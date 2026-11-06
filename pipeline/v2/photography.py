"""Independent capture targets, frozen before either image branch starts."""
import hashlib
import json
from pathlib import Path
import random
from .protocol import require

POLICY = json.loads((Path(__file__).resolve().parents[2] / 'shared/editorial-photography.v1.0.0.json').read_text())
POLICY_SHA256 = hashlib.sha256(json.dumps(POLICY, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def photography_plan(count, seed):
    require(type(count) is int and 1 <= count <= 25 and type(seed) is int and 0 <= seed <= 4294967295, 'Invalid photography selection')
    rng = random.Random(seed ^ 0x50484F54)
    profiles = []
    while len(profiles) < count:
        deck = list(POLICY['profiles'])
        rng.shuffle(deck)
        profiles.extend(deck)
    return profiles[:count]


def photography_directive(profile):
    require(profile in POLICY['profiles'], 'Unknown photographic capture profile')
    return '\nPhotographic capture brief:\n' + POLICY['general_directive'] + '\n' + POLICY['template'].format(**profile)


def freeze_photography(profile):
    return dict(version=POLICY['version'], policy_sha256=POLICY_SHA256, profile=profile.copy())
