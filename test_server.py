import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from server import ROOT, make_server


class BackupTests(unittest.TestCase):
    def test_backup_roundtrip_and_rejected_write_preserves_file(self):
        with tempfile.TemporaryDirectory() as directory:
            server = make_server('127.0.0.1', 0, directory)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f'http://127.0.0.1:{server.server_port}'
            name = 'a' * 32 + '.json'
            payload = {'kind': 'hrvs_workspace', 'schema_version': 1, 'images': [], 'samples': {}, 'notes': 'Tiếng Việt'}
            def put(data, origin=None):
                headers = {'Content-Type': 'application/json'}
                if origin:
                    headers['Origin'] = origin
                return urlopen(Request(base + '/api/backups/' + name, data=data, headers=headers, method='PUT'))
            try:
                with put(json.dumps(payload).encode()) as response:
                    self.assertEqual(response.status, 200)
                self.assertEqual(json.loads((Path(directory) / name).read_text(encoding='utf-8')), payload)
                with urlopen(base + '/api/backups/' + name) as response:
                    self.assertEqual(json.load(response), payload)
                with urlopen(base + '/api/backups') as response:
                    self.assertEqual(json.load(response)[0]['name'], name)
                for body, origin, status in [(b'bad', None, 400), (b'{}', None, 400), (json.dumps(payload).encode(), 'https://other.test', 403)]:
                    with self.assertRaises(HTTPError) as error:
                        put(body, origin)
                    self.assertEqual(error.exception.code, status)
                self.assertEqual(json.loads((Path(directory) / name).read_text(encoding='utf-8')), payload)
                self.assertEqual(len(list(Path(directory).iterdir())), 1)
                with urlopen(base + '/app.js') as response:
                    self.assertIn('javascript', response.headers['Content-Type'])
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def test_default_backup_path(self):
        server = make_server('127.0.0.1', 0)
        try:
            self.assertEqual(server.backup_dir, ROOT / 'backup')
        finally:
            server.server_close()


if __name__ == '__main__':
    unittest.main()
