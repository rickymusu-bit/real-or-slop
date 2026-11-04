"""Apply explicitly requested standard presentations without rewriting source reviews.

Preview by default. --apply uploads the two or more prepared files privately and
registers them only while their source approval and revision still match.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import urllib.request
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline.v2.protocol import visual_profile

spec=importlib.util.spec_from_file_location('review_import',Path(__file__).with_name('sync-review-inbox.py'))
helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)


def prepare(value,root):
    if value.get('version')!='1.0.0' or not isinstance(value.get('variants'),list) or not 1<=len(value['variants'])<=50:
        raise ValueError('Da 1 a 50 presentazioni esplicite')
    rows=[];files={};ids=set()
    for row in value['variants']:
        if not re.fullmatch(r'[\w-]{1,160}',row['image_id']) or row['image_id'] in ids:raise ValueError('Identità duplicata o non valida')
        if type(row['source_revision']) is not int or row['source_revision']<0 or not re.fullmatch('[a-f0-9]{64}',row['source_sha256']):raise ValueError('Approvazione sorgente non valida')
        file=helpers.file_info(row['file'],root)
        with Image.open(file['path']) as im:
            if im.size!=(1024,1024) or im.format!='WEBP' or im.mode!='RGB':raise ValueError('Richiesta copia WebP RGB 1024×1024')
        if file['sha256']!=row['sha256'] or row['media_key']!=file['key'] or (row['width'],row['height'])!=(1024,1024):raise ValueError('Hash o presentazione non corrispondente al file')
        meta=row['metadata'];normal=meta['normalization'];decision=normal['crop_decision']
        if normal['owner_requested'] is not True or normal['approved_source_sha256']!=row['source_sha256'] or decision['preserves_context'] is not True or decision['needs_review'] is not False:
            raise ValueError('Richiesta esplicita e ritaglio senza dubbi necessari')
        if meta['profile_image_sha256']!=file['sha256']:raise ValueError('Profilo riferito ad altri pixel')
        visual_profile(meta['profile'])
        rows.append(dict(image_id=row['image_id'],source_sha256=row['source_sha256'],source_revision=row['source_revision'],sha256=row['sha256'],
            media_key=row['media_key'],width=1024,height=1024,metadata_json=json.dumps(meta,ensure_ascii=False),created_at=row['created_at']))
        ids.add(row['image_id']);files[file['sha256']]=file
    return rows,files


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('manifest',type=Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    rows,files=prepare(json.loads(args.manifest.read_text()),Path.cwd())
    print(json.dumps(dict(presentations=len(rows),size=[1024,1024],apply=args.apply,source_reviews_rewritten=False)),flush=True)
    if not args.apply:return
    account,db,bucket=helpers.config();api='https://api.cloudflare.com/client/v4/accounts/'+account;token=os.environ['CLOUDFLARE_API_TOKEN']
    def query(sql,params=()):
        request=urllib.request.Request(api+'/d1/database/'+db+'/query',data=json.dumps(dict(sql=sql,params=list(params))).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        with urllib.request.urlopen(request,timeout=60) as response:value=json.load(response)
        if not value.get('success'):raise RuntimeError('Scrittura delle presentazioni non riuscita')
        return value['result'][0]['results']
    current=query('SELECT * FROM editorial_review_presentations');existing={r['image_id']:r for r in current};pending=[]
    for row in rows:
        old=existing.get(row['image_id'])
        if old:
            if any(old[k]!=row[k] for k in row if k!='metadata_json') or json.loads(old['metadata_json'])!=json.loads(row['metadata_json']):raise ValueError('Presentazione già presente e diversa: nessuna sovrascrittura')
        else:pending.append(row)
    # Content-addressed uploads leave every source byte intact. No model calls.
    for row in pending:
        file=files[row['sha256']]
        request=urllib.request.Request(api+'/r2/buckets/'+bucket+'/objects/'+file['key'],data=Path(file['path']).read_bytes(),method='PUT',headers={'Authorization':'Bearer '+token,'Content-Type':file['mime']})
        with urllib.request.urlopen(request,timeout=60) as response:response.read()
    keys=['image_id','source_sha256','source_revision','sha256','media_key','width','height','metadata_json','created_at']
    for offset in range(0,len(pending),10):
        chunk=pending[offset:offset+10]
        query('INSERT INTO editorial_review_presentations('+','.join(keys)+') VALUES '+','.join('('+','.join('?' for _ in keys)+')' for _ in chunk),[r[k] for r in chunk for k in keys])
    print('Presentazioni standard applicate; giudizi e fotogrammi sorgenti conservati.',flush=True)


if __name__=='__main__':main()
