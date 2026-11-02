"""Resumable editorial Batch CLI. No action means a network-free plan."""
import argparse
from contextlib import contextmanager
from dataclasses import replace, asdict
import fcntl
import json
import os
from pathlib import Path
import re
import uuid
from .batch_api import BatchAPI, MAX_INPUT_BYTES
from .batch_engine import Engine, initialize
from .batch_store import BatchRemote
from .editorial import Config, PipelineStop, candidates, write_private
from .importer import RequestError, request
from .licenses import recognized_license

SITE='https://real-or-slop.rickymusu.workers.dev'


@contextmanager
def workspace(folder):
    folder.mkdir(parents=True,exist_ok=True);folder.chmod(0o700)
    with (folder/'.batch.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise PipelineStop('Workspace Batch già in uso') from None
        try:yield
        finally:fcntl.flock(lock,fcntl.LOCK_UN)


def batch_config():
    cfg=Config.environment()
    return replace(cfg,evaluation_usd=float(os.getenv('EDITORIAL_BATCH_EVALUATION_USD') or '0'),generation_usd=float(os.getenv('EDITORIAL_BATCH_GENERATION_USD') or '0'))


def identifier(value):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',value):raise PipelineStop('Identificativo run non valido')
    return value


def run_one(args,uid,cfg=None):
    folder=(args.out/identifier(uid)).resolve()
    remote=BatchRemote(args.base,os.getenv('REAL_OR_SLOP_ADMIN_TOKEN',''),uid)
    if args.status:
        row=remote.call(remote.prefix)
        return dict(id=uid,status=row['status'],stage=row['stage'],revision=row['revision'],saved_status=True)
    with workspace(folder):
        api=BatchAPI(os.getenv('OPENAI_API_KEY',''))
        starting=args.start and not any(row['id']==uid for row in remote.call('batch-runs'))
        if starting:
            if (folder/'state.json').exists():raise PipelineStop('Workspace esistente: riprendere il run con --resume')
            cfg.validate(paid=True)
            if os.getenv('ENABLE_EDITORIAL_PAID')!='true':raise PipelineStop('Nuovi batch a pagamento non abilitati nel client')
            api.check_models(cfg)
            license_info=recognized_license(os.getenv('GENERATED_LICENSE_URL'))
            if not license_info or not os.getenv('GENERATED_LICENSE_NAME'):raise PipelineStop('Configurare i diritti dichiarati delle immagini generate')
            capabilities=request(remote.base,remote.token,'/api/admin/import')
            if not capabilities.get('quarantine_configured') or not capabilities.get('images_configured'):raise PipelineStop('Storage privato non configurato')
            known=remote.call('state');root=args.manifest.resolve().parent;items=json.loads(args.manifest.read_text())
            state=initialize(items,root,folder,cfg,uid,license_info,[*known['references'],*known['inventory'],*known.get('claims',[])],known.get('preferences'))
            write_private(folder/'state.json',state)
            remote.call('batch-runs',dict(id=uid,config=asdict(cfg),photos=[{**{k:p[k] for k in ('id','original_sha256','file_sha256','perceptual_hash')},**{k:p['metadata'][k] for k in ('provider','source_id','source_url')}} for p in state['photos']]))
        remote.acquire()
        try:
            if starting:remote.save(state,folder)
            else:
                state=remote.restore(folder)
                if not state:
                    path=folder/'state.json'
                    if not path.exists():raise PipelineStop('Prima preparazione incompleta: recuperare il workspace originale; nessuna chiamata pagata è stata inviata')
                    state=json.loads(path.read_text())
                    if state.get('id')!=uid:raise PipelineStop('Workspace di un altro run')
                    remote.save(state,folder)
            engine=Engine(state,folder,api,remote,args.max_batch_bytes)
            if args.cancel:return engine.cancel()
            execute=bool(args.execute and os.getenv('ENABLE_EDITORIAL_PAID')=='true')
            return engine.tick(execute=execute,adopt=args.adopt_batch_id)
        finally:remote.release()


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest',type=Path,nargs='?')
    actions=parser.add_mutually_exclusive_group()
    actions.add_argument('--start',action='store_true');actions.add_argument('--resume',metavar='RUN_ID');actions.add_argument('--status',metavar='RUN_ID');actions.add_argument('--cancel',metavar='RUN_ID');actions.add_argument('--resume-all',action='store_true');actions.add_argument('--simulate',action='store_true')
    parser.add_argument('--execute',action='store_true',help='Autorizza nuove fasi a pagamento solo con i gate client e server attivi')
    parser.add_argument('--run-id',help='Identificativo scelto prima di avviare il run, conservare per il recupero')
    parser.add_argument('--adopt-batch-id',help='Riconcilia un invio incerto verificando metadata e file del job')
    parser.add_argument('--out',type=Path,default=Path('.pipeline/batches'));parser.add_argument('--base',default=SITE)
    parser.add_argument('--max-batch-bytes',type=int,default=MAX_INPUT_BYTES)
    args=parser.parse_args(argv)
    try:
        cfg=batch_config() if args.start or args.simulate or not any((args.resume,args.status,args.cancel,args.resume_all)) else Config();cfg.validate()
        if args.manifest and not any((args.start,args.simulate,args.resume,args.status,args.cancel,args.resume_all)):
            rows=candidates(json.loads(args.manifest.read_text()),args.manifest.resolve().parent)
            print(json.dumps(dict(eligible=len(rows),phases=[len(rows),len(rows)//2,len(rows)//2,len(rows)//2],completion_window='24h',paid=False,remote_writes=False)));return 0
        if args.start and not args.execute:raise PipelineStop('--start richiede --execute esplicito; usare il manifest senza azioni per il piano')
        if args.start or args.simulate:
            if not args.manifest:raise PipelineStop('Manifest richiesto')
            # The controlled pilot can never grow into multiple image attempts.
            rows=json.loads(args.manifest.read_text())
            if len(rows)<=2:cfg=replace(cfg,attempts=1,max_evaluations=min(cfg.max_evaluations,4),max_generations=1,max_regenerations=1)
        if args.simulate:
            from .batch_fixtures import FixtureBatch
            uid=identifier(args.run_id or str(uuid.uuid4()));folder=(args.out/uid).resolve()
            cfg=replace(cfg,analysis_model=cfg.analysis_model or 'fixture-analysis',evaluator_model=cfg.evaluator_model or 'fixture-evaluator',image_model=cfg.image_model or 'fixture-image',run_usd=100,daily_usd=100,evaluation_usd=.01,generation_usd=.1)
            with workspace(folder):
                state=initialize(rows,args.manifest.resolve().parent,folder,cfg,uid,{'name':'Fixture-only','url':'https://creativecommons.org/publicdomain/zero/1.0/'},simulated=True)
                engine=Engine(state,folder,FixtureBatch(),max_bytes=args.max_batch_bytes)
                for _ in range(30):
                    result=engine.tick(execute=True)
                    if result['status'] in ('completed','paused','cancelled','stopped'):break
                print(json.dumps(result));return 0 if result['status']=='completed' else 1
        if args.resume_all:
            remote=BatchRemote(args.base,os.getenv('REAL_OR_SLOP_ADMIN_TOKEN',''),'listing')
            result=[]
            for row in remote.call('batch-runs'):
                if row['status'] not in ('active','paused'):continue
                saved=remote.call('batch-runs/'+row['id'])['state']
                if saved.get('error'):continue  # Automatic continuation never acknowledges an API error for the owner.
                result.append(run_one(args,row['id']))
            print(json.dumps(result));return 0
        uid=args.resume or args.status or args.cancel or args.run_id or str(uuid.uuid4())
        if not any((args.start,args.resume,args.status,args.cancel)):raise PipelineStop('Indicare un manifest per il piano o un’azione Batch')
        result=run_one(args,uid,cfg);print(json.dumps(result));return 1 if result.get('error') else 0
    except (ValueError,OSError,KeyError,TypeError) as error:
        print(str(error) if isinstance(error,(PipelineStop,RequestError)) else 'Batch interrotto: verificare configurazione e workspace privato');return 1


if __name__=='__main__':raise SystemExit(main())
