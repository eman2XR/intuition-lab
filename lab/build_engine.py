"""Gated, agent-authored picture engines for idle publishing mornings.

When no picture engine is ready, the daily run can build one from a research brief instead of only sketching it. The
coordinator owns every write: it snapshots the exact bytes of every file it will touch, splices the model's structured
output into explicit marker comments, and only keeps the engine if it passes every gate (`node --check`, the numerical
checks, a locked-down sandbox render that fails any side-effecting code, and the usual render checks). No agent-written
engine CODE ever reaches main or the live site: a successful build commits the engine files and its draft onto a
dedicated `engine-candidate/<day>-<kind>` branch and pushes only that branch, then restores the main working tree to its
exact original bytes, so the code exists only on the review branch until a human merges it (see `approve_engine`). The
owner is told through a proposal and the dashboard that a new picture is ready to review. A built engine's first
investigation is saved as a draft on the candidate branch, never published. This is the single, explicit exception to
the rule that models return data and never executable code; it is deliberately kept off the live site until reviewed.
"""
import copy
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from . import sources
from .contracts import obj, STR, validate, RESEARCH_SCHEMA, DESIGN_SCHEMA, validate_design
from .pipeline import run, write_json, keep_retrieved, DESIGNER, STANDARD
from .render import capture, gate_probe
from . import topics as topics_module

# Markers already present in the files; the installer splices generated code immediately before each one.
MARKERS = {
    'scene': '/* AGENT-ENGINES: scene.',
    'map': '/* AGENT-ENGINES: map.',
    'physics': '/* AGENT-ENGINES: physics.',
    'checkSets': '/* AGENT-ENGINES: checkSets.',
    'app': '/* AGENT-ENGINES: app-topics.',
    'topics': '# AGENT-ENGINES: entries.',
}
# Every file the installer may edit; snapshotted byte-for-byte before any edit.
ENGINE_FILES = ('web/scene.js', 'web/physics.js', 'web/curriculum.json', 'lab/topics.py', 'web/app.js')
IDENT = re.compile(r'^[A-Za-z_$][\w$]*$')
# Defence in depth only; the sandbox render (gate_probe) is the real gate for network, timers, workers and cookies.
# This denylist covers hazards the sandbox cannot catch at render: a clock or randomness (also caught by the
# determinism check), module loading and dynamic code. Network and timer tokens are deliberately NOT listed here so
# that an engine reaching for them is caught behaviourally by the sandbox rather than by brittle pattern matching.
BANNED = re.compile(r'\b(?:require|import|eval|Function|Math\.random|Date\.now|performance\.now'
                    r'|localStorage|sessionStorage|while\s*\(\s*true\s*\))\b|\bnew\s+Date\b|</script')
CANDIDATE_PREFIX = 'engine-candidate/'


# The generated engine, as a bounded structured object rather than free text.
ENGINE_SCHEMA = obj({
    'kind': STR, 'label': STR, 'category': STR, 'checksName': STR,
    'physics': STR, 'scene': STR, 'entry': STR, 'model_notes': STR,
})
LIMITS = {'kind': 60, 'label': 60, 'category': 60, 'checksName': 60,
          'physics': 7000, 'scene': 12000, 'entry': 4000, 'model_notes': 4000}


def _strip_js(code):
    """A copy of the code with comment bodies and string/template contents blanked, so a structural scan sees only the
    code's shape. Heuristic: a `/` is only treated as a comment when it starts `//` or `/*`; a regex literal (rare in
    drawing code) would be misread, so this is documented as a heuristic, not a parser."""
    out, i, n = [], 0, len(code)
    while i < n:
        c = code[i]
        if c == '/' and i + 1 < n and code[i + 1] == '/':
            j = code.find('\n', i)
            if j < 0:
                break
            i = j
            continue
        if c == '/' and i + 1 < n and code[i + 1] == '*':
            j = code.find('*/', i + 2)
            i = (j + 2) if j >= 0 else n
            out.append(' ')
            continue
        if c in '"\'`':
            quote, i = c, i + 1
            while i < n:
                if code[i] == '\\':
                    i += 2
                    continue
                if code[i] == quote:
                    i += 1
                    break
                i += 1
            out.append('""')
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def _skip_balanced(s, i):
    """Given s[i] at an opening bracket (`(`, `[` or `{`), return the index just past its matching close, or None if
    it is unbalanced."""
    if i >= len(s) or s[i] not in '([{':
        return None
    stack = []
    while i < len(s):
        c = s[i]
        if c in '([{':
            stack.append(c)
        elif c in ')]}':
            if not stack:
                return None
            stack.pop()
            if not stack:
                return i + 1
        i += 1
    return None


