"""Non-destructive, aspect-preserving review copies, v1.0.0.

New editorial flow: original bytes remain in the source workspace.
Historical 1024x1024 crop studies stay reproducible via explicit legacy mode.
"""
import hashlib
import html
import json
import random
import shutil
from pathlib import Path

from PIL import Image

from ..editorial import write_private
from .presentation import oriented_frame, source_records
from .protocol import require

VERSION = "1.0.0"
MAX_SIDE = 2048
MAX_AREA = 32_000_000


def proportional_copy(raw: bytes, target: Path, max_side: int = MAX_SIDE) -> dict:
    require(type(max_side) is int and 128 <= max_side <= 4096,
            "Lato massimo da 128 a 4096 pixel")
    frame = oriented_frame(raw)
    source_width, source_height = frame.size
    require(source_width * source_height <= MAX_AREA,
            "Fotografia oltre il limite di pixel")
    frame.thumbnail((max_side, max_side), Image.Resampling.LANCZOS,
                    reducing_gap=3)
    width, height = frame.size
    require(width > 0 and height > 0 and max(width, height) <= max_side,
            "Anteprima proporzionale fuori limite")
    # Integer cross-product tolerance allows Pillow's unavoidable one-pixel rounding.
    require(abs(width * source_height - height * source_width) <=
            max(source_width, source_height), "Rapporto d'aspetto alterato")
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(not target.exists(), "Anteprima esistente: non sovrascrivere")
    frame.save(target, "WEBP", quality=85, method=6)
    target.chmod(0o600)
    operations = ["exif_orientation", "alpha_on_white"]
    if (width, height) != (source_width, source_height):
        operations.append("proportional_downscale")
    operations.extend(["compression", "format_conversion"])
    return dict(
        version=VERSION,
        source_sha256=hashlib.sha256(raw).hexdigest(),
        sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        oriented_source_size=[source_width, source_height],
        width=width, height=height, original_ratio=source_width / source_height,
        crop_box=None, retained_area=1.0, format="webp",
        color_mode="RGB", webp_quality=85, operations=operations,
        upscaled=False, review_status="pending", profile=None,
        published=False, paid=False
    )


def export_preserved(states: list[Path], out: Path,
                     max_side: int = MAX_SIDE) -> dict:
    require(not out.exists(), "La cartella esiste già: usare una nuova versione")
    # Verify all existing hashes before generating any new files.
    records = source_records(states)
    (out / "media").mkdir(parents=True, mode=0o700)
    (out / "previous-frame").mkdir(mode=0o700)
    variants = []
    cards = []
    for row, raw, previous in records:
        filename = row["id"] + ".webp"
        presentation = proportional_copy(raw, out / "media" / filename, max_side)
        shutil.copyfile(previous, out / "previous-frame" / filename)
        variants.append(dict(candidate_id=row["id"], file="media/" + filename,
                             presentation=presentation,
                             previous_profile_image_sha256=row["sha256"]))
        image_name = html.escape(filename, quote=True)
        cards.append(
            '<article><img src="media/' + image_name +
            '" alt="Fotografia proporzionale per la revisione">'
            '<details><summary>Confronta la copia precedente</summary>'
            '<img src="previous-frame/' + image_name +
            '" alt="Fotografia della revisione precedente">'
            '<p>Contesto originale conservato: 100%. Profilo nuovo da verificare.'
            '</p></details></article>'
        )
    write_private(out / "variants.json",
                  dict(version=VERSION, variants=variants, published=False,
                       old_profiles_apply_to_variants=False,
                       crop_policy="never", max_side=max_side))
    random.Random(34).shuffle(cards)
    page = (
        '<!doctype html><html lang="it"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width">'
        '<title>Copie proporzionali in revisione</title>'
        '<style>body{background:#10151c;color:#e8edf4;font:16px system-ui;'
        'max-width:1200px;margin:auto;padding:24px}.grid{display:grid;'
        'grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}'
        'article{background:#1b2430;padding:12px}img{display:block;'
        'width:100%;height:auto;max-height:70vh;object-fit:contain}'
        'summary{cursor:pointer;padding:12px 0}a{color:#81dcca}</style>'
        '<h1>Fotografie nel formato originale</h1><p>Nessun ritaglio, '
        'nessuna nuova approvazione e nessuna chiamata API.</p><div class="grid">' +
        ''.join(cards) + '</div></html>'
    )
    (out / "index.html").write_text(page, encoding="utf-8")
    return dict(version=VERSION, copies=len(variants), max_side=max_side,
                crop_policy="never", paid=False, published=False,
                review_status="pending")
