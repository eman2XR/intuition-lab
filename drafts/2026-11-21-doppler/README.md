# Draft: Why does a passing siren drop in pitch?

A hand-made guide for a new curriculum item 3.5, kept as a draft on 2026-11-21. After three review rounds the final
accuracy review failed on one play-mode bug: the after-playback note plot pinned notes flat on its edges during drags.
That is fixed here (the plot's range covers every plotted note); the final visual review was stopped to save cost. It
needs a fresh round of the four reviews before it can be published.

- `web/scene.js`, `web/physics.js` and `web/app.js` on this branch already have the engine spliced in (`doppler`: a night
  street seen from above, the siren's sound as glowing rings; a steady tone for the heard note through `soundTone`).
  Open the draft locally with `?draft=20261121T235900-doppler`.
- `doppler-scene.js`, `doppler-entry.js` and `doppler-physics.js` are the engine's own code, and `splice.py source target`
  splices them into a copy of `web/` (`python3 splice.py web web` on a clean main).
- `scene.json` and `research.json` are the guide and its research record (sources fetched from Wikipedia).
- `sweep-dp.js` checks the labels at 140 canvas sizes; `publish-dp.py` publishes the guide once its reviews pass and adds
  curriculum item 3.5.
