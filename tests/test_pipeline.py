import copy
import tempfile
import unittest
import threading
from pathlib import Path
from unittest.mock import patch
from lab.contracts import validate_scene
from lab.fixtures import FixtureProvider, SCENE
from lab.pipeline import run, approved
import helpers


class LoopTests(unittest.TestCase):
    def execute(self, provider, rounds=3, checks=None):
        with tempfile.TemporaryDirectory() as tmp:
            state=helpers.execute(provider,rounds,Path(tmp),checks)
            self.assertTrue((Path(tmp)/'web'/'runs'/state['id']/'record.json').exists())
            return state

    def test_feedback_causes_revision_and_fixture_is_never_live(self):
        state=self.execute(FixtureProvider())
        self.assertEqual(state['status'],'fixture_complete')
        self.assertEqual(len(state['revisions']),2)
        self.assertFalse(state['revisions'][0]['scene']['show_reference'])
        self.assertTrue(state['revisions'][1]['scene']['show_reference'])

    def test_owner_guidance_reaches_designer_writer_and_reviewers(self):
        class Recorder(FixtureProvider):
            def __init__(self):
                super().__init__();self.prompts={}
            def generate(self,role,prompt,schema=None,**kw):
                self.prompts.setdefault(role,[]).append(prompt)
                return super().generate(role,prompt,schema,**kw)
        provider=Recorder()
        with tempfile.TemporaryDirectory() as tmp:
            state=helpers.execute(provider,1,Path(tmp),guidance=['Use an everyday example.','  '])
        self.assertEqual(state['guidance'],['Use an everyday example.'])
        self.assertTrue(any(e['message'].startswith('Owner guidance: 1 note') for e in state['events']))
        for role in ('designer','writer','learner','visual_reviewer','physics_reviewer'):
            self.assertIn('Use an everyday example.',provider.prompts[role][-1],role)
        for role in ('researcher','blind_viewer'):
            self.assertNotIn('Use an everyday example.',provider.prompts[role][-1],role)

    def test_design_brief_guides_the_writer_and_the_blind_viewer_sees_only_pictures(self):
        class Recorder(FixtureProvider):
            def __init__(self,blind_pass=True):
                super().__init__();self.prompts={};self.images={};self.blind_pass=blind_pass
            def generate(self,role,prompt,schema=None,images=(),**kw):
                self.prompts.setdefault(role,[]).append(prompt);self.images.setdefault(role,[]).append([Path(i).name for i in images])
                if role=='blind_viewer' and not self.blind_pass:
                    return {'pass':False,'score':4,'summary':'Cannot see what changes.','changes':['Show the change.'],'blocking_issues':[]}
                return super().generate(role,prompt,schema,images=images,**kw)
        def capture(scene,directory,**kwargs):
            directory.mkdir(parents=True);frames=[]
            for n in range(1,3):
                frame=directory/f'frame-{n}.png';frame.write_bytes(b'f');frames.append(frame)
            (directory/'canvas-1.png').write_bytes(b'c')
            return frames,[{'name':'test','pass':True}]
        for blind_pass,status in ((True,'fixture_complete'),(False,'needs_review')):
            provider=Recorder(blind_pass)
            with tempfile.TemporaryDirectory() as tmp:
                with patch('lab.pipeline.ROOT',Path(tmp)),patch('lab.pipeline.capture',capture):
                    state=run(provider,2)
            self.assertEqual(state['status'],status)
            self.assertEqual(state['design']['idea'],'Fixture idea: compare the paths.')
            for role in ('writer','visual_reviewer'):
                self.assertIn('Fixture idea: compare the paths.',provider.prompts[role][-1],role)
            for role in ('learner','blind_viewer'):
                self.assertNotIn('Fixture idea',provider.prompts[role][-1],role)
            self.assertEqual(provider.images['blind_viewer'][-1],['canvas-1.png'])
            self.assertTrue(any('Designer is planning' in e['message'] for e in state['events']))

    def test_iteration_exhaustion_leaves_draft(self):
        state=self.execute(FixtureProvider(),1)
        self.assertEqual(state['status'],'needs_review')

    def test_failed_checks_block_even_with_passing_reviews(self):
        state=self.execute(FixtureProvider(),3,[{'name':'numerical failure','pass':False}])
        self.assertEqual(state['status'],'needs_review')
        self.assertFalse(any(r['accepted'] for r in state['revisions']))

    def test_api_failure_retains_record(self):
        class Broken(FixtureProvider):
            def generate(self,*args,**kwargs):
                raise RuntimeError('Connection failed')
        state=self.execute(Broken())
        self.assertEqual(state['status'],'failed')
        self.assertEqual(state['error'],'Connection failed')

    def test_scientific_blocker_overrides_score(self):
        self.assertFalse(approved({'pass':True,'score':10,'blocking_issues':['Incorrect physics']}))

    def test_reviewers_actually_run_in_parallel(self):
        barrier=threading.Barrier(2)
        class Parallel(FixtureProvider):
            def generate(self,role,*args,**kwargs):
                if role in ('physics_reviewer','visual_reviewer'):
                    barrier.wait(timeout=2)
                return super().generate(role,*args,**kwargs)
        state=self.execute(Parallel())
        self.assertEqual(state['status'],'fixture_complete')

    def test_researcher_timeout_falls_back_to_coordinator_sources(self):
        from lab.cli_providers import WorkerLimitError
        class Slow(FixtureProvider):
            def generate(self,role,*args,**kwargs):
                if role=='researcher':raise WorkerLimitError('claude worker exceeded its 600s time limit')
                if role=='source_finder':return {'urls':[{'url':'https://example.edu/page','why':'w'}]}
                return super().generate(role,*args,**kwargs)
        page=('Clocks','word '*200)
        with patch('lab.sources.fetch',return_value=page):
            state=self.execute(Slow())
        self.assertEqual(state['provenance']['retrieved_by'],'coordinator')
        self.assertTrue(any('coordinator is retrieving' in e['message'] for e in state['events']))

    def test_invalid_scene_cannot_reach_renderer(self):
        scene=copy.deepcopy(SCENE);scene['mass']=float('nan')
        with self.assertRaises(ValueError):validate_scene(scene)
        scene=copy.deepcopy(SCENE);scene['mass']=20
        with self.assertRaises(ValueError):validate_scene(scene)
        scene=copy.deepcopy(SCENE);scene['beats']=[]
        with self.assertRaises(ValueError):validate_scene(scene)
        scene=copy.deepcopy(SCENE);scene['beats']=scene['beats']*2
        with self.assertRaises(ValueError):validate_scene(scene)
        scene=copy.deepcopy(SCENE);scene['beats']=scene['beats']+scene['beats'][:1]
        validate_scene(scene)
        scene=copy.deepcopy(SCENE);scene['why']='x'*221
        with self.assertRaises(ValueError):validate_scene(scene)
        scene=copy.deepcopy(SCENE);del scene['why']
        with self.assertRaises(ValueError):validate_scene(scene)

