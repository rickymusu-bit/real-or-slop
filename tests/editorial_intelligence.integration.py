"""Local-only HTTP integration for owner-first dashboard. No external calls or paid secrets."""
import base64
import json
import io
from PIL import Image
import os
import uuid
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

base=os.environ["ROS_TEST_BASE"]
token=Path(".dev.vars").read_text().strip().split("=",1)[1]
def call(path, data=None, method=None, auth=token, binary=False):
    headers={"Authorization":"Bearer "+auth} if auth else {}
    if data is not None:
        raw=data if binary else json.dumps(data).encode()
        headers["Content-Type"]="image/png" if binary else "application/json"
        method=method or "POST"
    else:
        raw=None
        method=method or "GET"
    req=urllib.request.Request(base+path,data=raw,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            return response.status,json.load(response)
    except urllib.error.HTTPError as e:
        try: value=json.loads(e.read())
        except ValueError: value={}
        return e.code,value

prefix="/api/admin/editorial/intelligence"
assert call(prefix,auth="not-a-token")[0]==401
state=call(prefix)[1]
assert state["enabled"] is False and state["generation_enabled"] is False,state
assert state["topic_discovery_enabled"] is False,state
assert call(prefix+"/suggest",{"operation_id":str(uuid.uuid4())})[0]==409
assert call(prefix+"/topic-discovery/settings",{"enabled":True},auth="not-a-token")[0]==401
assert call(prefix+"/topic-discovery/settings",{"enabled":"true"})[0]==400
assert call(prefix+"/topic-discovery/settings",{"enabled":True,"extra":1})[0]==400
code,switched=call(prefix+"/topic-discovery/settings",{"enabled":True})
assert code==200 and switched["topic_discovery_enabled"] is True and switched["paid_calls_started"] is False
assert call(prefix)[1]["topic_discovery_enabled"] is True
# Enabling suggestions alone does not enable paid API access.
assert call(prefix+"/suggest",{"operation_id":str(uuid.uuid4())})[0]==503
code,switched=call(prefix+"/topic-discovery/settings",{"enabled":False})
assert code==200 and switched["topic_discovery_enabled"] is False and switched["paid_calls_started"] is False
assert call(prefix)[1]["topic_discovery_enabled"] is False
assert call(prefix+"/suggest",{"operation_id":str(uuid.uuid4())})[0]==409
assert not [job for job in call(prefix)[1]["jobs"] if job["kind"]=="suggest"]
title="Proteste a Bruxelles, ottobre 2026 "+uuid.uuid4().hex[:8]
code,unavailable=call("/api/admin/editorial/workspace/topics",{"title":title,"operation_id":str(uuid.uuid4())})
assert code==503,(code,unavailable)
assert all(t['title']!=title for t in call('/api/admin/editorial/workspace')[1]['topics'])
code,created=call("/api/admin/editorial/workspace/topics",{"title":title,"description":"Owner-supplied description without a model call."})
assert code==201,(code,created)
uid=created["id"]
assert created["embedding_status"]=="pending",created
topics=call("/api/admin/editorial/workspace")[1]["topics"]
semantic=next(t for t in topics if t["id"]==uid)
assert semantic["embedding_status"]=="pending",semantic
# The human-supplied semantic description must be retained even while
# Topic Discovery and paid services are disabled.
detail="Protests by agricultural workers across France and neighboring countries."
code,described=call("/api/admin/editorial/workspace/topics",{
    "title":"Farmers mobilizations across Europe "+uuid.uuid4().hex[:8],
    "description":detail})
assert code==201 and described["embedding_status"]=="pending",(code,described)
described_row=next(t for t in call("/api/admin/editorial/workspace")[1]["topics"] if t["id"]==described["id"])
assert described_row["description"]==detail,described_row
assert call(prefix)[1]["topic_discovery_enabled"] is False
url="https://commons.wikimedia.org/wiki/File:Owner_Test_2026.jpg"
code,link=call("/api/admin/editorial/workspace/links",{"topic_id":uid,"source_url":url})
assert code==201,(code,link)
code,dupe=call("/api/admin/editorial/workspace/links",{"topic_id":uid,"source_url":url})
assert code==409,(code,dupe)
external=call("/api/admin/editorial/workspace/links",{
    "topic_id":uid,"source_url":"https://example.org/unsafe.jpg"})[1]
assert call(prefix+"/acquire",{"proposal_id":external["id"]})[0]==400
assert call(prefix+"/suggest",{"operation_id":str(uuid.uuid4())})[0]==409
assert call(prefix+"/search",{"topic_id":uid,"limit":3,"operation_id":str(uuid.uuid4())})[0]==409
assert call("/api/admin/editorial/workspace/manual-stage",{"topic_id":uid,"decision":"skip"})[0]==200
assert call(prefix+"/search",{"topic_id":uid,"limit":3,"operation_id":str(uuid.uuid4())})[0]==503
assert call(prefix+"/slop/plan",{"topic_id":uid})[0]==503
assert call(prefix+"/slop/generate",{"topic_id":uid,"slot":0})[0]==409

# A valid small PNG; checks the whole file is retained for owner review.
png=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1l8AAAAASUVORK5CYII=")
url="/api/admin/editorial/workspace/uploads?"+urllib.parse.urlencode(
    {"topic_id":uid,"title":"tiny-owner.png"})
code,saved=call(url,png,binary=True)
assert code==201,(code,saved)
inbox=saved["inbox_id"]
state=call("/api/admin/review-inbox?state=pending&origin=REAL")[1]
card=next((x for x in state["images"] if x["id"]==inbox),None)
assert card and card["sha256"]==saved["sha256"],card
assert card["details"]["original_sha256"]==saved["sha256"]
assert card["details"]["topic_id"]==uid
# Candidates from another topic must not pollute a selected topic's REAL ranking.
code,other=call("/api/admin/editorial/workspace/topics",{
    "title":"Street photography in Tokyo, November 2026 "+uuid.uuid4().hex[:8],"description":"Owner-supplied street photography topic."})
assert code==201,(code,other)
current=call(prefix+"?topic_id="+uid)[1]
unrelated=call(prefix+"?topic_id="+other["id"])[1]
assert any(item["id"]==inbox for item in current["ranked_real"])
assert all(item["id"]!=inbox for item in unrelated["ranked_real"])
code,vote=call("/api/admin/review-inbox/"+inbox+"/decision",{
    "decision":"approved","revision":card["revision"],"sha256":saved["sha256"],
    "note":"Owner-selected photograph, rights and origin still unverified","reason":"editorial"
})
assert code==200,(code,vote)
updated=call(prefix+"?topic_id="+uid)[1]
assert any(x["id"]==inbox for x in updated["reviewed_unprofiled"])
assert updated["preferences"]["real"]["observations"]==0
assert call(prefix+"/profile",{"inbox_id":inbox,"sha256":saved["sha256"]})[0]==503
# The source pixel hash is checked before any paid call. A faithful WebP full-frame
# preview can be presented by the owner's browser without changing the original.
webp=io.BytesIO()
Image.new("RGB",(1,1),"white").save(webp,"WEBP")
visual=base64.b64encode(webp.getvalue()).decode()
assert call(prefix+"/profile",{"inbox_id":inbox,"sha256":saved["sha256"],
                               "preview_base64":visual})[0]==503
assert call(prefix+"/profile",{"inbox_id":inbox,"sha256":saved["sha256"],
                               "preview_base64":"<svg/>"})[0]==400
wide=io.BytesIO()
Image.new("RGB",(100,20),"white").save(wide,"WEBP")
assert call(prefix+"/profile",{"inbox_id":inbox,"sha256":saved["sha256"],
                               "preview_base64":base64.b64encode(wide.getvalue()).decode()})[0]==400
assert not updated["prompts"]
assert not updated["suggestions"]
print("Editorial intelligence integration passed: Topic Discovery OFF by default, persistent owner toggle without paid calls, manual topic intake, private owner photos and closed paid gates")
