"""Daily project review: the lab suggests improvements to itself; the owner approves or declines.

Bounded to one review per local day (one research call and one structured call). Models return
proposals as data; the coordinator assigns IDs, merges owner decisions, and writes web/proposals.json.
Nothing here changes code: approved proposals wait for a supervised coding session.
"""
import json
import re
from datetime import datetime, timezone
from . import ROOT
from .contracts import obj, validate, STR, STRINGS
from .pipeline import write_json
from .topics import TOPICS
from . import inbox

GOAL = ('Intuition Lab is an autonomous visual physics research lab with humans in the loop. Its goal is to build '
        'intuitive understanding of physics through honest, interactive, beautiful visuals, publishing one reviewed '
        'investigation a day, and over time to work toward clearly scoped investigations of open problems in physics. '
        'Agents propose, research, render, review and revise; the owner steers through picks, questions, feedback '
        'and approvals. Scientific honesty, beginner clarity and low cost matter more than volume.')

SITE = ('Static GitHub Pages site that installs as a phone app with notifications for new guides. Top: a slim lab '
        'status strip that expands to show the current steps and a box for owner guidance notes. Home: one featured '
        'guide, then every other reviewed guide in a single grid, newest first. A guide: title and a one-line why, a '
        'canvas stage with a poster play button, reading-paced subtitles, a scrubbable bar with chapter ticks, sliders '
        'offered after playback, ask and feedback links that open GitHub issues, related guides, and a collapsed "How '
        'the lab checked this" section. Visual engines are hand-written canvas renderers; models only return scene data '
        'within fixed fields. Every draft is rendered in a headless browser and must pass physics, visual, beginner and '
        'blind-picture reviews.')

AREAS = ['website', 'visuals', 'engines', 'pipeline', 'research', 'curriculum']
PROPOSAL = obj({'title': STR, 'area': {'type': 'string', 'enum': AREAS}, 'problem': STR, 'proposal': STR,
                'benefit': STR, 'effort': {'type': 'string', 'enum': ['small', 'medium', 'large']},
                'risk': STR, 'evidence': STRINGS})
SCHEMA = obj({'proposals': {'type': 'array', 'items': PROPOSAL}})
LIMITS = {'title': 90, 'problem': 400, 'proposal': 600, 'benefit': 300, 'risk': 300}


def recent_reviews(root, limit=8):
    """Blocking issues and requested changes from recent drafts: the most direct signal of what to fix."""
    runs = sorted((root / 'web' / 'runs').glob('*/record.json'), reverse=True)
    notes = []
    for path in runs:
        try:
            record = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if record.get('provider') == 'fixture' or not record.get('revisions'):
            continue
        last = record['revisions'][-1]
        issues = [text[:220] for key in ('physics_review', 'visual_review', 'learner_review') if last.get(key)
                  for text in last[key].get('blocking_issues', [])[:2] + last[key].get('changes', [])[:1]]
        notes.append({'topic': record.get('topic'), 'status': record.get('status'), 'issues': issues})
        if len(notes) >= limit:
            break
    return notes


def decisions(requests):
    found = {}
    for request in requests:
        match = re.search(r'proposal:\s*(P-\d{8}-\d+)', request.get('body', ''))
        if match and request['kind'] in ('approve', 'decline'):
            found[match.group(1)] = 'approved' if request['kind'] == 'approve' else 'declined'
    return found


def review(provider, root=ROOT, requests=(), today=None):
    """Run one bounded review and return the updated proposals document."""
    path = root / 'web' / 'proposals.json'
    document = json.loads(path.read_text()) if path.exists() else {'proposals': []}
    for proposal in document['proposals']:
        proposal['status'] = decisions(requests).get(proposal['id'], proposal.get('status', 'open'))
    known = [{k: p[k] for k in ('id', 'title', 'area', 'status')} for p in document['proposals']]
    notes = provider.generate('scout', 'Find recent, credible tools, techniques and research that could improve an '
        'interactive physics-explanation website built on canvas renderers and AI agents: explorable explanations, '
        'browser visualization and animation, accessibility and readability of animated captions, physics-education '
        'research on misconceptions, and agent evaluation of visual output. Prefer primary sources from the last two '
        'years. Include URLs.', research=True)
    result = provider.generate('architect', GOAL + '\nSite: ' + SITE + '\nVisual engines: ' +
        json.dumps({k: v['label'] for k, v in TOPICS.items()}) + '\nRecent reviewer findings: ' +
        json.dumps(recent_reviews(root)) + '\nExisting proposals and owner decisions (do not repeat approved or '
        'declined ones; build on approved ones): ' + json.dumps(known) + '\nResearch notes:\n' + notes[:12000] +
        '\nPropose at most four concrete, high-leverage improvements for the owner to approve, ordered by value. '
        'Favour fixes for recurring reviewer findings, clearer intuition for beginners, simpler design, and steps '
        'toward investigating open problems honestly. Each must be implementable in one focused coding session or '
        'say how to split it. Cite only URLs from the notes in evidence; use an empty list if none apply.', SCHEMA)
    validate(result, SCHEMA)
    day = (today or datetime.now().astimezone().date()).strftime('%Y%m%d')
    fresh = []
    for n, item in enumerate(result['proposals'][:4], 1):
        if any(len(item[k]) > limit for k, limit in LIMITS.items()):
            continue
        item['evidence'] = [url for url in item['evidence'] if url.startswith('https://') and url in notes][:4]
        fresh.append({'id': f'P-{day}-{n}', 'status': 'open', 'created': datetime.now(timezone.utc).isoformat(), **item})
    # Blueprints come from the designer, not this review, so a review never replaces them.
    kept = [p for p in document['proposals'] if p.get('kind') == 'blueprint' or not p['id'].startswith(f'P-{day}-')]
    document = {'updated': datetime.now(timezone.utc).isoformat(), 'goal': GOAL,
                'proposals': (fresh + kept)[:16]}
    write_json(path, document)
    return document


def daily_review(factory, root=ROOT, requests=None):
    """At most one review per local day; failures are logged and never block investigations."""
    ledger = root / '.council-state' / 'improve.json'
    today = datetime.now().astimezone().date()
    state = json.loads(ledger.read_text()) if ledger.exists() else {}
    if state.get('day') == today.isoformat():
        return None
    ledger.parent.mkdir(exist_ok=True)
    write_json(ledger, {'day': today.isoformat(), 'status': 'running'})
    try:
        document = review(factory(), root, inbox.fetch() if requests is None else requests, today)
        write_json(ledger, {'day': today.isoformat(), 'status': 'done', 'proposals': len(document['proposals'])})
        return document
    except Exception as error:
        write_json(ledger, {'day': today.isoformat(), 'status': 'failed', 'error': type(error).__name__})
        print(f'Project review stopped ({type(error).__name__}: {str(error)[:160]}); investigations are unaffected.', flush=True)
        return None
