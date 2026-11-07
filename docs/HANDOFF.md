# Intuition Lab: coding-agent handoff

Read this first, then `README.md`, and check `git status`: work may be uncommitted. At the end of every session, rewrite **Current state** (at most about 70 lines), edit **Reference** in place, and add one line per dated change to **History**, newest first. Details live in the git log.

## Current state

Updated 2026-11-01, evening (America/Los_Angeles).

**Links and names**
- Repository: https://github.com/eman2XR/intuition-lab (branch `main`, remote `origin`; GitHub redirects the old `the-council` repository address). Site: https://eman2xr.github.io/intuition-lab/ (the old `/the-council/` address does not redirect).
- Kept from The Council on purpose: the `council:` issue labels (including `council:guidance`), browser storage keys (`council-watched`, `council-notes`, `council-sound`, and `council-issues` in session storage), the launch agent `org.the-council.daily`, the worker folder `~/Projects/the-council-worker`, and the `.council-state` and `.council-runtime` folders. `council.py` is the separate legacy persona debate.

**Worker and schedule**
- At 9 AM local, launchd runs `caffeinate -i <Framework Python 3.13> scripts/run_daily.py --provider claude --count 1 --rounds 3 --publish` in the worker checkout. It needs an awake, logged-in Mac with the VPN up. The schedule is enabled (`schedule.enabled: true` in `web/dashboard.json`, which is set by hand) and the worker has no pause flag.
- A publishing run first waits up to 20 minutes for GitHub to answer; if it never does, nothing starts and the day's attempt is unused. It then updates the checkout (fast-forward, or replay its own unpushed publication; never over local edits) and logs `Worker checkout: …`. The worker runs GitHub's `main`, so changes reach it only once pushed (it was at `51e5873`, with no local edits, when this was written).
- Logs in the worker's `.council-state`: `daily.log` (each line starts with the local time), `daily-error.log`, the ledger `history.json` and the project review's `improve.json`.
- Pause without unloading the schedule: `touch ~/Projects/the-council-worker/.council-state/paused` (nothing starts, no slot is used, no project review); delete the file to resume. The site only looks paused when `schedule.enabled` is false.
- Daily check-in: every cycle, idle and paused ones included, writes `checked` (`at` and a one-line `outcome`) and the last 60 attempts into `web/dashboard.json` and publishes it.

