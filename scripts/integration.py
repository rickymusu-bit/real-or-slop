"""Start an isolated LOCAL Worker, run HTTP/WebSocket checks, then stop it."""
import os
import json
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
state=Path('.wrangler/integration').resolve()
base='http://127.0.0.1:8788'
local_profile=os.environ.get('ROS_TEST_PROFILE','local')
profile_args=['--env',local_profile] if local_profile else []
batch_test=os.environ.get('ROS_TEST_BATCH')=='1'
v2_test=os.environ.get('ROS_TEST_V2')=='1'
real_test=os.environ.get('ROS_TEST_REAL')=='1'
cycle_test=os.environ.get('ROS_TEST_CYCLE')=='1'
if cycle_test and (local_profile!='local' or batch_test or v2_test or real_test):raise RuntimeError('Cycle ledger fixtures require their own isolated local profile')
if batch_test and local_profile!='local':raise RuntimeError('Batch fixtures require the isolated local profile')
if v2_test and (local_profile!='local' or batch_test):raise RuntimeError('V2 fixtures require their own isolated local profile')
if real_test and (local_profile!='local' or batch_test or v2_test):raise RuntimeError('REAL discovery fixtures require their own isolated local profile')
batch_vars=[]
if real_test:
    # Reservation endpoint only; no model API calls or new production configuration.
    for key,value in dict(ENABLE_REAL_DISCOVERY_PAID='true',REAL_DISCOVERY_MODEL='gpt-6.1-terra',REAL_DISCOVERY_CALL_USD='0.01',REAL_DISCOVERY_RUN_USD='0.03',REAL_DISCOVERY_DAILY_USD='0.06',REAL_DISCOVERY_TOTAL_USD='0.08',REAL_DISCOVERY_MAX_CALLS='3').items():batch_vars.extend(['--var',key+':'+value])
if cycle_test:
    for key,value in dict(ENABLE_REAL_DISCOVERY_PAID='true',ENABLE_EDITORIAL_CYCLE_GENERATION='true',REAL_DISCOVERY_MODEL='gpt-6.1-terra',REAL_DISCOVERY_CALL_USD='0.01',REAL_DISCOVERY_RUN_USD='0.50',REAL_DISCOVERY_DAILY_USD='0.55',REAL_DISCOVERY_TOTAL_USD='0.65',REAL_DISCOVERY_MAX_CALLS='32',EDITORIAL_CYCLE_IMAGE_MODEL='fixture-image',EDITORIAL_CYCLE_GENERATION_USD='0.10',EDITORIAL_CYCLE_MAX_GENERATIONS='2').items():batch_vars.extend(['--var',key+':'+value])
if batch_test:
    # Monetary fixtures ONLY on wrangler dev --local. No OpenAI key or network inference.
    for key,value in dict(ENABLE_EDITORIAL_PAID='true',EDITORIAL_BATCH_EVALUATION_USD='0.01',EDITORIAL_BATCH_GENERATION_USD='0.10',EDITORIAL_RUN_USD='1',EDITORIAL_DAILY_USD='1',EDITORIAL_TOTAL_USD='0.15').items():batch_vars.extend(['--var',key+':'+value])
if v2_test:
    # Local ledger + fake Batch transport. No model API calls or remote writes.
    for key,value in dict(ENABLE_EDITORIAL_V2_EXPERIMENTS='true',ENABLE_EDITORIAL_V2_PAID='true',EDITORIAL_V2_EVALUATION_USD='0.01',EDITORIAL_V2_GENERATION_USD='0.10',EDITORIAL_V2_RUN_USD='1',EDITORIAL_V2_DAILY_USD='1',EDITORIAL_V2_TOTAL_USD='0.49',EDITORIAL_V2_MAX_EVALUATIONS='200',EDITORIAL_V2_MAX_GENERATIONS='200').items():batch_vars.extend(['--var',key+':'+value])
