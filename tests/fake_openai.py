"""Fake OpenAI for the integration tests: Responses API (tags by category, SLOP prompts with a format in turn), image
generation and the list of models, with a control endpoint to queue errors (4xx, 5xx, 429, unreadable answers) and read the log."""
import base64
import io
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

queue, log = [], []
DEFAULT = {'tags': ['street', 'crowd'], 'caption': 'Una strada affollata.'}
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
        self.reply(404, {})
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        if self.path == '/control':
            queue[:] = data.get('queue', []); log.clear(); return self.reply(200, {'ok': True})
        if self.path not in ('/v1/responses', '/v1/images/generations'): return self.reply(404, {})
        log.append({'authorization': self.headers.get('Authorization'), 'body': data, 'path': self.path})
        behaviour = queue.pop(0) if queue else None
        if behaviour and 'status' in behaviour:
            return self.reply(behaviour['status'], {'error': {'message': 'fake', 'type': 'fake', 'code': behaviour.get('code')}})
        if self.path == '/v1/images/generations':
            if behaviour and behaviour.get('garbage'): return self.reply(200, {'data': []})
            return self.reply(200, {'data': [{'b64_json': picture(data.get('size', '1024x1024'))}], 'usage': {'input_tokens': 50, 'output_tokens': 1056}})
        if behaviour is None and data.get('text', {}).get('format', {}).get('name') == 'slop_prompts':
            request = json.loads(data['input'][0]['content'][0]['text'])
            allowed = data['text']['format']['schema']['properties']['prompts']['items']['properties']['format']['enum']
            behaviour = {'json': {'prompts': [{'prompt': 'A documentary photograph: ' + ', '.join(request['theme'] + list(slot.values())),
                                               'used_tags': list(slot.values()), 'format': allowed[i % len(allowed)]}
                                              for i, slot in enumerate(request['slots'])]}}
        behaviour = behaviour or DEFAULT
        text = 'not json' if behaviour.get('garbage') else json.dumps(behaviour['json']) if 'json' in behaviour \
            else json.dumps({'tags': behaviour['tags'], 'caption': behaviour['caption']})
        self.reply(200, {'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': text}]}],
                         'usage': behaviour.get('usage', {'input_tokens': 1200, 'output_tokens': 60})})
    def log_message(self, *args): pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
