import argparse
import hashlib
import io
import json
import sqlite3
import uuid
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError,URLError
from .providers import Client,PROVIDERS
from .licenses import recognized_license

def rights_check(row):
    if not all(row.get(k) for k in ['title','source_url','image_url','author','evidence']): return 'incomplete'
    # Eligibility is not authenticity: every candidate remains in-review.
    return 'eligible-needs-review' if recognized_license(row.get('rights')) else 'ambiguous'

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
    class ReviewedRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            target=urlparse(newurl)
            if target.scheme!='https' or target.hostname not in allowed_hosts: raise ValueError('Redirect non autorizzato')
            return super().redirect_request(req,fp,code,msg,headers,newurl)
    opener=build_opener(ReviewedRedirect())
    for attempt in range(4):
        client.sleep(client.delay)
        try:
            with opener.open(Request(row['image_url'],headers={'User-Agent':client.ua}),timeout=20) as r:
                data=r.read(12_000_001)
            break
        except HTTPError as e:
            if e.code not in (429,500,502,503,504) or attempt==3: raise
            client.sleep(2**attempt)
        except (TimeoutError,URLError):
            if attempt==3: raise
            client.sleep(2**attempt)
    if len(data)>12_000_000: raise ValueError('Immagine troppo grande')
    Image.MAX_IMAGE_PIXELS=30_000_000
    with Image.open(io.BytesIO(data)) as image:
        image.load(); tiny=ImageOps.grayscale(image).resize((9,8))
        pix=list(tiny.getdata()); bits=sum((pix[y*9+x]>pix[y*9+x+1])<<(y*8+x) for y in range(8) for x in range(8))
        return data,hashlib.sha256(data).hexdigest(),f'{bits:016x}'

def optimize(data, target):
    """Whole-frame derivative; original and editorial credits remain private and intact."""
    from PIL import Image,ImageOps
    with Image.open(io.BytesIO(data)) as image:
        derivative=ImageOps.exif_transpose(image).convert('RGB')
        derivative.thumbnail((1600,1600))
        derivative.save(target,format='WEBP',quality=85,method=6)


def ingest(db,rows,config,client=None,fetch_files=False,folder=Path('.pipeline/quarantine')):
    folder.mkdir(parents=True,exist_ok=True)
    count=0
    for row in rows:
        if count>=config['max_results']: break
        if not row.get('source_id') or not row.get('source_url'): continue
        if db.execute('SELECT 1 FROM candidates WHERE (provider=? AND source_id=?) OR source_url=?',(row['provider'],row['source_id'],row['source_url'])).fetchone(): continue
        row={**row,'status':'in-review','rights_assessment':rights_check(row),'categories':config.get('categories',[]),'license_filter':config.get('licenses',[])}
        license=recognized_license(row.get('rights'))
        if license:
            # Preserve the provider's raw rights string alongside the canonical
            # identity. A port is not an upgrade to the unported/4.0 license.
            row['license_url']=license['url'];row['license_name']=license['name']
        if config.get('licenses') and (license or {}).get('name') not in config['licenses']:
            row['rights_assessment']='outside-license-filter'
        sha=phash=file=None
        uid=str(uuid.uuid4())
        if fetch_files and row['rights_assessment']=='eligible-needs-review':
            data,sha,phash=download(row,client,config.get('download_hosts',[]))
            if db.execute('SELECT 1 FROM candidates WHERE sha256=?',(sha,)).fetchone(): continue
            # Similarity suggests a duplicate, never proves authenticity.
            row['possible_duplicate']=any((int(phash,16)^int(p,16)).bit_count()<=5 for (p,) in db.execute('SELECT phash FROM candidates WHERE phash IS NOT NULL'))
            file=str(folder/uid); Path(file).write_bytes(data)
            derived=folder/(uid+'.webp'); optimize(data,derived)
            row['derived_file']=str(derived);row['transformation']='Whole-frame resize <=1600px, WebP q85; original and attribution retained privately'
        db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?,?,?)',(uid,row['provider'],row['source_id'],row['source_url'],json.dumps(row),sha,phash,file));count+=1
    db.commit();return count

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('--provider',choices=PROVIDERS,required=True);parser.add_argument('--fixture');parser.add_argument('--live',action='store_true');parser.add_argument('--download',action='store_true');parser.add_argument('--out',default='.pipeline');args=parser.parse_args()
    config=json.loads(Path(args.config).read_text()); limit=config.get('max_results',10)
    if not isinstance(limit,int) or not 1<=limit<=50: raise ValueError('max_results deve essere tra 1 e 50')
    config['max_results']=limit
    folder=Path(args.out);folder.mkdir(parents=True,exist_ok=True);db=connect(folder/'queue.sqlite')
    if args.fixture: rows=json.loads(Path(args.fixture).read_text());client=None
    elif args.live:
        client=Client(config.get('user_agent'));rows=[]
        for q in queries(config):
            if len(rows)>=limit:break
            rows.extend(PROVIDERS[args.provider].search(client,q,limit-len(rows)));rows=rows[:limit]
    else: parser.error('Usare --fixture oppure --live esplicito')
    if args.download and not args.live: parser.error('--download richiede --live')
    count=ingest(db,rows,config,client,args.download,folder/'quarantine')
    manifest=[dict(id=r[0],metadata=json.loads(r[4]),sha256=r[5],phash=r[6],file=r[7]) for r in db.execute('SELECT id,provider,source_id,source_url,metadata,sha256,phash,file FROM candidates')]
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print(f'{count} nuovi candidati privati; nessuna approvazione o pubblicazione')
if __name__=='__main__': main()
