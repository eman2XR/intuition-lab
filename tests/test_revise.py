import copy
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import lab.build_engine as be
import lab.revise as revise
from lab.daily import daily
from helpers import (GOOD_ENGINE, GOOD_REVISED_ENGINE, BROKEN_REVISED_ENGINE, CLOBBER_SCENE_REVISED_ENGINE,
                     CLOBBER_PHYSICS_REVISED_ENGINE, MALICIOUS_REVISED_ENGINE, RevisionProvider, on_day)
from test_build_engine import git_checkout, mock_render, BROWSER

GUIDE_ID = '20261108T090000-demo01'
ITEM = {'id': '9.1', 'question': 'Why is this a placeholder question for the engine builder?', 'model': 'demo-bars'}
RESEARCH = {
    'claim': 'A placeholder claim.', 'explanation': 'A placeholder explanation.', 'assumptions': ['A.'],
    'prediction': 'A placeholder prediction.', 'falsifier': 'A placeholder falsifier.', 'limitations': ['None.'],
    'misconceptions': ['A beginner belief.'],
    'questions': [{'q': 'A transfer question?', 'a': 'An answer.'}],
    'sources': [{'title': 'Fixture source', 'url': 'https://example.org/fixture', 'supports': 'Offline example.'}],
}
PUB_SCENE = {'title': 'A placeholder guide', 'subtitle': 'A teaser.', 'why': '', 'kind': 'demo-bars',
             'beats': [{'title': 'One', 'body': 'A.'}, {'title': 'Two', 'body': 'B.'}, {'title': 'Three', 'body': 'C.'}],
             'takeaway': 'A takeaway.', 'mass': 0.6, 'distance': 1.25, 'ray_count': 1, 'show_reference': True,
             'show_labels': True, 'accent': 'blue', 'line_width': 2, 'duration': 24, 'controls': 'first'}


def publish_guide(root):
    """Install the original demo-bars engine and a published guide that uses it, then commit and push to origin/main."""
    be.install(copy.deepcopy(GOOD_ENGINE), 'demo-bars', '9.1', root)
    record = {'id': GUIDE_ID, 'provider': 'reviewed-agents', 'status': 'reviewed', 'topic': 'demo-bars',
              'question': ITEM['question'], 'created': '2026-11-02T17:00:00+00:00', 'research': RESEARCH,
              'scene': PUB_SCENE, 'checks': [{'name': 'ok', 'pass': True}],
              'provenance': {'sources_retrieved': True, 'retrieved_by': 'agent', 'intro_note': 'Original guide.'},
              'revisions': [{'number': 1, 'scene': PUB_SCENE, 'checks': [{'name': 'ok', 'pass': True}],
                             'accepted': True, 'frames': []}]}
    guide_dir = root / 'web' / 'published' / GUIDE_ID
    guide_dir.mkdir(parents=True)
    (guide_dir / 'record.json').write_text(json.dumps(record, indent=2))
    (root / 'web' / 'published' / 'index.json').write_text(json.dumps(
        [{'id': GUIDE_ID, 'question': ITEM['question'], 'topic': 'demo-bars', 'created': record['created'],
          'title': PUB_SCENE['title']}], indent=2))


def feedback(number=5, guide=GUIDE_ID, body=None):
    return {'number': number, 'kind': 'feedback', 'title': 'Feedback',
            'body': body if body is not None else f'Please make the third beat clearer. guide: {guide}',
            'curriculum': None}


def checkout(tmp):
    git, origin, root = git_checkout(tmp, [ITEM], full=True)
    publish_guide(root)
    git(root, 'add', 'web', 'lab')
    git(root, 'commit', '-qm', 'engine and published guide')
    git(root, 'push', '-q', 'origin', 'main')
    return git, origin, root


