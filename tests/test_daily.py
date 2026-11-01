import copy
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from lab.daily import daily, daily_lock, export_accepted, publish
from lab.fixtures import FixtureProvider
from lab.pipeline import run
from lab.schedule import write_schedule
import plistlib


def curriculum(root, items):
    (root/'web').mkdir(parents=True, exist_ok=True)
    (root/'web'/'curriculum.json').write_text(json.dumps({'chapters':[{'items':items}]}))


READY_ITEMS=[{'id':'1.1','question':'Why do clocks at different heights tick at different rates?','model':'gravity-clocks'},
             {'id':'1.2','question':'Why does gravity bend light?','model':'light-bending'}]


class DailyTests(unittest.TestCase):
    def test_daily_budget_persists_and_failed_slots_are_not_retried(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);curriculum(root,READY_ITEMS)
            with patch('lab.daily.run',return_value={'status':'needs_review','id':'draft'}) as runner:
                daily(FixtureProvider,root=root)
                daily(FixtureProvider,root=root)
                self.assertEqual(runner.call_count,1)
                self.assertFalse((root/'web'/'published').exists())

    def test_second_daily_slot_takes_the_next_ready_item_without_a_planner_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);curriculum(root,READY_ITEMS);provider=FixtureProvider()
            with patch('lab.daily.run',return_value={'status':'needs_review','id':'draft'}) as runner:
                ledger=daily(lambda:provider,count=2,root=root)
            self.assertEqual([c.kwargs['topic'] for c in runner.call_args_list],['gravity-clocks','light-bending'])
            self.assertEqual([a['curriculum'] for a in ledger],['1.1','1.2'])
            self.assertEqual(provider.calls,0)

    def test_nothing_ready_uses_no_slot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            curriculum(root,[{'id':'2.2','question':'Can two events be simultaneous for one person but not another?','model':'spacetime'},
                             {'id':'1.2','question':'Why does gravity bend light?','model':'light-bending'}])
            (root/'web'/'published').mkdir()
            (root/'web'/'published'/'index.json').write_text(json.dumps([{'id':'x','question':'Another light question?','topic':'light-bending'}]))
            with patch('lab.daily.run') as runner:
                self.assertEqual(daily(FixtureProvider,root=root),[])
            runner.assert_not_called()

    def test_plannable_needs_a_ready_unused_model_and_a_fresh_question(self):
        from lab.daily import plannable
        items=READY_ITEMS+[{'id':'2.1','question':'Why does a moving clock tick slowly?','model':'light-clock'},
                           {'id':'2.4','question':'Why can nothing travel faster than light?','model':'twin-trip'}]
        guides=[{'question':'Why does gravity bend light?','topic':'light-bending'}]
        ledger=[{'question':'Why does a moving clock tick slowly?','topic':'twin-trip','status':'reviewed'},
                {'question':'Why do clocks at different heights tick at different rates?','topic':'gravity-clocks','status':'failed'}]
        same=lambda e,q: (e.get('question') or '')==q
        explored=lambda q,model=None: any(same(g,q) for g in guides) or any(same(a,q) and model in (None,a.get('topic')) for a in ledger)
        # Light bending is used, the clocks question failed with the same model, twin trip is not ready;
        # the moving clock question is open again because its earlier attempt used another model.
        self.assertEqual([i['id'] for i in plannable(items,guides,explored)],['2.1'])

    def test_lock_prevents_overlap(self):
        with tempfile.TemporaryDirectory() as tmp:
            with daily_lock(Path(tmp)):
                with self.assertRaises(RuntimeError):
                    with daily_lock(Path(tmp)):pass

    def accepted(self,root):
        def capture(scene,directory,**kwargs):
            directory.mkdir(parents=True)
            path=directory/'frame.png';path.write_bytes(b'fixture')
            return [path],[{'name':'test','pass':True}]
        with patch('lab.pipeline.ROOT',root),patch('lab.pipeline.capture',capture):
            state=run(FixtureProvider(),2,topic='gravity-clocks')
        state['provider']='test-live';state['status']='reviewed'
        return state

    def test_export_filters_private_data_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=self.accepted(root)
            target=export_accepted(state,root);export_accepted(state,root)
            record=json.loads((target/'record.json').read_text())
            self.assertNotIn('usage',record);self.assertNotIn('events',record)
            self.assertEqual(record['scene']['kind'],'gravity-clocks')
            index=json.loads((root/'web'/'published'/'index.json').read_text())
            self.assertEqual(len(index),1)
            self.assertTrue((root/'web'/record['revisions'][0]['frames'][0]).exists())

    def test_export_rejects_fixture_failed_checks_and_escaping_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=self.accepted(root)
            for mutate in [lambda s:s.update(provider='fixture'),
                           lambda s:s['revisions'][-1]['checks'][0].update({'pass':False}),
                           lambda s:s['revisions'][-1]['physics_review'].update({'pass':False}),
                           lambda s:s['revisions'][-1]['learner_review'].update({'pass':False}),
                           lambda s:s['revisions'][-1].pop('learner_review'),
                           lambda s:s['revisions'][0].update(frames=['../secret.png'])]:
                bad=copy.deepcopy(state);mutate(bad)
                with self.assertRaises(ValueError):export_accepted(bad,root)
            self.assertFalse((root/'web'/'published'/'index.json').exists())

    def test_schedule_preserves_paths_with_spaces_and_sets_limits(self):
        with tempfile.TemporaryDirectory(prefix='Council test ') as tmp:
            path=write_schedule(9,2,'claude',Path(tmp))
            config=plistlib.loads(path.read_bytes())
            self.assertEqual(config['WorkingDirectory'],tmp)
            self.assertEqual(config['StartCalendarInterval'],{'Hour':9,'Minute':0})
            self.assertIn('--publish',config['ProgramArguments'])
            self.assertNotIn('RunAtLoad',config)

    def test_publish_never_commits_unrelated_staged_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/'web'/'published';p.mkdir(parents=True);(p/'index.json').write_text('[]')
            with patch('lab.daily.subprocess.run') as git:
                git.return_value.stdout='main'
                with self.assertRaises(RuntimeError):publish(root)
                self.assertEqual(git.call_count,2)

    def test_crashed_attempt_consumes_slot_and_is_marked_interrupted(self):
        from datetime import datetime
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=root/'.council-state';folder.mkdir()
            ledger=[{'day':datetime.now().astimezone().date().isoformat(),'status':'running'}]
            (folder/'history.json').write_text(json.dumps(ledger))
            with patch('lab.daily.run') as runner:
                result=daily(FixtureProvider,root=root)
            runner.assert_not_called()
            self.assertEqual(result[0]['status'],'interrupted')