def top_level_declarations_only(code):
    """Reject a scene field that would RUN anything when the file loads. Structurally require every top-level
    construct to be a function declaration or a named const/let bound to an arrow or function expression: no IIFEs, no
    bare calls, no top-level statements. Returns (ok, reason). This is a heuristic scan over comment- and
    string-stripped code (see _strip_js), not a full parser; the spliced file is also run through `node --check`, and
    the sandbox render catches anything that does execute. Documented limitation: regex literals and unusual syntax may
    be misread, erring towards rejection, which only costs a fallback."""
    s = _strip_js(code)
    i, n = 0, len(s)
    decl = re.compile(r'(async\s+)?(function|const|let)\b')
    while i < n:
        while i < n and (s[i].isspace() or s[i] == ';'):
            i += 1
        if i >= n:
            break
        head = decl.match(s, i)
        if not head:
            return False, f'top-level code that is not a function or named declaration near "{code[i:i + 40].strip()}"'
        keyword = head.group(2)
        i = head.end()
        if keyword == 'function':
            # function NAME(params){...}: step past the parameter list, then the balanced body.
            paren = s.find('(', i)
            if paren < 0:
                return False, 'a function declaration without a parameter list'
            after = _skip_balanced(s, paren)
            if after is None:
                return False, 'an unbalanced parameter list in the scene field'
            brace = after
            while brace < n and s[brace].isspace():
                brace += 1
            if brace >= n or s[brace] != '{':
                return False, 'a function declaration without a body'
            i = _skip_balanced(s, brace)
            if i is None:
                return False, 'an unbalanced function body in the scene field'
        else:
            # const/let NAME = <arrow or function expression>; nothing that calls out at load. A leading '(' is only an
            # arrow parameter list if a '=>' follows its matching ')'; otherwise it is an IIFE, a sequence or a call and
            # is rejected. A bare call (foo(...)), a sequence ((0,fn)('u')) and (()=>{})() all fail this.
            end = _statement_end(s, i)
            statement = s[i:end]
            eq = statement.find('=')
            if eq < 0:
                return False, 'a const/let with no value in the scene field'
            rhs = statement[eq + 1:].strip()
            async_head = re.match(r'^async\s+', rhs)
            core = rhs[async_head.end():].lstrip() if async_head else rhs
            if core.startswith('function'):
                pass  # a function expression; it is created, not called, at load
            elif core.startswith('('):
                close = _skip_balanced(core, 0)
                if close is None:
                    return False, 'an unbalanced parenthesis in a const/let value in the scene field'
                if not core[close:].lstrip().startswith('=>'):
                    return False, 'a const/let value that runs at load (an IIFE, sequence or call, not an arrow)'
            elif re.match(r'^[A-Za-z_$][\w$]*\s*=>', core):
                pass  # a single-identifier arrow: x => ...
            else:
                return False, 'a const/let value that is not a function or arrow (it could run at load)'
            i = end
    return True, ''


def _statement_end(s, i):
    """The index of the top-level `;` ending the statement starting at i, or the end of the string."""
    depth = 0
    while i < len(s):
        c = s[i]
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        elif c == ';' and depth == 0:
            return i
        i += 1
    return len(s)


def _pass_expr_end(s, i):
    """From index i just after a `pass:`, the index where that check's pass expression ends: the first top-level `,`
    or the `}` that closes the check object."""
    depth = 0
    while i < len(s):
        c = s[i]
        if c in '([{':
            depth += 1
        elif c in ')]}':
            if depth == 0:
                return i
            depth -= 1
        elif c == ',' and depth == 0:
            return i
        i += 1
    return len(s)


def _split_top_level(s):
    """Split s on commas that sit at bracket depth zero: the members of an object body."""
    parts, depth, start = [], 0, 0
    for i, c in enumerate(s):
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        elif c == ',' and depth == 0:
            parts.append(s[start:i])
            start = i + 1
    parts.append(s[start:])
    return parts


def _top_level_colon(s):
    """The index of the first `:` at bracket depth zero in s, or -1."""
    depth = 0
    for i, c in enumerate(s):
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        elif c == ':' and depth == 0:
            return i
    return -1


def physics_members_only(physics):
    """Structurally validate the generated `physics` field, which is spliced into the `const Physics = {...}` object.
    Require every top-level member to be a method definition (`name(params){...}`) or a plain-literal property
    (`name: 3`); reject computed-key members (`[expr]:`, which run code while the object is built), getters/setters,
    and any property whose value is not a method or a plain literal (an arrow, call or IIFE). Returns (ok, reason).
    Heuristic, over comment/string-stripped code; method bodies are not descended into (they run only when called, in
    the sandbox), and node --check plus the sandbox render back this up."""
    s = _strip_js(physics)
    method = re.compile(r'^(async\s+)?\*?\s*[A-Za-z_$][\w$]*\s*\(')
    literal = re.compile(r'^(-?[\d][\d.eE+\-]*|true|false|null|""|\(\)\s*=>)$')
    for member in _split_top_level(s):
        m = member.strip()
        if not m:
            continue
        if m[0] == '[':
            return False, 'a computed-key member in the physics field (it runs code as the object is built)'
        if re.match(r'^(get|set)\s+[A-Za-z_$]', m):
            return False, 'a getter or setter in the physics field'
        if method.match(m):
            continue  # a method definition name(params){...}; its body runs only when called
        colon = _top_level_colon(m)
        if colon < 0:
            return False, 'a physics member that is neither a method nor a plain-literal property'
        key, value = m[:colon].strip(), m[colon + 1:].strip()
        if not re.fullmatch(r'[A-Za-z_$][\w$]*|""', key):
            return False, 'a physics member with a non-plain key'
        if not re.fullmatch(r'-?[\d][\d.eE+\-]*|true|false|null|""', value):
            return False, 'a physics member whose value is not a method or a plain literal (it could run at load)'
    return True, ''


