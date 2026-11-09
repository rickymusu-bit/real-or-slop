"""v2.0.0, 2026-11-09T16:30:00Z. Start an isolated LOCAL Worker (real local D1 and R2), run the HTTP and,
with ROS_TEST_BROWSER=1, browser checks, then stop it. Never touches remote resources."""
import os
import secrets
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

state = Path('.wrangler/integration').resolve()
base = 'http://127.0.0.1:8788'
env = {**os.environ, 'XDG_CONFIG_HOME': os.environ.get('XDG_CONFIG_HOME', '/tmp/real-or-slop-config'),
       'WRANGLER_SEND_METRICS': 'false', 'ROS_TEST_BASE': base, 'ROS_TEST_STATE': str(state)}
secret = Path('.dev.vars'); created = not secret.exists()
if created: secret.write_text('ADMIN_TOKEN=' + secrets.token_urlsafe(36) + '\n')
try:
    if state.exists(): shutil.rmtree(state)  # only the dedicated local test state
    subprocess.run(['npx', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', str(state), '--env', 'local'],
                   check=True, env=env, stdout=subprocess.DEVNULL)
    Path('artifacts').mkdir(exist_ok=True)
    with Path('artifacts/integration-worker.log').open('w') as log:
        proc = subprocess.Popen(['npx', 'wrangler', 'dev', '--local', '--port', '8788', '--persist-to', str(state), '--env', 'local'],
                                env=env, stdout=log, stderr=log, start_new_session=True)
        try:
            for _ in range(150):
                try:
                    with urllib.request.urlopen(base + '/api/health', timeout=1) as r:
                        if r.status == 200: break
                except OSError: time.sleep(.4)
            else: raise RuntimeError('Worker locale non pronto; vedere artifacts/integration-worker.log')
            scripts = ['tests/library.integration.py']
            if os.environ.get('ROS_TEST_BROWSER') == '1': scripts.append('tests/library_browser.integration.py')
            for script in scripts: subprocess.run(['python3', script], env=env, check=True)
        finally:
            os.killpg(proc.pid, 15)
            proc.wait(timeout=20)
    print('All isolated local integration checks passed.')
finally:
    if created: secret.unlink()
