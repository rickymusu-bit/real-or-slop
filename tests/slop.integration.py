"""Studio lifecycle with real LOCAL Worker/D1/R2, no external generation."""
import concurrent.futures
import http.cookiejar
import json
import os
from pathlib import Path
import struct
import subprocess
import urllib.error
import urllib.request
import uuid
import zlib

base = os.environ.get('ROS_TEST_BASE', 'http://127.0.0.1:8787')
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def request(path, method='GET', data=None, auth=token, origin=None):
    headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer '+auth}
    if origin: headers['Origin'] = origin
    raw = data if isinstance(data, bytes) else json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(base+path, method=method, headers=headers, data=raw)
    try:
        with client.open(req) as response:
            body = response.read()
            return response.status, json.loads(body) if response.headers.get('Content-Type', '').startswith('application/json') else body
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())

def draft(**changes):
    plan = dict(title='Private studio fixture '+uuid.uuid4().hex, category_id='trasporti', subcategory_id='trasporti-treni',
                country='Italia', place='Laboratorio immaginario', period='1940', subject='Strumento di calcolo', subject_kind='trasporti',
                country_or_region='europa', period_bucket='1900_1945', image_medium='foto_bn', composition='scena_ampia', cognitive_mechanism='chronology_device',
                scene_description='Fixture neutra: nessuna immagine generata da API.', fictional_claim='La scena fotografica è sintetica.',
                single_clue='Confrontare le date documentate.', period_accurate_details='Materiali da verificare dal revisore.', technical_treatment='1200x800, fotogramma integro, confronto con REAL.',
                documented_facts=[dict(fact='La HP-35 fu commercializzata nel 1972.', source_title='Smithsonian', reference_url='https://airandspace.si.edu/collection-objects/calculator-pocket-electronic-hp-35/nasm_A19850582000')],
                ai_model='fixture-model', generation_owner='Titolare locale', generation_source_url='https://example.invalid/fixture-generation',
                generation_date='2024-02-29', generation_version='run-v1', iteration=1, owner_declaration=True,
                prompt='  PRIVATE_STUDIO_FULL_PROMPT\nPrompt integrale di prova.\n  ', reveal_explanation='Immagine generata con IA; il riferimento documenta solo il contesto.',
                evaluation_notes='PRIVATE_STUDIO_RESULT_NOTES', license_name='CC0', license_url='https://creativecommons.org/publicdomain/zero/1.0/')
    plan.update(changes)
    return plan

checks = dict(facts_confirmed=True, rights_confirmed=True, safety_confirmed=True, comparability_confirmed=True)
for path in ['/admin/slop', '/api/admin/slop', '/api/admin/slop/preview', '/api/admin/slop/unknown/import']:
    assert request(path, auth='wrong')[0] == 401
assert request('/api/admin/slop', 'POST', {}, origin='https://foreign.invalid')[0] == 403
assert request('/api/admin/slop', 'DELETE')[0] == 405
assert request('/api/admin/slop', 'POST', dict(plan={'title':'x','status':'approved'}, reason='invalid'))[0] == 400
assert request('/api/admin/slop', 'POST', dict(plan=draft(subcategory_id='arte-pittura'), reason='invalid'))[0] == 400

plan = draft()
status, preview = request('/api/admin/slop/preview', 'POST', dict(plan=plan))
assert status == 200, preview
assert 'Sviluppa liberamente' in preview['prompt'] and 'Non inventare fonti' in preview['prompt']
assert 'generata con IA' in preview['reveal']
status, created = request('/api/admin/slop', 'POST', dict(plan=plan, reason='Prima progettazione'))
assert status == 201, created
pid = created['id']; path = '/api/admin/slop/'+pid
assert created['status'] == 'draft' and created['image_id'] is None and created['revision'] == 1
assert created['plan']['prompt'] == plan['prompt']
assert created['template_version'] == '2.0.0'
assert any(row['id'] == pid for row in request('/api/admin/slop')[1])
assert request(path+'/import', 'POST', dict(revision=1, reason='No checks'))[0] == 400

# Revision checks cover edits and imports. Only one concurrent draft update wins.
plan['evaluation_notes'] = 'PRIVATE_STUDIO_RESULT_NOTES: revisione umana'
with concurrent.futures.ThreadPoolExecutor(2) as executor:
    outcomes = list(executor.map(lambda _: request(path, 'PUT', dict(plan=plan, revision=1, reason='Valutazione risultato'))[0], range(2)))
assert sorted(outcomes) == [200, 409], outcomes
current = request(path)[1]
assert current['revision'] == 2 and len(current['events']) == 2
assert json.loads(current['events'][0]['before_json'])['revision'] == 1
assert token not in json.dumps(current['events'])
assert request(path+'/import', 'POST', dict(**checks, revision=1, reason='Stale'))[0] == 409

# Concurrent manual imports cannot leave duplicate or orphan candidates/sources.
with concurrent.futures.ThreadPoolExecutor(2) as executor:
    outcomes = list(executor.map(lambda _: request(path+'/import', 'POST', dict(**checks, revision=2, reason='Output e fonti controllati')), range(2)))
