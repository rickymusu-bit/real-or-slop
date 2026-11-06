"""Independent SLOP composition intents; never inspect or rotate REAL pixels."""
import hashlib
import json
from pathlib import Path
import random
from .protocol import require

POLICY = json.loads((Path(__file__).resolve().parents[2] / 'shared/editorial-composition.v1.0.0.json').read_text())
POLICY_SHA256 = hashlib.sha256(json.dumps(POLICY, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def composition_plan(count, seed):
    require(type(count) is int and 1 <= count <= 25 and type(seed) is int and 0 <= seed <= 4294967295, 'Invalid composition selection')
    rng = random.Random(seed ^ 0x43414D45)
    profiles = []
    while len(profiles) < count:
        deck = list(POLICY['profiles'])
        rng.shuffle(deck)
        profiles.extend(deck)
    return profiles[:count]


def freeze_composition(profile):
    return dict(version=POLICY['version'], policy_sha256=POLICY_SHA256,
                profile_id=profile['id'], viewpoint=profile['viewpoint'], roll_degrees=profile['roll_degrees'])
