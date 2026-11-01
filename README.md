# Intuition Lab

![The lab at work: AI agents researching, drawing and reviewing a guide](docs/images/lab.png)

Intuition Lab is a team of AI agents working together to produce short, intuitive guides that explain why things work. Why is the sky blue? Why do just 23 people give even odds of a shared birthday? Each guide answers one question with a short animation you can play with.

**[Open the site →](https://eman2xr.github.io/intuition-lab/)**

They make one a day. One reads up and finds sources, one writes up the science, one plans the picture and one writes the words. Four reviewers then check the rendered result: one for accuracy, one for the visuals, one reading as a beginner, and one who sees only the pictures. If any of them isn't convinced, it goes back for another draft. Only guides that pass all four go live.

The pictures are drawn in code on top of exact models, so the numbers you see are the real ones.

![From "Why is the night sky dark?": only light from within 13.8 billion light-years has had time to reach us](docs/images/night-sky.jpg)

The older persona-debate experiment lives in `council.py`. If you're a coding agent, start with [the handoff](docs/HANDOFF.md) and [CLAUDE.md](CLAUDE.md).

## Run locally

Requires Python 3.10+, Node.js for the optional physics checks, and Chromium through Playwright.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m playwright install chromium
python3 -m http.server 8765 --directory web
```

Open **http://127.0.0.1:8765** to browse the site locally. The site is static: investigations are made by the commands below and published as files.

## Choose Codex or Claude Code

The default runner is **Codex**. Both CLIs use their existing authentication and model configuration; Intuition Lab does not extract credentials or require a separate OpenAI API key for these runners. Their normal subscription, organization, or API billing and usage limits still apply.

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

The adapters use `codex exec` with native image attachments and an output schema, or `claude -p` with native image content blocks and `--json-schema`. Wrapper banners are ignored when parsing JSON events. Each role gets a fresh session; continuity comes from the saved research, scene and reviewer feedback. Workers return data; the coordinator writes scene files. Claude exposes only web tools during research and no built-in tools for the other roles. Codex uses its read-only sandbox and disables nested agents. Existing managed policies remain in effect.

Managed Claude installations may require an organization network or VPN. If the check reports that its gateway is unreachable, establish that connection and run `claude diagnose`, then retry. A timeout or gateway failure is not treated as a successful review. The adapter does not change authentication, VPN configuration, or organization policy.

### Work limits

Both CLI runners have the same bounds:

- At most **two concurrent workers**. Physics and visual reviews run independently in parallel.
- Default **three revision rounds**, configurable from 1–4.
- At most `2 + 3 × rounds` CLI requests per investigation (11 by default).
- Default **300 seconds per CLI request**, configurable with `--timeout`.
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

0. The coordinator (the Python program that runs everything) takes the next ready question; when the owner has sent questions, feedback or guidance notes, a planner chooses among the ready questions instead.
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

## Boundaries of this milestone

- Two supported visual primitives: weak-field light bending and stationary gravitational clock comparison. The planner proposes questions within these models, not arbitrary scientific topics or animation code. It receives recent history to avoid paraphrased repeats; exact repeats are rejected deterministically. Semantic novelty still depends on the planner.
- The director changes scene **data**, not executable code or the physics implementation.
- First-order model: `m = GM/c² = 0.025 × mass`, impact parameter `b = distance`, and `y(x) = b − 2m/b × (sqrt(x²+b²)+x)`. The asymptotic bending angle is `4m/b`. Controls ensure `m/b ≤ 0.025`.
- Vertical deviation is magnified 6× and labeled. The grid is a coordinate reference; the object's radius and marker speed are illustrative. No black holes or strong-field claims.
- Screen samples support visual review, but do not replace continuous video or temporal-quality review.
- Source URLs are checked against retrieved notes; source reliability and entailment still depend on model review and human inspection.
- Codex, Claude Code, the direct OpenAI API, and the offline fixture share `generate(role, prompt, schema, images, research)`. The coordinator is independent of the model provider.
- HyperFrames video export, voiceover, broader scene generation and notifications are follow-on work. The current artifact is an interactive webpage with a deterministic `CouncilScene.seek(time, beat)` capture interface.

## Daily investigations

Deployment note: the first live clock guide passed review. On the original Desktop checkout, unattended launchd execution is currently blocked by macOS folder privacy; see the [handoff](docs/HANDOFF.md) for the required worker-location/permission step. The public dashboard reports this pause. Manual runs work.

Run one daily cycle using existing Claude Code authentication:

```sh
python3 -m lab daily --provider claude --count 1 --rounds 3 --publish
```

Use `--provider codex` for Codex. Omit `--publish` to export accepted guides locally without committing or pushing. `--count 2` permits up to two attempts per local calendar day, not two guaranteed publications. The daily run plans without a model call unless the owner left questions or feedback: it takes the next curriculum item whose model is marked ready in `lab/topics.py` and not already used by a published guide or draft; when none qualifies it starts nothing and uses no slot. Each investigation then uses at most `3 + 4 × rounds` research/director/reviewer calls (16 with the planner at three rounds), with the same 30-minute model-work deadline and three concurrent reviewers. Failed planning, crashes, and rejected investigations consume a daily slot to prevent retry loops.

The coordinator uses an OS file lock and persistent `.council-state/history.json` to prevent overlapping daily jobs and duplicate attempts on repeated triggers. It retains draft records in `web/runs/`. Only live runs that pass both reviews and all render checks enter `web/published/`; fixtures are never published as research. The public record includes sources, assumptions, checks, and visual revision history. Passing automated review is not proof of scientific correctness.

Publication commits only `web/published/` and `web/dashboard.json` and pushes `main` using the existing Git credentials. It refuses to commit when unrelated changes are staged. A failed push leaves the export on disk and is retried on the next cycle. A remote conflict is not force-pushed or automatically merged: resolve it locally, then rerun the daily command. Keep this checkout on `main` and sync it before making changes elsewhere.

### Schedule on macOS

Generate a launch-agent configuration for 9 AM local time:

```sh
python3 -m lab schedule --provider claude --hour 9 --count 1
```

Install the generated configuration (once):

```sh
mkdir -p "$HOME/Library/LaunchAgents"
cp .council-state/org.the-council.daily.plist "$HOME/Library/LaunchAgents/"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/org.the-council.daily.plist"
```

If macOS reports “Operation not permitted” for a project on Desktop/Documents, the launch agent is blocked by privacy protection. Run the schedule from a separate checkout outside those folders (for example `~/Projects/the-council-worker`) and generate the plist from there. Git hooks configured via a global `core.hooksPath` inside a protected folder also break background pushes. Do not claim the schedule works until a `launchctl kickstart` smoke test exits successfully.

The generated file uses absolute paths to this checkout and Python interpreter, plus your current PATH. Regenerate it if either moves. The Mac must be on and you must be logged in; managed Claude also needs its VPN connection. `caffeinate` prevents idle sleep during a run, but does not power on the Mac or defeat a closed laptop lid. A missed calendar trigger can run on wake; the daily ledger prevents duplicate work. There is no always-on cloud research worker.

Check or stop the schedule:

```sh
launchctl print "gui/$(id -u)/org.the-council.daily"
tail -n 50 .council-state/daily.log .council-state/daily-error.log
launchctl bootout "gui/$(id -u)/org.the-council.daily"
```

This scheduler and file lock target macOS/Linux; the generated launch agent is macOS-specific. Logs and history are local and ignored by Git.

The clock model compares supported stationary observers at radii `r` and `r+2` outside a nonrotating spherical mass: `lower/upper = sqrt((1-2m/r)/(1-2m/(r+2)))`, with `m=.025×mass`. The relative clock-hand speed difference is magnified 12×; the percentage readout is unmagnified. Spatial positions are schematic. This is not a GPS, orbit, or black-hole simulation. See [NIST's optical-clock measurements](https://www.nist.gov/publications/relativity-and-optical-clocks).

## Publish the website

The repository's `.github/workflows/pages.yml` deploys the static demo to GitHub Pages on pushes to `main`, or when manually dispatched. In GitHub, open **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions** before the first deployment.

The workflow runs the offline unit tests and physics checks, then uploads an explicit list of public website assets. It includes the accepted `web/published/` archive and excludes local runs, source notes, provider usage metadata, credentials, and runtime files. The hosted edition disables the agent-run button; agents still run on your own machine. The expected project URL after a successful deployment is https://eman2XR.github.io/the-council/.

The dashboard shows the current question, phase, revision, recent activity, daily attempts, and configured schedule. With `--publish`, safe status snapshots are pushed at most once every two minutes at phase boundaries (plus start/completion); Pages deployment adds latency. The browser refreshes status once a minute and flags stale activity. This is not a streaming heartbeat, and GitHub cannot determine whether the Mac is currently awake. Raw model output, internal errors, and usage metadata are not part of status snapshots.

The public homepage opens the newest accepted guide; archive links retain older guides. If no guide has passed review, it displays the labeled offline example. GitHub Actions only tests and deploys files; model work stays on your machine.

## Verify

```sh
python3 -m unittest discover -s tests -v
node -e "const p=require('./web/physics.js'); console.log(p.checks()); if(p.checks().some(c=>!c.pass))process.exit(1)"
python3 -m lab run --provider fixture
```

Physics checks exercise the same JavaScript functions used by the canvas. Pipeline tests cover feedback-driven revision, draft retention, scientific vetoes, invalid scenes and provider failures. Adapter tests cover actual subprocess timeout/cancellation, image transport, structured-output parsing, concurrent budgets, and wrapper banners. Live checks are separate from these automated tests.

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
