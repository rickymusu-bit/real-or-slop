"""Private file utilities shared by both Batch protocols."""
import hashlib


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def write_bytes(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    path.chmod(0o600)
