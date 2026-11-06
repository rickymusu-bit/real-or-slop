"""Real LOCAL D1/R2, original-only fake generation. No OpenAI API access."""
import concurrent.futures
import contextlib
from dataclasses import asdict
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
from unittest.mock import patch
sys.path.insert(0, str(Path('.').resolve()))
from pipeline.importer import request, RequestError
from pipeline.v2.run import Remote, main
from pipeline.v2.engine import Config, Engine, initialize
from pipeline.v2.fixtures import study_inputs, FixtureBatch

assert os.environ.get('ROS_TEST_V2') == '1'
base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
os.environ['ENABLE_EDITORIAL_V2_PAID'] = 'true'  # Explicit local fixture execution only.
cfg = Config(evaluator_model='fixture-vision', image_model='fixture-image', run_usd=1, daily_usd=1, evaluation_usd=.01, generation_usd=.1, size='auto', presentation_mode='whole_frame')


def call(path, data=None, method=None):
    return request(base, token, '/api/admin/editorial/v2/' + path, method or ('POST' if data is not None else 'GET'), data)


def sql(command):
    args = ['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', os.environ['ROS_TEST_STATE'], '--command', command, '--json']
    return json.loads(subprocess.check_output(args, stderr=subprocess.DEVNULL))[0]['results']


def rejected(action, message):
    try:
        action()
        raise AssertionError(message)
    except RequestError:
        pass