def _nonvacuous_checks(physics):
    """Reject a checks method with a check whose pass value is not a real assertion. A trustworthy check calls a model
    function (`this.<fn>(...)`) and compares the result to a concrete constant, within a tolerance where needed. This
    rejects literals (`true`), self-comparisons (`x === x`), literal-only comparisons (`1 === 1`), `typeof` and
    `Boolean(...)`/`!!` coercions, always-true tails (`... || true`, `(x, true)`) and vacuous sentinel comparisons
    (`>= -1e9`). Heuristic: it scans the comment/string-stripped `pass:` expressions, so it catches the obvious
    untrustworthy forms, not every one. Returns (ok, reason)."""
    s = _strip_js(physics)
    self_cmp = re.compile(r'^(.+?)(===|!==|==|!=|<=|>=|<|>)(.+)$')
    for match in re.finditer(r'\bpass\s*:', s):
        core = s[match.end():_pass_expr_end(s, match.end())].strip()
        if not core or core.startswith('{'):
            continue
        if core in ('true', 'false'):
            return False, 'a check whose pass value is a literal, proving nothing'
        cmp = self_cmp.match(core)
        if cmp and cmp.group(1).strip() == cmp.group(3).strip():
            return False, 'a check that compares a value with itself, proving nothing'
        if 'this.' not in core:
            return False, 'a check with no model-function call, so it tests nothing'
        if 'typeof' in core:
            return False, 'a check that only tests a type, not a value'
        if re.search(r'Boolean\s*\(|!!', core):
            return False, 'a check that coerces to a boolean instead of asserting a value'
        if re.search(r'(\|\||\?\?)\s*(true|1)\b', core) or re.search(r',\s*(true|1)\s*\)', core):
            return False, 'a check with an always-true tail'
        if re.search(r'(>=|<=|>|<)\s*-?\s*(1e9|1e18|1e99|1e308|9e99|Infinity)', core):
            return False, 'a check that compares against a sentinel, so it is always true'
        if not (re.search(r'===|!==|==|!=|<=|>=|<|>', core)
                or re.search(r'\b(near|close|approx|within)\s*\(|Math\.abs\s*\(', core)):
            return False, 'a check that does not compare a model value to a constant'
    return True, ''


def validate_engine(engine):
    """Shape, size and structure of the generated engine; raises ValueError on anything out of bounds or unsafe. The
    denylist is defence in depth; the function-only rule keeps load-time execution out, and the sandbox render is the
    real safety gate."""
    validate(engine, ENGINE_SCHEMA)
    for key, limit in LIMITS.items():
        if not engine[key].strip() or len(engine[key]) > limit:
            raise ValueError(f'Engine field {key} is empty or over its {limit}-character bound.')
    if not IDENT.match(engine['checksName']):
        raise ValueError('checksName must be a plain identifier.')
    for field in ('physics', 'scene', 'entry'):
        if BANNED.search(engine[field]):
            raise ValueError(f'Engine field {field} uses a forbidden construct (module loading, dynamic code, randomness or a clock).')
    ok, reason = top_level_declarations_only(engine['scene'])
    if not ok:
        raise ValueError(f'The scene field must be only function/const declarations, nothing that runs at load: {reason}.')
    ok, reason = physics_members_only(engine['physics'])
    if not ok:
        raise ValueError(f'The physics field must be only method definitions and plain-literal properties: {reason}.')
    ok, reason = _nonvacuous_checks(engine['physics'])
    if not ok:
        raise ValueError(f'The checks are not trustworthy: {reason}.')
    defined = set(re.findall(r'(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*\(', engine['physics']))
    if engine['checksName'] not in defined:
        raise ValueError('The checks method is not defined in the physics field.')
    body = engine['physics'][engine['physics'].index(engine['checksName']):]
    others = defined - {engine['checksName']}
    if 'this.' not in body or not any(f'this.{name}' in body for name in others):
        raise ValueError('The checks must call the model functions (reference this.<model function>).')
    return engine


BUILDER = (
    'You are the engine builder. Return the executable code for a NEW visual engine that lets the lab investigate this '
    'question, as structured fields, never as prose. The coordinator will splice your code, unchanged, into the site and '
    'then gate it; broken, unsafe or non-deterministic code is discarded.\n'
    'Fields:\n'
    '- physics: one or more Physics methods written as object-property syntax (name(args){...},), including an exact '
    'numerical model and a checks method named exactly by checksName that returns an array of at least three '
    '{name, pass} objects. Each check must CALL the model methods (this.<method>) and compare against a known value, so '
    'that it fails if the model is wrong. Pure arithmetic only; no drawing, no randomness, no time, no I/O.\n'
    '- scene: one or more top-level function declarations for the drawing, including a draw function '
    'function drawX(ctx,w,h,spec,st){...}. Drawing MUST be a pure function of (spec, st): deterministic, so seeking to '
    'the same time yields identical pixels. Use the provided helpers text(ctx,value,x,y,opts) and pill(ctx,value,x,y,opts) '
    'for every word on the stage so labels are counted; the stage carries only a few short names (five words or fewer '
    'each, at most a dozen words at once), and the subtitles carry the explanation. Only what the current sentence is '
    'about may move. Available in scope: ACCENT, TAU, clamp, smooth, rgba(hex,a), trace, text, pill, Physics. st has '
    '{t, since, stage, mass, distance, labels, live, playing, chapters}; mass is the first control (0..1), distance the '
    'second (1..2.5). Never say a picture is not to scale, enlarged or magnified.\n'
    '- entry: the body of the ENGINES map entry (the text between the braces), e.g. '
    'draw:drawX,demo:false,tryAny:true,a:[\'Label\',\'what the first slider does\'],b:[\'Unused\',\'\',\'\'],'
    'fa:a=>..., fb:b=>\'\', effect:(a,b)=>Physics.<model>(a,b), measure:[\'Readout\',a=>...], scale:\'\', '
    'disclosure:\'...\', try:\'...\', aria:\'...\'. effect MUST return 0 when the first control is 0 and a positive '
    'number when it is 1, so the zero-effect render check passes.\n'
    '- model_notes: plain notes for the writer and reviewers: what each of the three or four chapters shows, the honesty '
    'points and caveats, and suggested primary or university sources. Chapter 1 sets the first control to zero.\n'
    '- checksName: the exact name of the checks method in physics.\n'
    '- label: a short human label (a few words). category: the home-page category, e.g. "Space and time".\n'
    '- kind: a short identifier for the engine.\n'
    'Keep the picture calm and the idea intuitive: define every term, start from something seen or measured, confront '
    'the everyday belief, and set the scene in chapter 1 before any claim.')


