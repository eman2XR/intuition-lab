"""Owner-only Web Push: stores the owner's device subscriptions and asks scripts/push.mjs to send to them. A device
signs up from the installed app, which seals its subscription with the inbox key and opens a prefilled GitHub issue;
`inbox` opens those issues, adds each device, welcomes it and closes the issue."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from . import ROOT

STATE = ROOT / '.council-state'
SCRIPT = ROOT / 'scripts' / 'push.mjs'


def node():
    """launchd runs with a minimal PATH, so also look where Homebrew and the Node installer put node."""
    for candidate in (shutil.which('node'), '/opt/homebrew/bin/node', '/usr/local/bin/node'):
        if candidate and os.access(candidate, os.X_OK):
            return candidate
    return None


def add(subscription_json, state_dir=STATE):
    """Validate one subscription (the code shown by the installed app) and keep one entry per endpoint."""
    sub = json.loads(subscription_json) if isinstance(subscription_json, str) else subscription_json
    if not isinstance(sub, dict) or not isinstance(sub.get('endpoint'), str):
        raise ValueError('Subscription needs an endpoint.')
    url = urlparse(sub['endpoint'])
    if url.scheme != 'https' or not url.hostname:
        raise ValueError('Subscription endpoint must be an https address.')
    keys = sub.get('keys')
    if not isinstance(keys, dict) or not all(isinstance(keys.get(k), str) and keys[k].strip() for k in ('p256dh', 'auth')):
        raise ValueError('Subscription needs keys p256dh and auth.')
    entry = {'endpoint': sub['endpoint'], 'keys': {'p256dh': keys['p256dh'], 'auth': keys['auth']}}
    folder = Path(state_dir)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / 'push-subscriptions.json'
    subs = json.loads(path.read_text()) if path.exists() else []
    added = all(s.get('endpoint') != entry['endpoint'] for s in subs)
    subs = [s for s in subs if s.get('endpoint') != entry['endpoint']] + [entry]
    # Owner-only from creation; an older file is narrowed before it is written.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        handle.write(json.dumps(subs, indent=1) + '\n')
    return added


def run(*args, timeout=120):
    binary = node()
    if not binary:
        raise RuntimeError('node was not found')
    # Node's fetch ignores proxy settings unless asked; a sandboxed session reaches the push service only through its
    # proxy. A scheduled run has no proxy set, so this changes nothing there.
    env = {**os.environ, 'NODE_USE_ENV_PROXY': '1'} if os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') else None
    return subprocess.run([binary, str(SCRIPT), *args], text=True, capture_output=True, timeout=timeout, env=env)


def keys(state_dir=STATE):
    result = run('keys', str(state_dir))
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return result.stdout.strip()


def notify(title, body, url, state_dir=STATE, endpoint=None):
    """Send one notification to every subscription, or only to `endpoint`. Never raises: a failure prints one line
    and returns False."""
    try:
        folder = Path(state_dir)
        if not (folder / 'vapid.json').exists() or not (folder / 'push-subscriptions.json').exists():
            print('Push skipped: no key pair or subscriptions in the state folder.', flush=True)
            return False
        result = run('send', str(folder), json.dumps({'title': title, 'body': body, 'url': url}), *([endpoint] if endpoint else []))
        for line in (result.stdout + result.stderr).strip().splitlines()[:20]:
            print(f'Push: {line}', flush=True)
        return result.returncode == 0
    except Exception as error:
        print(f'Push failed ({type(error).__name__}: {error})', flush=True)
        return False


REPO = 'eman2XR/intuition-lab'
OWNER = 'eman2XR'
MARKER = '<!-- council-push -->'


def inbox_keys(state_dir=STATE):
    """The inbox public key (put it in web/push.json as "inbox"); the key pair is made once and kept."""
    result = run('inbox-keys', str(state_dir))
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return result.stdout.strip()


def sealed_from(body):
    """The sealed subscription in a sign-up issue: the first JSON object with epk, salt, iv and ct."""
    for match in re.finditer(r'\{[^{}]*\}', body or ''):
        try:
            sealed = json.loads(match.group(0))
        except ValueError:
            continue
        if isinstance(sealed, dict) and all(isinstance(sealed.get(k), str) for k in ('epk', 'salt', 'iv', 'ct')):
            return sealed
    return None


def unseal(sealed, state_dir=STATE):
    result = run('unseal', str(state_dir), json.dumps(sealed))
    if result.returncode or not result.stdout.strip():
        raise ValueError('the request could not be opened with this lab\'s inbox key')
    return json.loads(result.stdout.strip().splitlines()[-1])


def inbox(site, runner=subprocess.run, state_dir=STATE):
    """Open the owner's sign-up issues: add each device, send it a welcome notification, then comment and close the
    issue. Returns one line per issue."""
    listed = runner(['gh', 'issue', 'list', '-R', REPO, '--author', OWNER, '--state', 'open', '--search', 'council-push in:body',
                     '--limit', '50', '--json', 'number,body'], text=True, capture_output=True, timeout=60)
    if listed.returncode:
        raise RuntimeError((listed.stderr or listed.stdout).strip()[:200] or 'gh issue list failed')
    lines = []
    for issue in json.loads(listed.stdout or '[]'):
        if MARKER not in (issue.get('body') or ''):
            continue
        number = str(issue['number'])
        try:
            sealed = sealed_from(issue['body'])
            if not sealed:
                raise ValueError('no sealed request in the issue')
            subscription = unseal(sealed, state_dir)
            added = add(subscription, state_dir)
            welcomed = notify('Intuition Lab', 'Notifications are on for this device.', site, state_dir, subscription['endpoint'])
            note = ('Notifications are on for this device' if added else 'This device was already signed up') + (
                '; a welcome notification was sent.' if welcomed else '; the welcome notification could not be sent.')
        except (ValueError, KeyError) as error:
            note = f'Could not turn on notifications from this request ({error}). Try again from the app.'
        runner(['gh', 'issue', 'close', number, '-R', REPO, '--comment', note], text=True, capture_output=True, timeout=60)
        lines.append(f'#{number}: {note}')
    return lines

