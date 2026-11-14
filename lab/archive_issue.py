"""Apply one owner archive or restore request straight from its GitHub issue event, so the Archive button on a guide
takes effect in a minute or two instead of at the next morning run. Run by .github/workflows/archive.yml as
`python -m lab.archive_issue "$GITHUB_EVENT_PATH"`. Any request this misses stays open and the daily run applies it
(lab.daily.apply_archive)."""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path
from . import ROOT
from .daily import apply_archive
from .inbox import KINDS, OWNER, REPO


def request_from_event(event):
    """The archive or restore request in an issue event, or None when the event is not the owner's own open request."""
    issue = event.get('issue') or {}
    if (issue.get('user') or {}).get('login') != OWNER or (event.get('sender') or {}).get('login') != OWNER:
        return None
    if issue.get('state') != 'open' or not isinstance(issue.get('number'), int):
        return None
    kinds = [KINDS.get(label.get('name')) for label in issue.get('labels', [])]
    kind = next((k for k in kinds if k in ('archive', 'unarchive')), None)
    if not kind:
        return None
    return {'number': issue['number'], 'kind': kind, 'title': str(issue.get('title', ''))[:200],
            'body': (issue.get('body') or '')[:800], 'curriculum': None}


def still_open(number, runner=subprocess.run):
    """Whether the issue is still open now; an issue opened with a label fires two events, and the second must not
    apply the request again."""
    try:
        state = runner(['gh', 'issue', 'view', str(number), '--repo', REPO, '--json', 'state', '-q', '.state'],
                       text=True, capture_output=True, check=True, timeout=60).stdout.strip()
    except Exception:
        return True
    return state == 'OPEN'


def main(event_path, root=ROOT):
    request = request_from_event(json.loads(Path(event_path).read_text()))
    if request is None or not still_open(request['number']):
        print('Nothing to apply: not an open archive or restore request from the owner.', flush=True)
        return 0
    notes = apply_archive([request], root, date.today().isoformat())
    print(' '.join(notes) or 'The request was answered without a change.', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1]))
