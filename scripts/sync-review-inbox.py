"""Import existing local images into the private unified review inbox.

Preview by default. --apply copies pixels to content-addressed QUARANTINE keys
and adds pending inbox rows, without altering any old judgments or game tables.
No model API, generation, search, image edits, approval or publication.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from PIL import Image


def file_info(path, root):
    path=Path(path).resolve()
    if not path.is_relative_to(root.resolve()):raise ValueError('Image outside the workspace')
    size=path.stat().st_size
    if not 0<size<=12_000_000:raise ValueError('Image size outside private archive limits')
    with Image.open(path) as image:
        mime=Image.MIME.get(image.format)
        if image.format not in ('JPEG','PNG','WEBP'):raise ValueError('Only JPEG, PNG and WebP allowed')
        image.verify()
    sha=hashlib.sha256(path.read_bytes()).hexdigest()
    return dict(path=str(path),sha256=sha,mime=mime,size=size,key='review-inbox/files/'+sha)


def prepare(plan, root):
    if set(plan)!={'version','images'} or plan['version']!='1.0.0' or not isinstance(plan['images'],list) or not plan['images']:
        raise ValueError('Invalid review import manifest')
    rows=[];files={};seen=set()
    for row in plan['images']:
        if set(row)-{'id','origin','sha256','file','metadata','pair_key','created_at','original_file'} or not re.fullmatch(r'[\w-]{1,160}',row['id']) or row['origin'] not in ('REAL','AI') or not isinstance(row['metadata'],dict):
            raise ValueError('Invalid image identity or metadata')
        preview=file_info(row['file'],root)
        if preview['sha256']!=row['sha256']:raise ValueError('Image does not match its recorded hash')
        identity=(row['origin'],row['sha256'])
        if identity in seen:raise ValueError('Duplicate image in import manifest')
        seen.add(identity);files[preview['sha256']]=preview
        metadata=dict(row['metadata'])
        if row.get('original_file'):
            original=file_info(row['original_file'],root);files[original['sha256']]=original
            metadata.update(original_key=original['key'],original_sha256=original['sha256'])
        rows.append((row['id'],row['origin'],row['sha256'],preview['key'],json.dumps(metadata,ensure_ascii=False),row.get('pair_key'),row['created_at']))
    return rows,files


def config():
    code="import fs from 'node:fs';import {parse} from 'jsonc-parser';process.stdout.write(JSON.stringify(parse(fs.readFileSync('wrangler.jsonc','utf8'))));"
    value=json.loads(subprocess.check_output(['node','--input-type=module','-e',code]))
    db=next(x for x in value['d1_databases'] if x['binding']=='DB')
    bucket=next(x for x in value['r2_buckets'] if x['binding']=='QUARANTINE')
    return value['account_id'],db['database_id'],bucket['bucket_name']


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest',type=Path)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--files-only',action='store_true',help='Stage private files before releasing the inbox schema')
    parser.add_argument('--receipts',type=Path,default=Path('.pipeline/review-consolidation/upload-receipts.json'))
    args=parser.parse_args()
    rows,files=prepare(json.loads(args.manifest.read_text()),Path.cwd())
    print(json.dumps(dict(images=len(rows),private_files=len(files),bytes=sum(x['size'] for x in files.values()),apply=args.apply,generation=False,publication=False)),flush=True)
    if not args.apply:return
    account,db,bucket=config()
    token=os.environ['CLOUDFLARE_API_TOKEN']
    receipts=json.loads(args.receipts.read_text()) if args.receipts.exists() else dict(account=account,bucket=bucket,uploaded={})
    if receipts['account']!=account or receipts['bucket']!=bucket:raise ValueError('Receipt destination differs from configured archive')
    api='https://api.cloudflare.com/client/v4/accounts/'+account
    def put(file):
        req=urllib.request.Request(api+'/r2/buckets/'+bucket+'/objects/'+file['key'],data=Path(file['path']).read_bytes(),method='PUT',
            headers={'Authorization':'Bearer '+token,'Content-Type':file['mime']})
        with urllib.request.urlopen(req,timeout=90) as response:
            if response.status!=200:raise RuntimeError('Private upload failed')
            response.read()
        return file['sha256'],dict(key=file['key'],size=file['size'])
    pending=[f for sha,f in files.items() if sha not in receipts['uploaded']]
    args.receipts.parent.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures=[pool.submit(put,f) for f in pending]
        failures=[]
        for future in as_completed(futures):
            try:
                sha,receipt=future.result()
            except (OSError,RuntimeError) as error:
                failures.append(type(error).__name__)
                print('Private upload failed:',type(error).__name__,getattr(error,'code',''),flush=True)
                continue
            receipts['uploaded'][sha]=receipt
            temporary=args.receipts.with_suffix('.tmp');temporary.write_text(json.dumps(receipts));temporary.chmod(0o600);temporary.replace(args.receipts)
            if len(receipts['uploaded'])%25==0:print('Private files copied:',len(receipts['uploaded']),flush=True)
    if failures:
        raise RuntimeError(f'{len(failures)} files failed; successful receipts preserved. Resume explicitly. No database import performed.')
    # File uploads finish before any row can expose an unavailable preview.
    if args.files_only:
        print('Private files staged. No database changes.',flush=True)
        return
    for offset in range(0,len(rows),10):
        chunk=rows[offset:offset+10]
        sql='INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,pair_key,created_at) VALUES '+','.join('(?,?,?,?,?,?,?)' for _ in chunk)+' ON CONFLICT DO NOTHING'
        req=urllib.request.Request(api+'/d1/database/'+db+'/query',data=json.dumps(dict(sql=sql,params=[v for row in chunk for v in row])).encode(),
            headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=60) as response:result=json.load(response)
        if not result.get('success') or not all(x.get('success') for x in result.get('result',[])):raise RuntimeError('Private database import failed')
    print('Private inbox import complete. Existing decisions unchanged.',flush=True)


if __name__=='__main__':
    main()
