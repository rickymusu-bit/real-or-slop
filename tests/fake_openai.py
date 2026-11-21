"""Fake OpenAI for the integration tests: Responses API (measures of the REAL, SLOP proposals and evaluations, gallery instructions), image
generation and the list of models, with a control endpoint to queue errors (4xx, 5xx, 429, unreadable answers) and read the log."""
import base64
import io
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

queue, log = [], []
MODELS = ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
          'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.2', 'gpt-5.2-pro', 'gpt-5.1', 'gpt-5',
          'gpt-5-mini', 'gpt-5-nano', 'gpt-5-pro', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o3-pro', 'o3',
          'gpt-image-2', 'gpt-image-2.5-flare']

counter = [0]
def picture(size):
    """A small PNG with the requested proportions, different every time (the library refuses duplicates)."""
    from PIL import Image
    width, height = (int(v) // 16 for v in size.split('x'))
    counter[0] += 1
    image = Image.new('RGB', (width, height), (counter[0] * 37 % 256, 120, 90))
    image.putpixel((counter[0] % width, 0), (255, 255, 255))
    out = io.BytesIO(); image.save(out, 'PNG')
    return base64.b64encode(out.getvalue()).decode()

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == '/control': return self.reply(200, {'log': log})
        if self.path == '/v1/models': return self.reply(200, {'object': 'list', 'data': [{'id': m, 'object': 'model'} for m in MODELS]})
        if self.path.startswith('/commons/w/api.php?'):
            # Fake Commons for the nightly source check: files whose name contains «Gone» are missing, the others exist.
            from urllib.parse import parse_qs, urlsplit
            titles = parse_qs(urlsplit(self.path).query).get('titles', [''])[0].split('|')
            log.append({'path': '/commons', 'titles': titles})
            return self.reply(200, {'query': {'pages': [{'title': t, 'missing': True} if 'Gone' in t else {'title': t, 'pageid': 1} for t in titles]}})
        self.reply(404, {})
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        if self.path == '/control':
            queue[:] = data.get('queue', []); log.clear(); return self.reply(200, {'ok': True})
        if self.path not in ('/v1/responses', '/v1/images/generations'): return self.reply(404, {})
        log.append({'authorization': self.headers.get('Authorization'), 'body': data, 'path': self.path})
        behaviour = queue.pop(0) if queue else None
        if behaviour and behaviour.get('delay'): time.sleep(behaviour['delay'])
        if behaviour and 'status' in behaviour:
            return self.reply(behaviour['status'], {'error': {'message': 'fake', 'type': 'fake', 'code': behaviour.get('code')}})
        if self.path == '/v1/images/generations':
            if behaviour and behaviour.get('garbage'): return self.reply(200, {'data': []})
            return self.reply(200, {'data': [{'b64_json': picture(data.get('size', '1024x1024'))}], 'usage': {'input_tokens': 50, 'output_tokens': 1056}})
        schema_name = data.get('text', {}).get('format', {}).get('name')
        request = json.loads(data['input'][0]['content'][0]['text']) if schema_name in ('slop_evaluation', 'slop_gallery_proposal') else None
        if schema_name == 'gallery_instructions' and (behaviour is None or 'delay' in behaviour):
            behaviour = {'json': {'instructions': 'Inventa un fatto visibile e conserva la piazza riconoscibile.'}}
        if schema_name == 'real_measure' and (behaviour is None or 'delay' in behaviour):
            # A subject with four kinds of detail and two plain objects beside it: crowding 29, detail 51.
            plain = {k: False for k in ('text', 'repeated', 'countable', 'texture', 'reflective', 'joints')}
            behaviour = {'json': {'subject': {'name': 'Game Boy', 'box': {'x': 0.25, 'y': 0.2, 'width': 0.5, 'height': 0.6},
                                              'detail': {**plain, 'text': True, 'repeated': True, 'countable': True, 'texture': True}},
                                  'others': [{'name': 'cartuccia', 'box': {'x': 0.8, 'y': 0.7, 'width': 0.15, 'height': 0.2}, 'detail': plain},
                                             {'name': 'scatola', 'box': {'x': 0.0, 'y': 0.6, 'width': 0.2, 'height': 0.3}, 'detail': plain}],
                                  'unlisted': 0}}
        if schema_name == 'slop_gallery_proposal' and (behaviour is None or 'delay' in behaviour):
            behaviour = {'json': {'premise': 'Un bus d’epoca inventato attraversa la piazza riconoscibile.',
                                  'prompt': 'A plausible invented vintage bus crossing a recognizable square in natural light.', 'reason': ''}}
        if schema_name == 'slop_evaluation' and (behaviour is None or behaviour.get('evaluation') or behaviour.get('delay')):
            decision = (behaviour or {}).get('evaluation', 'accept')
            anchors = request.get('brief') or {'required': [request.get('premise')], 'exclusions': []}
            behaviour = {'json': {'attempt_id': request['attempt_id'], 'decision': decision, 'critical_findings': (behaviour or {}).get('critical', []), 'minor_findings': (behaviour or {}).get('minor', []),
                                  'editorial_constraints_met': (behaviour or {}).get('constraints', True), 'uncertainty_notes': (behaviour or {}).get('uncertainty', []), 'action_reason': 'Visible photographic texture and plausible geometry throughout the frame.',
                                  'revised_prompt': 'A revised documentary scene with a different viewpoint.' if decision in ('revise_prompt', 'replan_scene') else '',
                                  'preserved_required': anchors['required'], 'preserved_exclusions': anchors['exclusions']}}
        behaviour = behaviour or {'json': {}}
        text = 'not json' if behaviour.get('garbage') else json.dumps(behaviour['json'])
        self.reply(200, {'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': text}]}],
                         'usage': behaviour.get('usage') or {'input_tokens': 1200, 'output_tokens': 60}})
    def log_message(self, *args): pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