class PauseTests(unittest.TestCase):
    def test_pause_flag_starts_nothing_and_uses_no_slot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'.council-state').mkdir();(root/'.council-state'/'paused').write_text('owner')
            with patch('lab.daily.run') as runner:
                self.assertEqual(daily(FixtureProvider,root=root),[])
            runner.assert_not_called()
            self.assertFalse((root/'.council-state'/'history.json').exists())


def checkouts(tmp):
    """A bare stand-in for GitHub, a checkout that pushes in between ("me") and the worker's checkout."""
    tmp=Path(tmp);hooks=tmp/'hooks';hooks.mkdir()
    def git(cwd,*args):
        return subprocess.run(['git','-c',f'core.hooksPath={hooks}',*args],cwd=cwd,text=True,capture_output=True,check=True).stdout.strip()
    def local(path):
        for key,value in (('user.name','Test'),('user.email','test@example.com'),('commit.gpgsign','false'),('core.hooksPath',str(hooks))):
            git(path,'config',key,value)
        return path
    origin=tmp/'origin.git';git(tmp,'init','-q','--bare','-b','main',str(origin))
    me=tmp/'me';git(tmp,'init','-q','-b','main',str(me));local(me)
    (me/'README.md').write_text('one\n');git(me,'add','.');git(me,'commit','-qm','start')
    git(me,'remote','add','origin',str(origin));git(me,'push','-q','origin','main')
    worker=tmp/'worker';git(tmp,'clone','-q',str(origin),str(worker));local(worker)
    def push_from_me(path,text,message):
        (me/path).parent.mkdir(parents=True,exist_ok=True);(me/path).write_text(text)
        git(me,'add','.');git(me,'commit','-qm',message);git(me,'push','-q','origin','main')
    return git,origin,worker,push_from_me


