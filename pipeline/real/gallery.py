"""Private, reproducible review HTML. Decisions are exported, never auto-applied."""
import csv
import html
from html.parser import HTMLParser
import json
import os
import re
from urllib.parse import urlsplit

from ..editorial import write_private
from ..v2.protocol import require
from .contracts import digest
from .review import latest_reviews, verify_media
from .store import Store


class Plain(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []

    def handle_data(self, value):
        self.parts.append(value)


def plain(value):
    parser = Plain(); parser.feed(value or '')
    return html.unescape(''.join(parser.parts))


def safe_url(value, image=False):
    parsed = urlsplit(value or '')
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        return ''
    if image and parsed.hostname not in ('upload.wikimedia.org', 'thumb.wikimedia.org'):
        return ''
    return value


def retrieved(store):
    found = {}
    for path in sorted(store.folder.rglob('retrieval/*.json')):
        # A pilot also stores reports/configuration under retrieval/. Only
        # provider receipts use a SHA filename; those contain candidate lists.
        if not re.fullmatch(r'[a-f0-9]{64}', path.stem):
            continue
        source = Store(path.parent.parent)
        result = source.read('retrieval/'+path.name)
        for row in result['candidates']:
            uid = digest([row['provider'], row['source_id']])
            if uid not in found:
                found[uid] = dict(id='source-'+uid[:24], source_id=row['source_id'], sha256=None, title=row['title'], author=row['author'],
                    source_url=row['source_url'], image_url=row['image_url'], license_url=row['rights'],
                    blockers=['documentary_review_required'], queries=[])
            found[uid]['queries'].extend(v['query'] for v in result['identity']['adapted']['variants'])
    return list(found.values())


def render(store, records=None, shortlisted=(), thumbnails=None):
    records = retrieved(store) if records is None else records
    require(len(records) <= 1000, 'Galleria oltre il limite: usare un lotto più piccolo')
    current = latest_reviews(store)
    frozen = store.read('freeze.v1.0.0.json')
    mode = 'Simulazione: immagini e giudizi di test.' if frozen and frozen['simulated'] else 'Candidate da verificare individualmente.'
    thumbnails = thumbnails or {}
    folder = store.folder/'gallery'
    folder.mkdir(exist_ok=True, mode=0o700)
    rows = []
    for item in records:
        if 'derived_file' in item:
            verify_media(store, item)
            image = os.path.relpath(store.folder/item['derived_file'], folder)
        else:
            image = safe_url(thumbnails.get(item.get('source_id', ''), item.get('image_url', '')), image=True)
        proof = item.get('provenance', {})
        saved = current.get(item['id'])
        same_pixels = saved and saved['sha256'] == item.get('sha256')
        visual = item.get('visual', {})
        can_review = bool(item.get('sha256') and not item['blockers'] and visual.get('usable') and
                          visual.get('photographic') and item.get('profile_image_sha256') == item['sha256'])
        rows.append(dict(id=item['id'], sha256=item.get('sha256'), title=item.get('title', item['id']),
            author=plain(item.get('author', proof.get('author', ''))),
            source_url=safe_url(item.get('source_url', proof.get('source_url', ''))),
            license_url=safe_url(item.get('license_url', proof.get('license_url', ''))), image=image,
            blockers=item['blockers'], shortlisted=item['id'] in shortlisted, can_review=can_review,
            current_decision=saved['decision'] if same_pixels else 'pending', revision=(saved['revision'] if saved else 0)+1))
    fingerprint = digest(rows)[:20]
    name = f'review.{fingerprint}.v1.0.0.html'
    csv_name = f'candidates.{fingerprint}.v1.0.0.csv'
    cards = []
    for row in rows:
        esc = lambda value: html.escape(str(value), quote=True)
        image = f'<img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="{esc(row["image"])}" alt="{esc(row["title"])}">' if row['image'] else '<p>Apri la pagina fonte per vedere il file.</p>'
        links = ''.join(f'<a href="{esc(row[key])}" target="_blank" rel="noopener noreferrer">{label} ↗</a> ' for key, label in
                        (('source_url', 'Fonte'), ('license_url', 'Licenza')) if row[key])
        buttons = ''.join(f'<button type="button" data-decision="{value}" {"disabled" if not row["can_review"] else ""}>{label}</button>' for value, label in
                          (('approved', 'Approva'), ('rejected', 'Rifiuta'), ('pending', 'In attesa')))
        message = 'Dossier e profilo da completare' if not row['can_review'] else 'Scelta individuale sui pixel correnti'
        cards.append(f'<article data-id="{esc(row["id"])}" data-shortlisted="{str(row["shortlisted"]).lower()}">{image}<div class="body"><h2>{esc(row["title"])}</h2><p>{esc(message)}</p><p class="state">Stato: {esc(row["current_decision"])}</p><div class="choices">{buttons}</div><details><summary>Provenienza e verifiche</summary><p>{esc(row["author"])}</p>{links}<p>{esc(", ".join(row["blockers"]))}</p></details></div></article>')
    data = json.dumps(rows, ensure_ascii=False).replace('<', '\\u003c')
    document = '''<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisione privata REAL</title>
<style>body{margin:0;background:#131a20;color:#edf4f7;font:16px system-ui}header,main{max-width:1400px;margin:auto;padding:24px}h1{margin:0 0 12px}p{line-height:1.5}a{color:#9bdfd2}input,button{font:inherit;padding:11px;border:1px solid #667c8d;border-radius:6px;background:#25343f;color:white}button{cursor:pointer;min-height:44px}button:disabled{opacity:.4;cursor:default}button[aria-pressed="true"]{outline:3px solid #96e5cc}label{display:inline-block;margin:8px}#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:20px}article{border:1px solid #3a5060;border-radius:9px;background:#1c2832;overflow:hidden}img{width:100%;height:260px;object-fit:contain;background:#0c1116}.body{padding:16px}h2{font-size:17px;overflow-wrap:anywhere}.choices{display:flex;gap:8px;flex-wrap:wrap}details{margin-top:15px}details p{overflow-wrap:anywhere}[hidden]{display:none!important}#message{color:#ffdb91}</style>
<header><h1>Revisione privata REAL</h1><p>@@MODE@@</p><p>@@COUNT@@ candidate. Le decisioni vengono scaricate in un file: nessuna immagine viene pubblicata automaticamente. Le immagini con dossier o profilo pendenti restano da verificare.</p>
<label>Revisore <input id="reviewer" maxlength="200" autocomplete="name" placeholder="Nome del revisore"></label><label><input id="short" type="checkbox">Solo shortlist</label><button id="export" type="button">Scarica le mie decisioni</button><p id="message" role="status"></p><p><a href="@@CSV@@" download>Elenco CSV</a></p></header><main><div id="grid">@@CARDS@@</div></main><script id="records" type="application/json">@@DATA@@</script>
<script>const rows=JSON.parse(document.getElementById('records').textContent);const byId=new Map(rows.map(r=>[r.id,r]));const selected=new Map();for(const card of document.querySelectorAll('article'))for(const button of card.querySelectorAll('[data-decision]'))button.addEventListener('click',()=>{const row=byId.get(card.dataset.id);if(!row.can_review)return;selected.set(row.id,button.dataset.decision);for(const b of card.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));card.querySelector('.state').textContent='Scelta: '+button.textContent});document.getElementById('short').addEventListener('change',e=>{for(const card of document.querySelectorAll('article'))card.hidden=e.target.checked&&card.dataset.shortlisted!=='true'});document.getElementById('export').addEventListener('click',()=>{const reviewer=document.getElementById('reviewer').value.trim();const message=document.getElementById('message');if(!reviewer||selected.size===0){message.textContent='Indica il revisore e scegli almeno una decisione.';return}const decisions=[...selected].map(([id,decision])=>{const r=byId.get(id);return{candidate_id:id,sha256:r.sha256,decision,reviewer,revision:r.revision,confirm_reviewed:true}});const url=URL.createObjectURL(new Blob([JSON.stringify(decisions,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='decisions.v1.0.0.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent=decisions.length+' decisioni esportate; pubblicazione non avviata.'});</script></html>'''
    inserts = dict(MODE=mode, COUNT=str(len(rows)), CSV=csv_name, CARDS=''.join(cards), DATA=data)
    document = re.sub(r'@@(MODE|COUNT|CSV|CARDS|DATA)@@', lambda match: inserts[match[1]], document)
    (folder/name).write_text(document); (folder/name).chmod(0o600)
    with (folder/csv_name).open('w', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['id', 'sha256', 'author', 'source_url', 'license_url', 'current_decision', 'can_review'])
        for row in rows:
            values = [str(row.get(key) or '') for key in ('id', 'sha256', 'author', 'source_url', 'license_url', 'current_decision', 'can_review')]
            writer.writerow(["'"+value if value.lstrip().startswith(('=', '+', '-', '@')) else value for value in values])
    (folder/csv_name).chmod(0o600)
    result = dict(html=str(folder/name), csv=str(folder/csv_name), candidates=len(rows), reviewable=sum(r['can_review'] for r in rows), published=False)
    write_private(folder/'latest.v1.0.0.json', result)
    return result
