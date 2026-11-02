"""Real LOCAL D1/R2 and fake OpenAI. Run only via ROS_TEST_BATCH=1 runner."""
import concurrent.futures
from dataclasses import asdict,replace
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
sys.path.insert(0,str(Path('.').resolve()))
from pipeline.batch_engine import Engine,initialize
from pipeline.batch_fixtures import FixtureBatch
from pipeline.batch_store import BatchRemote
from pipeline.editorial import Config
from pipeline.importer import request,RequestError

assert os.environ.get('ROS_TEST_BATCH')=='1'
base=os.environ['ROS_TEST_BASE'];assert base.startswith('http://127.0.0.1:')
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
fixture=importlib.util.spec_from_file_location('editorial_fixture','tests/editorial_pipeline_test.py');module=importlib.util.module_from_spec(fixture);fixture.loader.exec_module(module)
# Importing a fixture helper never calls OpenAI.
cfg=Config(analysis_model='fixture-analysis',evaluator_model='fixture-evaluator',image_model='fixture-generator',attempts=1,max_evaluations=4,max_generations=1,max_regenerations=1,run_usd=.14,daily_usd=.15,evaluation_usd=.01,generation_usd=.1)
uid='integration-'+uuid.uuid4().hex

def call(path,data=None,method=None):return request(base,token,'/api/admin/editorial/'+path,method or ('POST' if data is not None else 'GET'),data)
def sql(command):
 args=['npx','wrangler','d1','execute','DB','--local','--env','local','--persist-to',os.environ['ROS_TEST_STATE'],'--command',command,'--json']
 return json.loads(subprocess.check_output(args,stderr=subprocess.DEVNULL))[0]['results']
try:
 request(base,'wrong','/api/admin/editorial/batch-runs');raise AssertionError('Unauthenticated Batch access')
except RequestError:pass

with tempfile.TemporaryDirectory() as temp:
 root=Path(temp);folder=root/'work';state=initialize(module.batch(root,2),root,folder,cfg,uid,{'name':'CC BY 4.0','url':'https://creativecommons.org/licenses/by/4.0/'})
 payload=dict(id=uid,config=asdict(cfg),photos=[{**{key:p[key] for key in ('id','original_sha256','file_sha256','perceptual_hash')},**{key:p['metadata'][key] for key in ('provider','source_id','source_url')}} for p in state['photos']])
 result=call('batch-runs',payload);assert result['id']==uid
 # A second caller gets exactly the same run, never another daily intake.
 assert call('batch-runs',payload)['id']==uid
 other={**payload,'id':'other-'+uuid.uuid4().hex}
 try:call('batch-runs',other);raise AssertionError('Daily intake race not guarded')
 except RequestError:pass
 remote=BatchRemote(base,token,uid);remote.acquire()
 try:
  try:BatchRemote(base,token,uid).acquire();raise AssertionError('Second writer obtained lease')
  except RequestError:pass
  remote.save(state,folder)
  # Restore into an empty filesystem: inputs and model snapshot are durable.
  restored=root/'restored';restored.mkdir();copy=remote.restore(restored)
  assert copy['id']==uid and all((restored/p['file']).is_file() for p in copy['photos'])
  stale=remote.revision-1
  try:remote.send('checkpoint',dict(revision=stale,state=copy,files=call('batch-runs/'+uid)['files']));raise AssertionError('Stale checkpoint accepted')
  except RequestError:pass
  api=FixtureBatch();engine=Engine(copy,restored,api,remote)
  for _ in range(20):
   result=engine.tick(execute=True)
   if result['status'] in ('completed','paused','stopped'):break
  assert result['status']=='completed',result
  assert result['real']==1 and result['slop']==1,result
  assert len(api.batches)==4 and result['reserved_usd']==.14,result
  queue=request(base,token,'/api/admin/review-queue')
  assert queue['ready']==2 and queue['processing']==0,queue
  assert all(row['details']['type'] in ('REAL','AI') for row in queue['images'])
  assert sql('SELECT count(*) AS n FROM review_events')[0]['n']==0
  assert sql('SELECT count(*) AS n FROM published_images')[0]['n']==24
 finally:remote.release()
 # A previous day's concurrent cohort competes for the SAME current daily cap.
 old='old-'+uuid.uuid4().hex
 sql("INSERT INTO editorial_batch_runs(id,day,status,stage,capacity,config_json,created_at,updated_at) VALUES('"+old+"','2001-01-01','active','ranking',1,'"+json.dumps(asdict(cfg),separators=(',',':'))+"','date','date')")
 second=BatchRemote(base,token,old);second.acquire()
 try:
  def reserve(n):
   try:return second.send('reserve',dict(id='race-'+str(n),requests=[dict(id='call-race-'+str(n),kind='evaluation')]),'POST')
   except RequestError:return None
  with concurrent.futures.ThreadPoolExecutor(2) as pool:outcomes=list(pool.map(reserve,range(2)))
  assert sum(row is not None for row in outcomes)==1,outcomes
  winner=next(n for n,row in enumerate(outcomes) if row is not None)
  replay=reserve(winner);assert replay['already_reserved'] and replay['reserved_usd']==.01
  assert sql('SELECT round(sum(reserved_usd),6) AS total FROM editorial_usage')[0]['total']==.15
  before=sql('SELECT count(*) AS n FROM editorial_usage')[0]['n']
  try:second.send('reserve',dict(id='too-large',requests=[dict(id='large-1',kind='evaluation'),dict(id='large-2',kind='evaluation')]),'POST');raise AssertionError('Overspent Batch accepted')
  except RequestError:pass
  assert sql('SELECT count(*) AS n FROM editorial_usage')[0]['n']==before
 finally:second.release()
 # A different day/run with looser daily limits still cannot reset the total cap.
 third='total-'+uuid.uuid4().hex
 total_cfg=replace(cfg,daily_usd=1)
 sql("INSERT INTO editorial_batch_runs(id,day,status,stage,capacity,config_json,created_at,updated_at) VALUES('"+third+"','2001-01-02','active','ranking',1,'"+json.dumps(asdict(total_cfg),separators=(',',':'))+"','date','date')")
 last=BatchRemote(base,token,third);last.acquire()
 try:
  try:last.send('reserve',dict(id='over-total',requests=[dict(id='call-over-total',kind='evaluation')]),'POST');raise AssertionError('Cumulative cap was reset by another run')
  except RequestError:pass
  assert sql('SELECT count(*) AS n FROM editorial_usage')[0]['n']==before
 finally:last.release()
 print('Batch integration passed: real private checkpoint restore, lease/CAS, source claims, four fake provider phases, atomic prepaid budget/replay/concurrency/day/total caps, human-only review, unchanged published catalog.')