def entry_point():
    spec=importlib.util.spec_from_file_location('run_daily',Path(__file__).resolve().parents[1]/'scripts'/'run_daily.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


class WorkerSyncTests(unittest.TestCase):
    def test_waits_for_the_network_and_gives_up_without_starting(self):
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            self.assertEqual(entry_point().online(worker,minutes=1),0)
            missing=Path(tmp)/'not-a-checkout';missing.mkdir()
            now=[0];waits=[]
            def sleep(seconds):waits.append(seconds);now[0]+=seconds
            self.assertIsNone(entry_point().online(missing,minutes=2,every=30,clock=lambda:now[0],sleep=sleep))
            self.assertEqual(waits,[30,30,30,30])

    def test_publish_replays_its_commit_when_github_moved_during_the_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            push_from_me('README.md','two\n','pushed during the run')
            (worker/'web'/'published'/'run-1').mkdir(parents=True);(worker/'web'/'published'/'run-1'/'record.json').write_text('{}')
            publish(worker)
            log=git(origin,'log','--format=%s','main').splitlines()
            self.assertEqual(log[:2],['Publish reviewed investigation run-1','pushed during the run'])
            self.assertEqual(git(worker,'rev-parse','HEAD'),git(origin,'rev-parse','main'))

    def test_publish_conflict_is_left_pending_and_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            push_from_me('web/published/run-1/record.json','{"theirs":1}','same file on GitHub')
            (worker/'web'/'published'/'run-1').mkdir(parents=True);(worker/'web'/'published'/'run-1'/'record.json').write_text('{"ours":1}')
            with self.assertRaises(RuntimeError):publish(worker)
            self.assertEqual(git(worker,'status','--porcelain','--untracked-files=no'),'')
            self.assertEqual(git(origin,'log','-1','--format=%s','main'),'same file on GitHub')

    def test_entry_point_fast_forwards_before_the_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            push_from_me('lab/new.py','x=1\n','new code')
            self.assertEqual(entry_point().update(worker),'updated')
            self.assertEqual(git(worker,'rev-parse','HEAD'),git(origin,'rev-parse','main'))
            self.assertEqual(entry_point().update(worker),'up to date')

    def test_entry_point_never_touches_local_edits(self):
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            push_from_me('lab/new.py','x=1\n','new code')
            (worker/'README.md').write_text('edited by hand\n')
            self.assertEqual(entry_point().update(worker),'local edits present, not updated')
            self.assertEqual((worker/'README.md').read_text(),'edited by hand\n')
            self.assertNotEqual(git(worker,'rev-parse','HEAD'),git(origin,'rev-parse','main'))

    def test_entry_point_replays_only_an_unpushed_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            (worker/'web').mkdir();(worker/'web'/'dashboard.json').write_text('{}')
            git(worker,'add','.');git(worker,'commit','-qm','Update Council investigation dashboard')
            push_from_me('lab/new.py','x=1\n','new code')
            self.assertEqual(entry_point().update(worker),'updated, unpushed publication replayed on top')
            self.assertEqual(git(worker,'log','-2','--format=%s'),'Update Council investigation dashboard\nnew code')
            (worker/'notes.txt').write_text('x');git(worker,'add','.');git(worker,'commit','-qm','something else')
            push_from_me('lab/newer.py','y=1\n','newer code')
            self.assertEqual(entry_point().update(worker),'unpushed commits outside the publication, not updated')
