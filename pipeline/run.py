import argparse
import hashlib
import io
import json
import sqlite3
import uuid
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request,urlopen
from .providers import Client,PROVIDERS

LICENSES={'https://creativecommons.org/publicdomain/zero/1.0/':'CC0','https://creativecommons.org/publicdomain/mark/1.0/':'Public Domain Mark','https://creativecommons.org/licenses/by/4.0/':'CC BY 4.0','https://creativecommons.org/licenses/by-sa/4.0/':'CC BY-SA 4.0'}

def rights_check(row):
    rights=row.get('rights','').strip().replace('http://','https://')
    if not rights.endswith('/'): rights+='/'
    if not all(row.get(k) for k in ['title','source_url','image_url','author','evidence']): return 'incomplete'
    # Eligibility is not authenticity: every candidate remains in-review.
    return 'eligible-needs-review' if rights in LICENSES else 'ambiguous'

def queries(config):
    terms=[config.get(k,'') for k in ['subject','context','place','period','kind']]
    base=' '.join(t for t in terms if t)
    variants=config.get('variants',[])[:3]
    return [base]+[base+' '+str(v) for v in variants]

def connect(path):
    db=sqlite3.connect(path)
    db.execute('CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY, provider TEXT, source_id TEXT, source_url TEXT UNIQUE, metadata TEXT, sha256 TEXT UNIQUE, phash TEXT, file TEXT, UNIQUE(provider,source_id))')
    return db

def download(row, client, allowed_hosts):
    from PIL import Image, ImageOps
    parsed=urlparse(row['image_url'])
    if parsed.scheme!='https' or parsed.hostname not in allowed_hosts: raise ValueError('Host download non autorizzato dalla configurazione')
    with urlopen(Request(row['image_url'],headers={'User-Agent':client.ua}),timeout=20) as r:
        # Refuse redirects outside the explicit reviewed host list.
        if urlparse(r.geturl()).hostname not in allowed_hosts: raise ValueError('Redirect non autorizzato')
        data=r.read(12_000_001)
    if len(data)>12_000_000: raise ValueError('Immagine troppo grande')
    Image.MAX_IMAGE_PIXELS=30_000_000
    with Image.open(io.BytesIO(data)) as image:
        image.load(); tiny=ImageOps.grayscale(image).resize((9,8))
        pix=list(tiny.getdata()); bits=sum((pix[y*9+x]>pix[y*9+x+1])<<(y*8+x) for y in range(8) for x in range(8))
        return data,hashlib.sha256(data).hexdigest(),f'{bits:016x}'

def ingest(db,rows,config,client=None,fetch_files=False,folder=Path('.pipeline/quarantine')):
    folder.mkdir(parents=True,exist_ok=True)
    count=0
    for row in rows:
        if count>=config['max_results']: break
        if not row.get('source_id') or not row.get('source_url'): continue
        if db.execute('SELECT 1 FROM candidates WHERE (provider=? AND source_id=?) OR source_url=?',(row['provider'],row['source_id'],row['source_url'])).fetchone(): continue
        row={**row,'status':'in-review','rights_assessment':rights_check(row),'categories':config.get('categories',[]),'license_filter':config.get('licenses',[])}
        sha=phash=file=None
        uid=str(uuid.uuid4())
        if fetch_files and row['rights_assessment']=='eligible-needs-review':
            data,sha,phash=download(row,client,config.get('download_hosts',[]))
            if db.execute('SELECT 1 FROM candidates WHERE sha256=?',(sha,)).fetchone(): continue
            # Similarity suggests a duplicate, never proves authenticity.
            row['possible_duplicate']=any((int(phash,16)^int(p,16)).bit_count()<=5 for (p,) in db.execute('SELECT phash FROM candidates WHERE phash IS NOT NULL'))
            file=str(folder/uid); Path(file).write_bytes(data)
        db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?,?,?)',(uid,row['provider'],row['source_id'],row['source_url'],json.dumps(row),sha,phash,file));count+=1
    db.commit();return count

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('--provider',choices=PROVIDERS,required=True);parser.add_argument('--fixture');parser.add_argument('--live',action='store_true');parser.add_argument('--download',action='store_true');parser.add_argument('--out',default='.pipeline');args=parser.parse_args()
    config=json.loads(Path(args.config).read_text()); limit=config.get('max_results',10)
    if not isinstance(limit,int) or not 1<=limit<=50: raise ValueError('max_results deve essere tra 1 e 50')
    folder=Path(args.out);folder.mkdir(parents=True,exist_ok=True);db=connect(folder/'queue.sqlite')
    if args.fixture: rows=json.loads(Path(args.fixture).read_text());client=None
    elif args.live:
        client=Client(config.get('user_agent'));rows=[]
        for q in queries(config): rows.extend(PROVIDERS[args.provider].search(client,q,limit-len(rows))); rows=rows[:limit]
    else: parser.error('Usare --fixture oppure --live esplicito')
    if args.download and not args.live: parser.error('--download richiede --live')
    count=ingest(db,rows,config,client,args.download,folder/'quarantine')
    manifest=[dict(id=r[0],metadata=json.loads(r[4]),sha256=r[5],phash=r[6],file=r[7]) for r in db.execute('SELECT id,provider,source_id,source_url,metadata,sha256,phash,file FROM candidates')]
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print(f'{count} nuovi candidati privati; nessuna approvazione o pubblicazione')
if __name__=='__main__': main()
