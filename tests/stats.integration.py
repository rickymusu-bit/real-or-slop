"""«Statistics» and Settings through the API: quality beside the models, thresholds, hours of an open game, games now and
open, games and answers of the period, paid calls, balance of the catalogue with formats. Seeds rows in the local D1."""
from local_db import sql
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
state = os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
API = base + '/api/admin/library'

def call(path, data=None, method=None, auth=True):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(API + path, data=body, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if auth else {})})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
assert call('/stats', auth=False)[0] == 401 and call('/settings', auth=False)[0] == 401
# Quality beside the models.
status, models = call('/models'); assert status == 200 and models['image_quality'] == 'high', models
assert call('/models', {'image_quality': 'ultra'}, method='PUT')[0] == 400
status, models = call('/models', {'image_quality': 'xhigh'}, method='PUT'); assert models['image_quality'] == 'xhigh', models
status, models = call('/models', {'image_model': 'gpt-image-2'}, method='PUT')
assert models['image_quality'] == 'high', models  # gpt-image-2 has no «xhigh»: back to medium
assert call('/models', {'image_model': 'gpt-image-2.5-flare', 'image_quality': 'max'}, method='PUT')[1]['image_quality'] == 'max'
call('/models', {'image_quality': 'medium'}, method='PUT')

# Numbers of Settings: defaults, bounds, used by the SLOP studio.
status, settings = call('/settings')
assert settings['values'] == {'open_game_hours': 24, 'max_generation_attempts':3, 'editorial_tolerance':1, 'commons_checks_per_night': 50}, settings
for wrong in ({'commons_checks_per_night': -1}, {'commons_checks_per_night': 501}, {'commons_checks_per_night': 2.5}):
    assert call('/settings', wrong, method='PUT')[0] == 400, wrong
for wrong in ({'slop_section_min_real': 50}, {'slop_auto_threshold_percent': 33}, {'slop_group_min_real': 5}, {'open_game_hours': 1.5}, {'open_game_hours': '24'}, {'other': 1}, {}):
    assert call('/settings', wrong, method='PUT')[0] == 400, wrong
status, settings = call('/settings', {'max_generation_attempts': 4}, method='PUT')
assert settings['values']['max_generation_attempts'] == 4, settings
status, studio = call('/slop/state'); assert status==200 and isinstance(studio['attention'],list), studio
call('/settings', {'max_generation_attempts': 3}, method='PUT')

# Statistics: a game being played now, an open game left yesterday, a concluded game, a game whose preparation expired.
now = int(time.time() * 1000)
statements = ["INSERT INTO galleries(id,title) VALUES('st-gallery','Statistics')",
              "INSERT INTO images(id,origin,status,title,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,copy_crop,created_at,updated_at,gallery_id) VALUES "
              + ",".join(f"('st-img-{i}','{o}','published',CASE '{o}' WHEN 'REAL' THEN 's{i}' ELSE NULL END,'st/{i}','{format(900 + i, '064x')}','image/png',40,50,'st/c{i}','{format(900 + i, '064x')}','{'{"format":"3:2"}' if i == 0 else '{}'}','x','x','st-gallery')"
                         for i, o in enumerate(['REAL', 'REAL', 'SLOP', 'SLOP']))]
def game(sid, level, phase, created, rounds):
    statements.append(f"INSERT INTO game_sessions(id,mode,level,created_at,owner_hash,phase,timing_mode,round_seconds) VALUES('{sid}','levels','{level}',{created},'x','{phase}','per-image',20)")
    for position, (image, presented, choice) in enumerate(rounds):
        statements.append(f"INSERT INTO game_rounds(id,session_id,image_id,position,presented_at,copy_key) VALUES('{sid}-{position}','{sid}','st-img-{image}',{position},{presented if presented else 'NULL'},'st/c{image}')")
        if choice: statements.append(f"INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) VALUES('{sid}-{position}','{choice}',{1 if (choice == 'REAL') == (image < 2) else 0},{presented + 1000},1000)")
game('st-now', 'medio', 'active', now - 60_000, [(0, now - 30_000, 'REAL'), (2, now - 10_000, None)])
game('st-old', 'facile', 'active', now - 2 * 3_600_000, [(1, now - 2 * 3_600_000, None)])
game('st-done', 'facile', 'completed', now - 600_000, [(0, now - 590_000, 'REAL'), (1, now - 580_000, 'AI'), (2, now - 570_000, 'AI'), (3, now - 560_000, None)])
game('st-expired', 'esperto', 'invalidated', now - 300_000, [(3, None, None)])
before = sql("SELECT count(*) AS n FROM game_sessions WHERE phase IN ('preparing','active')")[0]['n']
sql('; '.join(statements))
try:
    assert call('/stats?period=year')[0] == 400
    status, stats = call('/stats?period=7'); assert status == 200, stats
    assert stats['live']['now'] >= 1 and stats['live']['by_level']['medio'] >= 1, stats['live']
    assert stats['live']['open'] >= before + 2, stats['live']  # st-now and st-old are open within 24 hours
    call('/settings', {'open_game_hours': 1}, method='PUT')
    assert call('/stats?period=7')[1]['live']['open'] == stats['live']['open'] - 1  # st-old started two hours ago
    call('/settings', {'open_game_hours': 24}, method='PUT')
    games = {g['level']: g for g in stats['games']}
    assert games['facile']['completed'] >= 1 and games['facile']['unfinished'] >= 1, games['facile']
    assert games['esperto']['invalidated'] >= 1 and games['medio']['unfinished'] >= 1, games
    # st-done: REAL 1 of 2 recognised, SLOP 1 of 2 with one timed out: BA 0.5, score 0.
    assert stats['answers']['real']['total'] >= 2 and stats['answers']['timed_out'] >= 1, stats['answers']
    assert set(stats['calls']) == {'totals', 'recent'} and all(set(c) == {'kind', 'model', 'status', 'input_tokens', 'output_tokens', 'created_at'} for c in stats['calls']['recent'])
    assert {t['kind'] for t in stats['calls']['totals']} <= {'analysis', 'prompts', 'images', 'evaluation'}
    balance = stats['balance']
    assert balance['real']['published'] >= 2 and balance['slop']['published'] >= 2 and [l['id'] for l in balance['levels']] == ['facile', 'medio', 'difficile', 'esperto'], balance
    share = balance['real']['published'] / (balance['real']['published'] + balance['slop']['published'])
    assert abs(balance['real_share_published'] - round(share, 3)) < 0.001 and balance['warning'] == (share < 0.4 or share > 0.6), balance
    assert 'formats' not in balance and 'groups' not in balance and 'measures' not in balance
    assert 'groups' not in call('/slop/state')[1]
    assert call('/stats')[1]['period'] == '30' and call('/stats?period=all')[0] == 200
finally:
    sql("DELETE FROM game_sessions WHERE id IN ('st-now','st-old','st-done','st-expired'); DELETE FROM images WHERE id LIKE 'st-img-%'")
print('Statistics and Settings integration 1.2.0 passed: quality beside the models, thresholds, hours of an open game, games now and open, games, answers, calls, balance with formats.')
