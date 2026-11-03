"""Protocol v2 CLI. Default: inspect, offline. No production import or publication."""
import argparse
from dataclasses import asdict
import json
import os
from pathlib import Path
from ..batch import workspace
from ..batch_api import BatchAPI
from ..batch_store import BatchRemote
from ..editorial import PipelineStop, write_private
from ..importer import RequestError
from .engine import Config, Engine, initialize
from .protocol import VERSION, generation_plan, provenance, identifier, require


class Remote(BatchRemote):
    @property
    def prefix(self):
        return 'v2/runs/' + self.run_id

    def export_candidates(self, candidates):
        return self.send('candidates', dict(candidates=candidates), 'POST')


def inspect(origin, value):
    if origin == 'AI':
        generation_plan(value)
        count = len(value['ideas'])
    else:
        require(isinstance(value, list) and 1 <= len(value) <= 200, 'Manifest REAL richiesto')
        for row in value:
            require(set(row) == {'id', 'file', 'provenance'}, 'Manifest REAL v2: campi non ammessi')
            identifier(row['id']); provenance(row['provenance'], 'REAL')
        count = len(value)
    return dict(version=VERSION, origin=origin, candidates=count, phases=['generation', 'profile'] if origin == 'AI' else ['profile'],
                network=False, paid=False, remote_writes=False, publication_available=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', nargs='?', type=Path)
    parser.add_argument('--origin', choices=['REAL', 'AI'], default='AI')
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument('--simulate', action='store_true')
    actions.add_argument('--start', action='store_true')
    actions.add_argument('--resume', metavar='RUN_ID')
    actions.add_argument('--status', metavar='RUN_ID')
    actions.add_argument('--cancel', metavar='RUN_ID')
    parser.add_argument('--run-id')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--adopt-batch-id')
    parser.add_argument('--out', type=Path, default=Path('.pipeline/v2/runs'))
    parser.add_argument('--base', default='http://127.0.0.1:8787')
    args = parser.parse_args(argv)
    try:
        value = json.loads(args.manifest.read_text()) if args.manifest else None
        if not any((args.simulate, args.start, args.resume, args.status, args.cancel)):
            print(json.dumps(inspect(args.origin, value))); return 0
        uid = identifier(args.resume or args.status or args.cancel or args.run_id or '')
        folder = (args.out / uid).resolve()
        if args.simulate:
            from .fixtures import FixtureBatch
            require(args.manifest is not None, 'Manifest v2 richiesto')
            cfg = Config(analysis_model='fixture-vision', evaluator_model='fixture-vision', image_model='fixture-image', run_usd=1000, daily_usd=1000, evaluation_usd=.01, generation_usd=.1)
            with workspace(folder):
                require(not (folder / 'state.json').exists(), 'Run già presente: scegliere un altro identificativo')
                state = initialize(args.origin, value, args.manifest.resolve().parent, folder, cfg, uid, True,
                                   dict(url='https://creativecommons.org/publicdomain/zero/1.0/', author='Fixture locale'))
                engine = Engine(state, folder, FixtureBatch())
                for _ in range(10):
                    result = engine.tick(execute=True)
                    if result['status'] in ('completed', 'paused', 'cancelled', 'stopped'):
                        break
                print(json.dumps(result)); return 0 if result['status'] == 'completed' else 1
        remote = Remote(args.base, os.getenv('REAL_OR_SLOP_ADMIN_TOKEN', ''), uid)
        if args.status:
            row = remote.call(remote.prefix)
            print(json.dumps({key: row[key] for key in ('id', 'origin', 'status', 'stage', 'revision')})); return 0
        require(not args.start or args.execute, '--start richiede --execute esplicito')
        require(not args.execute or os.getenv('ENABLE_EDITORIAL_V2_PAID') == 'true', 'Nuove chiamate v2 non abilitate nel client')
        with workspace(folder):
            if args.start:
                require(args.manifest is not None and not (folder / 'state.json').exists(), 'Manifest richiesto e workspace nuovo necessario')
                cfg = Config.environment()
                cfg.validate(paid=True, origin=args.origin)
                api = BatchAPI(os.getenv('OPENAI_API_KEY', ''))
                available = {model['id'] for model in api.api('models').get('data', [])}
                require({cfg.evaluator_model, *([cfg.image_model] if args.origin == 'AI' else [])} <= available, 'Modelli v2 non disponibili; nessun fallback')
                state = initialize(args.origin, value, args.manifest.resolve().parent, folder, cfg, uid, False,
                                   dict(url=os.getenv('GENERATED_V2_LICENSE_URL', ''), author=os.getenv('GENERATED_V2_AUTHOR', '')) if args.origin == 'AI' else None)
                write_private(folder / 'state.json', state)
                remote.call('v2/runs', dict(id=uid, origin=args.origin, config=asdict(cfg), input=value))
            else:
                api = BatchAPI(os.getenv('OPENAI_API_KEY', ''))
            remote.acquire()
            try:
                # A repeated --start on a fresh machine must resume the server's
                # run, never replace its jobs with a new initial checkpoint.
                saved = remote.restore(folder)
                if saved:
                    state = saved
                else:
                    path = folder / 'state.json'
                    require(path.exists(), 'Checkpoint iniziale incompleto; recuperare il workspace originale')
                    state = json.loads(path.read_text())
                    require(state.get('id') == uid and state.get('protocol_version') == VERSION, 'Workspace iniziale di un altro run')
                    remote.save(state, folder)
                engine = Engine(state, folder, api, remote)
                result = engine.cancel() if args.cancel else engine.tick(execute=args.execute, adopt=args.adopt_batch_id)
                print(json.dumps(result)); return 1 if result.get('error') else 0
            finally:
                remote.release()
    except (ValueError, OSError, TypeError, KeyError) as error:
        print(str(error) if isinstance(error, (PipelineStop, RequestError)) else 'Pipeline v2 interrotta: controllare configurazione e checkpoint privato')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
