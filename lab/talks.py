"""Talk conversations: the owner's voice conversations with the editors (web/talk.js), sent as GitHub issues labelled
council:talk. Each holds a JSON transcript with the guide, the chapter it was about, and a kind (question, feedback or
mixed). The daily round saves them here and treats feedback on a chapter as a change request for that chapter.

Only issues written by the owner account are read, and their text is data, never instructions."""
import json
import re
import subprocess
from . import ROOT
from .inbox import OWNER, REPO

MARK = '<!-- council-talk -->'
BLOCK = re.compile(r'```json\s*(\{.*\})\s*```', re.S)


def parse(issue):
    """The conversation in one council:talk issue, with its issue number and link, or None if it holds none."""
    body = issue.get('body') or ''
    found = BLOCK.search(body) if MARK in body else None
    if not found:
        return None
    try:
        talk = json.loads(found.group(1))
    except ValueError:
        return None
    if not isinstance(talk, dict) or not isinstance(talk.get('turns'), list):
        return None
    turns = [{'who': 'you' if t.get('who') == 'you' else 'editor', 'text': str(t.get('text', ''))[:4000], 'chapter': t.get('chapter')}
             for t in talk['turns'] if isinstance(t, dict)]
    return {**talk, 'turns': turns, 'issue': issue.get('number'), 'url': issue.get('url')}


def feedback(talk):
    """The reader's words that the editor confirmed as feedback ("Noted: ..."), each with its chapter."""
    out = []
    for before, after in zip(talk['turns'], talk['turns'][1:]):
        if before['who'] == 'you' and after['who'] == 'editor' and re.match(r'\s*noted\b', after['text'], re.I):
            out.append({'chapter': before.get('chapter'), 'text': before['text']})
    return out


def summary(talk):
    where = f" chapter {talk['section']['index'] + 1} ({talk['section']['title']})" if talk.get('section') else ''
    lines = [f"#{talk.get('issue')} {talk.get('kind', '?')}: {talk.get('title') or talk.get('page')}{where}{' [pinned]' if talk.get('pinned') else ''}"]
    lines += [f"  feedback (chapter {f['chapter'] or '?'}): {f['text']}" for f in feedback(talk)]
    lines += [f"  {t['who']}: {t['text'][:200]}" for t in talk['turns'][:12]]
    return '\n'.join(lines)


def collect(runner=subprocess.run, root=ROOT):
    """Saves every open council:talk conversation to .council-state/talks/<talkId>.json and returns them."""
    result = runner(['gh', 'issue', 'list', '--repo', REPO, '--author', OWNER, '--label', 'council:talk', '--state', 'open',
                     '--json', 'number,title,body,url,createdAt', '--limit', '50'], capture_output=True, text=True, check=True)
    talks = [t for t in (parse(i) for i in json.loads(result.stdout or '[]')) if t]
    folder = root / '.council-state' / 'talks'
    folder.mkdir(parents=True, exist_ok=True)
    for talk in talks:
        name = re.sub(r'[^A-Za-z0-9-]', '', str(talk.get('talkId') or talk['issue'])) or str(talk['issue'])
        (folder / f'{name}.json').write_text(json.dumps(talk, indent=1, ensure_ascii=False) + '\n')
    return talks
