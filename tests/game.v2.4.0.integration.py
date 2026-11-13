"""v2.4.0, 2026-11-13T22:00:00Z: no captions (docs/didascalie-wizard.v1.0.0.md): a photo and the credits carry none; migration 0047 has
emptied every caption.
v2.3.0, 2026-11-13T19:00:00Z: no initial view (docs/copie-di-gioco.v5.0.0.md): a photo comes without «view», the round stores none.
v2.2.0, 2026-11-13T10:00:00Z: copies in the nearest common format (docs/copie-di-gioco.v4.0.0.md): each photo comes with its 4:5
initial view as fractions of the copy, kept by the round; the credits no longer say «4:5».
v2.1.0, 2026-11-12T19:00:00Z: privacy notes (docs/privacy-note-legali.v1.0.0.md): entering the leaderboard needs the age declaration, the owner
deletes an entry, the credits of a REAL say how it was changed, the daily maintenance deletes games older than 12 months.
v2.0.0, 2026-11-12T09:00:00Z: the level game and the leaderboard (docs/gioco-a-livelli.v1.0.0.md) against a LOCAL Worker with real D1
and R2: levels available only with enough REAL and SLOP, preparation of the first photo only, photos served one at a time, the
countdown that starts when the photo is shown, immediate verdict, replayed and changed answers, a timed-out photo that counts as
not recognised, the score photos × (2 × BA − 1), credits with sources and prompts, the leaderboard (nickname check, one entry per
game, only concluded games, best entry per player, game code checked by the owner, hidden entries), and no PvP."""
import http.cookiejar
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from catalog_v1_2_0 import publish, remove

base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
state = os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
API = base + '/api/admin/library'

def call(url, data=None, method=None, opener=None, admin=False):
    body = json.dumps(data).encode() if data is not None else None
    headers = {'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if admin else {})}
    req = urllib.request.Request(url, data=body, method=method or ('POST' if body is not None else 'GET'), headers=headers)
    try:
        with (opener or urllib.request.build_opener()).open(req) as r:
            payload = r.read()
            return r.status, json.loads(payload) if r.headers.get('Content-Type', '').startswith('application/json') else payload
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def sql(command):
    out = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command, '--json'],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]['results']
def player(): return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def origin_of(round_id): return sql(f"SELECT i.origin FROM game_rounds r JOIN images i ON i.id=r.image_id WHERE r.id='{round_id}'")[0]['origin']
def expected(outcomes):
    real = [o for o in outcomes if o[0] == 'REAL']; slop = [o for o in outcomes if o[0] == 'AI']
    rates = [sum(1 for a, c in group if a == c) / len(group) for group in (real, slop) if group]
    ba = sum(rates) / len(rates)
    return round(len(outcomes) * (2 * ba - 1) * 10) / 10

# Nothing older in the catalogue: each level counts only what this script publishes.
for row in sql("SELECT id FROM images WHERE status='published'"): call(f'{API}/{row["id"]}/withdraw', {}, admin=True)
assert call(base + '/api/rooms')[0] == 404  # no PvP
status, levels = call(base + '/api/levels'); assert status == 200, levels
assert [(l['id'], l['photos'], l['seconds'], l['available']) for l in levels['levels']] == \
    [('facile', 10, 20, False), ('medio', 15, 15, False), ('difficile', 20, 10, False), ('esperto', 25, 5, False)], levels
