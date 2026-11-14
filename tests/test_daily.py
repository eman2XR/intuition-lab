import copy
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from lab.daily import EARLY_STOPS, daily, daily_lock, export_accepted, publish, research_brief, site_live
from lab.fixtures import FixtureProvider
from lab.schedule import write_schedule
from helpers import READY, READY_ITEMS, accepted, curriculum, on_day
import plistlib


@patch('lab.daily.READY',READY)
class DailyTests(unittest.TestCase):
    def test_daily_budget_persists_within_a_day(self):
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
        from lab.daily import attempted, plannable
        items=READY_ITEMS+[{'id':'2.1','question':'Why does a moving clock tick slowly?','model':'light-clock'},
                           {'id':'2.4','question':'Why can nothing travel faster than light?','model':'twin-trip'},
                           {'id':'3.1','question':'What happens when two waves meet?','model':'light-clock'}]
        guides=[{'question':'Why does gravity bend light?','topic':'light-bending'}]
        ledger=[{'question':'Why does a moving clock tick slowly?','topic':'twin-trip','status':'reviewed'},
                {'question':'Why do clocks at different heights tick at different rates?','topic':'gravity-clocks','status':'failed'},
                {'question':'What happens when two waves meet?','topic':'light-clock','status':'needs_review'}]
        same=lambda e,q: (e.get('question') or '')==q
        explored=lambda q,model=None: any(same(g,q) for g in guides) or attempted(ledger,q,model,same)
        # Light bending is used and twin trip is not ready; the clocks question stopped early, so it is retried; the
        # waves question reached review with its model; the moving clock question is open again because its earlier
        # attempt used another model.
        self.assertEqual([i['id'] for i in plannable(items,guides,explored)],['1.1','2.1'])

    def test_lock_prevents_overlap(self):
        with tempfile.TemporaryDirectory() as tmp:
            with daily_lock(Path(tmp)):
                with self.assertRaises(RuntimeError):
                    with daily_lock(Path(tmp)):pass

    def test_export_filters_private_data_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=accepted(root)
            target=export_accepted(state,root);export_accepted(state,root)
            record=json.loads((target/'record.json').read_text())
            self.assertNotIn('usage',record);self.assertNotIn('events',record)
            self.assertEqual(record['scene']['kind'],'gravity-clocks')
            self.assertIn('blind_review',record['revisions'][-1])
            index=json.loads((root/'web'/'published'/'index.json').read_text())
            self.assertEqual(len(index),1)
            self.assertTrue((root/'web'/record['revisions'][0]['frames'][0]).exists())
            self.assertEqual(sorted(p.name for p in (root/'web'/'published').iterdir()),[state['id'],'index.json'])
            # Runs from before the blind viewer still export.
            older=copy.deepcopy(state)
            for rev in older['revisions']:rev.pop('blind_review')
            export_accepted(older,root)

    def test_every_export_refusal_raises_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=accepted(root)
            run_dir=root/'web'/'runs'/state['id'];outside=root/'secret.png';outside.write_bytes(b's')
            (run_dir/'notes.txt').write_text('x');os.symlink(outside,run_dir/'linked.png')
            def frame(name):
                return lambda s:s['revisions'][0].update(frames=[name])
            for mutate in [lambda s:s.update(provider='fixture'),lambda s:s.update(status='needs_review'),
                           lambda s:s.update(id='../escape'),lambda s:s.update(id='x/y'),
                           lambda s:s['revisions'][-1].update(accepted=False),
                           lambda s:s['revisions'][-1].update(checks=[]),
                           lambda s:s['revisions'][-1]['checks'][0].update({'pass':False}),
                           lambda s:s['revisions'][-1]['physics_review'].update({'pass':False}),
                           lambda s:s['revisions'][-1]['visual_review'].update({'score':6}),
                           lambda s:s['revisions'][-1]['learner_review'].update({'blocking_issues':['Unclear']}),
                           lambda s:s['revisions'][-1]['blind_review'].update({'pass':False}),
                           lambda s:s['revisions'][-1].pop('learner_review'),
                           lambda s:s.pop('scene'),
                           frame('../secret.png'),frame(f'runs/{state["id"]}/../../../secret.png'),
                           frame(f'runs/{state["id"]}/notes.txt'),frame(f'runs/{state["id"]}/linked.png'),
                           frame(f'runs/{state["id"]}/missing.png')]:
                bad=copy.deepcopy(state);mutate(bad)
                with self.assertRaises((ValueError,KeyError)):export_accepted(bad,root)
                self.assertFalse((root/'web'/'published').exists())
            # A failure while writing leaves the guide already published untouched and no temporary folder behind.
            target=export_accepted(state,root);before=(target/'record.json').read_bytes()
            with patch('lab.daily.shutil.copyfile',side_effect=OSError('disk full')):
                with self.assertRaises(OSError):export_accepted(state,root)
            self.assertEqual(sorted(p.name for p in (root/'web'/'published').iterdir()),[state['id'],'index.json'])
            self.assertEqual((target/'record.json').read_bytes(),before)

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
            root=Path(tmp);(root/'web').mkdir();(root/'web'/'dashboard.json').write_text('{}')
            with patch('lab.daily.subprocess.run') as git:
                git.return_value.stdout='main'
                with self.assertRaises(RuntimeError):publish(root)
                self.assertEqual(git.call_count,2)

    def test_crashed_attempt_consumes_slot_and_is_marked_interrupted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=root/'.council-state';folder.mkdir()
            ledger=[{'day':datetime.now().astimezone().date().isoformat(),'status':'running'}]
            (folder/'history.json').write_text(json.dumps(ledger))
            with patch('lab.daily.run') as runner:
                result=daily(FixtureProvider,root=root)
            runner.assert_not_called()
            self.assertEqual(result[0]['status'],'interrupted')

    def test_notifies_only_after_a_reviewed_guide_is_pushed_and_live(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);curriculum(root,READY_ITEMS);state=accepted(root)
            with patch('lab.daily.inbox.fetch',return_value=[]),patch('lab.daily.run',return_value=state),\
                 patch('lab.daily.publish',side_effect=RuntimeError('offline')),patch('lab.push.notify') as notify,\
                 patch('lab.daily.site_live') as live:
                ledger=daily(FixtureProvider,push=True,root=root)
            notify.assert_not_called();live.assert_not_called()
            self.assertEqual(ledger[0]['notify'],'pending')
            # The next cycle's successful push sends it once the site serves it; the day's slot is already used, so
            # nothing new starts. The push carries the guide's own folder.
            with patch('lab.daily.inbox.fetch',return_value=[]),patch('lab.daily.run') as runner,\
                 patch('lab.daily.publish') as pushed,patch('lab.push.notify') as notify,\
                 patch('lab.daily.site_live',return_value=True) as live:
                daily(FixtureProvider,push=True,root=root)
                daily(FixtureProvider,push=True,root=root)
            runner.assert_not_called()
            self.assertEqual(pushed.call_args_list[0].args,(root,[state['id']]))
            live.assert_called_once_with(state['id'])
            notify.assert_called_once_with(state['scene']['title'],state['scene']['subtitle'],
                                           f'https://eman2xr.github.io/intuition-lab/?guide={state["id"]}',root/'.council-state')

    def test_waiting_for_the_site_is_bounded_and_never_raises(self):
        class Page:
            status=200
            def __enter__(self):return self
            def __exit__(self,*a):return False
        answers=[OSError('404'),Page()]
        def opener(url,timeout):
            answer=answers.pop(0)
            if isinstance(answer,Exception):raise answer
            return answer
        now=[0];waits=[]
        def sleep(seconds):waits.append(seconds);now[0]+=seconds
        self.assertTrue(site_live('run-1',opener=opener,sleep=sleep,clock=lambda:now[0]))
        self.assertEqual(waits,[20])
        def down(url,timeout):raise OSError('offline')
        now=[0];waits=[]
        self.assertFalse(site_live('run-1',opener=down,sleep=sleep,clock=lambda:now[0]))
        self.assertEqual(sum(waits),600)

    def test_an_early_stop_notifies_the_owner_but_an_idle_day_does_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);curriculum(root,READY_ITEMS)
            failed={'status':'failed','id':'run-1','error':'claude worker exceeded its 300s time limit.'}
            with patch('lab.daily.inbox.fetch',return_value=[]),patch('lab.daily.run',return_value=failed),\
                 patch('lab.daily.publish'),patch('lab.push.notify') as notify:
                daily(FixtureProvider,push=True,root=root)
            notify.assert_called_once_with('Today’s run stopped early','claude worker exceeded its 300s time limit.',
                                           'https://eman2xr.github.io/intuition-lab/',root/'.council-state')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);curriculum(root,[])
            with patch('lab.daily.inbox.fetch',return_value=[]),patch('lab.daily.publish') as pushed,patch('lab.push.notify') as notify:
                daily(FixtureProvider,push=True,root=root)
            notify.assert_not_called()
            # The idle cycle still checks in on the dashboard and publishes it.
            pushed.assert_called_once_with(root,[])
            checked=json.loads((root/'web'/'dashboard.json').read_text())['checked']
            self.assertEqual(checked['outcome'],'No question is ready to investigate; nothing started.')

    def test_drafts_and_unpublished_runs_never_notify(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);curriculum(root,READY_ITEMS)
            with patch('lab.daily.inbox.fetch',return_value=[]),patch('lab.daily.run',return_value={'status':'needs_review','id':'draft'}),\
                 patch('lab.daily.publish'),patch('lab.push.notify') as notify:
                daily(FixtureProvider,push=True,root=root)
            notify.assert_not_called()
            state=accepted(root)
            with patch('lab.daily.run',return_value=state),patch('lab.push.notify') as notify:
                ledger=daily(FixtureProvider,count=2,root=root)
            notify.assert_not_called()
            self.assertTrue(ledger[-1]['exported'])


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
    def test_daily_log_lines_start_with_the_local_time(self):
        out=io.StringIO()
        stamped=entry_point().Stamped(out,clock=lambda:datetime(2026,11,2,9,0,5).astimezone())
        print('Planning “A?”.',file=stamped,flush=True);stamped.write('two\nlines\n')
        lines=out.getvalue().splitlines()
        self.assertEqual(len(lines),3)
        self.assertTrue(all(line.startswith('2026-11-02T09:00:05') for line in lines),lines)
        self.assertTrue(lines[0].endswith(' Planning “A?”.'))

    def test_waits_for_the_network_and_gives_up_without_starting(self):
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            # It answers on the first check without sleeping; the exact seconds depend on how fast git runs here.
            waited=entry_point().online(worker,minutes=1)
            self.assertIsNotNone(waited);self.assertLess(waited,60)
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
            (worker/'web'/'published'/'index.json').write_text(json.dumps([{'id':'run-1'}]))
            # A guide made by hand and not committed never ships with the run's publication.
            (worker/'web'/'published'/'by-hand').mkdir();(worker/'web'/'published'/'by-hand'/'record.json').write_text('{}')
            publish(worker,['run-1'])
            log=git(origin,'log','--format=%s','main').splitlines()
            self.assertEqual(log[:2],['Publish reviewed investigation run-1','pushed during the run'])
            self.assertEqual(git(worker,'rev-parse','HEAD'),git(origin,'rev-parse','main'))
            shipped=git(origin,'ls-tree','-r','--name-only','main').splitlines()
            self.assertIn('web/published/run-1/record.json',shipped);self.assertNotIn('web/published/by-hand/record.json',shipped)
            # An index that lists an uncommitted guide is not pushed at all.
            (worker/'web'/'published'/'index.json').write_text(json.dumps([{'id':'by-hand'},{'id':'run-1'}]))
            with self.assertRaises(RuntimeError):publish(worker,['run-1'])
            self.assertEqual(git(worker,'rev-parse','HEAD'),git(origin,'rev-parse','main'))

    def test_publish_conflict_is_left_pending_and_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            push_from_me('web/published/run-1/record.json','{"theirs":1}','same file on GitHub')
            (worker/'web'/'published'/'run-1').mkdir(parents=True);(worker/'web'/'published'/'run-1'/'record.json').write_text('{"ours":1}')
            log=io.StringIO()
            with self.assertRaises(RuntimeError) as refused,redirect_stdout(log):publish(worker,['run-1'])
            self.assertIn('conflicts with newer commits',str(refused.exception))
            # The log names the git command that failed and the last line it printed.
            self.assertIn('git push failed: error: failed to push some refs',log.getvalue())
            self.assertEqual(git(worker,'status','--porcelain','--untracked-files=no'),'')
            self.assertEqual(git(origin,'log','-1','--format=%s','main'),'same file on GitHub')

    def test_publish_commits_and_pushes_a_brief_and_nothing_unrelated(self):
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            (worker/'web'/'briefs').mkdir(parents=True)
            (worker/'web'/'briefs'/'2.2.json').write_text(json.dumps({'id':'2.2'}))
            (worker/'web'/'proposals.json').write_text(json.dumps({'proposals':[]}))
            # An unrelated edit in the worker is never staged by publish.
            (worker/'notes.txt').write_text('private')
            publish(worker)
            shipped=git(origin,'ls-tree','-r','--name-only','main').splitlines()
            self.assertIn('web/briefs/2.2.json',shipped)
            self.assertNotIn('notes.txt',shipped)
            self.assertEqual(git(worker,'rev-parse','HEAD'),git(origin,'rev-parse','main'))

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


