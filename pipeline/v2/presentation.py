"""Create reversible, uniform review copies without new API calls or approvals.

These are new variants, not replacements for profiled or approved candidates.
The crop and its meaning must be reviewed; existing profiles do not transfer.
"""
import argparse
import hashlib
import html
import io
import json
from pathlib import Path
import shutil

from PIL import Image, ImageOps

from ..batch_store import safe_path
from ..editorial import write_private
from .protocol import identifier, require

STANDARD_SIZE = (1024, 1024)
DEFAULT_CROP_MODEL = 'gpt-6.1-terra'


def oriented_frame(raw):
    require(0 < len(raw) <= 12_000_000, 'Originale vuoto o oltre 12 MB')
    Image.MAX_IMAGE_PIXELS = 30_000_000
    with Image.open(io.BytesIO(raw)) as source:
        require(source.format in ('JPEG', 'PNG', 'WEBP') and source.width * source.height <= 30_000_000, 'Originale non supportato')
        oriented = ImageOps.exif_transpose(source).convert('RGBA')
        # Apply the same background and pixel operations regardless of origin.
        frame = Image.new('RGBA', oriented.size, 'white')
        frame.alpha_composite(oriented)
        frame = frame.convert('RGB')
    return frame


def standard_copy(raw, target, size=STANDARD_SIZE, crop_box=None):
    require(size == STANDARD_SIZE, 'Il formato standard v2 è 1024×1024')
    frame = oriented_frame(raw)
    width, height = frame.size
    side = min(width, height)
    left, top = (width - side) // 2, (height - side) // 2
    center = (left, top, left + side, top + side)
    box = tuple(crop_box) if crop_box is not None else center
    require(len(box) == 4 and all(type(n) is int for n in box), 'Coordinate ritaglio non valide')
    require(0 <= box[0] < box[2] <= width and 0 <= box[1] < box[3] <= height and
            box[2] - box[0] == box[3] - box[1] == side, 'Richiesto quadrato massimo entro il fotogramma')
    frame.crop(box).resize(size, Image.Resampling.LANCZOS).save(target, 'WEBP', quality=85, method=6)
    target.chmod(0o600)
    return dict(version='1.1.0', source_sha256=hashlib.sha256(raw).hexdigest(),
                sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                oriented_source_size=[width, height], crop_box=list(box),
                retained_area=side * side / (width * height),
                width=size[0], height=size[1], format='webp', color_mode='RGB', webp_quality=85,
                operations=['exif_orientation', 'alpha_on_white', 'center_crop' if box == center else 'selected_crop', 'resize', 'compression', 'format_conversion'],
                upscaled=side < size[0],
                review_status='pending', profile=None)


def source_records(states):
    records = []
    seen = set()
    # Validate inputs before creating any output.
    for state_path in states:
        state = json.loads(state_path.read_text())
        for row in state['candidates']:
            identifier(row['id'])
            require(row['id'] not in seen, 'Identificativo duplicato')
            seen.add(row['id'])
            raw = safe_path(state_path.parent, row['file']).read_bytes()
            require(hashlib.sha256(raw).hexdigest() == row['original_sha256'], 'Originale modificato')
            preview = safe_path(state_path.parent, row['derived_file'])
            require(hashlib.sha256(preview.read_bytes()).hexdigest() == row['sha256'], 'Anteprima precedente modificata')
            records.append((row, raw, preview))
    require(bool(records), 'Nessuna candidata')
    return records


def export(states, out, size=STANDARD_SIZE):
    require(size == STANDARD_SIZE, 'Il formato standard v2 è 1024×1024')
    require(not out.exists(), 'La cartella di destinazione esiste già: usare una nuova variante')
    records = source_records(states)
    (out / 'media').mkdir(parents=True, mode=0o700)
    (out / 'previous-frame').mkdir(mode=0o700)
    variants = []
    for row, raw, preview in records:
        path = 'media/' + row['id'] + '.webp'
        presentation = standard_copy(raw, out / path, size)
        shutil.copyfile(preview, out / 'previous-frame' / (row['id'] + '.webp'))
        variants.append(dict(candidate_id=row['id'], file=path, presentation=presentation,
                             previous_profile_image_sha256=row['sha256']))
    write_private(out / 'variants.json', dict(version='1.1.0', variants=variants, published=False,
                                            old_profiles_apply_to_variants=False))
    cards = []
    for item in variants:
        name = html.escape(item['candidate_id'], quote=True)
        p = item['presentation']
        cards.append(f'<article><img src="media/{name}.webp" alt="Copia standard da revisionare">'
                     f'<details><summary>Confronta inquadratura precedente</summary>'
                     f'<img src="previous-frame/{name}.webp" alt="Inquadratura usata per il profilo precedente">'
                     f'<p>Area conservata: {p["retained_area"]:.0%}. Ritaglio e significato da verificare. '
                     'Profilo della nuova copia: da calcolare.</p></details></article>')
    # Mix origins deterministically; IDs and provenance stay out of the visible grid.
    import random
    random.Random(34).shuffle(cards)
    page = ('<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            '<title>Pilota — formato standard</title><style>body{background:#10151c;color:#e8edf4;font:16px system-ui;'
            'max-width:1200px;margin:auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}'
            'article{background:#1b2430;padding:10px}img{display:block;width:100%;height:auto}summary{cursor:pointer;padding:12px 0}'
            'a{color:#81dcca}</style><h1>Copie standard ' + str(size[0]) + '×' + str(size[1]) + '</h1>'
            '<p>' + str(len(variants)) + ' copie di revisione. Stessa procedura per entrambe le origini, originali conservati. '
            'Nessuna approvazione, pubblicazione o nuova chiamata API.</p>'
            '<p>I ritagli possono cambiare il contenuto: confrontare ogni copia con l’inquadratura precedente. '
            'I profili già disponibili descrivono quella precedente.</p><p><a href="variants.json">Registro dei ritagli e degli hash</a></p>'
            '<div class="grid">' + ''.join(cards) + '</div></html>')
    (out / 'index.html').write_text(page)
    return dict(copies=len(variants), size=list(size), review_status='pending', paid=False, published=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Presentazione v2: Terra predefinito, centro come baseline esplicita. Nessuna chiamata pagata senza --execute.')
    parser.add_argument('--states', nargs='+', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--size', choices=('1024x1024',), default='1024x1024')
    parser.add_argument('--method', choices=('terra', 'center'), default='terra')
    parser.add_argument('--model', default=DEFAULT_CROP_MODEL)
    parser.add_argument('--budget-usd', type=float)
    parser.add_argument('--reservation-usd', type=float)
    parser.add_argument('--max-calls', type=int, default=200)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args(argv)
    if args.method == 'terra':
        if args.budget_usd is None or args.reservation_usd is None:
            parser.error('Per Terra specificare --budget-usd e --reservation-usd; --execute abilita gli invii sincroni')
        from .smart_crop import run
        result = run(args.states, args.out, args.model, args.budget_usd, args.reservation_usd, args.max_calls, args.execute)
    else:
        if args.execute:
            parser.error('La baseline centrale è locale: omettere --execute')
        result = export(args.states, args.out, tuple(map(int, args.size.split('x'))))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
