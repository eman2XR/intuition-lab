# Intuition Lab — working instructions

Read `docs/HANDOFF.md` first, then `README.md`. Inspect `git status` before editing: ongoing work may be uncommitted. Do not discard local changes or delete run history to bypass daily budgets.

The product is a visual physics research lab, not the historical persona debate in `council.py`. Prioritize intuitive interactive visuals, actual browser captures, bounded revision, and honest scientific status. Keep the name **Intuition Lab** (renamed from The Council on 2026-10-29; the repository and site became `intuition-lab` on 2026-11-01, while the `council:` issue labels, browser storage keys, the launch agent `org.the-council.daily` and the worker folder keep the old names).

The coordinator owns writes, validation, scheduling and publication. Models return structured data. Support both Claude Code and Codex using their existing authentication; direct OpenAI API is optional. Preserve organization-managed CLI settings. Never bypass tool permissions or extract credentials.

Tests: `python3 -m unittest discover -s tests -v`. Renderer check: `python3 -m lab run --provider fixture --topic gravity-clocks --rounds 2`. Live calls consume usage; inspect existing run records before starting another. Read the handoff's current-state section for unfinished verification.

Only accepted live investigations, or hand-made guides the owner explicitly asks to publish, may enter `web/published/`. A hand-made guide must pass the render checks, its model checks and a final accuracy, visual and beginner review, and its record must say in `provenance.intro_note` that it was made in a coding session. Never promote fixtures, failed scientific reviews, or drafts the owner has not approved. Never force-push. The daily scheduler must retain its per-day cap and lock, and must not execute an unbounded agent loop.