def snapshot(root, files=ENGINE_FILES):
    """The exact current bytes of every file that may be edited, so a rollback is byte-identical."""
    snaps = {}
    for rel in files:
        path = root / rel
        snaps[rel] = path.read_bytes() if path.exists() else None
    return snaps


def restore(root, snaps):
    """Put every snapshotted file back to its exact original bytes (or remove one that did not exist)."""
    for rel, data in snaps.items():
        path = root / rel
        if data is None:
            if path.exists():
                path.unlink()
        else:
            path.write_bytes(data)


def _splice(text, marker, block):
    """Insert block immediately before the unique marker; raise if the marker is missing."""
    index = text.find(marker)
    if index < 0:
        raise ValueError(f'Marker not found: {marker}')
    return text[:index] + block + text[index:]


def _one_trailing_comma(code):
    return code.rstrip().rstrip(',') + ','


def install(engine, kind, curriculum_id, root):
    """Splice the generated engine into the site at the markers and mark the model ready. Disk only; the caller updates
    the in-memory topics after the gates pass. Raises on any missing marker, leaving the caller to roll back."""
    scene_path = root / 'web' / 'scene.js'
    scene = scene_path.read_text(encoding='utf-8')
    scene = _splice(scene, MARKERS['scene'], engine['scene'].strip() + '\n\n')
    scene = _splice(scene, MARKERS['map'], f" '{kind}':{{{engine['entry'].strip().rstrip(',')}}},\n ")
    scene_path.write_text(scene, encoding='utf-8')

    physics_path = root / 'web' / 'physics.js'
    physics = physics_path.read_text(encoding='utf-8')
    physics = _splice(physics, MARKERS['physics'], '    ' + _one_trailing_comma(engine['physics'].strip()) + '\n    ')
    physics = _splice(physics, MARKERS['checkSets'], f"'{kind}':this.{engine['checksName']},\n        ")
    physics_path.write_text(physics, encoding='utf-8')

    app_path = root / 'web' / 'app.js'
    app = app_path.read_text(encoding='utf-8')
    category = engine['category'].replace("'", "\\'")
    app = _splice(app, MARKERS['app'], f"\nTOPICS['{kind}']='{category}';")
    app_path.write_text(app, encoding='utf-8')

    topics_path = root / 'lab' / 'topics.py'
    topics_src = topics_path.read_text(encoding='utf-8')
    const = re.sub(r'[^A-Z0-9]', '_', kind.upper()) + '_NOTES'
    notes = engine['model_notes'].replace('\\', '\\\\').replace("'''", "'' '")
    question = topics_module.TOPICS.get(kind, {}).get('question') or ''
    item = next((i for i in _curriculum_items(root) if i.get('id') == curriculum_id), None)
    if item:
        question = item['question']
    label = engine['label'].replace('\\', '\\\\').replace("'", "\\'")
    block = (f"\n{const} = '''{notes}''' + COMMON\n"
             f"TOPICS['{kind}'] = {{'label':'{label}', 'question':{json.dumps(question)}, 'notes':{const}}}\n"
             f"READY.add('{kind}')\n")
    topics_path.write_text(topics_src + block, encoding='utf-8')

    if curriculum_id is not None:
        _set_ready(root, curriculum_id)


def _curriculum_items(root):
    path = root / 'web' / 'curriculum.json'
    if not path.exists():
        return []
    return [item for chapter in json.loads(path.read_text())['chapters'] for item in chapter['items']]


def _set_ready(root, curriculum_id):
    path = root / 'web' / 'curriculum.json'
    data = json.loads(path.read_text())
    for chapter in data['chapters']:
        for item in chapter['items']:
            if item.get('id') == curriculum_id:
                item['ready'] = True
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')


def _node(root, *args):
    return subprocess.run(['node', *args], cwd=root, text=True, capture_output=True, timeout=120)


def provisional_scene(question, kind):
    """A minimal, valid scene so the render gate exercises the new engine without waiting for the writer."""
    return {
        'title': (question or 'New investigation')[:100],
        'subtitle': 'A placeholder scene while the new engine is checked.',
        'why': 'A placeholder line while the new engine is checked.',
        'beats': [
            {'title': 'First, the control is off.', 'body': 'Start with the control at zero. Watch the picture before anything changes.'},
            {'title': 'Turn the control up.', 'body': 'As the control rises, one thing in the picture responds. Follow that one change.'},
            {'title': 'Compare the two.', 'body': 'Set the control high, then low. The difference is easy to see.'},
        ],
        'mass': 0.6, 'distance': 1.25, 'ray_count': 1, 'show_reference': False, 'show_labels': True,
        'accent': 'blue', 'line_width': 2, 'duration': 24, 'controls': 'first',
        'takeaway': 'A placeholder takeaway while the new engine is checked.', 'kind': kind,
    }