class RetryTests(unittest.TestCase):
    def test_an_early_stop_is_retried_until_it_has_stopped_three_times_and_the_latest_first(self):
        from lab.daily import attempted, retry_order
        same=lambda entry,q: entry.get('question')==q
        ledger=[{'question':'A','topic':'a','status':'failed'},{'question':'B','topic':'b','status':'interrupted'},
                {'question':'C','topic':'c','status':'needs_review'}]
        self.assertEqual(EARLY_STOPS,3)
        self.assertFalse(attempted(ledger,'A','a',same))
        self.assertFalse(attempted(ledger,'B','b',same))
        self.assertTrue(attempted(ledger,'C','c',same))
        stops=[{'question':'A','topic':'a','status':status} for status in ('interrupted','failed')]
        self.assertFalse(attempted(ledger+stops[:1],'A','a',same))
        self.assertTrue(attempted(ledger+stops,'A','a',same))
        self.assertFalse(attempted(ledger,'A','other',same))
        items=[{'question':'A'},{'question':'B'},{'question':'D'}]
        self.assertEqual([i['question'] for i in retry_order(items,ledger,same)],['D','B','A'])


@patch('lab.daily.READY',READY)
class DailyCycleTests(unittest.TestCase):
    ITEMS=[{'id':'1.1','question':'A?','model':'gravity-clocks'},{'id':'1.2','question':'B?','model':'light-bending'},
           {'id':'1.3','question':'C?','model':'light-clock'}]

    def cycle(self,root,day,status):
        """One daily cycle on the given day; returns the question it ran, or None."""
        with patch('lab.daily.datetime',on_day(day)),\
             patch('lab.daily.run',side_effect=lambda provider,rounds,**k:{'status':status(k['question']),'id':'run-'+day}) as runner:
            daily(FixtureProvider,root=root)
        return runner.call_args.kwargs['question'] if runner.called else None

    def test_lock_held_raises_and_leaves_the_ledger_untouched_and_a_new_day_gets_a_fresh_slot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);curriculum(root,self.ITEMS)
            self.assertEqual(self.cycle(root,'2026-11-02',lambda q:'needs_review'),'A?')
            ledger=(root/'.council-state'/'history.json').read_bytes()
            with daily_lock(root):
                with self.assertRaises(RuntimeError):self.cycle(root,'2026-11-03',lambda q:'needs_review')
            self.assertEqual((root/'.council-state'/'history.json').read_bytes(),ledger)
            self.assertIsNone(self.cycle(root,'2026-11-02',lambda q:'needs_review'))
            self.assertEqual(self.cycle(root,'2026-11-03',lambda q:'needs_review'),'B?')
            self.assertEqual([a['day'] for a in json.loads((root/'.council-state'/'history.json').read_text())],['2026-11-02','2026-11-03'])

    def test_retry_rule_over_several_days(self):
        # A and C always stop early, B reaches review. Untried questions come first; then retries, the latest early
        # stop first; a question rests after three early stops; one that reached review is never retried.
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);curriculum(root,self.ITEMS)
            status=lambda q:'needs_review' if q=='B?' else 'failed'
            ran=[self.cycle(root,f'2026-11-{day:02d}',status) for day in range(2,10)]
            self.assertEqual(ran,['A?','B?','C?','C?','C?','A?','A?',None])
            # A crash left an attempt running; the next cycle counts it as an early stop, and it is retried.
            ledger=json.loads((root/'.council-state'/'history.json').read_text())
            ledger.append({'day':'2026-11-09','question':'D?','topic':'gravity-clocks','status':'running'})
            (root/'.council-state'/'history.json').write_text(json.dumps(ledger))
            curriculum(root,self.ITEMS+[{'id':'1.4','question':'D?','model':'gravity-clocks'}])
            self.assertEqual(self.cycle(root,'2026-11-10',status),'D?')
            self.assertEqual(json.loads((root/'.council-state'/'history.json').read_text())[-2]['status'],'interrupted')


