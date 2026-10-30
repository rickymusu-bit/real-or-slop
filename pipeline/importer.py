"""Local files -> existing authenticated D1/R2 APIs. No Drive or approval."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from .licenses import recognized_license


def site_url(value):
    parsed = urlsplit(value)
    parsed.port  # Reject malformed ports before any authenticated request.
    local = parsed.hostname in ('localhost', '127.0.0.1', '::1')
    if (parsed.scheme != 'https' and not (parsed.scheme == 'http' and local)) or not parsed.hostname:
        raise ValueError('URL HTTPS richiesto; HTTP ammesso solo per localhost')
    if parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('Indicare l’URL radice del sito, senza credenziali o parametri')
    return value.rstrip('/')


def local_file(value, root):
    if not isinstance(value, str) or not value:
        raise ValueError('Percorso file mancante nel manifest')
    path = Path(value)
    if not path.is_absolute():
        path = path if path.is_file() else root / path
    path = path.resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError('I file del lotto devono rimanere nella cartella del manifest')
    return path


def prepare(item, root):
    from PIL import Image, ImageOps
    source = item['metadata']
    metadata = json.loads(local_file(item['import_sidecar'], root).read_text()) if item.get('import_sidecar') else source
    if not isinstance(metadata, dict):
        raise ValueError('I metadati devono essere un oggetto JSON')
    fields = ('type', 'title', 'description', 'author', 'source_url', 'provider', 'source_id', 'evidence',
              'explanation', 'categories', 'difficulty', 'ai_model', 'ai_prompt', 'generation_date', 'owner_declaration')
    payload = {key: metadata[key] for key in fields if key in metadata}
    payload.setdefault('type', 'REAL')
    payload.setdefault('difficulty', 'medio')
    payload.setdefault('explanation', 'Spiegazione editoriale da completare prima dell’approvazione.')
    payload.setdefault('description', metadata.get('date', ''))
    for key, limit in [('title', 300), ('author', 300), ('provider', 100), ('source_id', 300),
                       ('source_url', 1000), ('evidence', 4000), ('explanation', 4000)]:
        value = payload.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError(f'Completare il campo {key} (massimo {limit} caratteri)')
    source_url = urlsplit(payload['source_url'])
    if source_url.scheme != 'https' or not source_url.hostname or source_url.username or source_url.password:
        raise ValueError('La fonte deve avere un URL HTTPS valido')
    if payload['type'] not in ('REAL', 'AI') or payload['difficulty'] not in ('facile', 'medio', 'difficile'):
        raise ValueError('Tipo o difficoltà non validi')
    categories = payload.get('categories')
    if not isinstance(categories, list) or not 1 <= len(categories) <= 12 or not all(isinstance(c, str) and c for c in categories):
        raise ValueError('Indicare da 1 a 12 ID di categoria validi')
    license = recognized_license(metadata.get('license_url') or metadata.get('rights'))
    if not license:
        raise ValueError('Licenza da verificare prima del caricamento diretto')
    payload.update(license_url=license['url'], license_name=license['name'])
    original = local_file(item['file'], root)
    if original.stat().st_size > 12_000_000:
        raise ValueError('Originale oltre 12 MB')
    with original.open('rb') as stream:
        header = stream.read(12)
        if not (header.startswith(b'\xff\xd8') or header.startswith(b'\x89PNG') or
                (header.startswith(b'RIFF') and header[8:12] == b'WEBP')):
            raise ValueError('L’originale deve essere JPEG, PNG o WebP')
        stream.seek(0)
        original_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
    if item.get('sha256') and original_sha != item['sha256']:
        raise ValueError('Originale modificato rispetto al manifest')
    media = local_file(source.get('derived_file') or item['file'], root)
    if not 0 < media.stat().st_size <= 12_000_000:
        raise ValueError('File da caricare vuoto o oltre 12 MB')
    data = media.read_bytes()
    Image.MAX_IMAGE_PIXELS = 30_000_000
    with Image.open(io.BytesIO(data)) as image:
        if image.format not in ('JPEG', 'PNG', 'WEBP') or image.width * image.height > 30_000_000:
            raise ValueError('Usare JPEG, PNG o WebP entro 30 megapixel')
        mime = Image.MIME[image.format]
        image.load()
        pixels = list(ImageOps.grayscale(ImageOps.exif_transpose(image)).resize((9, 8)).getdata())
    phash = f'{sum((pixels[y*9+x] > pixels[y*9+x+1]) << (y*8+x) for y in range(8) for x in range(8)):016x}'
    payload['file_sha256'] = hashlib.sha256(data).hexdigest()
    return payload, data, mime, phash, original_sha, original


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the admin credential to a redirected origin.


def request(base, token, path, method='GET', data=None, headers=None):
    request_headers = {'Authorization': 'Bearer ' + token, **(headers or {})}
    if isinstance(data, dict):
        data = json.dumps(data).encode()
        request_headers['Content-Type'] = 'application/json'
    req = Request(base + path, method=method, data=data, headers=request_headers)
    try:
        with build_opener(NoRedirect()).open(req, timeout=90) as response:
            return json.load(response)
    except HTTPError as error:
        raise ValueError(f'API {path}: HTTP {error.code}; controllare accesso, file e configurazione') from None
    except (OSError, ValueError):
        # urllib may include header values in malformed-header errors. Never
        # forward those exception strings (or credentials) to the console.
        raise ValueError(f'API {path}: richiesta non riuscita; controllare rete e configurazione') from None


def upload(base, token, prepared):
    payload, data, mime, phash, original_sha, original = prepared
    original_bytes = original.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != original_sha:
        raise ValueError('Originale modificato durante l’importazione')
    result = request(base, token, '/api/admin/import', 'POST', payload)
    image_id = result.get('id', '')
    if not isinstance(image_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', image_id):
        raise ValueError('Risposta di importazione non valida')
    if result['status'] == 'in-review':
        if result.get('original_sha256') != original_sha:
            request(base, token, '/api/admin/originals/' + image_id, 'PUT', original_bytes,
                    {'Content-Type': 'application/octet-stream'})
        if result.get('sha256') != payload['file_sha256'] or not result.get('uploaded'):
            request(base, token, '/api/admin/assets/' + image_id, 'PUT', data,
                    {'Content-Type': mime, 'X-Perceptual-Hash': phash})
    return dict(id=image_id, status=result['status'], provider=payload['provider'], source_id=payload['source_id'],
                source_url=payload['source_url'], original_sha256=original_sha, file_sha256=payload['file_sha256'])


def main(argv=None):
    parser = argparse.ArgumentParser(description='File locali -> D1 e quarantena R2, senza Google Drive')
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--base', default='http://127.0.0.1:8787')
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--apply', action='store_true', help='Carica in quarantena; senza questo flag solo anteprima')
    parser.add_argument('--receipt', type=Path, help='Ricevuta locale per gli ID importati')
    args = parser.parse_args(argv)
    if not 1 <= args.limit <= 100:
        parser.error('--limit deve essere compreso tra 1 e 100')
    try:
        base = site_url(args.base)
        root = args.manifest.resolve().parent
        items = json.loads(args.manifest.read_text())
        if not isinstance(items, list) or not all(isinstance(item, dict) and isinstance(item.get('metadata'), dict) for item in items):
            raise ValueError('Il manifest deve essere una lista di schede con metadata')
        selected = [item for item in items if item.get('metadata', {}).get('rights_assessment') not in
                    ('outside-license-filter', 'ambiguous', 'incomplete')][:args.limit]
        # Validate the whole selected batch before the first remote mutation.
        prepared = []
        for item in selected:
            candidate = prepare(item, root)
            prepared.append(dict(item=item, payload=candidate[0], size=len(candidate[1]), original_sha=candidate[4]))
        if len({candidate['payload']['file_sha256'] for candidate in prepared}) != len(prepared):
            raise ValueError('File duplicati nel lotto: risolvere la deduplica prima dell’importazione')
        if not prepared:
            print('Nessun candidato idoneo nel lotto; nessuna richiesta di rete.')
            return 0
        token = os.environ.get('REAL_OR_SLOP_ADMIN_TOKEN') or os.environ.get('ROS_ADMIN_TOKEN', '')
        if args.apply:
            if len(token) < 32:
                raise ValueError('Configurare REAL_OR_SLOP_ADMIN_TOKEN come segreto (minimo 32 caratteri)')
            capabilities = request(base, token, '/api/admin/import')
            if capabilities.get('direct_import') != 1 or not capabilities.get('original_archive') or not capabilities.get('quarantine_configured'):
                raise ValueError('Aggiornare il Worker e configurare il binding QUARANTINE prima dell’importazione')
        receipt = args.receipt or root / 'import-receipt.json'
        results = []
        for summary in prepared:
            if args.apply:
                candidate = prepare(summary['item'], root)
                if candidate[0] != summary['payload'] or candidate[4] != summary['original_sha']:
                    raise ValueError('File o metadati modificati dopo la verifica del lotto')
                result = upload(base, token, candidate)
                results.append(result)
                temporary = receipt.with_suffix(receipt.suffix + '.tmp')
                temporary.write_text(json.dumps(dict(site=base, items=results), ensure_ascii=False, indent=2) + '\n')
                temporary.chmod(0o600)
                temporary.replace(receipt)
                print(f"[OK] {result['provider']}/{result['source_id']}: {result['id']} ({result['status']})")
            else:
                print(f"[ANTEPRIMA] {summary['payload']['provider']}/{summary['payload']['source_id']}: {summary['size']} byte -> quarantena R2")
        print(f'{len(prepared)} candidati; nessuna approvazione automatica. ' + ('Ricevuta locale salvata.' if args.apply else 'Nessuna richiesta di rete.'))
        return 0
    except (ValueError, KeyError, OSError) as error:
        print(f'Importazione interrotta: {error}')
        return 1