class BudgetTests(unittest.TestCase):
    def test_reviews_that_never_pass_end_as_a_draft_within_the_daily_budget(self):
        # The worst case under the budget __main__ gives a daily attempt: the planner is asked, the researcher fails
        # over to the coordinator's source finder, the designer's first brief is out of bounds and goes back once, and
        # all four reviewers reject every revision.
        from lab.__main__ import main
        class Budgeted(FixtureProvider):
            def __init__(self,name,model,max_calls,**limits):
                super().__init__();self.max_calls=max_calls
            def generate(self,role,prompt,schema=None,**kw):
                if self.calls>=self.max_calls:raise RuntimeError('Agent call budget exhausted; investigation remains a draft.')
                if role=='researcher':
                    self.calls+=1;raise RuntimeError('claude worker exceeded its 600s time limit')
                if role=='source_finder':
                    self.calls+=1;return {'urls':[{'url':'https://example.edu/page','why':'w'}]}
                if role in ('physics_reviewer','visual_reviewer','learner','blind_viewer'):
                    self.calls+=1;return {'pass':False,'score':5,'summary':'Not yet.','changes':['Clarify.'],'blocking_issues':['Unclear.']}
                if role=='designer' and not getattr(self,'rejected',False):
                    self.rejected=True;brief=super().generate(role,prompt,schema,**kw)
                    return {**brief,'chapters':brief['chapters'][:2]}
                return super().generate(role,prompt,schema,**kw)
        results=[]
        def attempt(factory,count,rounds,*args,**kwargs):
            provider=factory()
            provider.generate('planner','Choose.',{'properties':{'topic':{'enum':['gravity-clocks']}}})
            with tempfile.TemporaryDirectory() as tmp,patch('lab.sources.fetch',return_value=('Clocks','word '*200)):
                results.append((provider,helpers.execute(provider,rounds,Path(tmp),topic='gravity-clocks')))
        for rounds in (1,3,4):
            with patch('sys.argv',['lab','daily','--provider','claude','--rounds',str(rounds)]),\
                 patch('lab.__main__.CLIProvider',Budgeted),patch('lab.daily.daily',side_effect=attempt):
                main()
            provider,state=results[-1]
            self.assertEqual((state['status'],len(state['revisions'])),('needs_review',rounds),state.get('error'))
            self.assertEqual(state['provenance']['retrieved_by'],'coordinator')
            self.assertEqual(provider.calls,provider.max_calls)


if __name__=='__main__': unittest.main()