@patch('lab.daily.READY',READY)
class ResearchBriefTests(unittest.TestCase):
    # 1.1 is ready today (patched READY); 2.2 and 2.3 have no ready engine, so they are what an idle morning researches.
    ITEMS=[{'id':'1.1','question':'Why do clocks at different heights tick at different rates?','model':'gravity-clocks'},
           {'id':'2.2','question':'Can two events be simultaneous for one person but not another?','model':'spacetime'},
           {'id':'2.3','question':'Why is the travelling twin younger?','model':'twin-trip'}]

    def harness(self,items,guides=(),ledger=()):
        from lab.daily import attempted, normalize
        same=lambda e,q: normalize(e.get('question') or e.get('title') or '')==normalize(q)
        explored=lambda q,model=None: any(same(g,q) for g in guides) or attempted(list(ledger),q,model,same)
        model_of=lambda q: next((i['model'] for i in items if normalize(i['question'])==normalize(q)),None)
        return explored,model_of

    def test_idle_morning_researches_the_next_waiting_item_into_a_brief(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            provider=FixtureProvider();provider.calls=0
            explored,model_of=self.harness(self.ITEMS)
            brief=research_brief(lambda:provider,self.ITEMS,root,'2026-11-07',explored,model_of)
            # The next waiting item in teaching order, with its researcher, scientist and designer calls.
            self.assertEqual((brief['id'],brief['model']),('2.2','spacetime'))
            self.assertEqual(provider.calls,3)
            saved=json.loads((root/'web'/'briefs'/'2.2.json').read_text())
            self.assertEqual(saved['curriculum'],'2.2')
            self.assertIn('sources',saved['research']);self.assertIn('chapters',saved['design'])
            self.assertEqual((saved['sources_retrieved'],saved['retrieved_by']),(False,'agent'))
            proposal=json.loads((root/'web'/'proposals.json').read_text())['proposals'][0]
            self.assertEqual((proposal['kind'],proposal['curriculum']),('blueprint','2.2'))
            self.assertIn('web/briefs/2.2.json',proposal['proposal'])

    def test_owner_question_without_a_ready_engine_comes_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            provider=FixtureProvider();provider.calls=0
            explored,model_of=self.harness(self.ITEMS)
            requests=[{'number':7,'kind':'question','title':'Why is the travelling twin younger?','curriculum':'2.3'}]
            brief=research_brief(lambda:provider,self.ITEMS,root,'2026-11-07',explored,model_of,requests)
            self.assertEqual((brief['id'],brief['curriculum'],brief['model']),('2.3','2.3','twin-trip'))

    def test_once_a_day_and_never_re_researches_a_briefed_or_published_question(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            provider=FixtureProvider();provider.calls=0
            explored,model_of=self.harness(self.ITEMS)
            self.assertEqual(research_brief(lambda:provider,self.ITEMS,root,'2026-11-07',explored,model_of)['id'],'2.2')
            provider.calls=0
            # Once a day: a second brief the same day is refused without any model call.
            self.assertIsNone(research_brief(lambda:provider,self.ITEMS,root,'2026-11-07',explored,model_of))
            self.assertEqual(provider.calls,0)
            # A question with a brief is skipped: the next day takes the next waiting item.
            self.assertEqual(research_brief(lambda:provider,self.ITEMS,root,'2026-11-08',explored,model_of)['id'],'2.3')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            provider=FixtureProvider();provider.calls=0
            guides=[{'question':self.ITEMS[1]['question'],'topic':'spacetime'},
                    {'question':self.ITEMS[2]['question'],'topic':'twin-trip'}]
            explored,model_of=self.harness(self.ITEMS,guides=guides)
            # A published guide's question is never researched; with nothing left, no brief and no call.
            self.assertIsNone(research_brief(lambda:provider,self.ITEMS,root,'2026-11-09',explored,model_of))
            self.assertEqual(provider.calls,0)
            self.assertFalse((root/'web'/'briefs').exists())

    def test_a_provider_failure_leaves_no_brief_and_the_cycle_falls_back_to_a_sketch(self):
        class FailsAtScientist:
            name='fixture';usage=[]
            def __init__(self):self.calls=0;self.inner=FixtureProvider()
            def generate(self,role,prompt,schema=None,images=(),research=False):
                self.calls+=1
                if role=='scientist':raise ValueError('scientist failed')
                return self.inner.generate(role,prompt,schema,images,research)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web').mkdir()
            explored,model_of=self.harness(self.ITEMS)
            self.assertIsNone(research_brief(lambda:FailsAtScientist(),self.ITEMS,root,'2026-11-07',explored,model_of))
            self.assertFalse((root/'web'/'briefs'/'2.2.json').exists())
            self.assertFalse((root/'web'/'proposals.json').exists())
        # Wired into the idle daily cycle, a research failure still yields a design-only sketch for the owner.
        waiting=[i for i in self.ITEMS if i['model']!='gravity-clocks']
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);curriculum(root,waiting);provider=FailsAtScientist()
            daily(lambda:provider,root=root,requests=[],blueprints=True)
            self.assertFalse((root/'web'/'briefs').exists())
            proposals=json.loads((root/'web'/'proposals.json').read_text())['proposals']
            self.assertEqual(proposals[0]['kind'],'blueprint')
            self.assertNotIn('web/briefs',proposals[0]['proposal'])


class EntryPointTests(unittest.TestCase):
    def test_the_entry_point_needs_nothing_from_the_package_before_updating(self):
        import ast, lab
        module=entry_point()
        self.assertEqual(module.PUBLICATION,lab.PUBLICATION)
        self.assertEqual(module.ROOT,lab.ROOT)
        # Briefs are coordinator outputs, so both publication tuples must list them.
        self.assertIn('web/briefs/',lab.PUBLICATION)
        self.assertIn('web/briefs/',module.PUBLICATION)
        tree=ast.parse((Path(__file__).resolve().parents[1]/'scripts'/'run_daily.py').read_text())
        imported=[n for n in ast.walk(tree) if isinstance(n,(ast.Import,ast.ImportFrom))]
        names=[(n.module or '') if isinstance(n,ast.ImportFrom) else a.name for n in imported for a in (n.names if isinstance(n,ast.Import) else [n])]
        self.assertFalse([n for n in names if n=='lab' or n.startswith('lab.')])


class ArchiveTests(unittest.TestCase):
    def test_set_archived_flips_only_the_index_and_can_restore(self):
        from lab.daily import set_archived
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            (worker/'web'/'published'/'run-1').mkdir(parents=True);(worker/'web'/'published'/'run-1'/'record.json').write_text('{}')
            (worker/'web'/'published'/'index.json').write_text(json.dumps([{'id':'run-1','title':'A'}]))
            git(worker,'add','.');git(worker,'commit','-qm','Publish reviewed investigation run-1');git(worker,'push','-q','origin','main')
            self.assertTrue(set_archived(worker,'run-1',True))
            self.assertTrue(json.loads((worker/'web'/'published'/'index.json').read_text())[0]['archived'])
            self.assertEqual(git(origin,'log','-1','--format=%s','main'),'Archive investigation run-1')
            self.assertEqual(git(worker,'rev-parse','HEAD'),git(origin,'rev-parse','main'))
            # Restore removes the flag and ships only the index.
            self.assertFalse(set_archived(worker,'run-1',False))
            self.assertNotIn('archived',json.loads((worker/'web'/'published'/'index.json').read_text())[0])
            self.assertEqual(git(origin,'log','-1','--format=%s','main'),'Restore investigation run-1 from the archive')
            shipped=git(origin,'ls-tree','-r','--name-only','main').splitlines()
            self.assertIn('web/published/run-1/record.json',shipped)

    def test_set_archived_rejects_an_unknown_guide_and_commits_nothing(self):
        from lab.daily import set_archived
        with tempfile.TemporaryDirectory() as tmp:
            git,origin,worker,push_from_me=checkouts(tmp)
            (worker/'web'/'published').mkdir(parents=True);(worker/'web'/'published'/'index.json').write_text(json.dumps([{'id':'run-1'}]))
            git(worker,'add','.');git(worker,'commit','-qm','seed');git(worker,'push','-q','origin','main')
            before=git(worker,'rev-parse','HEAD')
            with self.assertRaises(ValueError):set_archived(worker,"missing",True)
            self.assertEqual(git(worker,'rev-parse','HEAD'),before)
            self.assertEqual(git(worker,'status','--porcelain'),'')

    def test_apply_archive_applies_known_requests_and_closes_each_issue(self):
        from unittest.mock import call
        from lab.daily import apply_archive
        reqs=[{'number':1,'kind':'archive','body':'guide: run-1\n\nhide it'},
              {'number':2,'kind':'unarchive','body':'guide: run-1'},
              {'number':3,'kind':'archive','body':'no id in this one'},
              {'number':4,'kind':'question','body':'guide: run-1'}]
        with patch('lab.daily.set_archived') as setter,patch('lab.daily.inbox.comment') as comment,patch('lab.daily.inbox.close') as close:
            notes=apply_archive(reqs,Path('/root'),'2026-11-08')
        self.assertEqual(setter.call_args_list,[call(Path('/root'),'run-1',True),call(Path('/root'),'run-1',False)])
        self.assertEqual([c.args[0] for c in close.call_args_list],[1,2,3])
        self.assertEqual(notes,['Archived the guide run-1.','Restored the guide run-1.'])
        self.assertIn('no guide id',comment.call_args_list[-1].args[1].lower())

    def test_apply_archive_leaves_a_pending_request_open(self):
        from lab.daily import apply_archive
        with patch('lab.daily.set_archived',side_effect=RuntimeError('offline')),\
             patch('lab.daily.inbox.comment') as comment,patch('lab.daily.inbox.close') as close:
            notes=apply_archive([{'number':9,'kind':'archive','body':'guide: run-1'}],Path('/root'),'2026-11-08')
        close.assert_not_called();self.assertEqual(notes,[])
        self.assertIn('pending',comment.call_args.args[1])


class ArchiveIssueTests(unittest.TestCase):
    def event(self, **issue):
        base={'number':7,'state':'open','user':{'login':'eman2XR'},'title':'Archive: X','body':'guide: run-1',
              'labels':[{'name':'council:archive'}]}
        return {'issue':{**base,**issue},'sender':{'login':'eman2XR'}}

    def test_only_the_owners_open_archive_or_restore_request_is_read(self):
        from lab.archive_issue import request_from_event
        self.assertEqual(request_from_event(self.event())['kind'],'archive')
        self.assertEqual(request_from_event(self.event(labels=[{'name':'council:unarchive'}]))['kind'],'unarchive')
        self.assertIsNone(request_from_event(self.event(user={'login':'someone'})))
        self.assertIsNone(request_from_event({**self.event(),'sender':{'login':'someone'}}))
        self.assertIsNone(request_from_event(self.event(state='closed')))
        self.assertIsNone(request_from_event(self.event(labels=[{'name':'council:question'}])))

    def test_the_action_applies_a_request_once(self):
        from lab import archive_issue
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'event.json';path.write_text(json.dumps(self.event()))
            with patch('lab.archive_issue.still_open',return_value=True),patch('lab.archive_issue.apply_archive',return_value=['Archived the guide run-1.']) as apply:
                archive_issue.main(path,root=Path(tmp))
            self.assertEqual(apply.call_args.args[0][0]['number'],7)
            # A change asks the workflow to republish the site; an answered request without a change does not.
            output=Path(tmp)/'output'
            with patch.dict(os.environ,{'GITHUB_OUTPUT':str(output)}),patch('lab.archive_issue.still_open',return_value=True),\
                 patch('lab.archive_issue.apply_archive',return_value=[]):
                archive_issue.main(path,root=Path(tmp))
            self.assertFalse(output.exists())
            with patch.dict(os.environ,{'GITHUB_OUTPUT':str(output)}),patch('lab.archive_issue.still_open',return_value=True),\
                 patch('lab.archive_issue.apply_archive',return_value=['Archived the guide run-1.']):
                archive_issue.main(path,root=Path(tmp))
            self.assertEqual(output.read_text(),'changed=true\n')
            # The second event for the same issue finds it closed and applies nothing.
            with patch('lab.archive_issue.still_open',return_value=False),patch('lab.archive_issue.apply_archive') as apply:
                archive_issue.main(path,root=Path(tmp))
            apply.assert_not_called()
