"""v4 cell-first frozen cycles and independent adapters on the v2 infrastructure.

The default CLI is entirely offline. No acquisition, inference or publication is
started by a dry-run or by preparing a frozen cycle. Live adapters need explicit
execution and the existing server-side budget ledger for any model calls.
"""
import argparse
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import random
import re
import subprocess

from ..editorial import write_private, now
from ..licenses import recognized_license
from .protocol import require, exact, english_text, provenance
from .engine import initialize, Config
from .direct import DirectEngine
from .search_sources import registry, DEFAULT_ENGINES
from .composition import POLICY as COMPOSITION_POLICY, POLICY_SHA256 as COMPOSITION_SHA256, composition_plan, freeze_composition
from .photography import POLICY as PHOTOGRAPHY_POLICY, POLICY_SHA256 as PHOTOGRAPHY_SHA256, photography_plan, photography_directive, freeze_photography

ROOT = Path(__file__).resolve().parents[2]
VERSION = '4.0.0'
CATALOG = ROOT/'data/editorial/briefs.v4.3.0.json'
TAXONOMY = json.loads((ROOT/'shared/editorial-taxonomy.v4.0.0.json').read_text())
CELLS = [e['id']+':'+t['id'] for e in TAXONOMY['emotions'] for t in TAXONOMY['topics']]
FIELDS = {'id','revision','status','taxonomy_version','intent_emotion','intent_topic','medium','description','tags','search_queries','slop_prompt'}


