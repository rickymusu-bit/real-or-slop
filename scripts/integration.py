"""Start an isolated LOCAL Worker, run HTTP/WebSocket checks, then stop it."""
import os
import secrets
import subprocess
import time
import urllib.request
from pathlib import Path
state=Path('.wrangler/integration').resolve()
base='http://127.0.0.1:8788'
local_profile=os.environ.get('ROS_TEST_PROFILE','local')
profile_args=['--env',local_profile] if local_profile else []
env={**os.environ,'XDG_CONFIG_HOME':os.environ.get('XDG_CONFIG_HOME','/tmp/real-or-slop-config'),'ROS_TEST_BASE':base,'ROS_TEST_STATE':str(state),'ROS_TEST_PROFILE':local_profile}
secret=Path('.dev.vars');created=not secret.exists()
if created: secret.write_text('ADMIN_TOKEN='+secrets.token_urlsafe(36)+'\n')
def run(args):subprocess.run([*args,*profile_args],check=True,env=env,stdout=subprocess.DEVNULL)
try:
    run(['npx','wrangler','d1','migrations','apply','DB','--local','--persist-to',str(state)])
    run(['npx','wrangler','d1','execute','DB','--local','--persist-to',str(state),'--file','scripts/seed.sql'])
    Path('artifacts').mkdir(exist_ok=True)
    with Path('artifacts/integration-worker.log').open('w') as log:
        proc=subprocess.Popen(['npx','wrangler','dev','--local','--port','8788','--persist-to',str(state),*profile_args],env=env,stdout=log,stderr=log,start_new_session=True)
        try:
            for attempt in range(50):
                try:
                    with urllib.request.urlopen(base+'/api/health',timeout=1) as r:
                        if r.status==200:break
                except OSError:time.sleep(.2)
            else:raise RuntimeError('Worker locale non pronto; vedere artifacts/integration-worker.log')
            import re,urllib.error
            for route in ['/','/allenamento','/tempo','/pvp','/informazioni','/crediti']:
                with urllib.request.urlopen(base+route) as response:
                    html=response.read().decode();assert response.status==200
                    assert '<title>Real or Slop' in html
                    asset=re.search(r'src="([^"]+\.js)"',html).group(1)
                    with urllib.request.urlopen(base+asset) as js:assert js.status==200
            print('Navigation/assets HTTP checks passed.')
            for script in (['tests/moderation.integration.py','tests/direct-import.integration.py','tests/curation.integration.py','tests/slop.integration.py'] if local_profile=='local' else [])+['tests/sampling.integration.py','tests/game.integration.py','tests/preloading.integration.py']:
                subprocess.run(['python3',script],env=env,check=True)
            subprocess.run(['node','tests/pvp.integration.mjs'],env=env,check=True)
            print('All isolated local integration checks passed.')
        finally:
            import signal
            os.killpg(proc.pid,signal.SIGTERM)
            proc.wait(timeout=10)
finally:
    if created:secret.unlink(missing_ok=True)
