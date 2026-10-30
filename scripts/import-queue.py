"""Explicit local metadata import, never approval. Files uploaded separately by editor."""
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request,urlopen
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline.licenses import recognized_license
p=argparse.ArgumentParser();p.add_argument('manifest');p.add_argument('--base',default='http://127.0.0.1:8787');args=p.parse_args()
from urllib.parse import urlparse
if urlparse(args.base).hostname not in ['localhost','127.0.0.1']:raise SystemExit('Questo script importa solo verso una demo locale')
token=os.environ.get('ROS_ADMIN_TOKEN')
if not token:raise SystemExit('Configurare ROS_ADMIN_TOKEN senza stamparlo')
for item in json.loads(Path(args.manifest).read_text()):
    m=item['metadata'];license=recognized_license(m.get('rights'))
    data=dict(type='REAL',title=m['title'],description=m.get('date',''),author=m['author'],source_url=m['source_url'],provider=m['provider'],source_id=m['source_id'],license_name=license['name'] if license else m['rights'],license_url=license['url'] if license else (m['rights'] if m['rights'].startswith('https://') else ''),evidence=m['evidence'],explanation='Spiegazione editoriale da completare prima dell’approvazione.',categories=m.get('categories',[]),difficulty='medio')
    try:
        r=urlopen(Request(args.base+'/api/admin/import',data=json.dumps(data).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token}),timeout=20)
        print('Candidata importata:',json.load(r)['id'])
    except Exception:raise SystemExit('Import bloccato: controllare metadati, licenza URL, categorie, duplicati e accesso admin')
