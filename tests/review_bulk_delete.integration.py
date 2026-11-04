"""LOCAL bulk deletion: authenticated snapshot, >50 rows, filters and history."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request
import urllib.error
import uuid
base=os.environ['ROS_TEST_BASE'];assert base.startswith('http://127.0.0.1:')
token=Path('.dev.vars').read_text().strip().split('=',1)[1]
def call(path,data=None,method=None,auth=token):
 req=urllib.request.Request(base+'/api/admin/'+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Authorization':'Bearer '+auth,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def sql(command):
 with tempfile.TemporaryDirectory() as temp:
  p=Path(temp)/'query.sql';p.write_text(command)
  raw=subprocess.check_output(['npx','wrangler','d1','execute','DB','--local','--env','local','--persist-to',os.environ['ROS_TEST_STATE'],'--file',str(p),'--json'],stderr=subprocess.DEVNULL)
 return json.loads(raw)[-1]['results']
q=lambda v:"'"+v.replace("'","''")+"'"
uid='bulk-'+uuid.uuid4().hex
statements=[]
for n in range(74):
 ident=uid+'-'+str(n);origin='REAL' if n<70 else 'AI';state='rejected' if n<73 else 'pending';sha=hashlib.sha256(ident.encode()).hexdigest()
 statements.append('INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,status,revision,created_at) VALUES('+','.join(map(q,[ident,origin,sha,'fixture/'+ident,'{}',state]))+",1,'date');")
 if state=='rejected':statements.append('INSERT INTO editorial_review_inbox_events VALUES('+','.join(map(q,['vote-'+ident,ident]))+",1,'fixture','rejected',"+q(sha)+",'Fixture refusal','date');")
sql('\n'.join(statements))
assert call('review-inbox/delete-rejected',auth='wrong')[0]==401
assert call('review-inbox/delete-rejected?origin=invalid')[0]==400
status,preview=call('review-inbox/delete-rejected?origin=REAL');assert status==200 and preview['count']>=70,preview
assert len(call('review-inbox?state=rejected&origin=REAL')[1]['images'])==50
payload=dict(confirm_delete=True,origin='REAL',snapshot_token=preview['snapshot_token'])
assert call('review-inbox/delete-rejected',payload,method='DELETE',auth='wrong')[0]==401
assert call('review-inbox/delete-rejected',{**payload,'confirm_delete':False},method='DELETE')[0]==400
assert call('review-inbox/delete-rejected',{**payload,'origin':'all'},method='DELETE')[0]==409
assert call('review-inbox/delete-rejected',{**payload,'state':'approved'},method='DELETE')[0]==400
# Simulate another reviewer changing a vote while the confirmation is open.
sql("UPDATE editorial_review_inbox SET status='approved',revision=2 WHERE id="+q(uid+'-1'))
assert call('review-inbox/delete-rejected',payload,method='DELETE')[0]==409
sql("UPDATE editorial_review_inbox SET status='rejected',revision=3 WHERE id="+q(uid+'-1'))
assert call('review-inbox/delete-rejected',payload,method='DELETE')[0]==409  # same count, different revision
preview=call('review-inbox/delete-rejected?origin=REAL')[1];payload['snapshot_token']=preview['snapshot_token']
protected=sql("SELECT id,status,revision FROM editorial_review_inbox WHERE status<>'rejected' ORDER BY id")
history=sql('SELECT * FROM editorial_review_inbox_events ORDER BY id')
ai_count=call('review-inbox/delete-rejected?origin=AI')[1]['count']
with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:call('review-inbox/delete-rejected',payload,method='DELETE'),range(2)))
assert sorted(status for status,_ in results)==[200,409],results
assert sum(result.get('deleted',0) for status,result in results if status==200)==preview['count']
assert call('review-inbox?state=rejected&origin=REAL')[1]['total']==0
assert call('review-inbox/delete-rejected?origin=AI')[1]['count']==ai_count
assert protected==sql("SELECT id,status,revision FROM editorial_review_inbox WHERE status<>'rejected' ORDER BY id")
assert history==sql('SELECT * FROM editorial_review_inbox_events ORDER BY id')
# Repeated queue synchronization cannot restore deleted sources.
assert call('review-inbox?state=rejected&origin=REAL')[1]['total']==0
preview=call('review-inbox/delete-rejected')[1];assert preview['count']>=3
status,result=call('review-inbox/delete-rejected',dict(confirm_delete=True,origin='all',snapshot_token=preview['snapshot_token']),method='DELETE')
assert status==200 and result['deleted']==preview['count'],result
assert call('review-inbox?state=rejected')[1]['total']==0
assert protected==sql("SELECT id,status,revision FROM editorial_review_inbox WHERE status<>'rejected' ORDER BY id")
assert history==sql('SELECT * FROM editorial_review_inbox_events ORDER BY id')
print('Bulk deletion passed: all pages, origin scope, strict confirmation, stale snapshots, duplicate requests, protected approvals/pending, retained judgments and no resurrection.')
