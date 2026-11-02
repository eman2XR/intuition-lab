"""Shared offline stand-ins for the tests: a curriculum, a renderer and an accepted investigation."""
import json
from datetime import datetime
from unittest.mock import patch
from lab.fixtures import FixtureProvider
from lab.pipeline import run

# Models the daily planner may use in these tests, independent of which pictures are ready today.
READY = {'gravity-clocks', 'light-bending', 'light-clock'}
READY_ITEMS = [{'id': '1.1', 'question': 'Why do clocks at different heights tick at different rates?', 'model': 'gravity-clocks'},
               {'id': '1.2', 'question': 'Why does gravity bend light?', 'model': 'light-bending'}]


def curriculum(root, items):
    (root / 'web').mkdir(parents=True, exist_ok=True)
    (root / 'web' / 'curriculum.json').write_text(json.dumps({'chapters': [{'items': items}]}))


def capture(checks=None):
    """A renderer that writes one PNG frame per revision and reports the given checks (passing by default)."""
    def render(scene, directory, **kwargs):
        directory.mkdir(parents=True)
        frame = directory / 'frame.png'
        frame.write_bytes(b'fixture')
        return [frame], checks if checks is not None else [{'name': 'test', 'pass': True}]
    return render


def execute(provider, rounds, root, checks=None, **kwargs):
    with patch('lab.pipeline.ROOT', root), patch('lab.pipeline.capture', capture(checks)):
        return run(provider, rounds, **kwargs)


def accepted(root):
    """A reviewed investigation as a live provider would leave it, ready for export."""
    state = execute(FixtureProvider(), 2, root, topic='gravity-clocks')
    state['provider'] = 'test-live'
    state['status'] = 'reviewed'
    return state


def on_day(day):
    """A datetime whose now() is 9 AM local time on the given day, for patching lab.daily.datetime."""
    class Day(datetime):
        @classmethod
        def now(cls, tz=None):
            moment = datetime.fromisoformat(day + 'T09:00:00').astimezone()
            return moment.astimezone(tz) if tz else moment.replace(tzinfo=None)
    return Day
