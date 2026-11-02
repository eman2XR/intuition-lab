import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from lab.render import ORIGIN, route_files


class Page:
    """Records the routes route_files installs, so requests can be replayed without a browser."""
    def __init__(self):
        self.routes = {}

    def route(self, pattern, handler):
        self.routes[pattern] = handler

    def get(self, path):
        answer = {}
        request = SimpleNamespace(request=SimpleNamespace(url=ORIGIN + path),
                                  fulfill=lambda status, body, **kw: answer.update(status=status, body=body),
                                  abort=lambda: answer.update(status='aborted'))
        self.routes[ORIGIN + '/**'](request)
        return answer['status'], answer.get('body')


class RouteTests(unittest.TestCase):
    def test_only_files_inside_the_folder_and_prefix_are_served(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            web = root / 'web'
            web.mkdir()
            (web / 'index.html').write_text('home')
            (root / 'secret.txt').write_text('secret')
            os.symlink(root / 'secret.txt', web / 'leak.txt')
            page = Page()
            route_files(page, web, '/web/')
            self.assertEqual(page.get('/web/'), (200, b'home'))
            self.assertEqual(page.get('/web/index.html'), (200, b'home'))
            for path in ('/web/%2e%2e/secret.txt', '/web/%2E%2E/secret.txt', '/web/..%2fsecret.txt', '/web//etc/passwd',
                         '/web/index.html%00.png', '/web/index.html\0', '/web/leak.txt', '/secret.txt', '/webindex.html',
                         '/other/index.html', '/web/missing.html'):
                self.assertEqual(page.get(path), (404, ''), path)


if __name__ == '__main__':
    unittest.main()
