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


def standard_copy(raw, target, size=STANDARD_SIZE):
    require(size == STANDARD_SIZE, 'Il formato standard v2 è 1024×1024')
    require(0 < len(raw) <= 12_000_000, 'Originale vuoto o oltre 12 MB')
    Image.MAX_IMAGE_PIXELS = 30_000_000
    with Image.open(io.BytesIO(raw)) as source:
        require(source.format in ('JPEG', 'PNG', 'WEBP') and source.width * source.height <= 30_000_000, 'Originale non supportato')
        oriented = ImageOps.exif_transpose(source).convert('RGBA')
        # Apply the same background and pixel operations regardless of origin.
        frame = Image.new('RGBA', oriented.size, 'white')
        frame.alpha_composite(oriented)
        frame = frame.convert('RGB')
        width, height = frame.size
        from math import gcd
        divisor = gcd(*size)
        ratio_w, ratio_h = size[0] // divisor, size[1] // divisor
        units = min(width // ratio_w, height // ratio_h)
        require(units > 0, 'Originale troppo piccolo per il formato')
        crop_w, crop_h = units * ratio_w, units * ratio_h
        left, top = (width - crop_w) // 2, (height - crop_h) // 2
        box = (left, top, left + crop_w, top + crop_h)
        frame.crop(box).resize(size, Image.Resampling.LANCZOS).save(target, 'WEBP', quality=85, method=6)
    target.chmod(0o600)
    return dict(version='1.1.0', source_sha256=hashlib.sha256(raw).hexdigest(),
                sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                oriented_source_size=[width, height], crop_box=list(box),
                retained_area=crop_w * crop_h / (width * height),
                width=size[0], height=size[1], format='webp', color_mode='RGB', webp_quality=85,
                operations=['exif_orientation', 'alpha_on_white', 'center_crop', 'resize', 'compression', 'format_conversion'],
                upscaled=crop_w < size[0] or crop_h < size[1],
                review_status='pending', profile=None)


def export(states, out, size=STANDARD_SIZE):
    require(size == STANDARD_SIZE, 'Il formato standard v2 è 1024×1024')
    require(not out.exists(), 'La cartella di destinazione esiste già: usare una nuova variante')
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--states', nargs='+', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--size', choices=('1024x1024',), default='1024x1024')
    args = parser.parse_args(argv)
    print(json.dumps(export(args.states, args.out, tuple(map(int, args.size.split('x'))))))


if __name__ == '__main__':
    main()
