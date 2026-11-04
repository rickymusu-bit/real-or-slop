"""Offline owner choices bound to final images; never publish or certify rights."""
import hashlib
import json
from .protocol import require, exact, text


def cohort(candidates):
    rows = sorted((r['id'], r['origin'], r['sha256']) for r in candidates)
    return hashlib.sha256(json.dumps(rows, separators=(',', ':')).encode()).hexdigest()


def validate_reviews(value, candidates):
    exact(value, ('version', 'kind', 'cohort_sha256', 'decisions'), 'Revisione editoriale')
    require(value['version'] == '1.0.0' and value['kind'] == 'owner_editorial_choices' and
            value['cohort_sha256'] == cohort(candidates), 'Revisione di un altro campione')
    require(isinstance(value['decisions'], list) and len(value['decisions']) <= len(candidates), 'Decisioni non valide')
    lookup = {r['id']: r for r in candidates}
    seen = set()
    for row in value['decisions']:
        exact(row, ('candidate_id', 'image_sha256', 'decision', 'note', 'reviewed_at'), 'Scelta immagine')
        uid = row['candidate_id']
        require(uid in lookup and uid not in seen and row['image_sha256'] == lookup[uid]['sha256'], 'Immagine sconosciuta, duplicata o diversa')
        require(row['decision'] in ('approved', 'rejected', 'pending') and isinstance(row['note'], str) and
                len(row['note']) <= 2000 and text(row['reviewed_at'], 100), 'Scelta o nota non valida')
        seen.add(uid)
    # These are quality/preferences decisions, not server-side provenance approval.
    return value


def review_script(candidates, initial_reviews=None, paired_view=False):
    records = {r['id']: r['sha256'] for r in candidates}
    initial = validate_reviews(initial_reviews, candidates)['decisions'] if initial_reviews else []
    data = json.dumps(dict(cohort_sha256=cohort(candidates), images=records,
                           initial_decisions=initial, paired_view=paired_view)).replace('<', '\\u003c')
    return '''<script>
const dataset=DATA, key='ros-owner-briefs:'+dataset.cohort_sha256;
let decisions={};try{decisions=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
if(!decisions||typeof decisions!=='object'||Array.isArray(decisions))decisions={};
for(const id of Object.keys(decisions))if(!dataset.images[id]||decisions[id]?.image_sha256!==dataset.images[id])delete decisions[id];
for(const row of dataset.initial_decisions)if(!decisions[row.candidate_id]||Date.parse(row.reviewed_at)>Date.parse(decisions[row.candidate_id].reviewed_at))decisions[row.candidate_id]=row;
function persist(){try{localStorage.setItem(key,JSON.stringify(decisions))}catch{document.querySelector('#save-status').textContent='Salvataggio locale non disponibile: esporta le scelte prima di chiudere.'}}
function count(){const chosen=Object.values(decisions).filter(r=>r.decision==='approved'||r.decision==='rejected').length;document.querySelector('#review-count').textContent=chosen+' / '+Object.keys(dataset.images).length+' immagini valutate'}
document.querySelectorAll('[data-candidate]').forEach(card=>{
 const id=card.dataset.candidate, image=card.querySelector('.final-image'), comparison=card.closest('section')?.querySelector('.comparison-image'), note=card.querySelector('textarea'), status=card.querySelector('.choice-status');
 if(decisions[id]?.image_sha256!==dataset.images[id])delete decisions[id];
 const draw=()=>{const value=decisions[id]?.decision||'pending';status.textContent={approved:'Approvata editorialmente',rejected:'Rifiutata',pending:'Da valutare'}[value];card.querySelectorAll('[data-choice]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.choice===value));b.disabled=!image.complete||!image.naturalWidth||!!comparison&&(!comparison.complete||!comparison.naturalWidth)});count()};
 const save=decision=>{decisions[id]={candidate_id:id,image_sha256:dataset.images[id],decision,note:note.value.slice(0,2000),reviewed_at:new Date().toISOString()};persist();draw()};
 note.value=decisions[id]?.note||'';note.addEventListener('input',()=>save(decisions[id]?.decision||'pending'));
 card.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>save(b.dataset.choice)));
 image.addEventListener('load',draw);image.addEventListener('error',draw);comparison?.addEventListener('load',draw);comparison?.addEventListener('error',draw);draw();
});
function filter(){const selected=dataset.paired_view?'':location.hash.slice(1);document.querySelectorAll('[data-origin]').forEach(c=>c.hidden=(selected==='REAL'||selected==='SLOP')&&c.dataset.origin!==selected)}
window.addEventListener('hashchange',filter);filter();
document.querySelector('#export-reviews').addEventListener('click',()=>{const output={version:'1.0.0',kind:'owner_editorial_choices',cohort_sha256:dataset.cohort_sha256,decisions:Object.values(decisions)};const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='real-or-slop-brief-pilot-reviews.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
</script>'''.replace('DATA', data, 1)