status, refused = call(base + '/api/sessions', {'level': 'facile'}, opener=player()); assert status == 409 and '10 REAL e 10 SLOP' in refused['error'], refused
catalogue = publish(API, token, 'gm', real=10, slop=10)
try:
    assert [l['available'] for l in call(base + '/api/levels')[1]['levels']] == [True, False, False, False]
    for wrong in ({'level': 'impossibile'}, {}, {'level': 'facile', 'count': 3}, {'mode': 'training'}):
        assert call(base + '/api/sessions', wrong, opener=player())[0] == 400, wrong

    def play(opener, wrong=(), late=(), check=False):
        """Plays a whole «facile» game: right answers except the positions in `wrong`; the photos in `late` time out."""
        status, session = call(base + '/api/sessions', {'level': 'facile'}, opener=opener); assert status == 201, session
        sid, outcomes = session['id'], []
        status, view = call(f'{base}/api/sessions/{sid}', opener=opener)
        assert view['phase'] == 'preparing' and view['total'] == 10 and view['seconds'] == 20 and view['question'] is None, view
        status, manifest = call(f'{base}/api/sessions/{sid}/manifest', opener=opener); assert len(manifest['images']) == 1, manifest
        first = manifest['images'][0]
        if check:
            assert not any(k in json.dumps(manifest) for k in ('REAL"', '"AI"', 'origin', 'prompt')), manifest
            status, image = call(base + first['image'], opener=opener); assert status == 200 and image[:4] == b'RIFF'
            second = sql(f"SELECT id FROM game_rounds WHERE session_id='{sid}' AND position=1")[0]['id']
            assert call(f'{base}/api/sessions/{sid}/media/{second}', opener=opener)[0] == 404  # one photo at a time
            assert call(f'{base}/api/sessions/{sid}/start', {'prepared': True, 'roundIds': [second]}, opener=opener)[0] == 409
            assert call(f'{base}/api/sessions/{sid}', opener=player())[0] in (401, 404)  # someone else's game
        status, view = call(f'{base}/api/sessions/{sid}/start', {'prepared': True, 'roundIds': [first['id']]}, opener=opener)
        assert status == 200 and view['phase'] == 'active', view
        for position in range(10):
            status, view = call(f'{base}/api/sessions/{sid}', opener=opener)
            q = view['question']; assert q['number'] == position + 1 and view['expiresAt'] is None, view
            assert 'view' not in q and 'caption' not in q, q
            if check and position == 0:
                assert call(f'{base}/api/sessions/{sid}/answer', {'roundId': q['id'], 'choice': 'REAL'}, opener=opener)[0] == 409  # not shown yet
            status, view = call(f'{base}/api/sessions/{sid}/ready', {'roundId': q['id']}, opener=opener)
            assert status == 200 and view['expiresAt'] and view['expiresAt'] - view['serverNow'] <= 20_000, view
            answer = 'AI' if origin_of(q['id']) == 'SLOP' else 'REAL'
            if position in late:
                sql(f"UPDATE game_rounds SET expires_at={int(time.time() * 1000) - 2000} WHERE id='{q['id']}'")
                status, after = call(f'{base}/api/sessions/{sid}', opener=opener)
                assert after['timedOut'] >= 1 and (after['question'] is None or after['question']['id'] != q['id']), after
                assert call(f'{base}/api/sessions/{sid}/answer', {'roundId': q['id'], 'choice': answer}, opener=opener)[0] == 410
                outcomes.append((answer, None)); continue
            choice = ('REAL' if answer == 'AI' else 'AI') if position in wrong else answer
            status, verdict = call(f'{base}/api/sessions/{sid}/answer', {'roundId': q['id'], 'choice': choice}, opener=opener)
            assert status == 200 and verdict == {'correct': choice == answer, 'answer': answer}, verdict
            if check and position == 0:
                assert call(f'{base}/api/sessions/{sid}/answer', {'roundId': q['id'], 'choice': choice}, opener=opener)[1]['replayed'] is True
                assert call(f'{base}/api/sessions/{sid}/answer', {'roundId': q['id'], 'choice': 'REAL' if choice == 'AI' else 'AI'}, opener=opener)[0] == 409
            outcomes.append((answer, choice))
        status, view = call(f'{base}/api/sessions/{sid}', opener=opener)
        assert view['done'] and view['phase'] == 'completed' and view['result']['score'] == expected(outcomes), (view['result'], outcomes)
        return sid, view, outcomes

    # A whole game with one wrong answer and one photo timed out.
    first_player = player()
    sid, view, outcomes = play(first_player, wrong=(3,), late=(5,), check=True)
    result = view['result']
    assert result['photos'] == 10 and result['timed_out'] == 1 and result['real']['total'] + result['slop']['total'] == 10, result
    credits = view['credits']; assert len(credits) == 10 and credits[5]['timedOut'] and not credits[5]['correct'], credits[5]
    for credit in credits:
        if credit['answer'] == 'AI': assert credit['prompt'].startswith('A street scene') and 'source' not in credit, credit
        else: assert credit['title'].startswith('gm-REAL') and 'prompt' not in credit and credit['changes'].startswith('Ritagliata,'), credit
        assert call(base + credit['image'], opener=first_player)[0] == 200  # the photos of a concluded game stay visible to its player
    # Leaderboard: nickname check, one entry per game, a code shown once, stored as a hash.
    for bad in ('m3rda', 'ab', 'x' * 21, '<b>'):
        assert call(f'{base}/api/sessions/{sid}/leaderboard', {'nickname': bad, 'age_ok': True}, opener=first_player)[0] == 400, bad
    status, refused = call(f'{base}/api/sessions/{sid}/leaderboard', {'nickname': 'Tester One'}, opener=first_player)
    assert status == 400 and '14 anni' in refused['error'], refused  # age declaration required
    assert call(f'{base}/api/sessions/{sid}/leaderboard', {'nickname': 'Tester One', 'age_ok': False}, opener=first_player)[0] == 400
    status, entry = call(f'{base}/api/sessions/{sid}/leaderboard', {'nickname': 'Tester  One', 'age_ok': True}, opener=first_player)
    assert status == 201 and entry['nickname'] == 'Tester One' and re.fullmatch(r'[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{2}', entry['code']), entry
    first_code = entry['code']
    assert call(f'{base}/api/sessions/{sid}/leaderboard', {'nickname': 'Tester One', 'age_ok': True}, opener=first_player)[0] == 409
    assert not sql(f"SELECT count(*) AS n FROM leaderboard WHERE code_hash='{first_code}' OR code_hash='{first_code.replace('-', '')}'")[0]['n']
    assert call(f'{base}/api/sessions/{sid}', opener=first_player)[1]['entered'] is True
    # The same player, a perfect game: only the best entry of each player is shown.
    sid2, view2, _ = play(first_player)
    assert view2['result']['score'] == 10
    status, entry2 = call(f'{base}/api/sessions/{sid2}/leaderboard', {'nickname': 'Tester One', 'age_ok': True}, opener=first_player); assert status == 201, entry2
    other = player()
    sid3, view3, _ = play(other, wrong=(0, 1))
    status, entry3 = call(f'{base}/api/sessions/{sid3}/leaderboard', {'nickname': 'Tester Two', 'age_ok': True}, opener=other); assert status == 201, entry3
    status, board = call(base + '/api/leaderboard'); assert status == 200, board
    for period in ('week', 'all'):
        mine = [r for r in board[period] if r['nickname'].startswith('Tester')]
        assert [(r['nickname'], r['level_label'], r['score']) for r in mine] == [('Tester One', 'Facile', 10), ('Tester Two', 'Facile', view3['result']['score'])], mine
        assert all(set(r) == {'rank', 'nickname', 'level', 'level_label', 'score', 'date'} for r in board[period])  # no codes, no cookies
    # An unfinished game has no score and cannot enter.
    unfinished = player()
    status, session = call(base + '/api/sessions', {'level': 'facile'}, opener=unfinished)
    assert call(f'{base}/api/sessions/{session["id"]}/leaderboard', {'nickname': 'Tester Three', 'age_ok': True}, opener=unfinished)[0] == 409
    sql(f"UPDATE game_sessions SET phase='invalidated' WHERE id='{session['id']}'")
    # The owner checks a code and hides an entry.
    assert call(base + '/api/admin/leaderboard?code=' + first_code)[0] == 401
    status, found = call(base + '/api/admin/leaderboard?code=' + urllib.parse.quote(first_code.lower().replace('-', ' ')), admin=True)
    assert status == 200 and found['found'] and found['entry']['nickname'] == 'Tester One' and found['entry']['score'] == result['score'], found
    assert call(base + '/api/admin/leaderboard?code=ABCD-EFGH-JK', admin=True)[1] == {'found': False, 'entry': None}
    assert call(base + '/api/admin/leaderboard?code=0000', admin=True)[0] == 400
    status, entries = call(base + '/api/admin/leaderboard', admin=True)
    best = next(e for e in entries['entries'] if e['nickname'] == 'Tester One' and e['score'] == 10)
    assert call(f'{base}/api/admin/leaderboard/{best["id"]}', {'hidden': True}, admin=True)[1] == {'id': best['id'], 'hidden': True}
    mine = [r for r in call(base + '/api/leaderboard')[1]['all'] if r['nickname'].startswith('Tester')]
    assert sorted((r['nickname'], r['score']) for r in mine) == [('Tester One', result['score']), ('Tester Two', view3['result']['score'])], mine
    assert call(f'{base}/api/admin/leaderboard/{best["id"]}', {'hidden': 'yes'}, admin=True)[0] == 400
    call(f'{base}/api/admin/leaderboard/{best["id"]}', {'hidden': False}, admin=True)
    # Deleting an entry for good, on the player's request: the code finds it no more.
    victim = found['entry']['id']
    assert call(f'{base}/api/admin/leaderboard/{victim}', method='DELETE')[0] == 401
    assert call(f'{base}/api/admin/leaderboard/{victim}', method='DELETE', admin=True)[1] == {'id': victim, 'deleted': True}
    assert call(f'{base}/api/admin/leaderboard/{victim}', method='DELETE', admin=True)[0] == 404
    assert call(base + '/api/admin/leaderboard?code=' + first_code, admin=True)[1] == {'found': False, 'entry': None}
    # Daily maintenance: a game started 13 months ago goes with its rounds; a recent one stays; the leaderboard stays.
    old_sid = sid2
    sql(f"UPDATE game_sessions SET created_at={int(time.time() * 1000) - 396 * 86_400_000} WHERE id='{old_sid}'")
    with urllib.request.urlopen(base + '/cdn-cgi/handler/scheduled?cron=17+3+*+*+*') as r: assert r.status == 200
    for _ in range(20):
        if not sql(f"SELECT count(*) AS n FROM game_sessions WHERE id='{old_sid}'")[0]['n']: break
        time.sleep(0.5)
    assert sql(f"SELECT count(*) AS n FROM game_sessions WHERE id='{old_sid}'")[0]['n'] == 0
    assert sql(f"SELECT count(*) AS n FROM game_rounds WHERE session_id='{old_sid}'")[0]['n'] == 0
    assert sql(f"SELECT count(*) AS n FROM game_sessions WHERE id='{sid3}'")[0]['n'] == 1
    assert sql(f"SELECT count(*) AS n FROM leaderboard WHERE session_id='{old_sid}'")[0]['n'] == 1
finally:
    sql("DELETE FROM leaderboard WHERE nickname LIKE 'Tester%'")
    sql("UPDATE game_sessions SET phase='completed',completed=1 WHERE phase IN ('preparing','active')")
    assert remove(API, token, catalogue) == {'deleted': 20, 'postponed': 0}
print('Game integration 2.4.0 passed: no captions; photos without initial view; age declaration, deletion, changes of a REAL, 12-month maintenance; levels, one photo at a time, countdown from the photo shown, verdicts, timeouts, score, credits, leaderboard, game codes.')
