#!/usr/bin/env python3
"""Read-only Google Drive originals -> private R2 moderation queue.

Files in one Drive folder are paired as <name>.json + <name>.(jpg|png|webp).
Only sidecars with ready=true are considered. Nothing is approved automatically.
Run with --apply for remote writes; normal runs are read-only previews.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
from urllib.parse import urlparse

SCOPE = ["https://www.googleapis.com/auth/drive.readonly"]
API = "https://www.googleapis.com/drive/v3/files"
MAX_ORIGINAL = 48_000_000
MAX_UPLOAD = 12_000_000
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
IGNORED = {"ready", "filename"}
REQUIRED = {"type", "title", "author", "source_url", "source_id", "provider",
            "evidence", "explanation", "categories", "difficulty"}
AI_REQUIRED = {"ai_model", "ai_prompt", "generation_date", "owner_declaration"}


def validate_manifest(item: object, available: dict[str, dict]) -> tuple[dict, dict] | None:
    if not isinstance(item, dict):
        raise ValueError("La scheda deve essere un oggetto JSON")
    if item.get("ready") is not True:
        return None
    filename = item.get("filename")
    if not isinstance(filename, str) or Path(filename).name != filename or Path(filename).suffix.lower() not in IMAGE_SUFFIXES:
        raise ValueError("filename deve identificare un'immagine nella stessa cartella Drive")
    image = available.get(filename)
    if image is None or image.get("mimeType", "").startswith("application/vnd.google-apps"):
        raise ValueError(f"Immagine non presente o non scaricabile: {filename}")
    metadata = {k: v for k, v in item.items() if k not in IGNORED}
    missing = REQUIRED - metadata.keys()
    if missing:
        raise ValueError("Campi richiesti mancanti: " + ", ".join(sorted(missing)))
    if metadata["type"] not in ("REAL", "AI"):
        raise ValueError("type deve essere REAL o AI")
    if metadata["difficulty"] not in ("facile", "medio", "difficile"):
        raise ValueError("Difficoltà non valida")
    if not isinstance(metadata["categories"], list) or not metadata["categories"] or not all(isinstance(c, str) and c for c in metadata["categories"]):
        raise ValueError("categories deve essere una lista di ID non vuota")
    for key in ("title", "author", "source_url", "source_id", "provider", "evidence", "explanation"):
        if not isinstance(metadata[key], str) or not metadata[key].strip():
            raise ValueError(f"Campo non valido: {key}")
    if urlparse(metadata["source_url"]).scheme != "https":
        raise ValueError("source_url deve essere HTTPS")
    if metadata["type"] == "AI":
        if AI_REQUIRED - metadata.keys() or metadata.get("owner_declaration") is not True:
            raise ValueError("Per AI servono modello, prompt, data e dichiarazione del proprietario")
    return metadata, image


def google_session(client_secret: Path, token_path: Path):
    # Imported lazily: repo's ordinary Node/Python CI does not need Google libraries.
    from google.auth.transport.requests import AuthorizedSession, Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPE)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        if not client_secret.is_file():
            raise ValueError("OAuth client_secret JSON assente: vedere docs/google-drive-catalog.md")
        creds = InstalledAppFlow.from_client_secrets_file(str(client_secret), SCOPE).run_local_server(port=0)
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(creds.to_json(), encoding="utf-8")
    token_path.chmod(0o600)
    return AuthorizedSession(creds)


def list_drive_files(session, folder_id: str) -> dict[str, dict]:
    files: dict[str, dict] = {}
    token = None
    while True:
        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "fields": "nextPageToken,files(id,name,mimeType,size)",
            "pageSize": 1000,
        }
        if token:
            params["pageToken"] = token
        response = session.get(API, params=params, timeout=30)
        response.raise_for_status()
        result = response.json()
        for f in result.get("files", []):
            name = f.get("name")
            if name in files:
                raise ValueError(f"Due file con lo stesso nome nella cartella: {name}")
            files[name] = f
        token = result.get("nextPageToken")
        if not token:
            break
    return files


def download(session, file: dict, limit: int) -> bytes:
    if int(file.get("size", 0)) > limit:
        raise ValueError(f"File oltre il limite {limit} byte: {file.get('name')}")
    response = session.get(f"{API}/{file['id']}", params={"alt": "media"}, stream=True, timeout=60)
    response.raise_for_status()
    out = bytearray()
    try:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            out.extend(chunk)
            if len(out) > limit:
                raise ValueError("File Drive troppo grande")
    finally:
        response.close()
    return bytes(out)


def optimized_webp(original: bytes) -> tuple[bytes, str]:
    from PIL import Image, ImageOps, UnidentifiedImageError
    Image.MAX_IMAGE_PIXELS = 30_000_000
    try:
        with Image.open(io.BytesIO(original)) as im:
            im.load()
            image = ImageOps.exif_transpose(im)
            image.thumbnail((1600, 1600))
            has_alpha = "A" in image.getbands() or "transparency" in image.info
            result = image.convert("RGBA" if has_alpha else "RGB")
            small = ImageOps.grayscale(result).resize((9, 8))
            pixels = list(small.getdata())
            bits = sum((pixels[y*9+x] > pixels[y*9+x+1]) << (y*8+x)
                       for y in range(8) for x in range(8))
            output = io.BytesIO()
            result.save(output, "WEBP", quality=85, method=6)
    except (UnidentifiedImageError, OSError, ValueError) as e:
        raise ValueError("Immagine non decodificabile o non sicura") from e
    if output.tell() > MAX_UPLOAD:
        raise ValueError("Derivato WebP oltre 12 MB")
    return output.getvalue(), f"{bits:016x}"


def site_url(site: str) -> str:
    parsed = urlparse(site.rstrip("/"))
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1")):
        raise ValueError("URL del sito HTTPS richiesto (HTTP solo per localhost)")
    if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Usare l'URL radice del sito, senza path o credenziali")
    return site.rstrip("/")


def submit(site: str, token: str, metadata: dict, drive_file: dict, sidecar: dict,
           original: bytes, derivative: bytes, perceptual_hash: str) -> tuple[str, str]:
    import requests
    headers = {"Authorization": f"Bearer {token}"}
    payload = {**metadata, "drive_archive": {
        "file_id": drive_file["id"], "manifest_id": sidecar["id"],
        "sha256": hashlib.sha256(original).hexdigest(),
    }}
    response = requests.post(site + "/api/admin/import", headers=headers, json=payload, timeout=30)
    if not response.ok:
        raise RuntimeError(f"Importazione rifiutata (HTTP {response.status_code}): {response.text[:200]}")
    data = response.json()
    if data["status"] != "in-review":
        return data["id"], f"Già {data['status']}; nessuna modifica"
    response = requests.put(
        site + data["upload"], headers={**headers, "Content-Type": "image/webp",
                                       "X-Perceptual-Hash": perceptual_hash},
        data=derivative, timeout=90,
    )
    if not response.ok:
        raise RuntimeError(f"Upload in quarantena non riuscito (HTTP {response.status_code}): {response.text[:200]}")
    return data["id"], "In revisione; originale privato su Drive, WebP in quarantena R2"


def main() -> int:
    p = argparse.ArgumentParser(description="Google Drive (originali) -> R2 (quarantena), con revisione umana")
    p.add_argument("--folder-id", required=True, help="ID di una cartella privata Drive con immagini e schede JSON")
    p.add_argument("--site", default="", help="URL radice del sito (necessario con --apply)")
    p.add_argument("--client-secret", type=Path, default=Path(".pipeline/client_secret.json"))
    p.add_argument("--token-file", type=Path, default=Path(".pipeline/google-drive-token.json"))
    p.add_argument("--limit", type=int, default=10, help="Numero massimo di candidati per esecuzione")
    p.add_argument("--apply", action="store_true", help="Importa in D1 e quarantena R2; altrimenti anteprima")
    args = p.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,200}", args.folder_id):
        p.error("ID cartella Drive non valido")
    if not 1 <= args.limit <= 100:
        p.error("--limit deve essere fra 1 e 100")
    admin_token = os.environ.get("REAL_OR_SLOP_ADMIN_TOKEN", "")
    if args.apply and (not args.site or len(admin_token) < 32):
        p.error("Con --apply servono --site e REAL_OR_SLOP_ADMIN_TOKEN (almeno 32 caratteri)")
    site = site_url(args.site) if args.apply else ""
    session = google_session(args.client_secret, args.token_file)
    available = list_drive_files(session, args.folder_id)
    sidecars = sorted((f for f in available.values() if f["name"].endswith(".json")), key=lambda f: f["name"])
    count = errors = 0
    for manifest_file in sidecars:
        if count >= args.limit:
            break
        try:
            item = json.loads(download(session, manifest_file, 100_000))
            paired = validate_manifest(item, available)
            if paired is None:
                continue
            metadata, image = paired
            if Path(manifest_file["name"]).stem != Path(image["name"]).stem:
                raise ValueError("Scheda e immagine devono condividere il nome base")
            count += 1
            if not args.apply:
                print(f"[ANTEPRIMA] {image['name']} -> {metadata['type']} / {metadata['difficulty']}")
                continue
            original = download(session, image, MAX_ORIGINAL)
            derivative, phash = optimized_webp(original)
            image_id, result = submit(site, admin_token, metadata, image, manifest_file,
                                      original, derivative, phash)
            print(f"[OK] {image['name']}: {result} (ID {image_id})")
        except Exception as e:
            errors += 1
            print(f"[ERRORE] {manifest_file['name']}: {e}")
    print(f"Esaminati {count} candidati, errori {errors}. Nessuna approvazione automatica.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
