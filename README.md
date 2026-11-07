# Intuition Lab

![The lab at work: AI agents researching, drawing and reviewing a guide](docs/images/lab.png)

Intuition Lab is a team of AI agents working together to produce short, intuitive guides that explain why things work. Why is the sky blue? Why do just 23 people give even odds of a shared birthday? Each guide answers one question with a short animation you can play with.

**[Open the site →](https://eman2xr.github.io/intuition-lab/)**

They make one a day. One reads up and finds sources, one writes up the science, one plans the picture and one writes the words. Four reviewers then check the rendered result: one for accuracy, one for the visuals, one reading as a beginner, and one who sees only the pictures. If any of them isn't convinced, it goes back for another draft. Only guides that pass all four go live.

The pictures are drawn in code on top of exact models, so the numbers you see are the real ones.

![From "Why is the night sky dark?": only light from within 13.8 billion light-years has had time to reach us](docs/images/night-sky.jpg)

The older persona-debate experiment lives in `council.py`. If you're a coding agent, start with [the handoff](docs/HANDOFF.md) and [CLAUDE.md](CLAUDE.md).

## Run locally

Requires Python 3.10 or later (the worker uses 3.13), Node.js 18 or later for the physics checks and the notification sender, a Playwright browser for captures (Chromium, falling back to Chrome or WebKit), and a signed-in GitHub CLI (`gh`) for the daily run's inbox.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m playwright install chromium
python3 -m http.server 8765 --directory web
```

Open **http://127.0.0.1:8765** to browse the site locally. The site is static: guides are made by the commands below and published as files. The service worker only installs on the deployed site, so local edits show on a normal reload.

## Choose Codex or Claude Code

The default runner is **Codex**. Both CLIs use their existing authentication and model configuration; Intuition Lab does not extract credentials or require a separate OpenAI API key for these runners. Their normal subscription, organisation, or API billing and usage limits still apply.

Install and sign into your chosen CLI first. Managed Claude Code wrappers keep their existing authentication. Run an image-and-JSON compatibility check (one live model request):

```sh
python3 -m lab check --provider codex
python3 -m lab check --provider claude
```

Start an investigation with either runner:

```sh
python3 -m lab run --provider codex --rounds 3
python3 -m lab run --provider claude --rounds 3
```

Use `--model` only to override your CLI's configured model. You can also set `COUNCIL_PROVIDER`, `COUNCIL_CODEX_MODEL`, or `COUNCIL_CLAUDE_MODEL`. Choose a model that supports images and structured output; research additionally requires the CLI's web tools.

The adapters use `codex exec` with native image attachments and an output schema, or `claude -p` with native image content blocks and `--json-schema`. Wrapper banners are ignored when parsing JSON events. Each role gets a fresh session; continuity comes from the saved research, design brief, scene and reviewer feedback. Workers return data; the coordinator writes scene files. Claude exposes only web tools during research and no built-in tools for the other roles. Codex uses its read-only sandbox and disables nested agents. Existing managed policies remain in effect.

Managed Claude installations may require an organisation network or VPN. If the check reports that its gateway is unreachable, establish that connection and run `claude diagnose`, then retry. A timeout or gateway failure is not treated as a successful review. The adapter does not change authentication, VPN configuration, or organisation policy.

### Work limits

Both CLI runners have the same bounds:

- At most **four concurrent workers**, so the four reviewers run in parallel.
- Default **three revision rounds**, configurable from 1–4.
- At most `3 + 5 × rounds` model calls per investigation (researcher, scientist and designer, then a writer and four reviewers per round), plus one for the coordinator's source finder while that fallback is on (the default) and one for the planner in daily runs: 19 for `lab run` and 20 for `lab daily` at three rounds (`calls_needed` in `lab/pipeline.py`).
- Default **300 seconds per CLI request** (web research gets twice that), configurable with `--timeout`.
- Default **30-minute deadline for model work**, configurable with `--minutes`. The renderer can finish its current capture before the next deadline check; this is not a hard wall-clock limit on the entire application.
- On macOS/Linux, a timed-out worker's entire process group is stopped. If one parallel reviewer fails, the others are cancelled. On Windows, process termination covers the direct CLI process only.
- Drafts and completed reviews survive failures; failed or unreviewed work never replaces the latest accepted artifact.

These limits bound work, not dollar cost. A CLI request may contain several model turns. The direct OpenAI API remains available explicitly:

```sh
# Set OPENAI_API_KEY and OPENAI_MODEL securely in your environment first.
python3 -m lab run --provider openai --rounds 3
```

That adapter uses billable API calls, limits each response to 3,000 output tokens and the research request to three tool calls. CLI-only time limits do not apply to it; each HTTP request has a 180-second timeout.

Exercise the complete renderer/revision pipeline without API calls:

```sh
python3 -m lab run --provider fixture --rounds 3
```

The fixture intentionally fails the first visual review (missing comparison and labels), then applies scripted changes in round two. This is a test fixture, not model intelligence. Real runs pass the actual captured images to separate model calls for each reviewer.

## What the loop does

0. The coordinator (the Python program that runs everything) takes the owner's pick from the site if there is one, otherwise the next ready question; when the owner has sent questions, feedback or guidance notes, a planner chooses among the ready questions instead.
1. Researcher searches for sources and saves source notes. If it fails, a source finder lists candidate pages and the coordinator fetches them.
2. Scientist turns the evidence into a scoped claim, assumptions, prediction, falsifier, limitations, misconceptions and transfer questions.
3. Designer writes the design brief before any narration: the one idea, the everyday starting point, the belief it confronts, how the picture shows the reason, what each chapter shows and when it changes, at most one short label per chapter, and what to try afterwards.
4. Writer creates a validated scene specification that follows the brief: title, chapters, narration, parameters and pacing for the topic's hand-built visual engine.
5. The coordinator captures frames from the actual interactive renderer (an early and a late frame per chapter, the late ones also as the canvas alone, and the phone views) and runs the checks.
6. Four reviewers run in parallel and never see one another's verdicts: accuracy checks the physics or mathematics; visual review checks layout, legibility and progression against the brief; a beginner reviewer answers the research's transfer questions from the frames and subtitles alone and copy-edits the text; a blind viewer sees only the canvas pictures, with no words, and flags anything cluttered, misleading or invisible. Each completed review is saved immediately.
7. Writer receives the reviews and the previous scene, then revises. All versions remain inspectable.

All four reviewers must pass with scores ≥7, no blocking issues, and passing numerical/layout checks. Failure or budget exhaustion retains a draft. Passing model review is **not** proof of scientific correctness or novelty.

When nothing can be investigated (every ready engine already has a guide), the scheduled run asks the designer to sketch the picture the next waiting question needs, once a day, as a proposal for the owner. Engines themselves are built by hand.

Runs are saved in `web/runs/<id>/record.json` with scenes, frames, source notes, review findings, timestamps and provider-reported usage. Only runs that pass every gate can be exported to `web/published/`.

## Boundaries

- Models return data (research records, design briefs, scenes and reviews) checked against fixed schemas and limits, never executable code. Each topic has a hand-built visual engine in `web/scene.js` drawing from an exact model in `web/physics.js`, whose checks run in CI and in every render.
- The planner only chooses among curriculum questions whose engine is marked ready (`READY` in `lab/topics.py`); it may rephrase a question but not change its engine. Exact repeats are rejected deterministically; paraphrased repeats depend on the planner.
- Screen samples support visual review, but do not replace continuous video or temporal-quality review.
- Source URLs are checked against retrieved notes; source reliability and entailment still depend on model review and human inspection.
- Codex, Claude Code, the direct OpenAI API, and the offline fixture share `generate(role, prompt, schema, images, research)`. The coordinator is independent of the model provider.
- There is no video export or voiceover: each guide is an interactive web page with a deterministic `CouncilScene.seek(time, chapter)` capture interface.

## Daily investigations

Scheduled runs come from a separate worker checkout, `~/Projects/the-council-worker`, because launchd cannot run a project kept on the Desktop or in Documents (macOS privacy protection). Manual runs work from any checkout.

Run one daily cycle using existing Claude Code authentication:

```sh
python3 -m lab daily --provider claude --count 1 --rounds 3 --publish
```

Use `--provider codex` for Codex. Without `--publish` an accepted guide is exported locally but not committed or pushed, and the owner's GitHub requests, notifications and the daily project review are skipped. `--count 2` permits up to two attempts per local calendar day, not two guaranteed publications.

An owner pick from the site goes first. Otherwise the run takes the next curriculum item whose model is marked ready in `lab/topics.py` and not already used by a published guide or draft (one picture per guide), without a model call; the planner is called only when the owner left questions, feedback or guidance notes. A question is done once a guide answers it or an attempt with its model reached review. An attempt that stopped early (an error, a time limit, an interrupted run) is retried, the most recent first, and a question rests after three early stops. When nothing qualifies, the run starts nothing and uses no slot. Failed planning, crashes and rejected investigations consume a daily slot to prevent retry loops.

The coordinator uses an OS file lock and persistent `.council-state/history.json` to prevent overlapping daily jobs and duplicate attempts on repeated triggers. It retains draft records in `web/runs/`. Only live runs that pass all four reviews and every render check enter `web/published/`; fixtures are never published as research. The public record includes sources, assumptions, checks, and every revision with its reviews. Passing automated review is not proof of scientific correctness.

Export checks everything before writing and moves the finished guide into `web/published/` in one step. Publication commits only the guides this checkout exported, `web/published/index.json`, `web/dashboard.json`, `web/proposals.json` and any build briefs in `web/briefs/`; it refuses when unrelated changes are staged or the index lists guides that are not committed, and pushes `main` with the existing Git credentials. If GitHub moved on during the run, it replays its own publication commits on top once and pushes again; a conflict leaves the publication pending for the next cycle. Nothing is force-pushed. Keep this checkout on `main`.

To publish an accepted run recorded in another checkout (for example a batch snapshot), use `python3 -m lab export --run-dir <run folder> --publish`; it applies the same gates.

### Schedule on macOS

Generate a launch-agent configuration for 9 AM local time, in the worker checkout:

```sh
python3 -m lab schedule --provider claude --hour 9 --count 1
```

Install the generated configuration (once):

```sh
mkdir -p "$HOME/Library/LaunchAgents"
cp .council-state/org.the-council.daily.plist "$HOME/Library/LaunchAgents/"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/org.the-council.daily.plist"
```

If macOS reports “Operation not permitted”, the checkout is in a protected folder: generate the plist from a checkout outside Desktop and Documents. Git hooks configured via a global `core.hooksPath` inside a protected folder also break background pushes. Do not claim the schedule works until a `launchctl kickstart` smoke test exits successfully.

The generated file uses absolute paths to this checkout and Python interpreter, plus your current PATH; regenerate it if either moves. The Mac must be on and you must be logged in; managed Claude also needs its VPN connection. `caffeinate` prevents idle sleep during a run, but does not power on the Mac or defeat a closed laptop lid. A missed calendar trigger can run on wake; the daily ledger prevents duplicate work. There is no always-on cloud research worker.

Before a publishing run, `scripts/run_daily.py` waits up to 20 minutes for GitHub to answer, since the network or VPN may not be up just after the Mac wakes; if it never answers, nothing starts and the day's attempt is unused. It then fast-forwards the checkout to GitHub's `main` (or replays its own unpushed publication on top), never touching local edits. Each line of `daily.log` starts with the local time.

To pause new investigations and the project review without unloading the schedule, create `.council-state/paused` in the worker (`touch .council-state/paused`) and delete it to resume. A paused cycle uses no slot and still records its check-in on the dashboard.

Check or stop the schedule:

```sh
launchctl print "gui/$(id -u)/org.the-council.daily"
tail -n 50 .council-state/daily.log .council-state/daily-error.log
launchctl bootout "gui/$(id -u)/org.the-council.daily"
```

This scheduler and file lock target macOS/Linux; the generated launch agent is macOS-specific. Logs and history are local and ignored by Git.

## Publish the website

The repository's `.github/workflows/pages.yml` deploys the static site to GitHub Pages on pushes to `main`, or when manually dispatched. In GitHub, open **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions** before the first deployment.

The workflow runs the offline unit tests, checks that the site's scripts parse and that every model's physics checks pass, then uploads an explicit list of public files; it fails if a tracked file under `web/` (other than `web/runs/` and `web/briefs/`) would be left out. The upload includes the accepted `web/published/` archive and excludes local runs, source notes, provider usage metadata, credentials, and runtime files. Asset links carry the commit (`?v=<sha>`) so browsers never mix files from different deploys. The site is at https://eman2xr.github.io/intuition-lab/; agents run only on your own machine.

The status strip shows the current question, phase, revision, recent activity and the configured schedule from `web/dashboard.json`. With `--publish`, safe status snapshots are pushed at most once every two minutes at phase boundaries (plus start and completion), and every daily cycle records a one-line check-in (`checked`), even when it starts nothing. Pages deployment adds latency. The browser refreshes status once a minute and flags stale activity. This is not a streaming heartbeat, and GitHub cannot determine whether the Mac is currently awake. Raw model output and usage metadata are not part of status snapshots.

The home page features the newest published guide and lists every other one, newest first; if none has passed review, it shows the labelled offline example. GitHub Actions only tests and deploys files; model work stays on your machine.

## Install on iPhone

Open https://eman2xr.github.io/intuition-lab/ in Safari, tap **Share → Add to Home Screen**, and open Intuition Lab from the Home Screen. At the bottom of the page, tap **Notify me of new guides**, allow notifications, and send the code it shows to the owner. The owner runs this once in the worker folder (`~/Projects/the-council-worker`):

```sh
python3 -m lab push add '<code>'
python3 -m lab push test
```

After that, the daily run notifies you when a reviewed guide is published, as soon as the site serves it (it checks for up to ten minutes), and sends “Today’s run stopped early” when an attempt stops before review. Drafts and days with nothing to do send nothing. There is no server: the worker's `.council-state` holds the key pair (`vapid.json`, created with `python3 -m lab push keys`; its public key is `web/push.json`) and the subscriptions, and `scripts/push.mjs` sends standard Web Push with Node's built-in crypto.

## Verify

```sh
python3 -m unittest discover -s tests -v
node -e "const c=require('./web/physics.js').allChecks(); const bad=c.filter(x=>!x.pass); console.log(c.length+' checks'); if(bad.length){console.log(bad);process.exit(1)}"
node scripts/push.mjs selftest
python3 -m lab.sitecheck
python3 -m lab run --provider fixture --topic gravity-clocks --rounds 2
```

Physics checks exercise the same JavaScript functions used by the canvas, for every model, as CI does. The push self-test reproduces the RFC 8291 example. `lab.sitecheck` opens the home page and every published guide in a headless browser. The fixture run renders a guide through the whole pipeline without model calls; run it after any change to `web/index.html`, because `lab/render.py` writes into the page. Pipeline tests cover feedback-driven revision, draft retention, scientific vetoes, invalid scenes and provider failures. Adapter tests cover actual subprocess timeout/cancellation, image transport, structured-output parsing, concurrent budgets, and wrapper banners. Live checks are separate from these automated tests.

## Sources and API references

- [Einstein Online: gravitational deflection of light](https://www.einstein-online.info/en/spotlight/light_deflection/)
- [Einstein Online: equivalence principle and light](https://www.einstein-online.info/en/spotlight/equivalence_light/)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Claude Code programmatic use](https://code.claude.com/docs/en/headless)
- [Claude image input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
- [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## License

New visual-lab code is MIT licensed. See `LICENSE`. Existing historical project files retain their original authorship.
