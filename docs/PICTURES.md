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
