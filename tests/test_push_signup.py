"""Device sign-up for notifications: a subscription sealed with the inbox key, posted as an owner issue, is opened,
added and its issue closed; nothing here reaches the network."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from lab import push

ROOT = Path(__file__).resolve().parents[1]
SUB = {'endpoint': 'https://web.push.apple.com/QTEST', 'keys': {'p256dh': 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'auth': 'tBHItJI5svbpez7KI4CCXg'}}


@unittest.skipUnless(shutil.which('node'), 'node is needed for scripts/push.mjs')
class PushSignupTest(unittest.TestCase):
    def setUp(self):
        self.state = Path(tempfile.mkdtemp())
        self.inbox_public = push.inbox_keys(self.state)

    def tearDown(self):
        shutil.rmtree(self.state, ignore_errors=True)

    def sealed(self, data=SUB):
        out = subprocess.run(['node', str(ROOT / 'scripts' / 'push.mjs'), 'seal', self.inbox_public, json.dumps(data)],
                             capture_output=True, text=True, check=True)
        return json.loads(out.stdout)

    def test_inbox_key_is_made_once(self):
        self.assertEqual(push.inbox_keys(self.state), self.inbox_public)
        self.assertEqual(oct((self.state / 'push-inbox.json').stat().st_mode & 0o777), '0o600')

    def test_seal_round_trip(self):
        self.assertEqual(push.unseal(self.sealed(), self.state), SUB)

    def test_sealed_request_is_found_in_an_issue_body(self):
        sealed = self.sealed()
        body = f"{push.MARKER}\nThis asks Intuition Lab to send new-guide notifications.\n\n```\n{json.dumps(sealed)}\n```"
        self.assertEqual(push.sealed_from(body), sealed)
        self.assertIsNone(push.sealed_from('no request here {"a": 1}'))

    def test_inbox_adds_the_device_and_closes_the_issue(self):
        sealed = self.sealed()
        issues = [{'number': 7, 'body': f"{push.MARKER}\n```\n{json.dumps(sealed)}\n```"},
                  {'number': 8, 'body': 'an ordinary issue that mentions council-push but has no marker'},
                  {'number': 9, 'body': f"{push.MARKER}\n```\n{{\"epk\":\"x\",\"salt\":\"x\",\"iv\":\"x\",\"ct\":\"x\"}}\n```"}]
        calls = []

        def runner(args, **kw):
            calls.append(args)
            out = json.dumps(issues) if args[:3] == ['gh', 'issue', 'list'] else ''
            return subprocess.CompletedProcess(args, 0, out, '')

        lines = push.inbox('https://example.test/', runner=runner, state_dir=self.state)
        saved = json.loads((self.state / 'push-subscriptions.json').read_text())
        self.assertEqual([s['endpoint'] for s in saved], [SUB['endpoint']])
        closes = {c[3]: c[-1] for c in calls if c[:3] == ['gh', 'issue', 'close']}
        self.assertEqual(sorted(closes), ['7', '9'])
        self.assertIn('Notifications are on for this device', closes['7'])
        self.assertIn('Could not turn on notifications', closes['9'])
        self.assertEqual(len(lines), 2)


if __name__ == '__main__':
    unittest.main()