def gates(root, kind, engine, research):
    """Every gate the engine must pass. Returns (ok, reason). The caller rolls back on a False."""
    for rel in ('web/scene.js', 'web/physics.js', 'web/app.js'):
        result = _node(root, '--check', rel)
        if result.returncode:
            return False, f'node --check {rel} failed: {result.stderr.strip().splitlines()[-1:] or ""}'
    script = ("const P=require('./web/physics.js');const all=P.allChecks();"
              "const k=P.checksFor(%s);"
              "process.stdout.write(JSON.stringify({allBad:all.filter(c=>!c.pass).length,n:k.length,"
              "bad:k.filter(c=>!c.pass).map(c=>c.name)}));" % json.dumps(kind))
    result = _node(root, '-e', script)
    if result.returncode:
        return False, f'allChecks evaluation failed: {result.stderr.strip().splitlines()[-1:] or ""}'
    try:
        data = json.loads(result.stdout)
    except ValueError:
        return False, 'allChecks produced no result.'
    if data['allBad']:
        return False, f'{data["allBad"]} numerical check(s) fail across the site.'
    if data['n'] < 3:
        return False, f'The new engine has only {data["n"]} check(s); at least three are required.'
    if data['bad']:
        return False, f'The new engine has failing checks: {data["bad"][:3]}.'
    # The real gate: render the placeholder scene in a locked-down sandbox. Any network, timer, worker, socket, beacon
    # or cookie the engine reaches for throws and is recorded; any page error or non-local request fails the build.
    try:
        probe = gate_probe(provisional_scene('', kind), root, kind)
    except Exception as error:
        return False, f'sandbox render failed: {type(error).__name__}: {str(error)[:140]}'
    if probe['fired']:
        return False, f'the engine used blocked APIs in the sandbox: {sorted(set(probe["fired"]))[:4]}.'
    if probe['network']:
        return False, f'the engine attempted network in the sandbox: {probe["network"][:2]}.'
    if probe['pageerrors']:
        return False, f'the engine raised errors in the sandbox: {probe["pageerrors"][:2]}.'
    if probe['error']:
        return False, f'the engine raised while rendering in the sandbox: {str(probe["error"])[:140]}.'
    # The usual render checks (labels, pace, determinism, zero effect, mobile fit, no JS errors) must still pass; this
    # render uses timers and rAF normally, like the live player, serving the engine from this checkout.
    try:
        with tempfile.TemporaryDirectory(prefix='engine-gate-') as temp:
            _, checks = capture(provisional_scene('', kind), Path(temp), research=research, provider='fixture', root=root)
    except Exception as error:
        return False, f'render failed: {type(error).__name__}: {str(error)[:140]}'
    failing = [c['name'] for c in checks if not c['pass']]
    if failing:
        return False, f'render checks failed: {failing[:3]}.'
    return True, 'all gates passed'


def _research_and_design(provider, question, kind, root):
    """The same researcher, scientist and designer steps a full run uses, to ground the engine in sources."""
    model_notes = (topics_module.TOPICS.get(kind) or {}).get('notes', '')
    retrieved_by = 'agent'
    try:
        notes = provider.generate('researcher', question + ' Search primary or university sources for this question. '
            'Include URLs, physical or mathematical assumptions, tests, and common misleading visual metaphors. Use web '
            'search, do not invent citations.', research=True)
    except RuntimeError:
        if not sources.enabled():
            raise
        notes, _ = sources.retrieve(provider, question)
        retrieved_by = 'coordinator'
    research = provider.generate('scientist', question + '\nProduce a precise, beginner-friendly research record from '
        'these retrieved notes. Only cite URLs in the notes. No new-discovery claims. In misconceptions, list the '
        'everyday beliefs and "wait, but..." objections a beginner would bring. In questions, write 3 to 5 transfer '
        'questions with short answers that a good guide must let a beginner answer, at least one aimed at a '
        'misconception.\n' + model_notes + '\n' + notes, RESEARCH_SCHEMA)
    validate(research, RESEARCH_SCHEMA)
    research = keep_retrieved(research, notes)
    if not research['sources'] or any(not s['url'].startswith(('https://', 'http://')) for s in research['sources']):
        raise ValueError('Research must include valid HTTP source URLs.')
    if provider.name != 'fixture' and any(s['url'] not in notes for s in research['sources']):
        raise ValueError('Research must cite sources present in retrieved notes.')
    design = validate_design(provider.generate('designer', question + '\n' + (model_notes + '\n' if model_notes else '')
        + 'Research:\n' + json.dumps(research) + '\n' + STANDARD + '\nNo visual engine exists for this question yet. '
        + DESIGNER + ' Describe the picture a new engine would need: set fits_engine to false and say in missing what to '
        'build, as simply as the idea allows.', DESIGN_SCHEMA))
    return research, design, retrieved_by


SAVED = {
    'reviewed': 'The picture engine and this guide were built by the agents from a research brief. The engine passed the '
                'build gates and the guide passed the lab reviews; both await the owner’s review before publishing.',
    'needs_changes': 'The picture engine was built by the agents from a research brief and passed the build gates, but '
                     'the lab reviewers requested changes. This draft awaits the owner’s review before publishing.',
    'stopped': 'The picture engine was built by the agents from a research brief and passed the build gates, but the '
               'investigation stopped before review. This draft awaits the owner’s review before publishing.',
}


