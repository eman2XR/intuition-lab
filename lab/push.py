"""Owner-only Web Push: stores the owner's device subscriptions and asks scripts/push.mjs to send to them."""
import json
import os
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
    return subprocess.run([binary, str(SCRIPT), *args], text=True, capture_output=True, timeout=timeout)


def keys(state_dir=STATE):
    result = run('keys', str(state_dir))
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return result.stdout.strip()


def notify(title, body, url, state_dir=STATE):
    """Send one notification to every subscription. Never raises: a failure prints one line and returns False."""
    try:
        folder = Path(state_dir)
        if not (folder / 'vapid.json').exists() or not (folder / 'push-subscriptions.json').exists():
            print('Push skipped: no key pair or subscriptions in the state folder.', flush=True)
            return False
        result = run('send', str(folder), json.dumps({'title': title, 'body': body, 'url': url}))
        for line in (result.stdout + result.stderr).strip().splitlines()[:20]:
            print(f'Push: {line}', flush=True)
        return result.returncode == 0
    except Exception as error:
        print(f'Push failed ({type(error).__name__}: {error})', flush=True)
        return False
