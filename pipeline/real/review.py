"""Documentary attestation, pixel-only profiles, independent human decisions."""
import hashlib
import json
import subprocess
from datetime import datetime

from ..editorial import now, vision_payload
from ..importer import local_file
from ..licenses import recognized_license
from ..v2.engine import media
from ..v2.protocol import provenance, require, text, https, exact, identifier
from .contracts import ROOT, VERSION, digest, validate

VISUAL_INSTRUCTIONS = '''Describe only the supplied pixels, without guessing origin or facts about people/events.
Assess possible emotions (multiple allowed), valence and intensity, attention, mobile readability,
plausibility and potential for an origin-judgment game. Explain visible elements causing interest and uncertainty.
Ordinary scenes are valid. Surprise, plausibility and emotional intensity do not determine authenticity.
You receive no title, author, URL, source, intended emotion, documentary evidence or generator prompt.
Do not infer private identities, actual emotions or historical events as established facts.'''


def documentary(record):
    exact(record, ('id', 'file', 'sha256', 'provenance', 'attestation', 'features'), 'Candidata documentale')
    require(text(record['id'], 100) and text(record['file'], 1000), 'Identità/file richiesti')
    identifier(record['id'])
    proof = provenance(record['provenance'], 'REAL')
    att = record['attestation']
    exact(att, ('reviewer', 'source_verified', 'rights_verified', 'verified_at', 'original_source_url'), 'Attestazione documentale')
    require(text(att['reviewer'], 200) and text(att['verified_at'], 100) and https(att['original_source_url']), 'Revisore e fonte originaria richiesti')
    require(datetime.fromisoformat(att['verified_at'].replace('Z', '+00:00')).tzinfo is not None, 'Timestamp documentale ISO 8601 con fuso richiesto')
    require(type(att['source_verified']) is bool and type(att['rights_verified']) is bool, 'Conferme documentali esplicite richieste')
    reasons = []
    if not recognized_license(proof['license_url']) or not att['rights_verified']:
        reasons.append('license_unresolved')
    if proof['authenticity'] != 'verified' or proof['semantic_edit'] or proof['content_kind'] != 'photograph' or not att['source_verified']:
        reasons.append('origin_unverified')
    return reasons


def document_path(revision=1):
    require(type(revision) is int and 1 <= revision <= 10000, 'Revisione documentale non valida')
    return 'documented.v1.0.0.json' if revision == 1 else f'documented.r{revision}.v1.0.0.json'


def profile_path(revision=1, document_revision=1):
    document_path(document_revision)
    require(type(revision) is int and 1 <= revision <= 10000, 'Revisione visiva non valida')
    return f'profiled.r{revision}.v1.0.0.json' if document_revision == 1 else f'profiled.d{document_revision}.r{revision}.v1.0.0.json'


def prepare(store, records, root, revision=1):
    """Only source-bound, documented pixels may reach the visual model."""
    store.frozen()
    require(isinstance(records, list) and 1 <= len(records) <= 200, 'Manifest documentale da 1 a 200 candidate')
    hits = set()
    for path in (store.folder/'retrieval').glob('*.json'):
        result = store.read(str(path.relative_to(store.folder)))
        hits.update((r['provider'], r['source_id'], r['source_url']) for r in result['candidates'])
    path = document_path(revision)
    existing = store.read(path)
    checked = []
    for record in records:
        blockers = documentary(record)
        proof = record['provenance']
        require((proof['provider'], proof['source_id'], proof['source_url']) in hits, 'Dossier non collegato a un risultato del run')
        raw = local_file(record['file'], root).read_bytes()
        checksum = hashlib.sha256(raw).hexdigest()
        require(checksum == record['sha256'], 'Originale modificato prima della verifica')
        checked.append((record, blockers, raw, checksum))
    require(len({record['id'] for record in records}) == len(records), 'ID candidata duplicato')
    if existing is not None:
        old = {row['id']: row for row in existing}
        require(set(old) == {row['id'] for row in records}, 'Dossier diverso: nuova revisione documentale richiesta')
        for record, _, _, checksum in checked:
            prior = old[record['id']]
            require(prior['original_sha256'] == checksum and all(prior[key] == record[key] for key in ('provenance', 'attestation', 'features')),
                    'Dossier immutabile diverso: nuova revisione documentale richiesta')
            verify_media(store, prior)
        return existing
    if revision > 1:
        require(store.read(document_path(revision-1)) is not None, 'Revisione documentale precedente mancante')
    result, ids, hashes = [], set(), {}
    for record, blockers, raw, checksum in checked:
        proof = record['provenance']
        ids.add(record['id'])
        media_id = f"{record['id']}-d{revision}-{checksum[:12]}"
        row = dict(id=record['id'], provenance=proof, attestation=record['attestation'], features=record['features'],
                   blockers=blockers, review_state='pending', **media(raw, store.folder, 'inputs', media_id))
        if checksum in hashes:
            row['duplicate_of'] = hashes[checksum]
        else:
            hashes[checksum] = row['id']
        result.append(row)
    near_duplicates(result)  # Validate any cached feature before paid profiling.
    return store.save(path, result, immutable=True)


