"""Private immutable snapshots and durable single-writer request receipts."""
from contextlib import contextmanager
import fcntl
import json
from pathlib import Path

from ..editorial import now, write_private
from ..v2.protocol import require, generation_plan
from .contracts import VERSION, digest, validate


class Store:
    def __init__(self, folder):
        self.folder = Path(folder).resolve()
        self.folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.folder.chmod(0o700)

    @contextmanager
    def lock(self):
        with (self.folder/'.lock').open('a') as file:
            try:
                fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                require(False, 'Discovery già in esecuzione')
            try:
                yield self
            finally:
                fcntl.flock(file, fcntl.LOCK_UN)

    def read(self, name):
        path = self.folder/name
        if not path.exists():
            return None
        envelope = json.loads(path.read_text())
        require(digest(envelope['payload']) == envelope['sha256'], 'Snapshot corrotto: '+name)
        return envelope['payload']

    def save(self, name, payload, immutable=False):
        prior = self.read(name)
        if immutable and prior is not None:
            require(prior == payload, 'Snapshot immutabile diverso: '+name)
            return prior
        write_private(self.folder/name, dict(sha256=digest(payload), payload=payload))
        return payload

    def freeze(self, intent, slop=None, simulated=False, selection_seed=None):
        validate('intent', intent)
        if slop is not None:
            generation_plan(slop)
        prior = self.read('freeze.v1.0.0.json')
        if prior:
            require(prior['intent'] == intent and prior['slop_plan'] == slop and prior['simulated'] == simulated
                    and prior['selection_seed'] == selection_seed, 'Freeze diverso: nuova revisione/run richiesti')
            return prior
        return self.save('freeze.v1.0.0.json', dict(version=VERSION, intent=intent, slop_plan=slop, simulated=simulated,
                         selection_seed=selection_seed,
                         created_at=now()), immutable=True)

    def frozen(self):
        value = self.read('freeze.v1.0.0.json')
        require(value is not None, 'Congelare intenzione e piano SLOP prima della ricerca')
        validate('intent', value['intent'])
        if value['slop_plan'] is not None:
            generation_plan(value['slop_plan'])
        return value
