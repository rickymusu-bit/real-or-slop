"""Reusable Batch transport: checkpoints, budgets, sharding and uncertain submissions.

Editorial policies live in version-specific engines, outside this module.
"""
import json
import uuid
from .batch_api import TERMINAL
from .batch_store import safe_path
from .editorial import PipelineStop, now, write_private, vision_payload, image_payload
from .batch_engine_io import digest, write_bytes


class BatchTransport:
    def save(self):
        self.state['updated_at']=now()
        write_private(self.folder/'state.json',self.state)
        if self.remote:self.remote.save(self.state,self.folder)

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

    def _reserve(self,job):
        if job['reserved']:return
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
        job['metadata']=dict(run_id=self.state['id'],job_id=job['id'],stage=job['stage'],input_sha256=sha,protocol_version=self.state['protocol_version'])
        job['status']='submitting';self.save()  # Durable intent BEFORE the paid submission.
        result=self.api.create_batch(job['file_id'],job['endpoint'],job['metadata'])
        job['provider_id']=result['id'];job['status']=result['status'];self.save()

    def _reconcile(self,job,adopt=None):
        result=self.api.retrieve(adopt) if adopt else self.api.find_submission(job['metadata'],job['file_id'])
        if not result:raise PipelineStop('Invio Batch dall’esito incerto: nessun reinvio; attendere o adottare il job verificato con --adopt-batch-id')
        if result.get('metadata')!=job['metadata'] or result.get('input_file_id')!=job['file_id'] or result.get('endpoint')!=job['endpoint']:
            raise PipelineStop('Il job adottato non corrisponde al checkpoint')
        job['provider_id']=result['id'];job['status']=result['status'];self.save()

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

