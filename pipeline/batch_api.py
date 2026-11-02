"""OpenAI Batch transport. Standard library only; no synchronous fallback."""
import json
import re
import uuid
from pathlib import Path
from urllib.request import Request
from urllib.error import HTTPError, URLError
from .editorial import OpenAI, PipelineStop

ENDPOINTS = {'/v1/responses', '/v1/images/generations'}
TERMINAL = {'completed', 'failed', 'expired', 'cancelled'}
MAX_INPUT_BYTES = 50_000_000  # Below the provider's 200 MB per-file limit.


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,150}', value):
        raise PipelineStop('Identificativo Batch OpenAI non valido')
    return value


class BatchAPI(OpenAI):
    def upload_jsonl(self, path):
        path = Path(path)
        if not 0 < path.stat().st_size <= MAX_INPUT_BYTES:
            raise PipelineStop('File Batch vuoto o oltre il limite')
        boundary = 'ros-' + uuid.uuid4().hex
        raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nbatch\r\n'
               f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="requests.jsonl"\r\nContent-Type: application/jsonl\r\n\r\n').encode() + path.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
        req = Request('https://api.openai.com/v1/files', data=raw, headers={'Authorization':'Bearer '+self.key, 'Content-Type':'multipart/form-data; boundary='+boundary})
        try:
            with self.opener(req, timeout=180) as response: result = json.loads(response.read(100000))
            return identifier(result['id'])
        except (HTTPError, OSError, URLError, KeyError, ValueError, TypeError):
            raise PipelineStop('Upload del file Batch non riuscito; nessuna generazione sincrona sostitutiva') from None

    def create_batch(self, file_id, endpoint, metadata):
        if endpoint not in ENDPOINTS: raise PipelineStop('Endpoint Batch non ammesso')
        result = self.api('batches', dict(input_file_id=identifier(file_id), endpoint=endpoint, completion_window='24h', metadata=metadata,
                                        output_expires_after=dict(anchor='created_at', seconds=2592000)))
        identifier(result.get('id'))
        return result

    def retrieve(self, batch_id):
        return self.api('batches/' + identifier(batch_id))

    def cancel(self, batch_id):
        return self.api('batches/' + identifier(batch_id) + '/cancel', {})

    def find_submission(self, metadata, file_id):
        after = ''
        matches = []
        for _ in range(10):
            page = self.api('batches?limit=100' + ('&after=' + identifier(after) if after else ''))
            for row in page.get('data', []):
                if row.get('input_file_id') == file_id and row.get('metadata') == metadata:
                    matches.append(row)
            if not page.get('has_more'): break
            after = page.get('last_id') or (page.get('data') or [{}])[-1].get('id')
            if not after: break
        if len(matches) > 1: raise PipelineStop('Più job corrispondono allo stesso invio: riconciliazione manuale richiesta')
        return matches[0] if matches else None

    def lines(self, file_id):
        req = Request('https://api.openai.com/v1/files/' + identifier(file_id) + '/content', headers={'Authorization':'Bearer '+self.key})
        try:
            with self.opener(req, timeout=180) as response:
                total = 0
                while True:
                    line = response.readline(24_000_001)
                    if not line: break
                    total += len(line)
                    if len(line) > 24_000_000 or total > 512_000_000:
                        raise PipelineStop('Risultati Batch oltre i limiti di lettura')
                    if line.strip(): yield json.loads(line)
        except (HTTPError, OSError, URLError, ValueError, TypeError) as error:
            if isinstance(error, PipelineStop): raise
            raise PipelineStop('Risultati Batch non disponibili o non validi; nessun reinvio automatico') from None