def save_draft(state, root, review_status, question, kind, curriculum_id, research, design, retrieved_by):
    """Save the built engine's first investigation as an owner-review draft; never publish it, never feature it."""
    run_id = state['id']
    scene = copy.deepcopy(state.get('scene') or provisional_scene(question, kind))
    scene['kind'] = kind
    revision = (state.get('revisions') or [{}])[-1]
    reviews = {key: {k: revision[key][k] for k in ('pass', 'score', 'summary') if k in revision[key]}
               for key in ('physics_review', 'visual_review', 'learner_review', 'blind_review') if key in revision}
    note = SAVED[review_status]
    record = {
        'id': run_id, 'provider': 'draft', 'status': 'draft', 'review_status': review_status,
        'question': question, 'topic': kind, 'created': state.get('created') or datetime.now(timezone.utc).isoformat(),
        'research': research, 'design': design, 'scene': scene, 'checks': state.get('checks', []), 'reviews': reviews,
        'provenance': {'sources_retrieved': state['provider'] != 'fixture', 'retrieved_by': retrieved_by,
                       'built_by': 'agents', 'intro_note': note},
        'note': note,
    }
    write_json(root / 'web' / 'drafts' / f'{run_id}.json', record)
    index_path = root / 'web' / 'drafts' / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else []
    entry = {'id': run_id, 'title': scene.get('title') or question, 'created': record['created'], 'kind': kind,
             'review_status': review_status}
    if curriculum_id:
        entry['curriculum'] = curriculum_id
    write_json(index_path, [entry] + [item for item in index if item.get('id') != run_id])
    return run_id


def waiting_items(items, ready, explored, requests=()):
    """The curriculum items that have no ready engine and whose question is unexplored, owner questions first, then
    teaching order; this is the item the daily run would next want a picture for."""
    waiting = [i for i in items if i.get('model') and i['model'] not in ready and not explored(i['question'], i['model'])]
    asked = [r.get('curriculum') for r in requests if r.get('kind') == 'question']
    front = [i for cid in asked for i in waiting if i.get('id') == cid]
    return front + [i for i in waiting if i not in front]


def engine_keys(root):
    """The engine identifiers already registered in the ENGINES map, so the builder never duplicates a map key and
    silently shadows an existing engine."""
    scene = (root / 'web' / 'scene.js').read_text(encoding='utf-8')
    return set(re.findall(r"'([a-z0-9-]+)':\{draw:", scene))


def buildable(items, root):
    """Of the waiting items, only those whose model has no engine anywhere yet: a brand-new model. An existing but
    not-ready engine (shelved on purpose) is promoted by hand, never rebuilt and clobbered automatically."""
    existing = engine_keys(root) | set(topics_module.TOPICS)
    return [i for i in items if i['model'] not in existing]


def collision(root, engine, kind):
    """A reason the generated code cannot be spliced in safely (a name it would redefine), or None. Reliable,
    definition-level name matching; a false positive only costs a fallback, never a clobbered existing engine."""
    if kind in engine_keys(root):
        return f'an engine named {kind} already exists'
    scene = (root / 'web' / 'scene.js').read_text(encoding='utf-8')
    physics = (root / 'web' / 'physics.js').read_text(encoding='utf-8')
    scene_fns = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)', scene))
    new_fns = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)', engine['scene']))
    clash = new_fns & scene_fns
    if clash:
        return f'the drawing redefines existing function(s): {sorted(clash)[:3]}'
    methods = lambda text: set(re.findall(r'(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*\(', text))
    clash = methods(engine['physics']) & methods(physics)
    if clash:
        return f'the model redefines existing Physics method(s): {sorted(clash)[:3]}'
    return None


def guard_day(root, day):
    """At most one engine-build attempt per calendar day; a crash still consumes the day's attempt."""
    path = root / '.council-state' / 'engine-build.json'
    if path.exists():
        try:
            if json.loads(path.read_text()).get('day') == day:
                return False
        except ValueError:
            pass
    return True


def mark_day(root, day, model, outcome):
    path = root / '.council-state' / 'engine-build.json'
    path.parent.mkdir(exist_ok=True)
    write_json(path, {'day': day, 'model': model, 'outcome': outcome})


# Every file carried onto a candidate branch is snapshotted so the main working tree can be restored byte-for-byte:
# the five engine files plus the drafts index, which save_draft rewrites.
SNAPSHOT_FILES = ENGINE_FILES + ('web/drafts/index.json',)


def _git(root, *args, check=True):
    """Run a git command in the checkout. Credentials in any URL are never passed on the command line."""
    return subprocess.run(['git', *args], cwd=root, text=True, capture_output=True, check=check, timeout=120)