rejected(lambda: request(base, 'wrong', '/api/admin/editorial/v2/candidates'), 'Unauthenticated v2 read')
with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    reals, slop = study_inputs(root / 'inputs', 8)
    for origin, inputs in [('AI', slop), ('REAL', reals)]:
        uid = 'v2-local-' + origin + '-' + uuid.uuid4().hex
        folder = root / origin
        state = initialize(origin, inputs, root / 'inputs', folder, cfg, uid, True, dict(url='https://creativecommons.org/publicdomain/zero/1.0/', author='LOCAL fixture'))
        state['simulated'] = False  # Exercise server validation using a local fake API.
        payload = dict(id=uid, origin=origin, config=asdict(cfg), input=inputs)
        call('runs', payload)
        assert call('runs', payload)['id'] == uid
        if origin == 'AI':
            bad = json.loads(json.dumps(payload)); bad['id'] += '-bad'; bad['input']['ideas'][0]['reference_id'] = 'forbidden'
            rejected(lambda: call('runs', bad), 'Photo-derived idea accepted')
        remote = Remote(base, token, uid); remote.acquire()
        try:
            rejected(lambda: Remote(base, token, uid).acquire(), 'Concurrent lease granted')
            remote.save(state, folder)
            restored = root / (origin + '-restored'); restored.mkdir()
            saved = remote.restore(restored)
            assert saved['origin'] == origin
            rejected(lambda: remote.send('checkpoint', dict(revision=remote.revision - 1, state=saved, files=call('runs/' + uid)['files'])), 'Stale checkpoint accepted')
            api = FixtureBatch(); engine = Engine(saved, restored, api, remote)
            for _ in range(10):
                result = engine.tick(execute=True)
                if result['status'] in ('completed', 'paused'):
                    break
            assert result['status'] == 'completed', result
            assert result['candidates'] == 4, result
            assert len(api.batches) == (2 if origin == 'AI' else 1)
            # Completion and archive export are idempotent, with no new calls.
            assert engine.tick(execute=False)['status'] == 'completed'
            candidates = call('candidates?run_id=' + uid)['candidates']
            assert len(candidates) == 4
            row = candidates[0]
            from urllib.request import Request, urlopen
            with urlopen(Request(base + row['image'], headers={'Authorization': 'Bearer ' + token})) as response:
                assert response.headers['Content-Type'] == 'image/webp' and response.read(12).startswith(b'RIFF')
            review = dict(revision=row['revision'], decision='approved', confirm_reviewed=True, provenance=row['provenance'], feedback=row['feedback'])
            if origin == 'REAL':
                rejected(lambda: call('candidates/' + row['id'] + '/review', review), 'Unverified REAL approved')
                review['provenance']['authenticity'] = 'hybrid'
                rejected(lambda: call('candidates/' + row['id'] + '/review', review), 'Hybrid approved')
                review['provenance']['authenticity'] = 'verified'
            reviewed = call('candidates/' + row['id'] + '/review', review)
            assert reviewed['reviewed'] and not reviewed['published']
            rejected(lambda: call('candidates/' + row['id'] + '/review', review), 'Stale review accepted')
            assert call('candidates?run_id=' + uid)['candidates'][0]['review_state'] == 'approved'
            mutated = json.loads(json.dumps(engine.state)); mutated['candidates'][0]['provenance']['author'] = 'changed'
            rejected(lambda: remote.send('checkpoint', dict(revision=remote.revision, state=mutated, files=call('runs/' + uid)['files'])), 'Completed dossier rewritten')
        finally:
            remote.release()
        if origin == 'AI':
            # Repeating start from a new workspace uses the completed server run;
            # it cannot create new jobs or repeat the original budget debits.
            manifest = root / 'slop.json'; manifest.write_text(json.dumps(inputs))
            api = FixtureBatch()
            api.api = lambda endpoint: {'data': [{'id': cfg.evaluator_model}, {'id': cfg.image_model}]}
            with patch('pipeline.v2.run.Config.environment', return_value=cfg), patch('pipeline.v2.run.BatchAPI', return_value=api), patch.dict(os.environ, {'REAL_OR_SLOP_ADMIN_TOKEN': token, 'GENERATED_V2_LICENSE_URL': 'https://creativecommons.org/licenses/by/4.0/', 'GENERATED_V2_AUTHOR': 'LOCAL fixture'}), contextlib.redirect_stdout(io.StringIO()) as output:
                assert main([str(manifest), '--start', '--execute', '--run-id', uid, '--base', base, '--out', str(root / 'restart')]) == 0, output.getvalue()
            assert not api.batches
            assert call('runs/' + uid)['state']['license']['url'] == 'https://creativecommons.org/publicdomain/zero/1.0/'
    # Both independent origins share the cumulative ledger, including races.
    assert sql('SELECT round(sum(reserved_usd),6) AS total FROM editorial_usage')[0]['total'] == .48
    race = 'v2-race-' + uuid.uuid4().hex
    call('runs', dict(id=race, origin='AI', config=asdict(cfg), input=slop))
    remote = Remote(base, token, race); remote.acquire()
    try:
        def reserve(index):
            try:
                return remote.send('reserve', dict(id='v2-race-job-' + str(index), requests=[dict(id='v2-race-call-' + str(index), kind='evaluation')]), 'POST')
            except RequestError:
                return None
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            outcomes = list(pool.map(reserve, range(2)))
        assert sum(result is not None for result in outcomes) == 1, outcomes
        winner = next(index for index, result in enumerate(outcomes) if result is not None)
        assert reserve(winner)['already_reserved']
        assert sql('SELECT round(sum(reserved_usd),6) AS total FROM editorial_usage')[0]['total'] == .49
    finally:
        remote.release()
    rejected(lambda: call('publish', dict(confirm=True)), 'Experimental publication route exists')
    assert sql('SELECT count(*) AS n FROM published_images')[0]['n'] == 24
    assert sql('SELECT count(*) AS n FROM images')[0]['n'] == 24
    assert sql('SELECT count(*) AS n FROM reference_photos')[0]['n'] == 0
    assert request(base, token, '/api/admin/review-queue')['ready'] == 0
    assert sql('SELECT count(*) AS n FROM editorial_v2_reviews')[0]['n'] == 2
print('V2 integration passed: independent flows, private D1/R2, restore, lease/CAS, original-only generation, immutable dossiers, documentary review, shared atomic budgets, no publication or gameplay changes.')