env={**os.environ,'XDG_CONFIG_HOME':os.environ.get('XDG_CONFIG_HOME','/tmp/real-or-slop-config'),'ROS_TEST_BASE':base,'ROS_TEST_STATE':str(state),'ROS_TEST_PROFILE':local_profile}
secret=Path('.dev.vars');created=not secret.exists()
if created: secret.write_text('ADMIN_TOKEN='+secrets.token_urlsafe(36)+'\n')
temporary_config = None
def run(args):subprocess.run([*args,*profile_args],check=True,env=env,stdout=subprocess.DEVNULL)
try:
    if not local_profile:
        # Exercise the actual no-R2 fallback even though production now has
        # bucket bindings. This derived configuration is LOCAL-only and is
        # discarded afterwards; deployment always uses wrangler.jsonc.
        state.parent.mkdir(parents=True, exist_ok=True)
        temporary_config = tempfile.TemporaryDirectory(prefix='no-r2-', dir=state.parent)
        folder = Path(temporary_config.name)
        config = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
            "import fs from 'node:fs'; import {parse} from 'jsonc-parser'; process.stdout.write(JSON.stringify(parse(fs.readFileSync('wrangler.jsonc','utf8'))));"]))
        config.pop('r2_buckets', None)
        config.pop('env', None)
        config.pop('previews', None)
        config.pop('build', None)
        config['main'] = str(Path(config['main']).resolve())
        config['assets']['directory'] = str(Path(config['assets']['directory']).resolve())
        for database in config['d1_databases']:
            database['migrations_dir'] = str(Path(database['migrations_dir']).resolve())
        file = folder/'wrangler.json'
        file.write_text(json.dumps(config))
        shutil.copyfile(secret, folder/'.dev.vars')
        (folder/'.dev.vars').chmod(0o600)
        profile_args.extend(['--config', str(file)])
        subprocess.run(['npm', 'run', 'build'], check=True, env=env, stdout=subprocess.DEVNULL)
    if state.exists(): shutil.rmtree(state)  # Only the dedicated local test state.
    run(['npx','wrangler','d1','migrations','apply','DB','--local','--persist-to',str(state)])
    run(['npx','wrangler','d1','execute','DB','--local','--persist-to',str(state),'--file','scripts/seed.sql'])
    run(['npx','wrangler','d1','execute','DB','--local','--persist-to',str(state),'--file','scripts/seed-publication.sql'])
    Path('artifacts').mkdir(exist_ok=True)
    with Path('artifacts/integration-worker.log').open('w') as log:
        proc=subprocess.Popen(['npx','wrangler','dev','--local','--port','8788','--persist-to',str(state),*profile_args,*batch_vars],env=env,stdout=log,stderr=log,start_new_session=True)
        try:
            for attempt in range(50):
                try:
                    with urllib.request.urlopen(base+'/api/health',timeout=1) as r:
                        if r.status==200:break
                except OSError:time.sleep(.2)
            else:raise RuntimeError('Worker locale non pronto; vedere artifacts/integration-worker.log')
            if not local_profile:
                token = secret.read_text().strip().split('=', 1)[1]
                req = urllib.request.Request(base+'/api/admin/import', headers={'Authorization': 'Bearer '+token})
                with urllib.request.urlopen(req) as response:
                    capabilities = json.load(response)
                    assert capabilities['quarantine_configured'] is False and capabilities['images_configured'] is False
                print('Runtime no-R2 verified: both storage bindings absent.')
            import re,urllib.error
            for route in ['/','/allenamento','/tempo','/pvp','/informazioni','/crediti']:
                with urllib.request.urlopen(base+route) as response:
                    html=response.read().decode();assert response.status==200
                    assert '<title>Real or Slop' in html
                    asset=re.search(r'src="([^"]+\.js)"',html).group(1)
                    with urllib.request.urlopen(base+asset) as js:assert js.status==200
                    styles=re.findall(r'<link\b[^>]*\bhref="([^"]+\.css)"',html)
                    assert styles,'Missing built stylesheet'
                    for style in styles:
                        with urllib.request.urlopen(base+style) as css:
                            assert css.status==200 and css.headers.get_content_type()=='text/css',(style,css.headers.get('Content-Type'))
                            assert b'<html' not in css.read(128).lower(),'HTML returned instead of CSS'
            print('Navigation/assets HTTP checks passed.')
            for script in (['tests/cycle_budget.integration.py'] if cycle_test else ['tests/real_discovery.integration.py'] if real_test else ['tests/editorial_v2.integration.py'] if v2_test else ['tests/batch.integration.py'] if batch_test else ['tests/moderation.integration.py','tests/direct-import.integration.py','tests/curation.integration.py','tests/slop.integration.py','tests/editorial.integration.py','tests/review.integration.py','tests/review_inbox.integration.py','tests/review_presentations.integration.py','tests/review_bulk_delete.integration.py','tests/similarity.integration.py','tests/editorial_cycle.integration.py','tests/editorial_intelligence.integration.py'] if local_profile=='local' else [])+['tests/sampling.integration.py','tests/game.integration.py','tests/preloading.integration.py']:
                subprocess.run(['python3',script],env=env,check=True)
            try:
                urllib.request.urlopen(base+'/api/rooms/ABCDEFGHJKLM/state')
                raise AssertionError('Public PvP API still available')
            except urllib.error.HTTPError as error: assert error.code==503
            print('Public PvP suspended; archived actor remains covered by unit tests.')
            print('All isolated local integration checks passed.')
        finally:
            import signal
            os.killpg(proc.pid,signal.SIGTERM)
            proc.wait(timeout=10)
finally:
    if created:secret.unlink(missing_ok=True)
    if temporary_config:temporary_config.cleanup()
