"""Starts an isolated local Worker (real local D1 and R2) wired to the fake OpenAI (tests/fake_openai.py), runs the HTTP
checks and, with ROS_TEST_BROWSER=1, the browser checks, then stops both. Never touches remote resources and never calls OpenAI.
The automatic SLOP batches run last, because they move every earlier image to the trash."""
import os
import json
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
        # Paid calls on, against the fake model (tests/fake_openai.py); everything lives in the local D1.
        analysis = {'OPENAI_API_KEY': 'test-openai-key', 'OPENAI_BASE_URL': fake + '/v1/', 'COMMONS_API_URL': fake + '/commons/w/api.php'}
        model = subprocess.Popen(['python3', 'tests/fake_openai.py', fake.rsplit(':', 1)[1]], stdout=log, stderr=log)
        proc = subprocess.Popen(['npx', 'wrangler', 'dev', '--local', '--port', '8788', '--test-scheduled', '--persist-to', str(state), '--env', 'local',
                                 *[arg for key, value in analysis.items() for arg in ('--var', f'{key}:{value}')]],
                                env=env, stdout=log, stderr=log, start_new_session=True)
        try:
            for _ in range(150):
                try:
                    with urllib.request.urlopen(base + '/api/health', timeout=1) as r:
                        if r.status == 200: break
                except OSError: time.sleep(.4)
            else: raise RuntimeError('Worker locale non pronto; vedere artifacts/integration-worker.log')
            scripts = ['tests/library.integration.py', 'tests/analysis.integration.py', 'tests/slop.integration.py', 'tests/database.integration.py', 'tests/game.integration.py', 'tests/stats.integration.py']
            if os.environ.get('ROS_TEST_BROWSER') == '1': scripts.extend(['tests/library_browser.integration.py', 'tests/real_wizard.integration.py', 'tests/real_descriptions_browser.integration.py', 'tests/slop_browser.integration.py', 'tests/database_browser.integration.py', 'tests/game_browser.integration.py'])
            scripts.append('tests/slop_auto.integration.py')
            scripts.append('tests/pipeline.integration.py')
            if os.environ.get('ROS_TEST_BROWSER') == '1': scripts.append('tests/slop_auto_browser.integration.py')
            if os.environ.get('ROS_TEST_SUITES'):
                selected = set(os.environ['ROS_TEST_SUITES'].split(','))
                known = {Path(script).name.removesuffix('.integration.py') for script in scripts}
                if selected - known: raise RuntimeError('Unknown or disabled integration suite: ' + ','.join(sorted(selected - known)))
                scripts = [script for script in scripts if Path(script).name.removesuffix('.integration.py') in selected]
            if os.environ.get('ROS_TEST_MATCH'):
                patterns = os.environ['ROS_TEST_MATCH'].split(',')
                scripts = [script for script in scripts if any(pattern in script for pattern in patterns)]
                if not scripts: raise RuntimeError('ROS_TEST_MATCH did not select any integration tests')
            timings = []
            try:
                for script in scripts:
                    started = time.monotonic()
                    result = subprocess.run(['python3', script], env=env)
                    elapsed = round(time.monotonic() - started, 2)
                    timings.append({'suite': script, 'seconds': elapsed, 'exit_code': result.returncode})
                    print(f'{script}: {elapsed}s', flush=True)
                    result.check_returncode()
            finally:
                Path('artifacts/integration-timings.json').write_text(json.dumps(timings, indent=2))
        finally:
            os.killpg(proc.pid, 15)
            proc.wait(timeout=20)
            model.terminate(); model.wait(timeout=5)
    print('All isolated local integration checks passed.')
finally:
    if created: secret.unlink()