def checksum(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def immutable(path,value):
    if path.exists():
        require(json.loads(path.read_text()) == value, 'Immutable matrix document differs: '+path.name)
    else:
        write_private(path,value)


def validate_catalog(value):
    exact(value,('version','catalog_id','language','created_at','authorship','briefs'),'Matrix catalogue')
    require(value['version'] in (VERSION,'4.1.0','4.2.0','4.3.0') and value['language']=='en' and isinstance(value['briefs'],list) and 1<=len(value['briefs'])<=10000,'Versioned English catalogue required')
    seen=set()
    for b in value['briefs']:
        exact(b,FIELDS,'Matrix brief')
        require(isinstance(b['id'],str) and re.fullmatch(r'[\w-]{1,100}',b['id']) and b['id'] not in seen,'Brief identity must be stable and unique');seen.add(b['id'])
        require(type(b['revision']) is int and b['revision']>0 and b['status'] in ('draft','approved','retired') and b['taxonomy_version']==VERSION and b['intent_emotion']+':'+b['intent_topic'] in CELLS,'Invalid brief revision or taxonomy cell')
        english_text(b['description']);english_text(b['slop_prompt'])
        require(b['medium'] in ('photograph','artwork') and isinstance(b['tags'],list) and 1<=len(b['tags'])<=12 and len(set(b['tags']))==len(b['tags']) and all(re.fullmatch(r'[a-z][a-z0-9_ -]{0,99}',t) for t in b['tags']),'English tags and medium required')
        require(isinstance(b['search_queries'],list) and 2<=len(b['search_queries'])<=8 and all(isinstance(q,str) and 0<len(q)<=200 for q in b['search_queries']),'Initial queries required')
        require(not re.search(r'https?://|data:|\b(reference_id|source_url|image_url)\b',b['slop_prompt'],re.I),'SLOP prompt must stand alone without source inputs')
    return value


def select(events,count,seed,adaptive,stamp,exploration=.25):
    command=['node','--import','tsx','scripts/editorial-matrix.v4.0.0.mjs','--stdin','--count',str(count),'--seed',str(seed),'--now',stamp,'--exploration',str(exploration),'--dry-run']
    if adaptive:command.append('--adaptive')
    result=subprocess.run(command,cwd=ROOT,input=json.dumps(events),text=True,capture_output=True,check=True)
    return json.loads(result.stdout)


def restore(folder):
    folder=Path(folder)
    value=json.loads((folder/'cycle-frozen.v4.0.0.json').read_text())
    require(checksum(value['payload'])==value['sha256'],'Cycle freeze changed')
    for name,digest in value['payload']['files'].items():
        require(Path(name).name==name and checksum(json.loads((folder/name).read_text()))==digest,'Frozen branch input changed: '+name)
    for row in json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs']:
        require(checksum(dict(brief=row['brief'],frozen_at=row['frozen_at']))==row['id'],'Individual brief freeze changed')
    return value


def freeze(folder,catalog=None,events=(),count=5,seed=53,adaptive=False,cycle_id='cycle-v4',stamp=None,image_model='unconfigured',evaluator_model='unconfigured',quality='medium',exploration=.25,size='auto',presentation_mode='whole_frame'):
    require(type(count) is int and 1<=count<=25 and type(seed) is int and 0<=seed<=4294967295 and re.fullmatch(r'[\w-]{1,100}',cycle_id),'Cycle limit is 5 briefs by default, at most 25 / 50 final images')
    require(type(exploration) in (float,int) and .05<=exploration<=1,'Exploration must remain between 5% and 100%')
    folder=Path(folder);catalog=validate_catalog(catalog or json.loads(CATALOG.read_text()));events=list(events)
    require(re.fullmatch(r'[\w.-]{1,100}',image_model) and re.fullmatch(r'[\w.-]{1,100}',evaluator_model) and quality in ('low','medium','high'),'Frozen model and output parameters required')
    require(size in ('auto','1024x1024','1024x1536','1536x1024') and presentation_mode in ('whole_frame','square_crop') and (presentation_mode=='whole_frame' or size=='1024x1024'),'Frozen aspect and presentation required')
    identity=dict(catalog_sha256=checksum(catalog),events_sha256=checksum(events),count=count,seed=seed,adaptive=bool(adaptive),cycle_id=cycle_id,image_model=image_model,evaluator_model=evaluator_model,quality=quality,exploration=exploration,size=size,presentation_mode=presentation_mode)
    compositions=composition_plan(count,seed) if catalog['version'] in ('4.2.0','4.3.0') else None
    if compositions is not None:identity['composition_policy_sha256']=COMPOSITION_SHA256
    photographs=photography_plan(count,seed) if catalog['version']=='4.3.0' else None
    if photographs is not None:identity['photography_policy_sha256']=PHOTOGRAPHY_SHA256
    if (folder/'cycle-frozen.v4.0.0.json').exists():
        value=restore(folder);prior=dict(value['payload']['identity']);prior.setdefault('size','1024x1024');prior.setdefault('presentation_mode','square_crop');require(prior==identity,'Cannot resume with different catalogue, feedback or selection');return value
    stamp=stamp or now();selection=select(events,count,seed,adaptive,stamp,exploration)
    rng=random.Random(seed);frozen=[];real=[];ideas=[];mapping=[]
    composition_records=[];photography_records=[]
    for position,chosen in enumerate(selection['selection']):
        options=sorted([b for b in catalog['briefs'] if b['status']!='retired' and b['intent_emotion']+':'+b['intent_topic']==chosen['cell']],key=lambda b:b['id'])
        require(options,'No original draft available for selected cell; prepare a new English brief before acquisition')
        usage={}
        for event in {r['id']:r for r in events}.values():
            if event['kind']=='proposal':usage[event['brief_id']]=usage.get(event['brief_id'],0)+1
        minimum=min(usage.get(b['id'],0) for b in options)
        b=rng.choice([b for b in options if usage.get(b['id'],0)==minimum])
        brief=dict(brief_id=b['id'],revision=b['revision'],taxonomy_version=VERSION,intent_emotion=b['intent_emotion'],intent_topic=b['intent_topic'],medium=b['medium'],description=b['description'],tags=b['tags'],search_queries=b['search_queries'],slop_prompt=b['slop_prompt'],seed=seed,model='authored-catalog',instructions_version=catalog['version'],catalog=dict(id=catalog['catalog_id'],version=catalog['version'],sha256=checksum(catalog)),selection=dict(run_id=cycle_id,method='adaptive' if adaptive else 'uniform',events_sha256=checksum(events),config_sha256=checksum(selection['config']),weight=chosen['weight']),parameters=dict(size=size,quality=quality,image_model=image_model,evaluator_model=evaluator_model,presentation_mode=presentation_mode))
        if compositions is not None:
            profile=compositions[position]
            brief['composition']=freeze_composition(profile)
            if b['medium']=='artwork':brief['slop_prompt']+=' Apply any viewpoint to the depicted scene when spatially meaningful; a flat artwork may remain flat. The camera instruction does not require an external room or frame.'
            brief['slop_prompt']+=' Camera composition: '+profile['directive']
            composition_records.append(dict(brief_id=b['id'],**brief['composition'],directive=profile['directive']))
        if photographs is not None and b['medium']=='photograph':
            profile=photographs[len(photography_records)]
            brief['photography']=freeze_photography(profile)
            directive=photography_directive(profile)
            brief['slop_prompt']+=directive
            photography_records.append(dict(brief_id=b['id'],**brief['photography'],directive=directive))
        envelope=dict(brief=brief,frozen_at=stamp);ref=checksum(envelope);frozen.append(dict(id=ref,**envelope))
        real.append(dict(brief_ref=ref,brief_id=b['id'],intent_cell=chosen['cell'],description=b['description'],initial_queries=b['search_queries'],providers=list(DEFAULT_ENGINES)))
        ideas.append(dict(id=b['id'],mode='original',idea=b['description'],prompt=brief['slop_prompt']))
        mapping.append(dict(input_id=b['id'],brief_ref=ref,intent_cell=chosen['cell']))
    documents={'briefs.v4.0.0.json':dict(version=VERSION,briefs=frozen),'real-requests.v4.0.0.json':dict(version=VERSION,requests=real),'slop-plan.v4.0.0.json':dict(version='2.0.0',independent=True,ideas=ideas),'branch-map.v4.0.0.json':dict(version=VERSION,records=mapping),'selection.v4.0.0.json':selection}
    if compositions is not None:documents['composition-plan.v1.0.0.json']=dict(version=COMPOSITION_POLICY['version'],policy_sha256=COMPOSITION_SHA256,assignment=COMPOSITION_POLICY['assignment'],seed=seed,records=composition_records,kind='intended_not_observed')
    if photographs is not None:documents['photography-plan.v1.0.0.json']=dict(version=PHOTOGRAPHY_POLICY['version'],policy_sha256=PHOTOGRAPHY_SHA256,assignment=PHOTOGRAPHY_POLICY['assignment'],seed=seed,records=photography_records,kind='intended_not_observed')
    for name,value in documents.items():immutable(folder/name,value)
    payload=dict(version=VERSION,identity=identity,frozen_at=stamp,source_inputs_supplied=False,maximum_final_images=2*count,files={name:checksum(value)for name,value in documents.items()})
    value=dict(payload=payload,sha256=checksum(payload));immutable(folder/'cycle-frozen.v4.0.0.json',value)
    return value


def documentary_gate(proof):
    provenance(proof,'REAL')
    require(proof['authenticity']=='verified' and not proof['semantic_edit'] and proof['content_kind'] in ('photograph','artwork') and recognized_license(proof['license_url']),'REAL needs verified original source, authorship, compatible rights and no semantic edits; index licence alone is insufficient')
    return proof


def search_real(folder,client,verify,download,providers=None,execute=False,simulated=False,max_attempts=10,source_cap=2):
    """Query official adapters; document before downloading or viewing pixels.

    verify is a separate documentary channel; download returns a local source
    file only after that gate. No text/image embedding is a hard gate. Review
    classification may differ from search intention without discarding an asset.
    """
    folder=Path(folder);frozen=restore(folder)
    require(execute and (simulated or os.getenv('ENABLE_EDITORIAL_V4_SEARCH')=='true'),'Search execution requires explicit gate')
    require(type(max_attempts) is int and 1<=max_attempts<=100 and type(source_cap) is int and 1<=source_cap<=25,'Bounded source strategy required')
    path=folder/'real-acquisition.v4.0.0.json'
    state=json.loads(path.read_text())if path.exists()else dict(version=VERSION,freeze_sha256=frozen['sha256'],attempts=[],inputs=[],links=[],seen_sources=[],status='active')
    require(state['freeze_sha256']==frozen['sha256'],'Acquisition belongs to another frozen cycle')
    registry_value=providers or registry();requests=json.loads((folder/'real-requests.v4.0.0.json').read_text())['requests'];used={};seen=set(state['seen_sources'])
    for old in state['attempts']:used[old['provider']]=used.get(old['provider'],0)+1
    for request in requests:
        if any(r['brief_ref']==request['brief_ref']for r in state['links']):continue
        for query in request['initial_queries']:
            available=[p for p in request['providers'] if p in registry_value and used.get(p,0)<source_cap and not getattr(registry_value[p],'paid',False)]
            if not available or len(state['attempts'])>=max_attempts:break
            # Rotate official providers, favouring their measured documentary
            # yield. Refusals of pictures are never retrieval failures.
            def score(p):
                rows=[r for r in state['attempts']if r['provider']==p]
                return ((sum(r['documentary_eligible']for r in rows)+1)/(len(rows)+2),-used.get(p,0),-request['providers'].index(p))
            provider=max(available,key=score);uid=checksum([frozen['sha256'],request['brief_ref'],provider,query])[:32]
            if any(a['id']==uid for a in state['attempts']):continue
            attempt=dict(id=uid,brief_ref=request['brief_ref'],brief_id=request['brief_id'],intent_cell=request['intent_cell'],provider=provider,queries=[query],source_hits=0,documentary_eligible=0,duplicates=0,cost=0,reasons=[],status='submitting',created_at=now())
            state['attempts'].append(attempt);used[provider]=used.get(provider,0)+1;write_private(path,state)
            try:
                # Durable intent before network; unknown interrupted attempts
                # are retained for inspection and never automatically retried.
                for hit in registry_value[provider].search(client,query,5):
                    attempt['source_hits']+=1
                    identity=str(hit.get('provider',provider))+':'+str(hit.get('source_id',hit.get('id')))
                    if identity in seen:attempt['duplicates']+=1;continue
                    seen.add(identity)
                    try:proof=documentary_gate(verify(hit))
                    except (ValueError,KeyError,TypeError):attempt['reasons'].append('documentary_unresolved');continue
                    attempt['documentary_eligible']+=1
                    source=Path(download(hit,proof)).resolve()
                    require(source.is_relative_to(ROOT) and source.is_file() and 0<source.stat().st_size<=12000000,'Acquisition must stay in the private project workspace')
                    digest=hashlib.sha256(source.read_bytes()).hexdigest()
                    if digest in seen:attempt['duplicates']+=1;continue
                    seen.add(digest);input_id='real-'+uid
                    state['inputs'].append(dict(id=input_id,file=str(Path(source).resolve()),provenance=proof))
                    state['links'].append(dict(input_id=input_id,brief_ref=request['brief_ref'],intent_cell=request['intent_cell'],provider=provider,off_target=None));break
                attempt['status']='completed'
            except (OSError,ValueError,KeyError,TypeError) as error:
                attempt.update(status='error',error_type=type(error).__name__)
            state['seen_sources']=sorted(seen);write_private(path,state)
            if any(r['brief_ref']==request['brief_ref']for r in state['links']):break
    state['status']='completed';write_private(path,state);return state


class MatrixDirectEngine(DirectEngine):
    """Attach private frozen associations before the completed archive is saved."""
    def __init__(self,state,folder,api,remote,associations,briefs):
        self.associations,self.briefs=associations,briefs
        super().__init__(state,folder,api,remote)

    def save(self):
        if self.state.get('status')=='completed':
            for candidate in self.state.get('candidates',[]):
                association=self.associations[candidate['input_id']]
                candidate.setdefault('brief_id',self.briefs[association['brief_ref']])
                candidate.setdefault('matrix_brief_ref',association['brief_ref'])
                candidate.setdefault('intent_cell',association['intent_cell'])
        super().save()


def run_branch(folder,origin,api,cfg=None,remote=None,execute=False,simulated=False,license_info=None):
    folder=Path(folder);frozen=restore(folder);require(origin in ('REAL','AI'),'Separate REAL/AI branch required')
    require(execute and (simulated or os.getenv('ENABLE_EDITORIAL_V4_PAID')=='true' and remote is not None),'Direct execution requires explicit v4 gate and existing server ledger')
    branch=folder/origin;branch.mkdir(exist_ok=True)
    if origin=='AI':inputs=json.loads((folder/'slop-plan.v4.0.0.json').read_text())
    else:
        acquisition=json.loads((folder/'real-acquisition.v4.0.0.json').read_text());require(acquisition['freeze_sha256']==frozen['sha256'],'REAL inputs from another cycle');inputs=acquisition['inputs']
        for source in inputs:documentary_gate(source['provenance'])
    # An empty branch is a valid result. Never fill it from its counterpart.
    if origin=='REAL' and not inputs:return dict(origin=origin,candidates=0,status='empty',published=False)
    cfg=cfg or Config.environment();cfg.validate(paid=not simulated,origin=origin)
    identity=frozen['payload']['identity']
    require(identity['evaluator_model']!='unconfigured' and (origin!='AI' or identity['image_model']!='unconfigured'),'Select models before freezing an executable cycle')
    require(cfg.size==identity.get('size','1024x1024') and cfg.presentation_mode==identity.get('presentation_mode','square_crop') and cfg.quality==identity['quality'] and cfg.evaluator_model==identity['evaluator_model'] and (origin!='AI' or cfg.image_model==identity['image_model']),'Models or parameters differ from the freeze')
    state_path=branch/'state.json';input_sha=checksum(inputs)
    if state_path.exists():
        state=json.loads(state_path.read_text());require(state.get('matrix_freeze_sha256')==frozen['sha256'] and state.get('matrix_input_sha256')==input_sha and Config(**state['config'])==cfg,'Resume input/configuration changed')
    else:
        state=initialize(origin,inputs,ROOT,branch,cfg,frozen['payload']['identity']['cycle_id']+'-'+origin.lower(),simulated,license_info)
        state.update(transport='synchronous',matrix_freeze_sha256=frozen['sha256'],matrix_input_sha256=input_sha);write_private(state_path,state)
    associations={r['input_id']:r for r in json.loads((folder/'branch-map.v4.0.0.json').read_text())['records']}
    if origin=='REAL':associations.update({r['input_id']:r for r in acquisition['links']})
    briefs={r['id']:r['brief']['brief_id']for r in json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs']}
    if remote:
        require(remote.run_id==state['id'],'Server ledger identity differs from frozen branch')
        remote.call('v2/runs',dict(id=state['id'],origin=origin,config=state['config'],input=inputs))
        remote.acquire()
        try:
            restored=remote.restore(branch)
            restored=restored or state
            require(restored.get('matrix_freeze_sha256')==frozen['sha256'] and restored.get('matrix_input_sha256')==input_sha,'Remote checkpoint differs from frozen branch')
            return MatrixDirectEngine(restored,branch,api,remote,associations,briefs).run(True)
        finally:remote.release()
    return MatrixDirectEngine(state,branch,api,None,associations,briefs).run(True)


def export_review(folder):
    """Prepare private inbox inputs; this function never uploads or decides."""
    folder=Path(folder).resolve();frozen=restore(folder)
    mapping={r['input_id']:r for r in json.loads((folder/'branch-map.v4.0.0.json').read_text())['records']}
    acquisition_path=folder/'real-acquisition.v4.0.0.json'
    acquisition=json.loads(acquisition_path.read_text())if acquisition_path.exists()else dict(attempts=[],links=[])
    mapping.update({r['input_id']:r for r in acquisition['links']})
    images=[];links=[];events=[]
    for origin in ('REAL','AI'):
        path=folder/origin/'state.json'
        if not path.exists():continue
        state=json.loads(path.read_text());require(state.get('matrix_freeze_sha256')==frozen['sha256'],'Branch from another freeze')
        for candidate in state['candidates']:
            association=mapping[candidate['input_id']];uid='v2-'+candidate['id']
            images.append(dict(id=uid,origin=origin,sha256=candidate['sha256'],file=str(folder/origin/candidate['derived_file']),original_file=str(folder/origin/candidate['file']),metadata=dict(title='Private matrix candidate',provenance=candidate,brief_ref=association['brief_ref'],intent_cell=association['intent_cell'],simulated=state['simulated']),pair_key=association['brief_ref'],created_at=state['created_at']))
            links.append(dict(candidate_id=uid,origin=origin,image_sha256=candidate['sha256'],brief_ref=association['brief_ref'],observed_cell=association['intent_cell'],provider='openai' if origin=='AI'else association['provider'],batch=frozen['payload']['identity']['cycle_id']))
        for job in state['jobs']:
            if not job.get('reserved'):continue
            association=mapping[job['target']]
            common=dict(kind='attempt',origin=origin,intent_cell=association['intent_cell'],observed_cell=association['intent_cell'],candidate_id=None,image_sha256=None,brief_id=job['target'],revision=0,decision=None,provider='openai',batch=frozen['payload']['identity']['cycle_id'],brief_ref=association['brief_ref'])
            # Reservation identity and amount never depend on an acknowledgement.
            events.append(dict(common,id='call:'+job['id'],created_at=state['created_at'],data=dict(source_hits=0,documentary_eligible=0,duplicates=0,cost=state['config']['generation_usd'if job['kind']=='generation'else'evaluation_usd'],queries=[],stage=job['stage'],status='reserved',payload_sha256=job.get('payload_sha256'))))
            if job['status']in ('completed','error'):
                events.append(dict(common,id='receipt:'+job['id']+':'+job['status'],created_at=job.get('submitted_at',state['created_at']),data=dict(source_hits=0,documentary_eligible=0,duplicates=0,cost=0,queries=[],stage='receipt',job_stage=job['stage'],status=job['status'],request_id=job.get('request_id'),payload_sha256=job.get('payload_sha256'))))
    refs={r['id']:r['brief']['brief_id']for r in json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs']}
    for attempt in acquisition['attempts']:
        common=dict(kind='attempt',origin='REAL',intent_cell=attempt['intent_cell'],observed_cell=attempt['intent_cell'],candidate_id=None,image_sha256=None,brief_id=refs[attempt['brief_ref']],revision=0,decision=None,provider=attempt['provider'],batch=frozen['payload']['identity']['cycle_id'],created_at=attempt['created_at'],brief_ref=attempt['brief_ref'])
        events.append(dict(common,id='search:'+attempt['id'],data=dict(source_hits=0,documentary_eligible=0,duplicates=0,cost=attempt['cost'],queries=attempt['queries'],stage='search',status='submitting')))
        if attempt['status']in ('completed','error'):
            events.append(dict(common,id='search-result:'+attempt['id'],data=dict(source_hits=attempt['source_hits'],documentary_eligible=attempt['documentary_eligible'],duplicates=attempt['duplicates'],cost=0,queries=attempt['queries'],stage='search_result',status=attempt['status'],reasons=attempt['reasons'])))
    for event in events:event['brief_id']=refs[event['brief_ref']]
    result=dict(version='1.0.0',images=images)
    # Exports represent the current checkpoint; use a digest in the filename
    # so later progress cannot overwrite an earlier archive.
    export_id=checksum(dict(images=images,links=links,events=events))[:16]
    immutable(folder/('review-inbox.'+export_id+'.v4.0.0.json'),result)
    immutable(folder/('matrix-links.'+export_id+'.v4.0.0.json'),dict(version=VERSION,candidates=links,attempts=events))
    return dict(images=len(images),candidates=links,attempts=events,review_manifest=str(folder/('review-inbox.'+export_id+'.v4.0.0.json')),network=False,published=False)


def embedding_projection(catalog):
    """Reuse the #44 neutral text encoder; cell labels are not embedding text."""
    validate_catalog(catalog)
    return dict(version='1.1.0',catalog_id=catalog['catalog_id']+'-neutral',protocol_version='3.0.0',authorship=catalog['authorship']+' Diagnostic neutral projection only; matrix labels remain in the v4 source.',briefs=[{**{k:b[k]for k in ('id','revision','status','medium','description','search_queries','slop_prompt')},'tags':['subject_in_context','contextual_detail']}for b in catalog['briefs']])


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--catalog',type=Path,default=CATALOG);parser.add_argument('--events',type=Path);parser.add_argument('--count',type=int,default=5);parser.add_argument('--seed',type=int,default=53);parser.add_argument('--cycle-id',default='cycle-v4');parser.add_argument('--adaptive',action='store_true');parser.add_argument('--dry-run',action='store_true');parser.add_argument('--out',type=Path);parser.add_argument('--check',action='store_true');parser.add_argument('--image-model',default='unconfigured');parser.add_argument('--evaluator-model',default='unconfigured');parser.add_argument('--quality',choices=('low','medium','high'),default='medium');parser.add_argument('--exploration',type=float,default=.25);parser.add_argument('--size',choices=('auto','1024x1024','1024x1536','1536x1024'),default='auto');parser.add_argument('--presentation-mode',choices=('whole_frame','square_crop'),default='whole_frame');args=parser.parse_args(argv)
    try:
        catalog=validate_catalog(json.loads(args.catalog.read_text()));events=json.loads(args.events.read_text())if args.events else []
        if isinstance(events,dict):events=events['events']
        require(not(args.dry_run and args.out),'Dry-run does not write a cycle')
        if args.out:result=freeze(args.out,catalog,events,args.count,args.seed,args.adaptive,args.cycle_id,image_model=args.image_model,evaluator_model=args.evaluator_model,quality=args.quality,exploration=args.exploration,size=args.size,presentation_mode=args.presentation_mode)
        else:
            result=dict(version=VERSION,catalogue_briefs=len(catalog['briefs']),cells=len(CELLS),network=False,paid=False,publication=False)
            if not args.check:result['selection']=select(events,args.count,args.seed,args.adaptive,now(),args.exploration)['selection']
        print(json.dumps(result));return 0
    except (ValueError,OSError,KeyError,TypeError,subprocess.CalledProcessError)as error:
        print(str(error)if isinstance(error,ValueError)else 'Matrix input, freeze or adapter unavailable');return 1


if __name__=='__main__':raise SystemExit(main())
