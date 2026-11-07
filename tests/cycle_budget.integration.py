"""LOCAL unified text/image ledger only: no actual inference or provider keys."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
sys.path.insert(0,str(Path('.').resolve()))
from pipeline.importer import request, RequestError
assert os.environ['ROS_TEST_CYCLE']=='1'
base=os.environ['ROS_TEST_BASE'];assert base.startswith('http://127.0.0.1:')
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
route='/api/admin/editorial/real-discovery/reserve'
def payload(run,n,stage='generation'):
    return dict(run_id=run,stage=stage,model='fixture-image' if stage=='generation' else 'gpt-6.1-terra',fingerprint=hashlib.sha256(str(n).encode()).hexdigest())
def call(value,auth=token):
    try:return request(base,auth,route,'POST',value)
    except RequestError:return None
def sql(command):
    return json.loads(subprocess.check_output(['npx','wrangler','d1','execute','DB','--local','--env','local','--persist-to',os.environ['ROS_TEST_STATE'],'--command',command,'--json'],stderr=subprocess.DEVNULL))[0]['results']
assert call(payload('auth',0),'wrong') is None
assert call({**payload('bad',0),'model':'invented-model'}) is None
with concurrent.futures.ThreadPoolExecutor(8) as pool:
    same=list(pool.map(lambda _:call(payload('same',0)),range(8)))
assert sum(r is not None and not r['already_reserved'] for r in same)==1
assert all(r['reserved_usd']==.1 for r in same)
with concurrent.futures.ThreadPoolExecutor(8) as pool:
    attempts=list(pool.map(lambda n:call(payload('same',n)),range(1,9)))
assert sum(r is not None for r in attempts)==1
assert sql("SELECT count(*) AS n FROM editorial_usage WHERE run_id='real-same' AND kind='generation'")[0]['n']==2
assert call(payload('same',100,'brief'))['reserved_usd']==.01
assert call(payload('second',0))['reserved_usd']==.1
assert call(payload('second',1))['reserved_usd']==.1
assert call(payload('third',0))['reserved_usd']==.1
assert call(payload('third',1)) is None  # Shared daily cap, not reset by run ID.
sql("INSERT INTO editorial_usage VALUES('legacy-cycle-local','legacy','2000-01-01','evaluation',0.14,'2000-01-01')")
assert call(payload('total',0,'brief')) is None
assert sql('SELECT round(sum(reserved_usd),2) AS usd FROM editorial_usage')[0]['usd']==.65
print('Cycle ledger passed: authenticated exact models, brief stage, atomic generation cap, idempotence, shared text/image daily and cumulative budgets; zero provider calls.')