**Pipeline** (`lab/pipeline.py`)
- Researcher (web tools, 600 s; if it fails, the coordinator's source fallback, on unless `COUNCIL_COORDINATOR_FETCH=0`) → scientist (research record with misconceptions and 3–5 transfer questions, citing only retrieved sources) → designer (brief: idea, start, belief, reason, 3–6 chapters each with at most one label of five words or fewer, and what to try; the prompt states its limits, 300 characters for idea, start, belief and try, 480 for reason and missing, 380 per chapter field, and `DESIGN_LIMITS` in `lab/contracts.py` allows about 20 more) → writer (three or four chapters following the brief) → render checks → four reviewers in parallel.
- Reviewers: accuracy (physics, or mathematics for other topics), visual (against the brief), beginner (`learner_review`: says why the idea matters, answers the transfer questions from frames and subtitles alone, copy-edits) and blind viewer (late canvas frames only, no words). Acceptance needs every check and all four reviews (score at least 7, no blocking issues); otherwise the writer revises, up to `rounds` times.
- Call budget `calls_needed(rounds, planner)`: 3 + 5 per round, +1 source finder when the fallback is on, +1 planner (20 for a daily run at three rounds). Four concurrent CLI workers.

**Planning** (`lab/daily.py`)
- `READY` in `lab/topics.py`: light-bending, gravity-clocks, spacetime-paths, light-clock, interference, diffraction, speed-limit, night-sky. Their curriculum items carry `ready: true` (a test enforces the match).
- One picture per guide: a model used by a published guide or a draft is not planned. An attempt counts once it reached review. Early stops (`failed`, `interrupted`) are retried, never-tried items first, then the most recent early stop; a question rests after `EARLY_STOPS = 3`.
- An owner pick goes first, without a planner call; questions, feedback or guidance notes bring in the planner, which chooses among ready items. Picks and questions close only after an attempt reached review; feedback closes once read; replies say "published" only after the push.
- Next: the worker's ledger leaves 2.4 (speed-limit, stopped early on 10-30), then 2.1 (light-clock, stopped early on 10-28). Both engines pass every render check with their fixture scenes. After them nothing is plannable until another engine is redesigned and marked ready.

**Publication**: `export_accepted` checks the run, its checks, reviews and frames before writing anything, builds the guide in a temporary folder and renames it into place, then updates `web/published/index.json`. `publish` stages only the exported runs, `index.json`, `dashboard.json`, `proposals.json` and `web/briefs/`, refuses unrelated staged changes and index entries that are not committed, and when a push is refused replays its commits on `origin/main` once (rebase and retry); a conflict leaves it pending. Never force-push.

**Notifications**: Web Push through `scripts/push.mjs` (Node built-ins only). The VAPID key is the worker's `.council-state/vapid.json` (created 2026-11-01; never copy, commit or replace it: replacing it cancels every subscription). Add a device in the worker with `python3 -m lab push add '<code>'`, then `python3 -m lab push test`. After a successful push the run waits until the guide's record is live on the site (polls for up to 10 minutes), then notifies; an early stop sends "Today’s run stopped early"; idle days send nothing. Not yet tried on a real iPhone: the worker has no `push-subscriptions.json`.

**Site**
- Home: the lab picture edge to edge, the intro line and status strip as its caption, "Latest from the lab" (the newest guide), every other guide in one grid newest first, a Drafts shelf only when drafts exist, then Up next, which follows the planner's rules and counts the questions still waiting for a picture.
- Guide pages: a `← Intuition Lab` link; `?guide=<id>&at=<seconds>` opens a paused moment (pausing or scrubbing writes `at` back into the address); an id the site cannot load yet shows "This guide is still being published." and retries every 20 seconds for about three minutes.
- Installable app (manifest, icons, Apple tags); `web/sw.js` keeps the cache `intuition-lab-v2`.

**Guides**: 17 published (`web/published/index.json`); the drafts shelf is empty. Eight were hand-made in coding sessions at the owner's request (their `provenance.intro_note` says so): shared-birthdays, sky-colour, river-black-hole, moon-two-tides, curvature, twin-paths, who-is-falling and falling-lift. The other nine came from agent runs; several were edited or rebuilt by hand afterwards, disclosed in `intro_note`. The clocks guide `61589ffe` is labelled "sources not retrieved"; rerunning or retracting it is the owner's call.

**Owner rules**
- Explain why, not only what; start from something seen, felt or measured; define every term; never refer to other guides (all in `STANDARD`).
- Calm pictures: labels of five words or fewer and at most 12 words on the stage at once (the render checks enforce both); the subtitles explain; only what the current sentence is about moves.
- Never "not to scale", "magnified" or similar wording, in pictures or text. No bylines. Teasers (the subtitle) pose the question without giving the answer.
- Copy-edit every title and sentence before publishing, hand edits included (use a fresh copy-editor subagent); disclose hand edits in `provenance.intro_note` and set `updated`.
- Hand-made guides are published only when the owner asks, after the render checks, model checks and a final accuracy, visual and beginner review.

**Open issues**
- Four older guides (`61589ffe`, `550db489`, `e017fbe8`, `3e5bd32e`) have chapters of four or five subtitle sentences, over the newer three-sentence render check.
- The non-ready engines spacetime, falling-time, tunneling and two-slit-particles fail the label checks with their fixture scenes.
- Published frames the site never shows still deploy (about 32 MB of the 36 MB of PNGs). Local `web/runs` holds about 390 MB, almost all fixture runs.
- `?guide=capture` deliberately opens the example, which `lab/render.py` draws over.
- GitHub Pages' CDN may briefly cache a 404 for a brand-new guide.
- Approved proposal P-20261027-4 (reduced motion, pause control) is only partly built: play and pause, keys and no autoplay exist, and reduced motion stops CSS transitions, previews and the lab picture, but the stage's canvas animates as usual and no render check emulates reduced motion.

**Verify** (in a coding session, use `/Library/Frameworks/Python.framework/Versions/3.13/bin/python3` for anything that needs Playwright)
```sh
python3 -m unittest discover -s tests -v
node -e "const c=require('./web/physics.js').allChecks(); const bad=c.filter(x=>!x.pass); console.log(c.length+' checks'); if(bad.length){console.log(bad);process.exit(1)}"
node scripts/push.mjs selftest
python3 -m lab.sitecheck
python3 -m lab run --provider fixture --topic gravity-clocks --rounds 2
```

## Reference

### Purpose and boundaries
- An open-source, model-independent visual lab. Agents research a question, write up the science, design and write a short guide for a hand-built picture, inspect the actual rendered frames and revise within limits; only guides that pass every gate are published. The owner is learning physics and values visual intuition over equations; since 2026-10-29 the lab also covers mathematics and famous ideas (attention, shared birthdays). The long-term aim is honestly scoped investigations of open problems.
- Runs use the existing Claude Code or Codex CLI login (the owner is cost-sensitive); the direct OpenAI API is optional. Managed Claude Code needs the VPN. Never change managed authentication, network policy, the ACC allowlist or sandbox settings without an explicit owner request, and never extract credentials.
- The site is static (GitHub Pages through Actions). The Mac runs the agents and pushes public files; the site stays up when the Mac is off.
- Models return data validated against `lab/contracts.py` (research records, design briefs, scenes, reviews), never code. Passing AI review does not prove truth or novelty.
- Git: the personal account `eman2XR` through a repository-local credential helper (`gh auth git-credential` with an explicit username); never replace the global work-account settings. Commit signing is off only in this repository and in the worker (`commit.gpgsign=false`, local); global x509 signing stays on. The global `core.hooksPath` is `~/Projects/weekly-notes-hooks` (the owner's choice, outside protected folders) so background pushes work. Ignored: `.env`, `.council-runtime/`, `.council-state/`, `web/runs/`, `web/latest.json`, `_site/`, `*.tmp`, `.claude/`.

### Architecture
- `lab/__init__.py`: `ROOT` and `PUBLICATION` (the only paths the coordinator commits: `web/published/`, `dashboard.json`, `proposals.json`, `web/briefs/`).
- `lab/__main__.py`: `python3 -m lab run|check|daily|schedule|export|push` with `--provider codex|claude|openai|fixture`, `--model`, `--rounds 1–4`, `--timeout`, `--minutes`, `--hour`, `--count 1|2`, `--publish`, `--topic`, `--question`, `--run-dir`, and `push keys|add '<code>'|test`. `daily --publish` also runs the project review once a day unless paused.
- `lab/pipeline.py`: the `run()` state machine, the quality bar `STANDARD`, the role prompts `DESIGNER`, `LEARNER` and `BLIND`, `calls_needed`, `keep_retrieved`, `approved`.
- `lab/daily.py`: the daily cycle (lock, ledger, planning, retry rule, check-in), `export_accepted`, `export_run`, `publish`, `site_live`, `announce`, replies on issues, `research_brief` and `blueprint`.
- `lab/topics.py`: `TOPICS` (each model's notes for the agents, all ending with the shared `COMMON`) and `READY`. `lab/contracts.py`: schemas, `validate`, `validate_scene`, `validate_design`, `DESIGN_LIMITS`, the light-bending `MODEL_NOTES`.
- `lab/cli_providers.py`: Codex and Claude Code adapters (structured output, native images, web tools only for research, call budget, deadline, process-group kill, four slots). `lab/providers.py`: the OpenAI Responses API. `lab/fixtures.py`: the offline provider and one fixture scene per engine (`ENGINE_SCENES`).
- `lab/render.py`: Playwright capture through request routing (no server; Chromium, then Chrome, then WebKit), frames and render checks, `label_checks`. `lab/sources.py`: coordinator retrieval from public https hosts only (redirects included), bounded in size and time.
- `lab/inbox.py` (owner issues through `gh`), `lab/improve.py` (daily project review), `lab/dashboard.py` (status snapshots and check-in), `lab/push.py` (subscriptions; finds `node` under launchd's minimal PATH; `notify` never raises), `lab/schedule.py` (launch agent plist), `lab/sitecheck.py` (browser smoke check), `lab/preview.py` and `lab/qa.py` (desktop and phone screenshots for design review).
- `scripts/run_daily.py`: the launchd entry (network wait, self-update, timestamped log). `scripts/push.mjs`: Web Push sender (`keys`, `send`, `selftest`; RFC 8291 encryption, RFC 8292 VAPID; drops subscriptions answered with 404 or 410). `scripts/batch.sh` and `scripts/overnight.sh` (with `batch-questions.txt`): human-started, capped batches from snapshot copies that never publish; export accepted runs with `lab export`.
- `web/index.html` and `web/style.css`; `web/app.js` (home, guide pages, status strip, lab picture states, notes, Up next, proposals, moments, service worker and notifications); `web/scene.js` (engines in `ENGINES`, the player `CouncilScene`, thumbnails `CouncilDraw`, the lab picture `CouncilLab`/`drawLab`); `web/physics.js` (exact models and checks: `checksFor(kind)`, `allChecks()`); `web/sw.js`, `web/manifest.webmanifest`, `web/icons/`, `web/push.json`. Data: `web/curriculum.json`, `web/published/`, `web/drafts/`, `web/dashboard.json`, `web/proposals.json`, `web/example.json` with `web/example-frames/`; private runs in `web/runs/`.
- `tests/`: offline unit tests; `helpers.py` holds the shared stand-ins, `test_push.py` runs the push self-test and `test_inbox.py` checks that curriculum `ready` flags match `READY`.
- `.github/workflows/pages.yml`: unit tests, `node --check` on the four scripts, `allChecks()`, explicit staging with a check that every tracked file under `web/` (runs and briefs aside) deploys, and `?v=<sha>` stamping of asset links.

### Records
- `web/runs/<id>/record.json` is the private run record (events, scenes, frames, reviews, usage). `web/published/<id>/record.json` is the export: id, question, topic, created, research, scene, checks, provenance and every revision with its reviews and copied frames, with provider `reviewed-agents`; `updated` is the ISO time of the last change (set it when a published record is edited by hand). `web/published/index.json`, newest first, drives the site.
- `web/dashboard.json`: status snapshot; `Dashboard` keeps whatever `schedule` holds.

### Scenes and the player
- Scene fields from the writer: title (≤100), subtitle (≤250, the home card teaser), why (≤220, about 25 words, the line under the title), three or four beats (title ≤90, body ≤380), `mass` 0–1 and `distance` 1–2.5 for the two sliders, `controls` (none, first, second, both), `duration` (it can only stretch the timing), and the `takeaway` shown at the end. Hand-made scenes may have more chapters and may add `links` (the first mention in the why line becomes a link), `opening` and `next`, which the writer's schema does not offer.
- Subtitles play one sentence at a time at 14 characters a second, at least 2.8 s each, with pauses; decimals never split a sentence. The render checks require at most 15 characters a second, at most three sentences a chapter and at least 2.5 s on screen.
- Chapter 1 sets the first control to zero. The last chapter's demo moves both controls unless the engine scripts its own (`demo(p, spec)`) or sets `demo: false`. Sliders appear inside the player only after playback or from the sliders button; nothing moves before play. Only the guitar-string engine makes sound (a plucked string); its mute setting is remembered in `council-sound`.
- `ENGINES` has 24 engines. Agents can use the 17 in `TOPICS`; the engines of hand-made guides (river, fall-views, tides, lift, moon-tides, birthdays, sky-colour) have no agent notes. Out of `READY`: standing-waves, quantum-well, wave-packet and attention have fixed choreography that agent-written scenes would not match; twin-trip shows what rather than why; spacetime, falling-time and tunneling are graph-style; two-slit-particles failed a beginner test.

### Adding a picture engine and marking it ready
1. `web/scene.js`: a draw function and an `ENGINES` entry (slider labels `a` and `b`, formatters `fa` and `fb`, `measure` or none, `disclosure`, `try`, `aria`, `demo` or `demoEnd`, and `effect(a, b)` when the readout is not zero at zero). Draw labels with `text()` and `pill()` so they are counted; pass `content: true` only for the words of a sentence being studied. Without a chapter clock (thumbnails), draw a representative still.
2. `web/physics.js`: the exact model and a checks set registered in `checkSets()`, so `checksFor` and CI's `allChecks()` include it.
3. `lab/topics.py`: notes that end with `COMMON` (what each chapter shows, the honesty points, suggested sources) and a `TOPICS` entry. `web/app.js`: a category in `TOPICS` (and in `REVIEWED` when the accuracy review is not physics). `lab/fixtures.py`: an `ENGINE_SCENES` entry keyed by a phrase only its notes contain.
4. Render it with `python3 -m lab run --provider fixture --topic <kind> --rounds 2`; every check must pass, the label checks included. Then run a frames-only blind-viewer subagent and a skeptical-learner subagent (frames plus narration, transfer questions answered from the guide alone, "not covered" allowed), fix, re-test and copy-edit. These are proxies; the owner answering cold is the real test.
5. Mark it ready only after that: add it to `READY` and set `ready: true` on its item in `web/curriculum.json`. A draft or a published guide using the model keeps it from being planned, so an engine meant for the daily run is marked ready rather than drafted.

### Page elements `lab/render.py` relies on
It opens `?guide=capture` (the example), waits for `window.CouncilScene` and text in `#beat-title`, calls the global `show(record)` and `CouncilScene.load`, `seek`, `checks`, `timeline`, `getState`, `labels` and `effect`, writes `#title`, `#why` and `#takeaway` when present, moves `#mass`, reads `#bend-value` and `#mass-value` (`data-value`), and captures `#universe` and `.workspace` at 1440×1050 and 390 px wide. `seek()` must stay deterministic and hide the poster. Run the fixture renderer check after any change to the page structure.

### Inbox and owner issues
- Only open issues by `eman2XR` with a `council:` label are read (`gh issue list`, up to 100), and only by the publishing worker; their text reaches the models as quoted data. A failing `gh` is retried once after 15 s with its error line logged; after that the run plans without requests. On 10-31 `gh` failed while GitHub was unreachable; on 11-01 it read cleanly.
- `council:choose` (Pick for tomorrow, body `curriculum: <id>`): the oldest pick of a ready, unexplored item becomes the plan without a planner call. `council:question` (Ask a question) and `council:feedback` (Give feedback) go to the planner. `council:guidance` (Guide the lab, then Send to the 9 AM run): up to five notes go to the planner, designer, writer and reviewers, never above the quality bar, and the dashboard counts them. `council:approve` and `council:decline` (`proposal: P-…`) record owner decisions on proposals.
- The run comments on the request it answered and on each guidance note. Picks, questions and guidance notes close once an attempt reached review and stay open after an early stop; feedback closes once the planner has read it. A reply says "published" only after the push succeeded.
- Proposals: the project review runs once per local day after a publishing cycle (not when paused), one research call and one structured call, and merges at most four proposals into `web/proposals.json` with owner decisions applied. When nothing is plannable, a publishing morning runs `research_brief`: it researches the next waiting question (owner `council:question` issues first, then the next curriculum item with no ready engine, skipping ones already briefed or published) through the same researcher, scientist and designer steps and saves a ready-to-build brief to `web/briefs/<id>.json` (the model, its checks and a chapter plan), once a day, surfaced as a `blueprint` proposal; if there is nothing to research or it fails, it falls back to a design-only sketch for the next waiting question, once a day (`kind: blueprint`, id `P-<day>-9`). Nothing is built automatically; approved proposals wait for a supervised coding session.

### Worker setup and session limits
- Worker: `~/Projects/the-council-worker`, outside Desktop and Documents (macOS privacy protection blocks launchd there), with the Framework Python 3.13 and Playwright, personal `gh` credentials and signing off locally. Generate the launch agent there with `python3 -m lab schedule --provider claude --hour 9 --count 1` and install it as the README shows; regenerate it if the checkout or interpreter moves. It cannot wake a powered-off Mac, work through a closed lid or connect the VPN. The worker updates itself; do not pull it by hand without asking the owner.
- `daily --count N` caps attempts per local day; crashes and failed planning use a slot. Never delete ledger entries to get around it.
- The coding session's sandbox cannot run the Claude CLI (it exits with 71), reach the web, open ports, launch Chrome or submit launchd jobs (do not retry that); the GitHub CLI works. Playwright works through request routing, so renders, `lab.sitecheck`, `lab.preview` and `lab.qa` run in the session with the Framework Python. Research works from the worker, not from a session. Live runs start from the owner's Terminal or the 9 AM worker.
- The permission check can block pushes to `main`, commands in the worker or writes to `web/published/`. Do not route around it: commit locally and give the owner the exact commands (without a leading `!`).

## History

- 2026-11-07: idle publishing mornings now research the next waiting question into a ready-to-build brief in `web/briefs/` (owner request), not just a design sketch; `research_brief` reuses the researcher, scientist and designer steps, once a day, and falls back to a sketch.
- 2026-11-07: the faster-than-light guide's bottom was rebuilt by hand (owner request): the abstract line chart became a rocket racing to a glowing light-speed wall, equal pushes giving ever-smaller leaps that never reach it; every chapter now fills the stage (disclosed in the record).
- 2026-11-07: whole-codebase fix-and-clean pushed (budget, publish safety, retry rule, inbox, service worker, engine clipping, dead code, docs); see commit 6596b0b.

- 2026-11-01 (evening): early stops include interrupted runs and a question rests after three; every cycle checks in on the dashboard; publication stages only the runs this checkout exported, and export is atomic; notifications wait for the site and an early stop alerts the owner; replies say "published" only after the push, and feedback closes once read; four CLI workers and `calls_needed`; `gh` retried once; timestamped log; the source fetcher reaches public https hosts only. Site: `?at=` moments, a still-publishing page, the `← Intuition Lab` link, service worker cache `intuition-lab-v2`. The base-rate and seasons engines were deleted and "magnified" wording removed from disclosures and check names. CI checks script syntax and that every tracked site file deploys, on Python 3.13.
- 2026-11-01: the site installs as an iPhone app, with owner-only notifications of new guides sent by the worker after it publishes (owner request).
- 2026-11-01: teasers pose the question without giving the answer (owner request; the night sky's was rewritten, disclosed); the site intro became one line matching the README.
- 2026-11-01: repository and site renamed to `intuition-lab` (owner request); labels, storage keys, the launch agent and the worker folder keep their names; the old Pages address does not redirect.
- 2026-11-01: Up next and Next follow the daily run's rules; a quieter grid; older titles in sentence case.
- 2026-11-01: night sky (`20261101T172324-12e71822`) published by the agents on a second attempt that morning, after the 9 AM run stopped at the designer ("Design brief exceeds its bounds": the prompt never stated the limits). The designer now gets its limits and early stops are retried. The stargazer was redrawn by hand afterwards (disclosed); the "Watch a run" button was removed.
- 2026-11-01: the six older drafts (falling lift, who is falling, the travelling twin, curved spacetime, two tides, the black hole river) published at the owner's request after full checks, disclosed as made in a coding session; the drafts shelf is empty.
- 2026-11-01: night-sky engine (6.1, Olbers' paradox) marked ready; the worker waits up to 20 minutes for the network (failed 9 AM runs had stalled on their first model call, and one cycle could not reach GitHub). Owner rules: never say a picture is not to scale; no "By Intuition Lab" bylines.
- 2026-11-01: sky-colour and shared-birthdays published at the owner's request, the first hand-made guides (`CLAUDE.md` now allows owner-approved ones after full checks); magazine home page with the lab picture edge to edge.
- 2026-10-31: seasons and rare-disease-test drafts removed at the owner's request. The 9 AM run found nothing ready and could not reach GitHub.
- 2026-10-30: four drafts made overnight at the owner's request (rare disease test, shared birthdays, sky colour, seasons; the owner dropped GPS). The 9 AM run (2.4) stopped when the researcher hit 600 s and the source finder then timed out.
- 2026-10-29: speed-limit engine for 2.4 marked ready (owner request); drafts got their own shelf; the worker updates itself before each run, and publication replays its commit when GitHub moved.
- 2026-10-29: agents reorganised around design (owner request): a designer's brief, the director became the writer, the blind viewer became the fourth reviewer, and a daily blueprint proposal when nothing is plannable. The renderer was fixed after `#subtitle` left the page. The lab picture now shows one character per role, with the coordinator as the room's machinery.
- 2026-10-29: renamed from The Council to Intuition Lab (the owner wanted "Lab", singular).
- 2026-10-29: the lab picture follows the real run, with guidance notes (`council:guidance`) and in-browser states; after rejecting pawns, an abstract wave and robots, the owner chose a lively lab of characterful scientists, then a small world of AI agents.
- 2026-10-29: home page features the newest guide with one grid, newest first, instead of curriculum sections; guide header with a why line and a dateline (`updated`); the owner asked for a drafts section.
- 2026-10-29: calm pictures enforced after the owner found a trapped-particle frame unreadable: label checks in every render, every engine trimmed.
- 2026-10-29: attention (5.1): the agents' guide passed review but the owner found it missed the point; rebuilt by hand as the path from attention to ChatGPT ("How" was the owner's wording). Reviews must now say why an idea matters, chapters keep to three sentences, and `attention` left `READY`.
- 2026-10-29: trapped particle, exact place versus speed and the black hole river rebuilt after blind-viewer and skeptic tests; `quantum-well` and `wave-packet` left `READY`.
- 2026-10-28: quality bar for new guides at the owner's request: plan only ready, unused models; a beginner reviewer with transfer questions; frames per chapter; light-clock engine for 2.1; schedule re-enabled. Research falls back to coordinator sources on any failure and gets 600 s (the 9 AM run had stopped at the old 300 s limit). The guitar-string guide was rebuilt as a shaken rope and a plucked string with sound.
- 2026-10-27: first worker run with real sources; guides revised after skeptical-learner audits; with owner approval the old twin diagram (`17d8ad17`), a duplicate interference guide (`98dddabc`) and both twin-trip guides (they showed what, not why) were unpublished; hand-made drafts began; a why line above the player (the "Before you start" primer and "Check yourself" were rejected as clutter); light bending drawn as an optical-geometry mesh.
- 2026-10-26: the lab was built: pipeline, renderer, dashboard, Pages site and bounded daily runs from a worker checkout (launchd is blocked on the Desktop). Research was blocked in-session, so unretrieved sources are refused and the clocks guide is labelled "sources not retrieved"; coordinator retrieval added; an engine for every curriculum item; daily project review with proposals; an overnight batch (a speed-limit run passed but was held).
