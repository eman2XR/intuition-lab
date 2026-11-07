import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch
from lab.fixtures import FixtureProvider
from lab.improve import daily_review, review
from helpers import READY, curriculum


class ImproveTests(unittest.TestCase):
    def test_review_assigns_ids_keeps_cited_urls_and_applies_owner_decisions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            (root/'web'/'proposals.json').write_text(json.dumps({'proposals':[{'id':'P-20261020-1','title':'Old','area':'website','status':'open'}]}))
            requests=[{'number':3,'kind':'approve','body':'proposal: P-20261020-1','title':''}]
            doc=review(FixtureProvider(),root,requests,date(2026,10,27))
            self.assertEqual(doc['proposals'][0]['id'],'P-20261027-1')
            self.assertEqual(doc['proposals'][0]['evidence'],['https://example.org/fixture-note'])
            self.assertEqual(doc['proposals'][1]['status'],'approved')

    def test_daily_review_runs_once_per_day_and_survives_failures(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            calls=[]
            def factory():
                calls.append(1);return FixtureProvider()
            self.assertIsNotNone(daily_review(factory,root,requests=[]))
            self.assertIsNone(daily_review(factory,root,requests=[]))
            self.assertEqual(len(calls),1)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            def broken():raise RuntimeError('offline')
            self.assertIsNone(daily_review(broken,root,requests=[]))
            self.assertEqual(json.loads((root/'.council-state'/'improve.json').read_text())['status'],'failed')

    def test_a_paused_worker_skips_the_project_review(self):
        from lab.__main__ import main
        for paused,reviews in ((True,0),(False,1)):
            with patch('sys.argv',['lab','daily','--provider','fixture','--publish']),patch('lab.daily.daily'),\
                 patch('lab.daily.paused',return_value=paused),patch('lab.improve.daily_review',return_value=None) as review:
                main()
            self.assertEqual(review.call_count,reviews)

    def test_review_keeps_the_designers_blueprints(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            sketch={'id':'P-20261027-9','kind':'blueprint','title':'A picture','area':'engines','status':'open'}
            (root/'web'/'proposals.json').write_text(json.dumps({'proposals':[sketch]}))
            doc=review(FixtureProvider(),root,[],date(2026,10,27))
            self.assertIn('P-20261027-9',[p['id'] for p in doc['proposals']])


@patch('lab.daily.READY',READY)
class BlueprintTests(unittest.TestCase):
    def test_designer_sketches_one_waiting_question_a_day_as_a_proposal(self):
        from lab.daily import blueprint
        items=[{'id':'2.2','question':'Can two events be simultaneous for one person but not another?','model':None},
               {'id':'1.2','question':'Why does gravity bend light?','model':'light-bending'},
               {'id':'4.1','question':'Why do particles fired one at a time still make stripes?','model':'two-slit-particles'}]
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            calls=[]
            def factory():
                calls.append(1);return FixtureProvider()
            first=blueprint(factory,items,root,'2026-10-30')
            self.assertEqual((first['id'],first['kind'],first['curriculum'],first['area']),('P-20261030-9','blueprint','2.2','engines'))
            self.assertIsNone(blueprint(factory,items,root,'2026-10-30'))
            second=blueprint(factory,items,root,'2026-10-31')
            self.assertEqual(second['curriculum'],'4.1')
            self.assertEqual(len(calls),2)
            saved=json.loads((root/'web'/'proposals.json').read_text())['proposals']
            self.assertEqual([p['curriculum'] for p in saved],['4.1','2.2'])

    def test_nothing_ready_researches_a_brief_only_when_asked(self):
        from lab.daily import daily
        items=[{'id':'2.2','question':'Can two events be simultaneous for one person but not another?','model':None}]
        for asked in (False,True):
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);curriculum(root,items)
                provider=FixtureProvider();provider.calls=0
                daily(lambda:provider,root=root,requests=[],blueprints=asked)
                # Idle morning: researcher, scientist and designer produce a build brief and a proposal when asked.
                self.assertEqual(provider.calls,3 if asked else 0)
                self.assertEqual((root/'web'/'proposals.json').exists(),asked)
                self.assertEqual((root/'web'/'briefs'/'2.2.json').exists(),asked)

if __name__=='__main__':unittest.main()
