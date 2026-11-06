"""One official API probe using configured OAuth, with no credential output."""
import argparse
import hashlib
import json
import os
from urllib.error import HTTPError

from ..editorial import now
from ..v2.search_sources import SearchClient, ConfigurationMissing

API = 'https://api.openverse.org/v1/images/?q=wildlife+rescue&page_size=1&page=1'
UA = 'RealOrSlop/1.0 (https://github.com/rickymusu-bit/real-or-slop)'


def check(client=None, env=None):
    env = os.environ if env is None else env
    mode = ('access_token' if env.get('OPENVERSE_ACCESS_TOKEN') else 'client_credentials' if
        env.get('OPENVERSE_CLIENT_ID') and env.get('OPENVERSE_CLIENT_SECRET') else 'anonymous')
    report = dict(checked_at=now(), endpoint=API, auth_mode=mode, model_calls=0, secrets_in_report=False)
    client = client or SearchClient(UA, max_calls=2, env=env)
    try:
        value = client.get(API)
        if not isinstance(value.get('results'), list):
            raise ValueError('Missing API result list')
        report.update(status='ready', http_status=200, results=len(value.get('results', [])),
                      api_calls=client.calls)
    except HTTPError as error:
        raw = error.read(16_384)
        content_type = error.headers.get('Content-Type', '') if error.headers else ''
        mitigated = error.headers.get('cf-mitigated') if error.headers else None
        challenge = b'challenges.cloudflare.com' in raw or b'Just a moment...' in raw or mitigated == 'challenge'
        report.update(status='provider_challenge' if challenge else 'authentication_error' if error.code == 401
                      else 'api_access_denied' if error.code == 403 and 'json' in content_type
                      else 'rate_limited' if error.code == 429 else 'http_error',
                      http_status=error.code, content_type=content_type, body_sha256=hashlib.sha256(raw).hexdigest(),
                      cloudflare_ray=error.headers.get('cf-ray') if error.headers else None,
                      api_calls=client.calls, error_body_retained=False)
    except ConfigurationMissing:
        report.update(status='authentication_configuration_missing', api_calls=client.calls)
    except (OSError, ValueError, KeyError, TypeError) as error:
        report.update(status='transport_or_protocol_error', error_type=type(error).__name__, api_calls=client.calls)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    args = parser.parse_args(argv)
    report = check() if args.live else dict(network=False, execute_required=True, credential_values_printed=False)
    print(json.dumps(report))
    return 0 if report.get('status') in (None, 'ready') else 2


if __name__ == '__main__':
    raise SystemExit(main())
