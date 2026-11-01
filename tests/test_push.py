import json
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from lab import push

SUB={'endpoint':'https://web.push.apple.com/abc','keys':{'p256dh':'BCVx','auth':'BTBZ'}}


class PushTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'),'node is not installed')
    def test_sender_matches_the_rfc_8291_example(self):
        result=subprocess.run(['node',str(push.SCRIPT),'selftest'],capture_output=True,text=True,timeout=60)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_add_validates_and_dedupes_by_endpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            for bad in ['{}','not json',{'endpoint':'http://x.example/a','keys':SUB['keys']},
                        {'endpoint':SUB['endpoint']},{'endpoint':SUB['endpoint'],'keys':{'p256dh':'BCVx','auth':''}}]:
                with self.assertRaises(ValueError):push.add(bad,tmp)
            self.assertTrue(push.add(json.dumps(SUB),tmp))
            self.assertFalse(push.add(dict(SUB,keys={'p256dh':'new','auth':'new'},extra=1),tmp))
            self.assertTrue(push.add(dict(SUB,endpoint='https://fcm.googleapis.com/x'),tmp))
            path=Path(tmp)/'push-subscriptions.json'
            subs=json.loads(path.read_text())
            self.assertEqual([s['endpoint'] for s in subs],['https://web.push.apple.com/abc','https://fcm.googleapis.com/x'])
            self.assertEqual(subs[0]['keys'],{'p256dh':'new','auth':'new'})
            self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)

    def test_notify_never_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(push.notify('T','B','https://x',tmp))
            (Path(tmp)/'vapid.json').write_text('{}');push.add(SUB,tmp)
            with patch('lab.push.subprocess.run',side_effect=subprocess.TimeoutExpired('node',120)):
                self.assertFalse(push.notify('T','B','https://x',tmp))
            with patch('lab.push.node',return_value=None):
                self.assertFalse(push.notify('T','B','https://x',tmp))


if __name__=='__main__':
    unittest.main()