def verify_media(store, row):
    for file_key, hash_key in (('file', 'original_sha256'), ('derived_file', 'sha256')):
        raw = (store.folder/row[file_key]).read_bytes()
        require(hashlib.sha256(raw).hexdigest() == row[hash_key], 'Pixel originali/finali modificati dopo la verifica')


def near_duplicates(records):
    """Reuse the TS similarity implementation and model-bound cached features."""
    features = []
    for row in records:
        if row['features'] is not None:
            f = row['features']
            require(set(f) == {'version', 'sha256', 'dhash', 'embedding'} and f['sha256'] == row['sha256'], 'Impronta non legata ai pixel finali')
            features.append(dict(id=row['id'], origin='REAL', **f))
    if not features:
        return []
    result = subprocess.run(['node', '--import', 'tsx', 'scripts/real-similarity.v1.0.0.mjs'],
                            input=json.dumps(features), text=True, capture_output=True, cwd=ROOT)
    require(result.returncode == 0, 'Cache di similarità non valida')
    return json.loads(result.stdout)


def profile(store, model, revision=1, document_revision=1):
    rows = store.read(document_path(document_revision))
    require(rows is not None, 'Verifica documentale necessaria prima dei pixel')
    output = []
    for row in rows:
        verify_media(store, row)
        if row['blockers'] or row.get('duplicate_of'):
            output.append(row)
            continue
        image = (store.folder/row['derived_file']).read_bytes()
        require(hashlib.sha256(image).hexdigest() == row['sha256'], 'Pixel finali modificati')
        # This API has no argument for metadata, intent, provenance or retrieval results.
        body = vision_payload(model.model, VISUAL_INSTRUCTIONS, image)['input']
        visual = model.invoke('visual', body, revision)
        output.append({**row, 'visual': visual, 'profile_image_sha256': row['sha256']})
    return store.save(profile_path(revision, document_revision), output, immutable=True)


def shortlist(records, maximum=5):
    require(type(maximum) is int and 3 <= maximum <= 5, 'Shortlist da tre a cinque, se disponibili')
    eligible = [row for row in records if not row['blockers'] and not row.get('duplicate_of') and
                row.get('visual', {}).get('usable') and row['visual']['photographic']]
    # Inspect every profile, not just provider ranking. No cell-match score exists.
    def score(row):
        return sum(row['visual'][key] or 0 for key in ('attention', 'readability', 'game_potential'))
    selected = sorted(eligible, key=lambda row: (-score(row), row['id']))[:maximum]
    return dict(version=VERSION, shortlisted=[row['id'] for row in selected], examined=len(records),
                eligible=len(eligible), needs_human_review=True, similarity_suggestions=near_duplicates(records))


def review(store, records, decisions):
    store.frozen()
    require(isinstance(decisions, list) and 1 <= len(decisions) <= 200, 'Giudizi da 1 a 200')
    by_id = {row['id']: row for row in records}
    for decision in decisions:
        exact(decision, ('candidate_id', 'sha256', 'decision', 'reviewer', 'revision', 'confirm_reviewed'), 'Giudizio umano')
        row = by_id.get(decision['candidate_id'])
        require(row is not None and decision['sha256'] == row['sha256'] and text(decision['reviewer'], 200)
                and decision['confirm_reviewed'] is True and type(decision['revision']) is int
                and decision['revision'] > 0 and decision['decision'] in ('approved', 'rejected', 'pending'), 'Giudizio esplicito sui pixel correnti richiesto')
        if decision['decision'] == 'approved':
            verify_media(store, row)
            require(not row['blockers'] and row.get('visual', {}).get('usable') and row['visual']['photographic'], 'Approvazione bloccata')
        path = 'reviews/'+digest(dict(id=row['id'], revision=decision['revision']))+'.json'
        prior = store.read(path)
        if prior is None:
            latest = latest_reviews(store).get(row['id'])
            require(decision['revision'] == (latest['revision']+1 if latest else 1), 'Revisione umana non consecutiva')
        payload = dict(decision=decision, created_at=prior['created_at'] if prior else now(), published=False)
        store.save(path, payload, immutable=True)
    return dict(recorded=len(decisions), published=False)


def latest_reviews(store):
    current = {}
    for path in (store.folder/'reviews').glob('*.json'):
        decision = store.read(str(path.relative_to(store.folder)))['decision']
        key = decision['candidate_id']
        if key not in current or current[key]['revision'] < decision['revision']:
            current[key] = decision
    return current
