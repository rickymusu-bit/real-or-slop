#!/usr/bin/env python3
"""Importa i tre PNG originali approvati da real-or-slop-brand-assets-v1.0.0.zip.

Uso: python3 scripts/import-brand-assets.py /percorso/al/pacchetto.zip

Non scarica file da Internet e non modifica nessun asset esterno a public/brand/.
Verifica integralmente ogni immagine prima di scrivere qualsiasi file.
"""
from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "public" / "brand"
EXPECTED = {
    "hero-real-slop-v1.0.0.png": "6beafa77b26979c34551f41a3d2b61b97de4ac87329853ee4bd8c31e612841ca",
    "mascot-real-slop-v1.0.0.png": "a19d5bf150f220d1afee2c2802d450c118d0b786d905cd29f22f74d643cf5ba4",
    "logo-real-slop-v1.0.0.png": "8d92cdca9afd251e64f330e7a307025fe0c51e5fa748ad63c41cd261cdef7a8b",
}


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: python3 scripts/import-brand-assets.py PACCHETTO.zip", file=sys.stderr)
        return 2
    zip_path = Path(sys.argv[1]).expanduser()
    if not zip_path.is_file():
        print(f"File ZIP non trovato: {zip_path}", file=sys.stderr)
        return 2
    verified: dict[str, bytes] = {}
    try:
        with zipfile.ZipFile(zip_path) as archive:
            for name, expected in EXPECTED.items():
                data = archive.read(f"public/brand/{name}")
                actual = hashlib.sha256(data).hexdigest()
                if actual != expected:
                    raise ValueError(f"Checksum SHA-256 errato per {name}")
                verified[name] = data
    except (zipfile.BadZipFile, KeyError, ValueError, OSError) as error:
        print(f"Importazione interrotta senza modifiche: {error}", file=sys.stderr)
        return 1

    DEST.mkdir(parents=True, exist_ok=True)
    for name, data in verified.items():
        fd, staging = tempfile.mkstemp(prefix=".brand-", suffix=".tmp", dir=DEST)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
            os.replace(staging, DEST / name)
        finally:
            if os.path.exists(staging):
                os.unlink(staging)
        print(f"Verificato: public/brand/{name} ({len(data)} byte)")
    print("Importazione completa: 3 PNG approvati, pronti per il commit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
