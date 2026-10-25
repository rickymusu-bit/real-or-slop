"""Official API connectors. Network usage requires explicit --live."""
import json
import os
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

def clean(value):
    if isinstance(value, list): return '; '.join(str(v) for v in value)
    return str(value or '')

def candidate(provider, asset_id, title, url, image, author='', rights='', evidence='', date=''):
    return dict(provider=provider, source_id=str(asset_id), title=clean(title), source_url=clean(url), image_url=clean(image), author=clean(author), rights=clean(rights), evidence=clean(evidence), date=clean(date), status='in-review', type='REAL')

class Client:
    def __init__(self, user_agent, delay=1, opener=urlopen, sleep=time.sleep):
        if not user_agent or '@' not in user_agent: raise ValueError('User-Agent con contatto richiesto')
        self.ua=user_agent; self.delay=delay; self.opener=opener; self.sleep=sleep; self.calls=0
    def get(self, url):
        # All endpoints are supplied by connector code, never by arbitrary search URLs.
        for attempt in range(4):
            self.sleep(self.delay)
            try:
                self.calls+=1
                with self.opener(Request(url, headers={'User-Agent': self.ua, 'Accept':'application/json'}), timeout=20) as r:
                    data=r.read(8_000_001)
                    if len(data)>8_000_000: raise ValueError('Risposta API troppo grande')
                    return json.loads(data)
            except HTTPError as e:
                if e.code not in (429,500,502,503,504) or attempt==3: raise
                try: retry=min(60, int(e.headers.get('Retry-After',0)))
                except ValueError: retry=0
                self.sleep(max(retry,2**attempt))
            except (TimeoutError,URLError):
                if attempt==3: raise
                self.sleep(2**attempt)

class Commons:
    name='commons'
    def search(self,c,q,limit):
        data=c.get('https://commons.wikimedia.org/w/api.php?'+urlencode(dict(action='query',format='json',generator='search',gsrsearch=q,gsrnamespace=6,gsrlimit=limit,prop='imageinfo',iiprop='url|extmetadata')))
        for row in data.get('query',{}).get('pages',{}).values():
            info=(row.get('imageinfo') or [{}])[0]; m=info.get('extmetadata',{}); v=lambda k:m.get(k,{}).get('value','')
            yield candidate(self.name,row['pageid'],row['title'],info.get('descriptionurl'),info.get('url'),v('Artist'),v('LicenseUrl') or v('LicenseShortName'),json.dumps(m),v('DateTimeOriginal'))
class Openverse:
    name='openverse'
    def search(self,c,q,limit):
        data=c.get('https://api.openverse.org/v1/images/?'+urlencode(dict(q=q,page_size=limit)))
        for r in data.get('results',[]): yield candidate(self.name,r['id'],r.get('title'),r.get('foreign_landing_url'),r.get('url'),r.get('creator'),r.get('license_url'),json.dumps(r),r.get('created_on'))
class Met:
    name='met'
    def search(self,c,q,limit):
        data=c.get('https://collectionapi.metmuseum.org/public/collection/v1/search?'+urlencode(dict(q=q,hasImages='true')))
        for asset in (data.get('objectIDs') or [])[:limit]:
            r=c.get(f'https://collectionapi.metmuseum.org/public/collection/v1/objects/{asset}')
            yield candidate(self.name,asset,r.get('title'),r.get('objectURL'),r.get('primaryImage'),r.get('artistDisplayName'), 'https://creativecommons.org/publicdomain/zero/1.0/' if r.get('isPublicDomain') else '',json.dumps(r),r.get('objectDate'))
class Loc:
    name='loc'
    def search(self,c,q,limit):
        data=c.get('https://www.loc.gov/search/?'+urlencode(dict(q=q,fo='json',c=limit,fa='original-format:photo, print, drawing')))
        for r in data.get('results',[]):
            detail=c.get(r['id'].rstrip('/')+'/?fo=json') if str(r.get('id','')).startswith('https://www.loc.gov/item/') else r
            item=detail.get('item',detail)
            yield candidate(self.name,r.get('id'),r.get('title'),r.get('id'),(r.get('image_url') or [''])[-1],item.get('contributor',item.get('creator')),item.get('rights_advisory',item.get('rights')),json.dumps(detail),item.get('date'))
class Smithsonian:
    name='smithsonian'
    def search(self,c,q,limit):
        key=os.environ.get('SMITHSONIAN_API_KEY')
        if not key: raise ValueError('SMITHSONIAN_API_KEY non configurata')
        data=c.get('https://api.si.edu/openaccess/api/v1.0/search?'+urlencode(dict(q=q,rows=limit,api_key=key)))
        for r in data.get('response',{}).get('rows',[]):
            content=r.get('content',{}); descriptive=content.get('descriptiveNonRepeating',{}); media=descriptive.get('online_media',{}).get('media',[])
            for m in media[:1]:
                usage=m.get('usage',{}); freetext=content.get('freetext',{})
                yield candidate(self.name,r['id'],r.get('title'),descriptive.get('record_link'),m.get('content'),freetext.get('name'),usage.get('access'),json.dumps(r),freetext.get('date'))
class Nasa:
    name='nasa'
    def search(self,c,q,limit):
        data=c.get('https://images-api.nasa.gov/search?'+urlencode(dict(q=q,media_type='image',page_size=limit)))
        for r in data.get('collection',{}).get('items',[])[:limit]:
            d=(r.get('data') or [{}])[0]
            yield candidate(self.name,d.get('nasa_id'),d.get('title'),'https://images.nasa.gov/details/'+d.get('nasa_id',''),next((l['href'] for l in r.get('links',[]) if l.get('rel')=='preview'),''),d.get('photographer') or d.get('center'),'NASA: verifica materiale di terzi e diritti di persone/marchi',json.dumps(d),d.get('date_created'))
PROVIDERS={p.name:p() for p in [Commons,Openverse,Met,Loc,Smithsonian,Nasa]}
