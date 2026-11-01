"""Serve the studio and atomically back up annotations beside this script."""
import argparse
import json
import os
import re
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOCK = threading.Lock()
BACKUP_NAME = re.compile(r"[a-f0-9]{32}\.json")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def reply(self, code, value):
        body = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/backups':
            rows = []
            for path in self.server.backup_dir.glob('*.json'):
                if BACKUP_NAME.fullmatch(path.name):
                    rows.append({'name': path.name, 'updated_at': path.stat().st_mtime})
            return self.reply(200, sorted(rows, key=lambda row: row['updated_at'], reverse=True))
        if self.path.startswith('/api/backups/'):
            name = self.path.removeprefix('/api/backups/')
            if not BACKUP_NAME.fullmatch(name):
                return self.reply(400, {'error': 'Invalid backup name'})
            try:
                with LOCK:
                    data = json.loads((self.server.backup_dir / name).read_text(encoding='utf-8'))
                return self.reply(200, data)
            except FileNotFoundError:
                return self.reply(404, {'error': 'Backup not found'})
        if self.path.startswith('/api/'):
            return self.reply(404, {'error': 'Unknown endpoint'})
        return super().do_GET()

    def do_PUT(self):
        name = self.path.removeprefix('/api/backups/')
        if not self.path.startswith('/api/backups/') or not BACKUP_NAME.fullmatch(name):
            return self.reply(400, {'error': 'Invalid backup name'})
        # Only same-origin browser requests may write; no CORS write access.
        origin = self.headers.get('Origin')
        if origin and origin not in ('http://' + self.headers.get('Host', ''), 'https://' + self.headers.get('Host', '')):
            return self.reply(403, {'error': 'Origin mismatch'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 32 * 1024 * 1024:
                return self.reply(413, {'error': 'Backup must be between 1 byte and 32 MB'})
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict) or data.get('kind') != 'hrvs_workspace' or data.get('schema_version') != 1 or not isinstance(data.get('images'), list) or not isinstance(data.get('samples'), dict):
                return self.reply(400, {'error': 'Invalid workspace backup'})
            directory = self.server.backup_dir
            directory.mkdir(parents=True, exist_ok=True)
            with LOCK:
                temporary = None
                try:
                    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=directory, delete=False) as stream:
                        temporary = Path(stream.name)
                        json.dump(data, stream, ensure_ascii=False, indent=2)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(temporary, directory / name)
                finally:
                    if temporary and temporary.exists():
                        temporary.unlink()
            return self.reply(200, {'saved': True, 'path': './backup/' + name})
        except (ValueError, UnicodeError):
            return self.reply(400, {'error': 'Invalid JSON'})
        except OSError:
            return self.reply(500, {'error': 'Cannot write backup directory'})


def make_server(host, port, backup_dir=None):
    server = ThreadingHTTPServer((host, port), partial(Handler, directory=str(ROOT / 'dist')))
    server.backup_dir = Path(backup_dir) if backup_dir else ROOT / 'backup'
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8791)
    parser.add_argument('--bind', default='127.0.0.1')
    args = parser.parse_args()
    with make_server(args.bind, args.port) as server:
        print(f'HRVS: http://{args.bind}:{args.port} | backup: {server.backup_dir}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
