# Picture techniques

Reusable ways to draw richer pictures in `web/scene.js` engines, worked out on the arrow-of-time guide (2026-11-25). Everything is plain Canvas 2D, deterministic for a given scene time (seeking must reproduce identical pixels), and needs no page APIs.

## A density field drawn like a shader (liquids, smoke, clouds, heat)

Used by `glassOfCoffee` (milk swirling into iced coffee). Use it whenever many particles stand for something continuous.

1. **Splat particles onto a grid.** Make a `Float32Array(NX*NY)` over the region, for example 44 × 260. Each particle adds a Gaussian (sigma about 0.085 of the region) to the cells within 3 sigma. Splatting is about 30 times cheaper than summing every particle at every cell.
2. **Swirl before splatting.** Displace each particle by a two-octave sine field that depends on position and time, growing with depth. For example, `u += a*(sin(v*12+t*.9+u*4) + .5*sin(v*27-t*1.4+u*9))` with `a = .02+.045*v`. Smooth blobs become curling tendrils. Keep it a function of the scene time `t`.
3. **Normalise, then shape the contrast.** Divide by the fully mixed density. Pass the result through a smoothstep (`e=clamp((m-.04)/.86); k=e*e*(3-2e)`) so clouds have defined edges.
4. **Colour through a ramp, not a straight blend.** `COFFEE_RAMP` runs from coffee through amber and caramel to cream, the way thin milk looks in coffee. Real materials pass through intermediate hues; a two-colour lerp looks muddy.
5. **Draw each row as one horizontal gradient** with a colour stop per cell. Rows overlap by about 0.6 px top and bottom. Abutting `fillRect`s show seams wherever antialiased edges composite over the background, and too few rows show stair-steps, so use about 2 px rows or finer.
6. **Even out with time when the real process mixes finer than the drawing.** Blend each cell toward the field's average (`m + (mean-m)*even`, with `even` growing with mixing time). Otherwise 200 particles stay blotchy when the real thing is a uniform latte. Say so in the disclosure.
7. **Light.** `globalCompositeOperation='screen'` with an amber gradient at the edges makes light glow through the dark liquid without washing out the light parts. A soft multiply-like dark gradient (rgba black, low alpha) gives volume.

## Making an object read as itself

Reviewers judge what the picture looks like before they read a word, so check a blind read first. Pitfalls found so far:

- A glass of dark liquid with bubbles inside and a solid disc on top reads as **stout**. Iced coffee needs ice cubes, no inner bubbles, and a thin translucent meniscus tinted from the liquid below.
- A pale, outlined, slightly tilted stream reads as a **straw**. A pour is opaque white, perfectly vertical, narrows as it falls, fades in at its top (or starts off the frame), has a soft shadow on one side and a bloom where it lands, and is drawn in front of whatever it lands among.
- Glass: thick walls, a heavy translucent base, a bright rim ellipse, one wide soft reflection and one thin one, and a soft radial shadow underneath.
- Keep labels clear of the drawing at every stage size; `lab/layout_check.js` only checks labels against each other and the frame.

## Posters and card thumbnails

The owner wants each guide's thumbnail to hint at the main subject in an interesting way. It does not have to be a frame from the video.

- Draw it in the engine's preview branch (`st.since===undefined`), which `python3 -m lab poster <id>` and the home-page cards both use. A poster can paint its own full background (`expansionPoster` paints a night sky).
- Make it one striking image with no labels: milk pouring into iced coffee for the arrow of time, and a light wave stretching from blue to red across a sky of galaxies for the expanding universe. Avoid half-empty graphs, small details lost at card size, and a plain repeat of chapter 1.
- Check it at card size, about 270 × 150, as well as full size, and have a reviewer give a blind read: what does it show, and does it hint at the question?

## Film-look guides (pre-rendered video)

Where a subject would gain from cinematic pictures (space, light, matter at scales we cannot see) and nothing needs to be played with, a guide can be made as a pre-rendered film. The engine is `film/engine.js`, modelled on *The Arrow of Time* (github.com/abhishekpradhan/the-arrow-of-time: ideas, not code), with `film/holography.js` as the worked example and `lab/film.py` to render and encode. It is the owner's preferred look for such subjects (2026-11-28), but not for every guide: diagrams, plots and things the viewer plays with stay in the live 2D engines.

- **HDR light, then a finish.** Shots draw linear light that can be far brighter than white. The finish adds bloom (a downsampled pyramid), halation (a red-orange glow round highlights), ACES tonemapping, a gentle split-tone grade, slight chromatic aberration, a vignette and fine grain. Keep skies truly black and let only emissive things reach white, or nothing blooms and the picture goes flat.
- **Motion.** Average several sub-frame samples over the shutter (motion blur), each with a Halton sub-pixel jitter (anti-aliasing). Ease every camera move (`keys` with inOutSine or inOutCubic), keep a slow drift or orbit going, and dissolve between shots. Things should arrive, grow and fade, not pop.
- **Real things built from real data.** Earth from Natural Earth maps (`film/assets/earth/`) with warped-noise clouds, an ocean glint, city lights and a shell of air. Black holes from light traced along its real paths. Stars as Gaussian points whose colour is their flux, sparse and mostly faint.
- **Fine structure, high contrast.** A disk of gas is many thin ringlets with gaps, partly see-through, not one smooth band. Glows sit on near-black.
- **Captions, not labels.** On-picture words are thin, letterspaced captions laid out as HTML over the video (`.film-caption`), and only where they add something the picture cannot say: a count or a name the viewer needs. Never label what is obvious (an Earth, a book, a black hole).
- **Narration, read live.** A film can be read aloud by a Gemini voice (owner's test, 2026-11-28): with `narration: {live: true, voice: 'Algenib'}` in the scene, the timeline also gives each line time to be spoken at the voice's pace (`READING.voice` in `web/scene.js`, so render the film after setting it), and on a device that keeps a Gemini key the page asks the quickest Live API model (`gemini-3.1-flash-live-preview`) for each line a few lines ahead and starts it when the film reaches it (`narrator` in `web/talk.js`). It starts within about 0.05 s of each subtitle, and within three lines after a jump. Visitors without a key see the silent film with subtitles. `lab/narrate.py` is the pre-recorded alternative (text-to-speech in a few batched requests, cut at the pauses and checked by transcription; the free tier allows 10 requests a day), with `lab/film.py --audio`. Give a speech model directions in its "director's notes" layout: a plain "Read this calmly: ..." prefix is read aloud.
- **Lessons from the expansion film's blind tests (2026-11-28).** Ring and caption the thing a motion is seen from (our galaxy, then another), or "no centre" never reads. A glow that fills all of space must be seen from inside it, reaching every edge of the frame; a bounded glowing ball reads as the Sun, and rays leaving a central dot read as an explosion. Hold colours stretched past what the eye sees at its deepest red or violet, or the waves reaching "you" vanish. Do not put a later discovery's look into an earlier scene (the 1964 antenna heard an even glow; the mottled map came from satellites). A pulsing star needs its light curve drawn under it to read in a still. Trails behind moving galaxies should be soft and fade toward their tail; hard thin streaks read as glitches or comets.
- **Check like the film does:** render stills of every shot at preview size (`--frames`), compare them side by side with the reference film's frames, and fix exposure and balance before the full render. A full guide renders in a few minutes. Keep videos small: grain and dense stars cost bitrate (CRF 28 at 1280x720 gave 22 MB for 112 s; aim lower).