assert sorted(status for status, _ in outcomes) in [[200, 201], [201, 409]], outcomes
imported = next(data for status, data in outcomes if status == 201)
image = imported['id']
assert request(path+'/import', 'POST', {})[1]['id'] == image
sealed = request(path)[1]
assert sealed['image_id'] == image and sealed['revision'] == 3 and sealed['status'] == 'in-review'
assert sum(event['action'] == 'imported' for event in sealed['events']) == 1
assert json.loads(sealed['events'][0]['after_json'])['checks']['safety_confirmed'] is True
assert request(path, 'PUT', dict(plan=plan, revision=3, reason='No provenance rewrite'))[0] == 409
_, queue = request('/api/admin/images?status=in-review')
linked = [row for row in queue if row['title'] == plan['title']]
assert len(linked) == 1
candidate = linked[0]
assert candidate['type'] == 'AI' and candidate['demo'] == 0 and candidate['status'] == 'in-review'
assert candidate['studio_plan_id'] == pid
assert candidate['ai_prompt'] == plan['prompt'] and candidate['ai_model'] == plan['ai_model']
assert candidate['generation_date'] == plan['generation_date'] and candidate['owner_declaration'] == 1
assert candidate['curation']['verified_place'] is None and candidate['curation']['represented_place'] == plan['place']
assert request('/api/admin/review/'+image, 'POST', dict(decision='approved', notes='No checks'))[0] == 400

# A generated external-file fixture is uploaded only to the local quarantine.
def chunk(kind, data): return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data))
pixels = uuid.uuid4().bytes[:12]
png = b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00'+pixels[:6]+b'\x00'+pixels[6:]))+chunk(b'IEND',b'')
assert request('/api/admin/assets/'+image, 'PUT', png)[0] == 200
assert request('/api/admin/assets/'+image)[0] == 200
assert request('/api/media/'+image, auth='')[0] == 404
reviewed_explanation = 'Immagine generata con IA. Spiegazione modificata dal revisore dopo aver visto il risultato; nessuna fotografia archivistica autentica.'
status, _ = request('/api/admin/review/'+image, 'POST', dict(decision='approved', notes='Revisione manuale della fixture', rights_confirmed=True, authenticity_confirmed=True, explanation=reviewed_explanation))
assert status == 200
assert request(path)[1]['status'] == 'approved'
assert request('/api/admin/assets/'+image, 'PUT', png)[0] == 409
profile = os.environ.get('ROS_TEST_PROFILE','local')
args = ['--env',profile] if profile else []
audit_result = subprocess.run(['npx','wrangler','d1','execute','DB','--local','--persist-to',os.environ['ROS_TEST_STATE'],'--command',f"SELECT notes FROM review_events WHERE image_id='{image}'",'--json',*args],check=True,capture_output=True,text=True)
audit = json.loads(json.loads(audit_result.stdout)[0]['results'][0]['notes'])
assert audit['changes']['explanation'] == {'before':plan['reveal_explanation'],'after':reviewed_explanation}

# Force only an already-owned LOCAL test assignment to this approved asset,
# avoiding probabilistic retries when testing the actual studio image's secrecy.
status, game = request('/api/sessions', 'POST', dict(mode='training', count=1), auth='')
assert status == 201
sid = game['id']
profile = os.environ.get('ROS_TEST_PROFILE','local')
args = ['--env',profile] if profile else []
command = f"UPDATE game_rounds SET image_id='{image}' WHERE session_id='{sid}'"
subprocess.run(['npx','wrangler','d1','execute','DB','--local','--persist-to',os.environ['ROS_TEST_STATE'],'--command',command,*args],check=True,stdout=subprocess.DEVNULL)
status, view = request('/api/sessions/'+sid, auth='')
assert status == 200
for private in ['PRIVATE_STUDIO', 'ai_prompt', 'ai_model', 'cognitive_mechanism', 'slop', 'template_version']:
    assert private not in json.dumps(view), private
assert request(view['question']['image'], auth='')[1] == png
assert request('/api/sessions/'+sid+'/ready', 'POST', dict(roundId=view['question']['id']), auth='')[0] == 200
_, revealed = request('/api/sessions/'+sid+'/answer', 'POST', dict(roundId=view['question']['id'], choice='AI'), auth='')
assert revealed['answer'] == 'AI' and 'generata con IA' in revealed['explanation']
assert revealed['explanation'] == reviewed_explanation
assert 'PRIVATE_STUDIO' not in json.dumps(revealed)

# Retired difficulty cannot change public settings or introduce a selector.
assert request('/api/sessions','POST',dict(mode='training',difficulty='esperto'),auth='')[0] == 201
# Rejection goes through the existing moderation endpoint for another manual import.
_, second = request('/api/admin/slop', 'POST', dict(plan=draft(), reason='Fixture per rifiuto'))
_, pending = request('/api/admin/slop/'+second['id']+'/import', 'POST', dict(**checks, revision=1, reason='Invio manuale'))
assert request('/api/admin/review/'+pending['id'], 'POST', dict(decision='rejected', notes='Output non idoneo'))[0] == 200
assert request('/api/admin/slop/'+second['id'])[1]['status'] == 'rejected'
print('Studio integration passed: templates, auth/origin, category validation, concurrent revisions/imports, exact provenance, quarantine, human approval/rejection, retired difficulty and no gameplay spoilers.')