class RevisionTests(unittest.TestCase):
    SNAPS = ('web/scene.js', 'web/physics.js', f'web/published/{GUIDE_ID}/record.json')

    def test_a_feedback_revision_pushes_a_branch_and_leaves_main_byte_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            before = be.snapshot(root, self.SNAPS)
            head = git(root, 'rev-parse', 'main')
            with mock_render(), patch('lab.inbox.comment') as comment, patch('lab.inbox.close') as close:
                out = revise.revise_feedback(lambda: RevisionProvider(), root, '2026-11-08', requests=[feedback()],
                                             rounds=2, push=True)
            self.assertEqual((out['revised'], out['guide'], out['issue']), (True, GUIDE_ID, 5))
            branch = out['branch']
            self.assertEqual(branch, f'feedback-revision/2026-11-08-{GUIDE_ID}')
            # The branch, on origin, carries the revised engine files and the revised guide record.
            shipped = git(origin, 'ls-tree', '-r', '--name-only', branch).splitlines()
            for rel in ('web/scene.js', 'web/physics.js', f'web/published/{GUIDE_ID}/record.json'):
                self.assertIn(rel, shipped)
            self.assertIn('revised to address feedback', git(origin, 'show', f'{branch}:web/scene.js'))
            record = json.loads(git(origin, 'show', f'{branch}:web/published/{GUIDE_ID}/record.json'))
            self.assertEqual(record['scene']['title'], 'A placeholder guide, revised')
            self.assertEqual(record['provenance']['revised_from_feedback'], 5)
            self.assertIn('issue #5', record['provenance']['intro_note'])
            self.assertEqual(len(record['revisions']), 2)
            self.assertEqual(record['revisions'][-1]['number'], 2)
            # main never moved and never received the revision; the live guide and engine are byte-identical.
            self.assertEqual(git(root, 'rev-parse', 'main'), head)
            self.assertEqual(git(origin, 'rev-parse', 'main'), head)
            self.assertNotIn('revised to address feedback', git(root, 'show', 'main:web/scene.js'))
            self.assertEqual(be.snapshot(root, self.SNAPS), before)
            self.assertEqual(git(root, 'diff', '--cached', '--name-only'), '')
            self.assertEqual(git(root, 'status', '--porcelain', '--untracked-files=no'), 'M web/proposals.json')
            # The proposal makes it visible, and the issue is commented and closed and recorded handled.
            proposals = json.loads((root / 'web' / 'proposals.json').read_text())['proposals']
            revisions = [p for p in proposals if p.get('kind') == 'revision']
            self.assertEqual(len(revisions), 1)
            self.assertEqual((revisions[0]['branch'], revisions[0]['guide'], revisions[0]['issue']), (branch, GUIDE_ID, 5))
            self.assertIn(branch, comment.call_args[0][1])
            close.assert_called_once_with(5)
            self.assertIn(5, json.loads((root / '.council-state' / 'feedback-handled.json').read_text()))

    def test_a_broken_revision_rolls_back_byte_identical_and_leaves_the_issue_open(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            before = be.snapshot(root, self.SNAPS)
            head = git(root, 'rev-parse', 'main')
            with mock_render(), patch('lab.inbox.comment') as comment, patch('lab.inbox.close') as close:
                out = revise.revise_feedback(lambda: RevisionProvider(BROKEN_REVISED_ENGINE), root, '2026-11-08',
                                             requests=[feedback()], rounds=2, push=True)
            self.assertFalse(out['revised'])
            # Every touched file is byte-identical, main unmoved, no branch anywhere, nothing staged.
            self.assertEqual(be.snapshot(root, self.SNAPS), before)
            self.assertEqual(git(root, 'rev-parse', 'main'), head)
            self.assertEqual(git(root, 'branch', '--list', 'feedback-revision/*'), '')
            self.assertEqual(git(origin, 'branch', '--list', 'feedback-revision/*'), '')
            self.assertEqual(git(root, 'diff', '--cached', '--name-only'), '')
            # The issue stays open with a hand-revision note, but is recorded handled so later runs do not retry it.
            self.assertIn('hand revision', comment.call_args[0][1])
            close.assert_not_called()
            self.assertIn(5, json.loads((root / '.council-state' / 'feedback-handled.json').read_text()))

    def _assert_rejected_clean(self, git, origin, root, before, head, comment, close):
        # The whole site is byte-identical, main unmoved, no review branch anywhere, the issue left open.
        self.assertEqual(be.snapshot(root, self.SNAPS), before)
        self.assertEqual(git(root, 'rev-parse', 'main'), head)
        self.assertEqual(git(root, 'branch', '--list', 'feedback-revision/*'), '')
        self.assertEqual(git(origin, 'branch', '--list', 'feedback-revision/*'), '')
        self.assertEqual(git(root, 'diff', '--cached', '--name-only'), '')
        self.assertIn('hand revision', comment.call_args[0][1])
        close.assert_not_called()

    def test_a_scene_clobber_of_a_sibling_engine_is_rejected(self):
        # The demonstrated attack: the revised scene also defines gravity-clocks' drawClocks. The collision guard must
        # reject it before any splice, so it never reaches node/allChecks/the render (which cannot see the clobber).
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            before = be.snapshot(root, self.SNAPS)
            head = git(root, 'rev-parse', 'main')
            with mock_render(), patch('lab.inbox.comment') as comment, patch('lab.inbox.close') as close:
                out = revise.revise_feedback(lambda: RevisionProvider(CLOBBER_SCENE_REVISED_ENGINE), root,
                                             '2026-11-08', requests=[feedback()], rounds=2, push=True)
            self.assertFalse(out['revised'])
            # main still has exactly one drawClocks (gravity-clocks'), un-clobbered.
            self.assertEqual(git(root, 'show', 'main:web/scene.js').count('function drawClocks'), 1)
            self._assert_rejected_clean(git, origin, root, before, head, comment, close)

    def test_a_physics_clobber_of_a_sibling_engine_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            before = be.snapshot(root, self.SNAPS)
            head = git(root, 'rev-parse', 'main')
            with mock_render(), patch('lab.inbox.comment') as comment, patch('lab.inbox.close') as close:
                out = revise.revise_feedback(lambda: RevisionProvider(CLOBBER_PHYSICS_REVISED_ENGINE), root,
                                             '2026-11-08', requests=[feedback()], rounds=2, push=True)
            self.assertFalse(out['revised'])
            self._assert_rejected_clean(git, origin, root, before, head, comment, close)

    @unittest.skipUnless(BROWSER, 'Playwright browser unavailable')
    def test_a_side_effecting_revision_is_rejected_by_the_real_sandbox(self):
        # Not mocked: the real locked-down gate_probe must catch a revised draw that reaches the network and roll back.
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            before = be.snapshot(root, self.SNAPS)
            head = git(root, 'rev-parse', 'main')
            with patch('lab.inbox.comment') as comment, patch('lab.inbox.close') as close:
                out = revise.revise_feedback(lambda: RevisionProvider(MALICIOUS_REVISED_ENGINE), root, '2026-11-08',
                                             requests=[feedback()], rounds=2, push=True)
            self.assertFalse(out['revised'])
            self._assert_rejected_clean(git, origin, root, before, head, comment, close)

    def test_no_eligible_feedback_falls_through_without_consuming_the_slot(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            guard = root / '.council-state' / 'engine-build.json'
            # No feedback at all.
            provider = RevisionProvider()
            self.assertIsNone(revise.revise_feedback(lambda: provider, root, '2026-11-08', requests=[], push=False))
            self.assertEqual(provider.calls, 0)
            self.assertFalse(guard.exists())
            # Feedback that names no published guide is ignored, and the slot is still free for the engine builder.
            self.assertIsNone(revise.revise_feedback(lambda: provider, root, '2026-11-08',
                                                     requests=[feedback(guide='no-such-guide')], push=False))
            self.assertEqual(provider.calls, 0)
            self.assertFalse(guard.exists())

    def test_the_idle_daily_cycle_revises_feedback_before_building_and_keeps_the_cap(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            with mock_render(), patch('lab.daily.READY', {'gravity-clocks'}), \
                 patch('lab.daily.datetime', on_day('2026-11-08')), \
                 patch('lab.inbox.comment'), patch('lab.inbox.close'):
                ledger = daily(lambda: RevisionProvider(), root=root, requests=[feedback()], blueprints=True)
                # The idle action uses no investigation slot and cuts a revision branch (not the engine builder's).
                self.assertEqual(ledger, [])
                self.assertIn(f'feedback-revision/2026-11-08-{GUIDE_ID}',
                              git(root, 'branch', '--list', 'feedback-revision/*'))
                self.assertEqual(git(root, 'branch', '--list', 'engine-candidate/*'), '')
                proposals = json.loads((root / 'web' / 'proposals.json').read_text())['proposals']
                self.assertEqual(len([p for p in proposals if p.get('kind') == 'revision']), 1)
                # A second cycle the same day does nothing more: the idle slot is consumed.
                daily(lambda: RevisionProvider(), root=root, requests=[feedback()], blueprints=True)
                branches = [b for b in git(root, 'branch', '--list', 'feedback-revision/*').split('\n') if b.strip()]
                self.assertEqual(len(branches), 1)

    def test_one_revision_a_day_shares_the_engine_build_guard(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            with mock_render(), patch('lab.inbox.comment'), patch('lab.inbox.close'):
                first = revise.revise_feedback(lambda: RevisionProvider(), root, '2026-11-08',
                                               requests=[feedback()], push=False)
            self.assertTrue(first['revised'])
            # The shared per-day guard is now spent for both the revision builder and the engine builder.
            self.assertFalse(be.guard_day(root, '2026-11-08'))
            provider = RevisionProvider()
            with patch('lab.inbox.comment'), patch('lab.inbox.close'):
                second = revise.revise_feedback(lambda: provider, root, '2026-11-08',
                                                requests=[feedback(number=6)], push=False)
            self.assertIsNone(second)
            self.assertEqual(provider.calls, 0)
            # A new calendar day may revise again.
            self.assertTrue(be.guard_day(root, '2026-11-09'))

    def test_approve_re_gates_prints_the_diff_and_fast_forwards_main(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            with mock_render(), patch('lab.inbox.comment'), patch('lab.inbox.close'):
                out = revise.revise_feedback(lambda: RevisionProvider(), root, '2026-11-08',
                                             requests=[feedback()], push=False)
            branch = out['branch']
            branch_head = git(root, 'rev-parse', branch)
            # The owner-facing proposal edit is published to main by the daily cycle; restore the working tree so the
            # candidate is still a fast-forward.
            git(root, 'checkout', '--', 'web/proposals.json')
            buffer = io.StringIO()
            with mock_render(), redirect_stdout(buffer):
                merged = be.approve_engine(root, branch)
            self.assertEqual(merged, branch_head)
            self.assertEqual(git(root, 'rev-parse', 'main'), branch_head)
            self.assertIn('revised to address feedback', git(root, 'show', 'main:web/scene.js'))
            # The human is shown the engine and record diff before the merge.
            printed = buffer.getvalue()
            self.assertIn('review this generated code', printed)
            self.assertIn(f'web/published/{GUIDE_ID}/record.json', printed)

    def test_approve_refuses_a_non_fast_forward_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            git, origin, root = checkout(tmp)
            with mock_render(), patch('lab.inbox.comment'), patch('lab.inbox.close'):
                out = revise.revise_feedback(lambda: RevisionProvider(), root, '2026-11-08',
                                             requests=[feedback()], push=False)
            branch = out['branch']
            git(root, 'checkout', '--', 'web/proposals.json')
            # main moves on after the branch was cut, so the branch is no longer a fast-forward.
            git(root, 'commit', '--allow-empty', '-qm', 'later work on main')
            with mock_render(), self.assertRaises(ValueError):
                be.approve_engine(root, branch)


if __name__ == '__main__':
    unittest.main()
