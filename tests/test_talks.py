import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from lab.talks import parse, feedback, collect, summary, MARK


def issue(number, talk, mark=True):
    return {'number': number, 'url': f'https://github.com/x/{number}', 'title': 'Talk: a guide',
            'body': (MARK + '\n' if mark else '') + 'A voice conversation.\n\n```json\n' + json.dumps(talk) + '\n```'}


TALK = {'talkId': 'abc-123', 'page': 'guide', 'guide': 'g1', 'title': 'How do we know?', 'kind': 'mixed', 'pinned': True,
        'section': {'index': 3, 'title': 'No centre'},
        'turns': [{'who': 'you', 'text': 'Why do the arrows double?', 'chapter': 4}, {'who': 'editor', 'text': 'Two gaps grow at once.', 'chapter': 4},
                  {'who': 'you', 'text': 'The teal arrows were hard to see.', 'chapter': 4}, {'who': 'editor', 'text': 'Noted: the lab will look at it.', 'chapter': 4}]}


class TalkTests(unittest.TestCase):
    def test_parse_reads_the_marked_transcript(self):
        talk = parse(issue(7, TALK))
        self.assertEqual((talk['issue'], talk['section']['index'], len(talk['turns'])), (7, 3, 4))

    def test_parse_ignores_issues_without_the_marker_or_a_transcript(self):
        self.assertIsNone(parse(issue(8, TALK, mark=False)))
        self.assertIsNone(parse({'number': 9, 'body': MARK + ' no transcript'}))
        self.assertIsNone(parse({'number': 10, 'body': MARK + '\n```json\n{"turns": 3}\n```'}))

    def test_feedback_is_the_readers_words_the_editor_noted(self):
        self.assertEqual(feedback(parse(issue(7, TALK))), [{'chapter': 4, 'text': 'The teal arrows were hard to see.'}])
        self.assertIn('feedback (chapter 4)', summary(parse(issue(7, TALK))))

    def test_collect_saves_each_conversation(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls = []
            def runner(command, **kw):
                calls.append(command)
                return SimpleNamespace(stdout=json.dumps([issue(7, TALK), {'number': 8, 'body': 'unrelated'}]))
            talks = collect(runner, Path(tmp))
            self.assertEqual(len(talks), 1)
            self.assertIn('council:talk', calls[0])
            self.assertIn('--author', calls[0])
            saved = json.loads((Path(tmp) / '.council-state' / 'talks' / 'abc-123.json').read_text())
            self.assertEqual(saved['issue'], 7)


if __name__ == '__main__':
    unittest.main()
