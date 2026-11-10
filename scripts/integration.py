"""v2.2.0, 2026-11-09T21:30:00Z. Start an isolated LOCAL Worker (real local D1 and R2) wired to a fake OpenAI
(tests/fake_openai.py), run the HTTP and, with ROS_TEST_BROWSER=1, browser checks, then stop both.
Never touches remote resources and never calls OpenAI."""
import os
import secrets
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

state = Path('.wrangler/integration').resolve()
base, fake = 'http://127.0.0.1:8788', 'http://127.0.0.1:8799'
env = {**os.environ, 'XDG_CONFIG_HOME': os.environ.get('XDG_CONFIG_HOME', '/tmp/real-or-slop-config'),
       'WRANGLER_SEND_METRICS': 'false', 'ROS_TEST_BASE': base, 'ROS_TEST_STATE': str(state), 'ROS_TEST_FAKE_OPENAI': fake}
secret = Path('.dev.vars'); created = not secret.exists()
if created: secret.write_text('ADMIN_TOKEN=' + secrets.token_urlsafe(36) + '\n')
try:
    if state.exists(): shutil.rmtree(state)  # only the dedicated local test state
    subprocess.run(['npx', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', str(state), '--env', 'local'],
                   check=True, env=env, stdout=subprocess.DEVNULL)
    Path('artifacts').mkdir(exist_ok=True)
    with Path('artifacts/integration-worker.log').open('w') as log:
        # Analysis on, against the fake model (tests/analysis.integration.py); the budget lives in the local D1.
        analysis = {'OPENAI_API_KEY': 'test-openai-key', 'OPENAI_BASE_URL': fake + '/v1/'}
        model = subprocess.Popen(['python3', 'tests/fake_openai.py', fake.rsplit(':', 1)[1]], stdout=log, stderr=log)
        proc = subprocess.Popen(['npx', 'wrangler', 'dev', '--local', '--port', '8788', '--persist-to', str(state), '--env', 'local',
                                 *[arg for key, value in analysis.items() for arg in ('--var', f'{key}:{value}')]],
                                env=env, stdout=log, stderr=log, start_new_session=True)
        try:
            for _ in range(150):
                try:
                    with urllib.request.urlopen(base + '/api/health', timeout=1) as r:
                        if r.status == 200: break
                except OSError: time.sleep(.4)
            else: raise RuntimeError('Worker locale non pronto; vedere artifacts/integration-worker.log')
            scripts = ['tests/library.integration.py', 'tests/analysis.v1.1.0.integration.py']
            if os.environ.get('ROS_TEST_BROWSER') == '1': scripts.extend(['tests/library_browser.v1.3.0.integration.py', 'tests/real_wizard.v1.2.0.integration.py'])
            for script in scripts: subprocess.run(['python3', script], env=env, check=True)
        finally:
            os.killpg(proc.pid, 15)
            proc.wait(timeout=20)
            model.terminate(); model.wait(timeout=5)
    print('All isolated local integration checks passed.')
finally:
    if created: secret.unlink()