def candidate_commit(root, branch, message, files, push):
    """Commit the given working-tree files onto a fresh commit on top of main and point `branch` at it, WITHOUT moving
    HEAD or touching the main working tree or index (it uses a throwaway index file). Then push only that branch,
    never main and never with --force. The caller restores the main working tree afterwards, so the engine code lives
    only on the review branch. Raises on any git failure, and deletes a pushed-nothing local branch on a failed push,
    so the caller can roll back fully."""
    if _git(root, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.strip() != 'main':
        raise RuntimeError('an engine candidate branch can only be cut from main')
    index = root / '.council-state' / 'engine-candidate.index'
    index.parent.mkdir(exist_ok=True)
    if index.exists():
        index.unlink()
    env = {**os.environ, 'GIT_INDEX_FILE': str(index)}
    try:
        subprocess.run(['git', 'read-tree', 'main'], cwd=root, env=env, check=True, capture_output=True, timeout=120)
        subprocess.run(['git', 'add', '--', *files], cwd=root, env=env, check=True, capture_output=True, timeout=120)
        tree = subprocess.run(['git', 'write-tree'], cwd=root, env=env, check=True, capture_output=True, text=True,
                              timeout=120).stdout.strip()
    finally:
        if index.exists():
            index.unlink()
    parent = _git(root, 'rev-parse', 'main').stdout.strip()
    commit = _git(root, 'commit-tree', tree, '-p', parent, '-m', message).stdout.strip()
    _git(root, 'branch', '-f', branch, commit)
    if push:
        try:
            _git(root, 'push', 'origin', branch)
        except subprocess.SubprocessError:
            _git(root, 'branch', '-D', branch, check=False)
            raise


def record_proposal(root, branch, kind, question, curriculum_id, draft_id, review_status, day):
    """Tell the owner, through the proposals file, that a new picture is ready to review on a branch. The proposal
    carries the branch name, model, question and draft id; merging the branch is what makes the picture live."""
    path = root / 'web' / 'proposals.json'
    document = json.loads(path.read_text()) if path.exists() else {'proposals': []}
    proposal = {
        'id': f'E-{day.replace("-", "")}-{kind}'[:60], 'kind': 'engine', 'status': 'open', 'branch': branch,
        'created': datetime.now(timezone.utc).isoformat(), 'curriculum': curriculum_id, 'model': kind,
        'draft': draft_id, 'review_status': review_status, 'question': question,
        'title': f'Review a new picture for “{question}”'[:90], 'area': 'engines',
        'problem': 'An agent built a new picture engine for this question. Its code is on a review branch only, never '
                   'on the live site.',
        'proposal': (f'Review the draft guide {draft_id} and the engine code on branch {branch} (checked out, or with '
                     f'python3 -m lab approve-engine {branch}, which re-runs the gates and fast-forwards main). '
                     'Nothing is live until you merge it.')[:600],
        'benefit': f'Adds a reviewed picture for “{question}”, so the daily run can investigate it.'[:300],
        'effort': 'medium',
        'risk': 'Model-written engine code; review the drawing, the model and the beginner guide before merging.',
        'evidence': [],
    }
    document['proposals'] = [proposal] + [p for p in document['proposals'] if p.get('id') != proposal['id']][:15]
    document['updated'] = datetime.now(timezone.utc).isoformat()
    write_json(path, document)
    return proposal


def _commit_message(kind, draft_id, review_status):
    return f'Engine candidate for {kind}: draft {draft_id} ({review_status.replace("_", " ")}) for owner review'


def build_engine(factory, items, root, day, explored, ready, requests=(), rounds=3, push=False, record=None):
    """On an idle publishing morning, build the engine the next waiting curriculum item needs, gate it, run its first
    investigation, and hand it to the owner as a review candidate on a dedicated branch. NO agent-written engine code
    reaches main or the live site: a success commits the engine files and draft onto `engine-candidate/<day>-<kind>`,
    pushes only that branch, and restores the main working tree byte-for-byte. Returns a truthy outcome once a
    candidate branch exists (so the caller does not also sketch a brief); returns None when it cannot run or fully
    rolls back, so the caller falls back to research_brief and then blueprint. Never raises: every failure is caught,
    and after any edit every touched file is restored to its exact original bytes, no draft or branch is left on main,
    and nothing is left staged."""
    try:
        return _build_engine(factory, items, root, day, explored, ready, requests, rounds, push, record)
    except Exception as error:
        print(f'Engine build aborted ({type(error).__name__}: {str(error)[:160]}); falling back.', flush=True)
        return None


def _build_engine(factory, items, root, day, explored, ready, requests, rounds, push, record):
    if not guard_day(root, day):
        return None
    # No splice targets, no build: a minimal checkout cannot build an engine.
    if any(not (root / rel).exists() for rel in ENGINE_FILES):
        return None
    candidates = buildable(waiting_items(items, ready, explored, requests), root)
    if not candidates:
        return None
    item = candidates[0]
    kind, curriculum_id, question = item['model'], item.get('id'), item['question']
    mark_day(root, day, kind, 'started')
    print(f'Idle morning: building a picture engine for {curriculum_id} ({kind}).', flush=True)
    try:
        provider = factory()
        research, design, retrieved_by = _research_and_design(provider, question, kind, root)
        engine = validate_engine(provider.generate('engine', question + '\n' + json.dumps({'model': kind})
            + '\nResearch:\n' + json.dumps(research) + '\nDesign brief:\n' + json.dumps(design) + '\n' + BUILDER,
            ENGINE_SCHEMA))
    except Exception as error:
        mark_day(root, day, kind, 'could-not-generate')
        print(f'Engine build could not generate ({type(error).__name__}: {str(error)[:160]}); falling back.', flush=True)
        return None
    clash = collision(root, engine, kind)
    if clash:
        mark_day(root, day, kind, 'name-collision')
        print(f'Engine build skipped before any edit: {clash}; falling back.', flush=True)
        return None
    # From here, any exit restores every touched file byte-for-byte, drops the in-memory topic, removes any draft and
    # deletes any half-made candidate branch, so neither engine code nor a draft is ever left on main.
    snaps = snapshot(root, SNAPSHOT_FILES)
    draft_path = None
    candidate = None
    try:
        install(engine, kind, curriculum_id, root)
        ok, reason = gates(root, kind, engine, research)
        if not ok:
            raise RuntimeError(f'gate failed: {reason}')
        print(f'Engine for {kind} passed every gate; running its first investigation.', flush=True)
        # The engine is installed on disk; make it available to this process for the run only.
        topics_module.READY.add(kind)
        ready.add(kind)
        topics_module.TOPICS[kind] = {'label': engine['label'], 'question': question,
                                      'notes': engine['model_notes'] + topics_module.COMMON}
        try:
            state = run(provider, rounds, on_update=record, topic=kind, question=question)
        except Exception as error:
            state = {'id': 'engine-' + day, 'provider': provider.name, 'status': 'failed', 'scene': None,
                     'created': datetime.now(timezone.utc).isoformat(), 'revisions': [], 'checks': [],
                     'error': str(error)}
            print(f'The built engine ran but the investigation stopped ({type(error).__name__}: {str(error)[:160]}).', flush=True)
        status = state.get('status')
        review_status = ('reviewed' if status in ('reviewed', 'fixture_complete')
                         else 'needs_changes' if status == 'needs_review' else 'stopped')
        draft_id = save_draft(state, root, review_status, question, kind, curriculum_id, research, design, retrieved_by)
        draft_path = root / 'web' / 'drafts' / f'{draft_id}.json'
        branch = CANDIDATE_PREFIX + f'{day}-{kind}'
        files = list(ENGINE_FILES) + [f'web/drafts/{draft_id}.json', 'web/drafts/index.json']
        candidate_commit(root, branch, _commit_message(kind, draft_id, review_status), files, push)
        candidate = branch
        # The engine code and draft are now on the candidate branch; restore main to byte-clean so update() is never
        # wedged and no agent-written code is tracked or left uncommitted on main.
        restore(root, snaps)
        if draft_path.exists():
            draft_path.unlink()
        _prune_drafts_dir(root)
        # Make the review candidate visible on the live site without any of its code: a proposal the owner acts on.
        record_proposal(root, branch, kind, question, curriculum_id, draft_id, review_status, day)
        mark_day(root, day, kind, f'candidate {branch}; draft {draft_id} ({review_status})')
        print(f'Engine for {kind} is on review branch {branch}; draft {draft_id} awaits the owner.', flush=True)
        return {'built': True, 'model': kind, 'curriculum': curriculum_id, 'question': question,
                'draft': draft_id, 'review_status': review_status, 'branch': branch, 'run_id': state.get('id')}
    except Exception as error:
        restore(root, snaps)
        if draft_path is not None and draft_path.exists():
            try:
                draft_path.unlink()
            except OSError:
                pass
        _prune_drafts_dir(root)
        if candidate:
            _git(root, 'branch', '-D', candidate, check=False)
        topics_module.READY.discard(kind)
        ready.discard(kind)
        topics_module.TOPICS.pop(kind, None)
        mark_day(root, day, kind, 'rolled-back')
        print(f'Engine build rolled back ({type(error).__name__}: {str(error)[:160]}); falling back.', flush=True)
        return None


def _prune_drafts_dir(root):
    """After a rollback, remove the drafts folder if the restore left it empty, so no stray directory remains on main."""
    drafts = root / 'web' / 'drafts'
    try:
        if drafts.is_dir() and not any(drafts.iterdir()):
            drafts.rmdir()
    except OSError:
        pass


def approve_engine(root, branch, research=None):
    """A reviewer's local, explicit step: fast-forward-merge a named engine-candidate branch into main, after
    RE-RUNNING the same gates on the branch's code. Never auto-called; the daily run only ever creates candidate
    branches. Refuses unless the checkout is on a clean main and the branch is a strict fast-forward of it, so a
    reviewer's uncommitted work is never clobbered and no merge commit is made. Returns the merged commit; raises
    ValueError on anything it refuses, so a reviewer sees why."""
    if not branch.startswith(CANDIDATE_PREFIX) or '..' in branch or any(c.isspace() for c in branch):
        raise ValueError(f'Not an engine candidate branch: {branch}')
    if _git(root, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.strip() != 'main':
        raise ValueError('Approving an engine requires being on main.')
    if _git(root, 'status', '--porcelain', '--untracked-files=no').stdout.strip():
        raise ValueError('The checkout has local edits; commit or stash them before approving an engine.')
    if _git(root, 'rev-parse', '--verify', '--quiet', branch, check=False).returncode:
        if _git(root, 'fetch', 'origin', branch, check=False).returncode:
            raise ValueError(f'Candidate branch not found locally or on origin: {branch}')
        _git(root, 'branch', '-f', branch, 'FETCH_HEAD')
    if _git(root, 'merge-base', '--is-ancestor', 'main', branch, check=False).returncode:
        raise ValueError(f'{branch} is not a fast-forward of main; rebuild or rebase it before approving.')
    # Re-run the gates on the branch's engine, in a throwaway worktree, so main is never dirtied by the check.
    kind = branch[len(CANDIDATE_PREFIX):][11:] or branch[len(CANDIDATE_PREFIX):]
    with tempfile.TemporaryDirectory(prefix='engine-approve-') as temp:
        work = Path(temp) / 'tree'
        _git(root, 'worktree', 'add', '--detach', str(work), branch)
        try:
            ok, reason = gates(work, kind, {'scene': '', 'physics': ''}, research)
            if not ok:
                raise ValueError(f'The candidate failed its gates on re-check: {reason}')
        finally:
            _git(root, 'worktree', 'remove', '--force', str(work), check=False)
    # Green gates are not enough: print the generated engine code so the human reads it before the merge.
    diff = _git(root, '--no-pager', 'diff', f'main...{branch}', '--', *ENGINE_FILES).stdout
    print(f'--- engine candidate {branch}: review this generated code before it goes live ---', flush=True)
    print(diff or '(no diff on the engine files)', flush=True)
    print('--- end of candidate diff ---', flush=True)
    _git(root, 'merge', '--ff-only', branch)
    merged = _git(root, 'rev-parse', 'HEAD').stdout.strip()
    print(f'Merged {branch} into main at {merged}. Push main to make the picture live.', flush=True)
    return merged

