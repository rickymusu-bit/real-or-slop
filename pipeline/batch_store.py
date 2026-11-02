"""Private D1 state / content-addressed R2 files, with leases and revision CAS."""
import hashlib
import json
from pathlib import Path
import re
from .editorial import Remote, PipelineStop, write_private
from .importer import request


def safe_path(folder, value):
    if not isinstance(value, str) or not re.fullmatch(r'(inputs|generations)/[A-Za-z0-9_-]+/(original\.(png|jpg|webp)|preview\.webp)', value):
        raise PipelineStop('Percorso checkpoint non ammesso')
    candidate = folder / value
    if candidate.is_symlink() or candidate.parent.is_symlink(): raise PipelineStop('Symlink checkpoint non ammesso')
    path = candidate.resolve()
    if not path.is_relative_to(folder.resolve()): raise PipelineStop('File fuori dal checkpoint')
    return path


class BatchRemote(Remote):
    def __init__(self, base, token, run_id):
        super().__init__(base, token, run_id)
        self.lease = None
        self.revision = 0
        self.known_files = {}

    @property
    def prefix(self): return 'batch-runs/' + self.run_id

    def acquire(self):
        result = self.call(self.prefix + '/lease', {})
        self.lease, self.revision = result['lease'], result['revision']

    def send(self, suffix, data=None, method='PUT'):
        return request(self.base, self.token, '/api/admin/editorial/' + self.prefix + '/' + suffix, method, data, {'X-Batch-Lease':self.lease})

    def release(self):
        if self.lease:
            try: self.send('lease', method='DELETE')
            finally: self.lease = None

    def restore(self, folder):
        from urllib.request import Request, build_opener
        from .importer import NoRedirect
        result = self.call(self.prefix)
        for file in result['files']:
            path = safe_path(folder, file['path'])
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != file['sha256']:
                req = Request(self.base + '/api/admin/editorial/' + self.prefix + '/files/' + file['sha256'], headers={'Authorization':'Bearer '+self.token})
                try:
                    with build_opener(NoRedirect()).open(req, timeout=90) as response: raw = response.read(12_000_001)
                except OSError: raise PipelineStop('Download checkpoint non riuscito') from None
                if len(raw) != file['size'] or hashlib.sha256(raw).hexdigest() != file['sha256']: raise PipelineStop('Checkpoint corrotto')
                path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(raw); path.chmod(0o600)
            self.known_files[file['sha256']] = file['size']
        self.revision = result['revision']
        return result['state']

    def save(self, state, folder):
        files = []
        for group in ('inputs','generations'):
            for path in sorted((folder/group).glob('*/*')):
                relative = str(path.relative_to(folder)); safe_path(folder, relative)
                raw = path.read_bytes(); digest = hashlib.sha256(raw).hexdigest()
                if self.known_files.get(digest) != len(raw):
                    self.send('files/' + digest, raw)
                    self.known_files[digest] = len(raw)
                files.append(dict(path=relative, sha256=digest, size=len(raw)))
        if len(json.dumps(dict(state=state,files=files)).encode()) > 1_900_000: raise PipelineStop('Checkpoint metadata oltre il limite')
        result = self.send('checkpoint', dict(revision=self.revision, state=state, files=files))
        self.revision = result['revision']
        write_private(folder/'state.json',state)

    def reserve_batch(self, job):
        return self.send('reserve',dict(id=job['id'], requests=[dict(id=item['custom_id'],kind=item['kind']) for item in job['items']]),'POST')
