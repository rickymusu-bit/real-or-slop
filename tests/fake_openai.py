"""v1.0.0, 2026-11-09T20:30:00Z: a fake OpenAI Responses API for the LOCAL integration tests. Nothing is sent to OpenAI.
POST /v1/responses answers with the next queued behaviour (default: valid tags and caption) and records the request.
POST /control {"queue": [...]} sets the behaviours and clears the log; GET /control returns the log.
Behaviours: {"tags": [...], "caption": "..."}, {"status": 500}, {"status": 400}, {"garbage": true}."""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

queue, log = [], []
DEFAULT = {'tags': ['street', 'crowd'], 'caption': 'Una strada affollata.'}

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == '/control': return self.reply(200, {'log': log})
        self.reply(404, {})
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        if self.path == '/control':
            queue[:] = data.get('queue', []); log.clear(); return self.reply(200, {'ok': True})
        if self.path != '/v1/responses': return self.reply(404, {})
        log.append({'authorization': self.headers.get('Authorization'), 'body': data})
        behaviour = queue.pop(0) if queue else DEFAULT
        if 'status' in behaviour: return self.reply(behaviour['status'], {'error': {'message': 'fake'}})
        text = 'not json' if behaviour.get('garbage') else json.dumps({'tags': behaviour['tags'], 'caption': behaviour['caption']})
        self.reply(200, {'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': text}]}],
                         'usage': {'input_tokens': 1200, 'output_tokens': 60}})
    def log_message(self, *args): pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
