"""LOCAL D1 atomic ledger and fake GPT. No model calls, keys or remote writes."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch

sys.path.insert(0, str(Path('.').resolve()))
from pipeline.importer import request, RequestError
from pipeline.real.planning import Model, Reservation
from pipeline.real.fixtures import FixtureAPI
from pipeline.real.store import Store

assert os.environ.get('ROS_TEST_REAL') == '1'
base = os.environ['ROS_TEST_BASE']; assert base.startswith('http://127.0.0.1:')
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
route = '/api/admin/editorial/real-discovery/reserve'


def payload(run, number):
    return dict(run_id=run, stage='strategies', model='gpt-6.1-terra', fingerprint=hashlib.sha256(str(number).encode()).hexdigest())


def call(value, credential=token):
    return request(base, credential, route, 'POST', value)


def rejected(fn):
    try:
        fn()
    except RequestError:
        return
    raise AssertionError('Request unexpectedly succeeded')


def sql(command):
    args = ['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', os.environ['ROS_TEST_STATE'], '--command', command, '--json']
    return json.loads(subprocess.check_output(args, stderr=subprocess.DEVNULL))[0]['results']


rejected(lambda: call(payload('unauth', 1), 'wrong'))
rejected(lambda: call({**payload('bad', 1), 'model': 'other'}))
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    repeats = list(pool.map(lambda _: call(payload('same', 1)), range(8)))
assert sum(not r['already_reserved'] for r in repeats) == 1
assert all(r['reserved_usd'] == .01 for r in repeats)

def attempt(number):
    try:
        return call(payload('same', number))
    except RequestError:
        return None
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    outcomes = list(pool.map(attempt, range(2, 10)))
assert sum(r is not None for r in outcomes) == 2  # First + two more reach run cap.
assert sql("SELECT count(*) AS n FROM editorial_usage WHERE run_id='real-same'")[0]['n'] == 3

# Two fake direct stages exercise the real authenticated server reservation.
with tempfile.TemporaryDirectory() as folder:
    store = Store(folder)
    store.freeze(dict(version='1.0.0', taxonomy_version='1.0.0', topic='animals', emotion='compassion', intensity='medium'))
    api = FixtureAPI()
    with patch.dict(os.environ, {'ENABLE_REAL_DISCOVERY_PAID': 'true'}), store.lock():
        model = Model(store, 'gpt-6.1-terra', api, Reservation(base, token, 'model'))
        strategies = model.strategies()
        model.strategies()
        assert len(api.calls) == 1
        assert strategies['strategies']
    assert all('OPENAI_API_KEY' not in p.read_text() for p in (store.folder/'requests').glob('*.json'))

# Changing run IDs cannot reset the daily aggregate cap (.06).
call(payload('daily-a', 1)); call(payload('daily-b', 1))
rejected(lambda: call(payload('daily-c', 1)))
# The cumulative ledger also includes unrelated legacy usage.
sql("INSERT INTO editorial_usage VALUES('legacy-local','legacy','2000-01-01','evaluation',0.02,'2000-01-01T00:00:00Z')")
rejected(lambda: call(payload('total', 1)))
assert sql("SELECT round(sum(reserved_usd),2) AS usd FROM editorial_usage")[0]['usd'] == .08
print('REAL discovery passed: auth, strict model, atomic races, idempotent reservations, per-run/daily/shared cumulative budgets and fake GPT cache.')
