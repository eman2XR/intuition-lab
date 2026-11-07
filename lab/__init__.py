"""Intuition Lab: visual research and review."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The only paths the coordinator commits and pushes: the public archive, the internal build briefs, and the
# site's status and proposals.
PUBLICATION = ('web/published/', 'web/briefs/', 'web/dashboard.json', 'web/proposals.json')
