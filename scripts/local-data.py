"""Backup and restore check. Deliberately no remote mode."""
import argparse
import os
import subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('action',choices=['backup','restore-test']);args=p.parse_args()
env={**os.environ,'XDG_CONFIG_HOME':os.environ.get('XDG_CONFIG_HOME','/tmp/real-or-slop-config')}
backup=Path('.wrangler/backups/metadata.sql');backup.parent.mkdir(parents=True,exist_ok=True)
def run(arguments):subprocess.run(['npx','wrangler','d1',*arguments],check=True,env=env,stdout=subprocess.DEVNULL)
if args.action=='backup':
    run(['export','DB','--local','--output',str(backup)])
    print('Backup locale creato in .wrangler/backups/metadata.sql')
else:
    if not backup.exists():raise SystemExit('Eseguire backup prima di restore-test')
    import tempfile
    with tempfile.TemporaryDirectory(prefix='ros-restore-',dir='/tmp') as state:
        run(['execute','DB','--local','--persist-to',state,'--file',str(backup)])
        import sqlite3
        validated=False
        for file in Path(state).rglob('*.sqlite'):
            db=sqlite3.connect(file)
            if db.execute("SELECT 1 FROM sqlite_master WHERE name='images'").fetchone():
                if db.execute('SELECT COUNT(*) FROM images').fetchone()[0]<24:raise RuntimeError('Catalogo incompleto nel restore')
                if db.execute('PRAGMA foreign_key_check').fetchall():raise RuntimeError('Vincoli non validi nel restore')
                validated=True
            db.close()
        if not validated:raise RuntimeError('Database ripristinato non trovato')
    print('Ripristino verificato su un nuovo stato locale separato')
