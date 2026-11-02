"""Four resumable Batch phases. One bounded tick; never waits for a provider job."""
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import uuid
from PIL import Image, ImageOps
from .batch_api import MAX_INPUT_BYTES, TERMINAL
from .batch_store import safe_path
from .editorial import (Config, PipelineStop, VERSION as RUBRIC_VERSION, RUBRIC, BRIEF, candidates,
    vision_payload, vision_result, image_payload, image_result, evaluation, assign_roles,
    creative_context, creative_result, generation_decision, slop_import_item, now, write_private, same_photo)
from .importer import local_file, prepare, upload
from .preferences import creative_hint, model as preference_model
from .run import optimize

VERSION = '1.0.0'


def digest(raw): return hashlib.sha256(raw).hexdigest()


def write_bytes(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw); path.chmod(0o600)


def photo_hash(raw):
    with Image.open(io.BytesIO(raw)) as picture:
        pixels = list(ImageOps.grayscale(picture).resize((9,8)).getdata())
    return f'{sum((pixels[y*9+x]>pixels[y*9+x+1]) << (y*8+x) for y in range(8) for x in range(8)):016x}'


def initialize(items, root, folder, cfg, run_id, license_info, known=(), preferences=None, simulated=False):
    cfg.validate()
    photos = candidates(items, root, known)
    if not photos: raise PipelineStop('Nessuna fotografia nuova ammissibile')
    if not simulated:
        cfg.validate(paid=True)
        minimum = (len(photos) + 2*(len(photos)//2))*cfg.evaluation_usd + (len(photos)//2)*cfg.generation_usd
        if minimum > min(cfg.run_usd,cfg.daily_usd): raise PipelineStop('Budget insufficiente per il primo passaggio del lotto: ridurre il numero di fotografie')
    normalized = []
    for photo in photos:
        with Image.open(local_file(photo['file'],root)) as picture: ext = {'PNG':'png','JPEG':'jpg','WEBP':'webp'}[picture.format]
        file = f'inputs/{photo["id"]}/original.{ext}'; preview = f'inputs/{photo["id"]}/preview.webp'
        write_bytes(safe_path(folder,file),local_file(photo['file'],root).read_bytes())
        write_bytes(safe_path(folder,preview),local_file(photo['metadata'].get('derived_file') or photo['file'],root).read_bytes())
        normalized.append({**photo,'file':file,'metadata':{**photo['metadata'],'derived_file':preview}})
    return dict(protocol_version=VERSION,id=run_id,status='active',stage='ranking',phase=0,created_at=now(),config=asdict(cfg),
        license=license_info,preferences=preference_model(preferences),photos=normalized,ranked=None,attempts=[],jobs=[],registered=False,
        real_imports={},exported={},calls=dict(evaluation=0,generation=0,regeneration=0),reserved_usd=0,simulated=simulated,cancel_requested=False)


class Engine:
    def __init__(self,state,folder,api,remote=None,max_bytes=MAX_INPUT_BYTES):
        if state.get('protocol_version') != VERSION: raise PipelineStop('Versione checkpoint Batch incompatibile')
        self.state,self.folder,self.api,self.remote=state,folder.resolve(),api,remote
        self.cfg=Config(**state['config']);self.cfg.validate()
        if not 1024 <= max_bytes <= MAX_INPUT_BYTES: raise PipelineStop('Limite JSONL Batch non valido')
        self.max_bytes=max_bytes

    def save(self):
        self.state['updated_at']=now()
        write_private(self.folder/'state.json',self.state)
        if self.remote:self.remote.save(self.state,self.folder)

    def _photo(self, uid): return next(row for row in self.state['photos'] if row['id']==uid)
    def _attempt(self, uid): return next(row for row in self.state['attempts'] if row['id']==uid)

    def _body(self,item):
        recipe=item['recipe']
        if 'image_path' in recipe:
            return vision_payload(recipe['model'],recipe['instructions'],safe_path(self.folder,recipe['image_path']).read_bytes(),recipe['context'])
        return image_payload(recipe['model'],recipe['prompt'],recipe['parameters'])

    def _line(self,item):
        return (json.dumps(dict(custom_id=item['custom_id'],method='POST',url='/v1/images/generations' if 'prompt' in item['recipe'] else '/v1/responses',body=self._body(item)),ensure_ascii=False,separators=(',',':'))+'\n').encode()

    def _new_phase(self,stage,items):
        chunks=[];current=[];size=0
        for item in items:
            item['custom_id']='call-'+uuid.uuid4().hex
            length=len(self._line(item))
            if length>self.max_bytes: raise PipelineStop('Una richiesta supera il limite JSONL: ridurre la derivata tecnica')
            if current and (len(current)>=20 or size+length>self.max_bytes):chunks.append(current);current=[];size=0
            current.append(item);size+=length
        if current:chunks.append(current)
        planned=[]
        for chunk in chunks:
            endpoint='/v1/images/generations' if 'prompt' in chunk[0]['recipe'] else '/v1/responses'
            models={item['recipe']['model'] for item in chunk}
            if len(models)!=1:raise PipelineStop('Un batch deve usare un solo modello')
            uid=str(uuid.uuid4())
            planned.append(dict(id=uid,phase=self.state['phase']+1,stage=stage,status='prepared',endpoint=endpoint,model=models.pop(),items=chunk,results={},reserved=False,file_id=None,provider_id=None))
        self.state['stage']=stage;self.state['phase']+=1
        self.state['jobs'].extend(planned);self.save()

    def _vision_item(self,target,kind,model,instructions,image_path,context=''):
        return dict(target=target,kind=kind,recipe=dict(model=model,instructions=instructions,image_path=image_path,context=context))

    def _setup(self):
        if not self.state['jobs']:
            self._new_phase('ranking',[self._vision_item(p['id'],'evaluation',self.cfg.analysis_model,RUBRIC,p['metadata']['derived_file']) for p in self.state['photos']])

    def _reserve(self,job):
        if job['reserved']:
            # Revalidate the paid gate/lease even after an earlier reservation.
            # Server replay is idempotent and never debits the budget twice.
            if self.remote:self.remote.reserve_batch(job)
            return
        counts=self.state['calls'].copy();cost=0
        for item in job['items']:
            counts[item['kind']]+=1
            cost+=self.cfg.evaluation_usd if item['kind']=='evaluation' else self.cfg.generation_usd
        if counts['evaluation']>self.cfg.max_evaluations or counts['generation']+counts['regeneration']>self.cfg.max_generations or counts['regeneration']>self.cfg.max_regenerations or round(self.state['reserved_usd']+cost,6)>self.cfg.run_usd:
            raise PipelineStop('Limite di chiamate o budget Batch raggiunto')
        reserved=self.remote.reserve_batch(job)['reserved_usd'] if self.remote else cost
        if reserved>cost+1e-9:raise PipelineStop('Stima Batch locale inferiore alla prenotazione server')
        self.state['calls']=counts;self.state['reserved_usd']=round(self.state['reserved_usd']+reserved,6);job['reserved']=True
        self.save()  # Idempotent server reservation survives losing this checkpoint.

    def _submit(self,job):
        self._reserve(job)
        raw=b''.join(self._line(item) for item in job['items'])
        if len(raw)>self.max_bytes:raise PipelineStop('File JSONL ricostruito oltre il limite')
        path=self.folder/'requests'/(job['id']+'.jsonl');write_bytes(path,raw)
        sha=digest(raw)
        if job.get('input_sha256') and job['input_sha256']!=sha:raise PipelineStop('Richieste Batch cambiate durante il recupero')
        job['input_sha256']=sha
        if not job['file_id']:
            job['file_id']=self.api.upload_jsonl(path);self.save()
        job['metadata']=dict(run_id=self.state['id'],job_id=job['id'],stage=job['stage'],input_sha256=sha,protocol_version=VERSION)
        job['status']='submitting';self.save()  # Durable intent BEFORE the paid submission.
        result=self.api.create_batch(job['file_id'],job['endpoint'],job['metadata'])
        job['provider_id']=result['id'];job['status']=result['status'];self.save()

    def _reconcile(self,job,adopt=None):
        result=self.api.retrieve(adopt) if adopt else self.api.find_submission(job['metadata'],job['file_id'])
        if not result:raise PipelineStop('Invio Batch dall’esito incerto: nessun reinvio; attendere o adottare il job verificato con --adopt-batch-id')
        if result.get('metadata')!=job['metadata'] or result.get('input_file_id')!=job['file_id'] or result.get('endpoint')!=job['endpoint']:
            raise PipelineStop('Il job adottato non corrisponde al checkpoint')
        job['provider_id']=result['id'];job['status']=result['status'];self.save()

    def _decode(self,job,item,body,response):
        cfg=self.cfg
        if job['stage']=='ranking':
            value=evaluation(vision_result(body));value.update(model=cfg.analysis_model,timestamp=now(),editorial_threshold=cfg.threshold,parameters=dict(detail='high',max_output_tokens=4000,format='json_object'))
            return value
        record=self._attempt(item['target'])
        usage=body.get('usage',{});usage={key:value for key,value in usage.items() if isinstance(value,(int,float)) and not isinstance(value,bool) and value>=0} if isinstance(usage,dict) else {}
        record.setdefault('batch_jobs',[]).append(dict(stage=job['stage'],batch_id=job['provider_id'],custom_id=item['custom_id'],request_id=response.get('request_id'),usage=usage,response_model=body.get('model',job['model'])))
        if job['stage']=='briefs':
            value=creative_result(vision_result(body),self._photo(record['reference_id'])['metadata']['source_url']);record.update(value);return True
        if job['stage']=='generation':
            raw=image_result(body);original=f'generations/{record["id"]}/original.png';preview=f'generations/{record["id"]}/preview.webp'
            write_bytes(safe_path(self.folder,original),raw);optimize(raw,safe_path(self.folder,preview));safe_path(self.folder,preview).chmod(0o600)
            derivative=safe_path(self.folder,preview).read_bytes();phash=photo_hash(derivative)
            created=body.get('created');timestamp=datetime.fromtimestamp(created,timezone.utc).isoformat().replace('+00:00','Z') if isinstance(created,int) and 0<created<100000000000 else now()
            record.update(file=original,derived_file=preview,original_sha256=digest(raw),sha256=digest(derivative),perceptual_hash=phash,generation_timestamp=timestamp,generation_timestamp_source='provider_created' if isinstance(created,int) and 0<created<100000000000 else 'retrieved_at',status='generated')
            if any(same_photo(dict(sha256=record['sha256'],phash=phash),p) for p in self.state['photos']):record.update(status='discarded',duplicate=True,decision_reason='Immagine troppo vicina a una fotografia sorgente: scartata senza modificare punteggi')
            return True
        value=evaluation(vision_result(body));record['evaluation']=value;record.update(generation_decision(value,cfg.threshold));return True

    def _collect(self,job,result):
        expected={item['custom_id']:item for item in job['items']};received={};fatal=False
        for file_id in (result.get('output_file_id'),result.get('error_file_id')):
            if not file_id:continue
            for line in self.api.lines(file_id):
                if not isinstance(line,dict):raise PipelineStop('Riga Batch non valida')
                uid=line.get('custom_id')
                if uid not in expected or uid in received:raise PipelineStop('Risultati Batch con identificativi duplicati o estranei')
                response=line.get('response') or {};error=line.get('error')
                if not isinstance(response,dict):raise PipelineStop('Risposta Batch non valida')
                if error or response.get('status_code')!=200:
                    code=error.get('code') if isinstance(error,dict) else None
                    code=code if isinstance(code,str) and code in ('batch_expired','batch_cancelled') else 'provider_error'
                    received[uid]=dict(error=code);fatal |= code=='provider_error'
                else:
                    try:
                        if not isinstance(response.get('body'),dict):raise ValueError()
                        received[uid]=dict(value=self._decode(job,expected[uid],response['body'],response))
                    except (ValueError,KeyError,TypeError,OSError):
                        received[uid]=dict(error='invalid_result');fatal=True
        for uid in expected.keys()-received.keys():
            received[uid]=dict(error='batch_'+result['status'] if result['status'] in ('expired','cancelled') else 'missing_result')
            fatal |= result['status'] not in ('expired','cancelled')
        job['results']=received;job['status']=result['status'];job['collected']=True
        for uid,value in received.items():
            if value.get('error') and job['stage']!='ranking':self._attempt(expected[uid]['target']).update(status='error',error='Richiesta '+job['stage']+' non riuscita: '+value['error'])
        self.save()
        if fatal:raise PipelineStop('Errore API nel batch: risultati conservati, nuove fasi a pagamento sospese')

    def _imports(self):
        state=self.state
        if not state['registered']:
            if self.remote:
                known=self.remote.call('state')['references'];own=[row for row in known if row['batch_id']==state['id']]
                if own:
                    expected={p['id']:(p['role'],p['rank'],p['file_sha256']) for p in state['ranked']}
                    if {p['id']:(p['role'],p['rank'],p['file_sha256']) for p in own}!=expected:raise PipelineStop('Registro Batch parziale o non coerente')
                self.remote.register(state['ranked'],registered=bool(own),root=self.folder)
            state['registered']=True;self.save()
        for photo in state['ranked']:
            if photo['role']!='REAL' or photo['evaluation']['score']<self.cfg.threshold or not photo['evaluation']['concrete_motive'].strip() or photo['id'] in state['real_imports']:continue
            self.save()
            if self.remote:
                item=upload(self.remote.base,self.remote.token,prepare(photo,self.folder));self.remote.call('reviews',dict(image_id=item['id'],reference_id=photo['id']));uid=item['id']
            else:uid='fixture-'+photo['id']
            state['real_imports'][photo['id']]=uid;self.save()

    def _export(self):
        for record in self.state['attempts']:
            if record['status'] not in ('accepted','discarded','error') or record['id'] in self.state['exported']:continue
            self.save()  # Freeze the exact dossier before its immutable remote write.
            uid=None
            if self.remote:
                if record['status']=='accepted':
                    item=slop_import_item(self._photo(record['reference_id']),record)
                    item['metadata'].update(license_name=self.state['license']['name'],license_url=self.state['license']['url'])
                    item=upload(self.remote.base,self.remote.token,prepare(item,self.folder));uid=item['id']
                self.remote.save_attempt(record,uid)
            self.state['exported'][record['id']]=uid or 'archived';self.save()

    def _briefs(self):
        items=[]
        for photo in self.state['ranked']:
            if photo['role']!='SLOP':continue
            previous=[row for row in self.state['attempts'] if row['reference_id']==photo['id']]
            if any(row['status']=='accepted' for row in previous) or len(previous)>=self.cfg.attempts:continue
            if previous and previous[-1]['status']!='discarded':continue  # API errors never trigger implicit paid retries.
            uid=str(uuid.uuid4());hint=creative_hint(self.state['preferences'],uid)
            record=dict(id=uid,reference_id=photo['id'],timestamp=now(),iteration=len(previous)+1,analysis_model=self.cfg.analysis_model,evaluator_model=self.cfg.evaluator_model,model=self.cfg.image_model,parameters=dict(n=1,size=self.cfg.size,quality=self.cfg.quality),vision_parameters=dict(detail='high',max_output_tokens=4000,format='json_object'),protocol_version=RUBRIC_VERSION,batch_protocol_version=VERSION,editorial_threshold=self.cfg.threshold,max_attempts=self.cfg.attempts,status='started',preferences=hint)
            self.state['attempts'].append(record)
            prior=previous[-1].get('evaluation') or dict(reason=previous[-1].get('decision_reason')) if previous else None
            items.append(self._vision_item(uid,'evaluation',self.cfg.analysis_model,BRIEF,photo['metadata']['derived_file'],creative_context(photo['metadata'],prior,hint)))
        return items

    def _advance(self,jobs):
        state=self.state;stage=state['stage']
        if stage=='ranking':
            if state['ranked'] is None:
                valid=[]
                for job in jobs:
                    for item in job['items']:
                        result=job['results'][item['custom_id']].get('value')
                        if result and result['photographic']:valid.append({**self._photo(item['target']),'evaluation':result})
                state['ranked']=assign_roles(valid);self.save()
            if not state['ranked']:state.update(status='completed',stage='completed');self.save();return
            self._imports();items=self._briefs();next_stage='briefs'
        elif stage=='briefs':
            ids={item['target'] for job in jobs for item in job['items']}
            items=[dict(target=r['id'],kind='generation' if r['iteration']==1 else 'regeneration',recipe=dict(model=self.cfg.image_model,prompt=r['prompt'],parameters=r['parameters'])) for r in state['attempts'] if r['id'] in ids and r['status']=='started' and r.get('prompt')];next_stage='generation'
        elif stage=='generation':
            ids={item['target'] for job in jobs for item in job['items']}
            items=[self._vision_item(r['id'],'evaluation',self.cfg.evaluator_model,RUBRIC,r['derived_file']) for r in state['attempts'] if r['id'] in ids and r['status']=='generated'];next_stage='evaluation'
        else:
            self._export();items=self._briefs();next_stage='briefs'
        if not items:
            if stage in ('briefs','generation'):
                self._export();items=self._briefs();next_stage='briefs'
            if not items:state.update(status='completed',stage='completed');self.save();return
        self._new_phase(next_stage,items)

    def tick(self,execute=False,adopt=None):
        if self.state['status'] in ('completed','cancelled','stopped'):return self.summary()
        if self.state.get('cancel_requested'):return self.cancel()
        self.state['status']='active';self.state.pop('error',None)
        try:
            self._setup()
            jobs=[job for job in self.state['jobs'] if job['phase']==self.state['phase']]
            for job in jobs:
                if job['status']=='submitting':self._reconcile(job,adopt);adopt=None
                if job['provider_id'] and not job.get('collected'):
                    result=self.api.retrieve(job['provider_id']);job['status']=result['status'];self.save()
                    if job['status'] in TERMINAL:
                        if job['status']=='failed':raise PipelineStop('Validazione Batch fallita: nessun reinvio automatico')
                        self._collect(job,result)
            if all(job.get('collected') for job in jobs):self._advance(jobs);jobs=[job for job in self.state['jobs'] if job['phase']==self.state['phase']]
            if self.state['status']=='completed':return self.summary()
            for job in jobs:
                if job['status']=='prepared':
                    if not execute:self.state['status']='paused';self.save();break
                    self._submit(job)
        except (ValueError,OSError,KeyError,TypeError) as error:
            submitted={item['target'] for job in self.state['jobs'] for item in job['items']}
            self.state['attempts']=[record for record in self.state['attempts'] if record['status']!='started' or record['id'] in submitted]
            self.state['status']='paused';self.state['error']=str(error) if isinstance(error,PipelineStop) else 'Operazione Batch interrotta: controllare configurazione, API e checkpoint privati'
            self.save()
        return self.summary()

    def cancel(self):
        self.state['cancel_requested']=True;self.save()
        for job in self.state['jobs']:
            if job['status']=='submitting':self._reconcile(job)
            if not job['provider_id'] or job.get('collected'):continue
            result=self.api.retrieve(job['provider_id'])
            if result['status'] not in TERMINAL and result['status']!='cancelling':
                try:result=self.api.cancel(job['provider_id'])
                except PipelineStop:
                    result=self.api.retrieve(job['provider_id'])
                    if result['status'] not in TERMINAL:raise
            job['status']=result['status'];self.save()
            if result['status'] in ('completed','expired','cancelled'):self._collect(job,result)
        if any(job['provider_id'] and job['status'] not in TERMINAL for job in self.state['jobs']):
            self.state['status']='paused';self.state['cancel_pending']=True;self.save();return self.summary()
        self.state['cancel_pending']=False
        for record in self.state['attempts']:
            if record['id'] not in self.state['exported']:
                record.update(status='cancelled',decision_reason='Run annullato: file e provenienza conservati privatamente, nessuna nuova valutazione o importazione')
                self.save()
                if self.remote:self.remote.save_attempt(record)
                self.state['exported'][record['id']]='cancelled';self.save()
        self.state['status']='cancelled';self.save();return self.summary()

    def summary(self):
        return dict(id=self.state['id'],status=self.state['status'],stage=self.state['stage'],real=len(self.state['real_imports']),slop=sum(row['status']=='accepted' for row in self.state['attempts']),calls=self.state['calls'],reserved_usd=round(self.state['reserved_usd'],6),jobs=[dict(id=job['id'],stage=job['stage'],status=job['status'],provider_id=job['provider_id']) for job in self.state['jobs']],error=self.state.get('error'))
