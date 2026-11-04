"""Explicit synthetic test data. Never evidence of editorial effectiveness."""
import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import random
import uuid
from PIL import Image
from .protocol import VERSION, SCHEMA


def profile(seed=0):
    rng = random.Random(seed)
    return dict(version=VERSION, photographic=True, usable=True,
        **{key: rng.choice(choices) for key, choices in SCHEMA['enums'].items()},
        **{key: rng.randrange(101) for key in SCHEMA['scalars']},
        language=['fixture'], content=['test texture'], relations=[],
        observations=['Fixture: variazioni cromatiche e dettagli distribuiti nel fotogramma.'],
        uncertainties=['Fixture sintetica: non misura la capacità di un VLM né prova autenticità.'], technical_issues=[])


def picture(seed, size=(64, 48)):
    raw = io.BytesIO()
    Image.frombytes('RGB', size, random.Random(seed).randbytes(size[0] * size[1] * 3)).save(raw, format='PNG')
    return raw.getvalue()


def source(uid):
    return dict(kind='REAL', content_kind='photograph', license_url='https://creativecommons.org/publicdomain/zero/1.0/',
        author='Fixture, non una fonte fotografica', evidence=[dict(id='source', url='https://example.invalid/' + uid,
        statement='Fixture locale: non prova una fotografia autentica.')], transformations=[], provider='fixture',
        source_id=uid, source_url='https://example.invalid/' + uid, authenticity='unverified', semantic_edit=False)


def study_inputs(folder, count=120):
    if type(count) is not int or not 2 <= count <= 200:
        raise ValueError('Il campione fixture deve avere tra 2 e 200 elementi')
    folder.mkdir(parents=True, exist_ok=True)
    reals = []
    for index in range(count // 2):
        uid = f'real-{index:03}'
        path = folder / (uid + '.png')
        path.write_bytes(picture(index)); path.chmod(0o600)
        reals.append(dict(id=uid, file=path.name, provenance=source(uid)))
    slop = dict(version=VERSION, independent=True, ideas=[dict(id=f'slop-{index:03}', mode='open' if index % 2 else 'original',
        idea=f'Fixture autonoma {index}', prompt=f'Esplora liberamente una scena fotografica originale, proposta autonoma {index}.') for index in range(count - count // 2)])
    (folder / 'real.json').write_text(json.dumps(reals, indent=2))
    (folder / 'slop.json').write_text(json.dumps(slop, indent=2))
    return reals, slop


class FixtureBatch:
    def __init__(self):
        self.files, self.batches = {}, {}

    def upload_jsonl(self, path):
        uid = 'file-' + uuid.uuid4().hex
        self.files[uid] = [json.loads(line) for line in Path(path).read_text().splitlines()]
        return uid

    def create_batch(self, file_id, endpoint, metadata):
        uid, output = 'batch-' + uuid.uuid4().hex, 'file-' + uuid.uuid4().hex
        results = []
        for row in self.files[file_id]:
            body = row['body']
            if endpoint == '/v1/responses':
                parts = body['input'][0]['content']
                raw = base64.b64decode(parts[1]['image_url'].split(',', 1)[1])
                value = profile(int(hashlib.sha256(raw).hexdigest(), 16))
                result = dict(output=[dict(content=[dict(type='output_text', text=json.dumps(value))])])
            else:
                raw = picture(int(hashlib.sha256(body['prompt'].encode()).hexdigest(), 16))
                result = dict(created=1793721600, data=[dict(b64_json=base64.b64encode(raw).decode())])
            results.append(dict(custom_id=row['custom_id'], error=None, response=dict(status_code=200, request_id='fixture-request', body=result)))
        self.files[output] = list(reversed(results))
        self.batches[uid] = dict(id=uid, status='completed', metadata=metadata, input_file_id=file_id, endpoint=endpoint, output_file_id=output, error_file_id=None)
        return self.retrieve(uid)

    def retrieve(self, uid):
        return copy.deepcopy(self.batches[uid])

    def find_submission(self, metadata, file_id):
        return next((self.retrieve(uid) for uid, row in self.batches.items() if row['metadata'] == metadata and row['input_file_id'] == file_id), None)

    def cancel(self, uid):
        self.batches[uid]['status'] = 'cancelled'
        return self.retrieve(uid)

    def lines(self, file_id):
        yield from copy.deepcopy(self.files[file_id])
