"""Stage frozen briefs, acquisition logs and existing inbox links; dry-run default.

Upload pixels with the existing inbox importer separately. This command never
approves, publishes, migrates a database, generates an image or starts a search.
"""
import argparse
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit
from urllib.request import Request,build_opener

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline.v2.matrix_v4_0_0 import restore,export_review
from pipeline.v2.protocol import require
from pipeline.importer import NoRedirect


def prepare(folder):
    folder=Path(folder);restore(folder);export=export_review(folder)
    briefs=json.loads((folder/'briefs.v4.0.0.json').read_text())['briefs']
    requests=[('briefs',brief)for brief in briefs]
    for event in export['attempts']:
        event=dict(event);ref=event.pop('brief_ref');require(event['kind']=='attempt','Only acquisition/cost events can be imported')
        requests.append(('attempts',dict(brief_ref=ref,event=event)))
    requests.extend(('candidates',row)for row in export['candidates'])
    manifest=json.loads(Path(export['review_manifest']).read_text())
    simulated=any(row['metadata'].get('simulated')for row in manifest['images']) or any(json.loads(path.read_text()).get('simulated')for path in (folder/'REAL/state.json',folder/'AI/state.json')if path.exists())
    return dict(requests=requests,review_manifest=export['review_manifest'],simulated=simulated)


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('cycle',type=Path);parser.add_argument('--base',default='http://127.0.0.1:8787');parser.add_argument('--apply',action='store_true');args=parser.parse_args(argv)
    try:
        data=prepare(args.cycle);parsed=urlsplit(args.base)
        require(not parsed.username and not parsed.password and not parsed.query and not parsed.fragment and parsed.path in ('','/'),'Use the Worker origin without credentials, path or query')
        require(parsed.scheme=='https' or parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1'),'HTTPS required outside loopback')
        print(json.dumps(dict(version='4.0.0',requests=len(data['requests']),review_manifest=data['review_manifest'],apply=args.apply,simulated=data['simulated'],approval=False,publication=False)))
        if not args.apply:return 0
        require(not data['simulated'],'Simulated images cannot be staged as matrix proposals')
        token=os.environ.get('REAL_OR_SLOP_ADMIN_TOKEN','');require(len(token)>=32,'Admin credential is not configured')
        opener=build_opener(NoRedirect())
        for path,payload in data['requests']:
            req=Request(args.base.rstrip('/')+'/api/admin/editorial/matrix/'+path,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
            with opener.open(req,timeout=30)as response:
                require(response.status==200,'Private staging did not complete');response.read(100000)
        print(json.dumps(dict(staged=len(data['requests']),approved=0,published=False)));return 0
    except (ValueError,OSError,KeyError,TypeError):
        print('Private staging stopped. Check frozen inputs, uploaded inbox pixels, document eligibility and authorization; no approval or publication performed.',file=sys.stderr);return 1


if __name__=='__main__':raise SystemExit(main())
