// The layout check of lab.render.capture: draws a guide's picture with a recording canvas at stage sizes from phones to
// wide screens, every quarter second of its chapters, for three seconds of play after them and as its preview, and
// reports labels (pills) that leave the picture or overlap each other, and any moment at which the drawing throws.
// Usage: node layout_check.js <web folder> <scene.json>; prints one line of JSON. The site's own files are not changed:
// two hooks are added to an in-memory copy of scene.js, one to record each label and one to reach the engines.
const fs = require('fs'), path = require('path');
const [web, scenePath] = process.argv.slice(2), scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));

// A 2D context that draws nothing but keeps the transform, so labels drawn under translate, scale or rotate are
// placed where the page would put them; text is measured at 0.58 of the font size per character.
function recordingContext() {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [], state = {font: '13px sans-serif', globalAlpha: 1};
  const mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  const own = {
    save() { stack.push([m, {...state}]); }, restore() { const s = stack.pop(); if (s) { m = s[0]; Object.assign(state, s[1]); } },
    reset() { m = [1, 0, 0, 1, 0, 0]; stack.length = 0; state.globalAlpha = 1; },
    translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); }, scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate(r) { const c = Math.cos(r), s = Math.sin(r); m = mul(m, [c, s, -s, c, 0, 0]); },
    transform(a, b, c, d, e, f) { m = mul(m, [a, b, c, d, e, f]); }, setTransform(a, b, c, d, e, f) { m = typeof a === 'object' ? [1, 0, 0, 1, 0, 0] : [a, b, c, d, e, f]; },
    resetTransform() { m = [1, 0, 0, 1, 0, 0]; }, getTransform() { return {a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5]}; },
    measureText(s) { const z = parseFloat(String(state.font).match(/(\d+(\.\d+)?)px/)?.[1] || 13); return {width: String(s).length * z * .58}; },
    createLinearGradient() { return {addColorStop() {}}; }, createRadialGradient() { return {addColorStop() {}}; },
    createConicGradient() { return {addColorStop() {}}; }, createPattern() { return {}; },
    getImageData(x, y, w, h) { return {data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h}; },
    createImageData(w, h) { if (typeof w === 'object') ({width: w, height: h} = w); return {data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h}; },
    isPointInPath() { return false; }, isPointInStroke() { return false; }, getLineDash() { return []; },
    point(x, y) { return [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]]; },
  };
  return new Proxy(state, {
    get(t, k) { if (k in own) return own[k]; if (k in t) return t[k]; return () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const ctx = recordingContext();
const stubCanvas = () => ({getContext: () => ctx, width: 300, height: 150, style: {}, dataset: {}});
global.window = globalThis;
global.document = {getElementById: () => null, createElement: stubCanvas, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, body: {dataset: {}}, documentElement: {dataset: {}}};

let src = fs.readFileSync(path.join(web, 'scene.js'), 'utf8');
const hook = (a, b) => { if (!src.includes(a)) throw new Error('hook not found: ' + a.slice(0, 50)); src = src.replace(a, b); };
hook('function pill(ctx,value,x,y,opts={}){', 'function pill(ctx,value,x,y,opts={}){__pill(ctx,value,x,y,opts);');
hook('window.CouncilBench=', 'window.__layout={ENGINES,timelineOf};window.CouncilBench=');
// Sound lives in the page code, which does not run here: a pluck asked for while drawing is dropped.
if (src.includes('function soundPluck(freq,gain=1){')) hook('function soundPluck(freq,gain=1){', 'function soundPluck(freq,gain=1){return;');
const pills = [];
global.__pill = (c, value, x, y, opts) => {
  if (c !== ctx || c.globalAlpha <= .05) return;
  const z = opts.size || 11; c.font = `${opts.weight || 500} ${z}px sans-serif`;
  const wd = c.measureText(String(value)).width, l = opts.align === 'right' ? x - wd : opts.align === 'center' ? x - wd / 2 : x;
  const pts = [[l - 5, y - z * .75], [l + wd + 5, y - z * .75], [l - 5, y + z * .75], [l + wd + 5, y + z * .75]].map(([px, py]) => c.point(px, py));
  pills.push({v: String(value), x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1]))});
};
eval(fs.readFileSync(path.join(web, 'physics.js'), 'utf8') + '\n' + src);

const {ENGINES, timelineOf} = window.__layout, engine = ENGINES[scene.kind];
const out = {sizes: 0, frames: 0, count: 0, problems: []};
if (!engine) { out.problems.push(`no engine for '${scene.kind}'`); out.count = 1; console.log(JSON.stringify(out)); process.exit(0); }
const tl = timelineOf(scene), C = tl.chapters, labels = scene.show_labels !== false;
const sizes = [[1240, 580], [1176, 384], [1216, 340], [1240, 290], [960, 408], [704, 580], [414, 518], [390, 488], [360, 450], [780, 260]];
out.sizes = sizes.length;
const note = (w, h, where, what) => { out.count++; if (out.problems.length < 8) out.problems.push(`${w}x${h} ${where}: ${what}`); };
for (const [w, h] of sizes) {
  const frame = (st, where) => {
    pills.length = 0; ctx.reset(); out.frames++;
    try { engine.draw(ctx, w, h, scene, st); } catch (e) { note(w, h, where, 'the drawing throws (' + e.message + ')'); return; }
    for (const p of pills) {
      if (p.x0 < -1 || p.x1 > w + 1 || p.y0 < -1 || p.y1 > h + 1) note(w, h, where, `"${p.v}" leaves the picture`);
      for (const q of pills) if (q !== p && (q.v < p.v || (q.v === p.v && pills.indexOf(q) < pills.indexOf(p))) && p.x0 < q.x1 - 1 && p.x1 > q.x0 + 1 && p.y0 < q.y1 - 1 && p.y1 > q.y0 + 1) note(w, h, where, `"${p.v}" overlaps "${q.v}"`);
    }
  };
  const base = {mass: scene.mass ?? 1, distance: scene.distance ?? 1, labels, touched: false, chapters: C};
  for (let i = 0; i < C.length; i++) { const c = C[i]; for (let s = 0; s <= c.end - c.start + 1e-9; s += .25) frame({...base, t: c.start + s, since: s, stage: i, live: false, playing: true}, `chapter ${i + 1} at ${s.toFixed(2)} s`); }
  const last = C[C.length - 1];
  for (let k = 0; k <= 60; k++) frame({...base, t: tl.total + k / 20, since: last.end - last.start + k / 20, stage: C.length - 1, live: true, playing: false}, `after playback at ${(k / 20).toFixed(2)} s`);
  // The card preview's call (app.js): no chapters, stage 2, no labels.
  frame({t: 0, stage: 2, mass: base.mass, distance: base.distance, labels: false}, 'card preview');
}
console.log(JSON.stringify(out));
