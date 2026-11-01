"""Owner-authored GitHub issues as bounded run input: picks, questions, feedback, and guidance notes.

The repository is public, so only issues written by the owner account are read, and their
text is passed to models as quoted data rather than instructions.
"""
import json
import re
import subprocess
from .pipeline import ROOT

OWNER = 'eman2XR'
REPO = 'eman2XR/intuition-lab'
KINDS = {'council:choose': 'choose', 'council:question': 'question', 'council:feedback': 'feedback',
         'council:approve': 'approve', 'council:decline': 'decline', 'council:guidance': 'guidance'}
# Guidance notes sent from the home page end with this line, which is not part of the note.
NOTE_TAIL = '\n\nA guidance note from the lab on the home page.'


def note_text(request):
    """The words of a guidance note: its body without the page's closing line, else its title."""
    text = (request.get('body') or '').split(NOTE_TAIL)[0].strip()
    return (text or re.sub(r'^Guidance:\s*', '', request.get('title') or '')).strip()[:400]


def curriculum(root=ROOT):
    path = root / 'web' / 'curriculum.json'
    if not path.exists():
        return []
    return [item for chapter in json.loads(path.read_text())['chapters'] for item in chapter['items']]


def fetch(runner=subprocess.run):
    """Return open owner issues with Council labels; any failure yields an empty inbox."""
    try:
        result = runner(['gh', 'issue', 'list', '--repo', REPO, '--state', 'open', '--author', OWNER,
                         '--limit', '20', '--json', 'number,title,body,labels,author'],
                        text=True, capture_output=True, check=True, timeout=60)
        issues = json.loads(result.stdout)
    except Exception as error:
        print(f'Inbox unavailable ({type(error).__name__}); planning without requests.', flush=True)
        return []
    inbox = []
    for issue in issues:
        if (issue.get('author') or {}).get('login') != OWNER:
            continue
        kinds = [KINDS[label['name']] for label in issue.get('labels', []) if label.get('name') in KINDS]
        if not kinds or not isinstance(issue.get('number'), int):
            continue
        body = issue.get('body') or ''
        match = re.search(r'curriculum:\s*([0-9]+\.[0-9]+)', body)
        inbox.append({'number': issue['number'], 'kind': kinds[0], 'title': str(issue.get('title', ''))[:200],
                      'body': body[:800], 'curriculum': match.group(1) if match else None})
    return inbox


def choice(inbox, items, topics, explored):
    """The oldest owner pick whose visual model exists and whose question is still unexplored."""
    by_id = {item['id']: item for item in items}
    for request in sorted((r for r in inbox if r['kind'] == 'choose'), key=lambda r: r['number']):
        item = by_id.get(request['curriculum'])
        if item and item.get('model') in topics and not explored(item['question']):
            return request, item
    return None, None


def comment(number, text, runner=subprocess.run):
    """Report what happened to a request; failures never interrupt the daily cycle."""
    try:
        runner(['gh', 'issue', 'comment', str(number), '--repo', REPO, '--body', text],
               text=True, capture_output=True, check=True, timeout=60)
        return True
    except Exception as error:
        print(f'Could not comment on issue #{number} ({type(error).__name__}).', flush=True)
        return False


def close(number, runner=subprocess.run):
    try:
        runner(['gh', 'issue', 'close', str(number), '--repo', REPO],
               text=True, capture_output=True, check=True, timeout=60)
    except Exception as error:
        print(f'Could not close issue #{number} ({type(error).__name__}).', flush=True)
