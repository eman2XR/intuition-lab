/* Shared by the interactive renderer and executable numerical checks. */
(function(root) {
  const Physics = {
    m: mass => 0.025 * mass,
    deflection(mass, b) { return 4 * this.m(mass) / b; },
    deviation(x, mass, b) { return -2 * this.m(mass) / b * (Math.hypot(x, b) + x); },
    slope(x, mass, b) { return -2 * this.m(mass) / b * (x / Math.hypot(x, b) + 1); },
    // Optical geometry for the light mesh: distance is light travel time timed far away, n = 1 + 2mu/R
    // (weak field, isotropic radius R). Embedded as a surface of revolution: circumference radius R + 2mu,
    // height z with (dR)^2 + (dz)^2 = (n dR)^2, so straightest lines on the surface are light paths.
    meshHeight(mu, R) {
      if (mu < 1e-9) return 0;
      const q = Math.sqrt(mu * (R + mu));
      return 4 * (q + mu / 2 * Math.log((q - mu) / (q + mu)));
    },
    // Light path through n = 1 + 2mu/R, entering parallel to x at height b; returns [x, y] points.
    lightPath(mu, b, x0 = -7.5, x1 = 7.5, steps = 360) {
      const accel = (x, y) => { const r = Math.hypot(x, y), n = 1 + 2 * mu / r, g = -2 * mu / (r * r * r) * n; return [g * x, g * y]; };
      let x = x0, y = b, n = 1 + 2 * mu / Math.hypot(x, y), px = n, py = 0;
      const h = (x1 - x0) / steps, points = [[x, y]];
      for (let i = 0; i < steps * 3 && x < x1; i++) {
        // Hamiltonian ray tracing: dx/dt = p, dp/dt = n grad n, with |p| = n.
        const f = (X, Y, PX, PY) => { const [ax, ay] = accel(X, Y); return [PX, PY, ax, ay]; };
        const k1 = f(x, y, px, py), k2 = f(x + h / 2 * k1[0], y + h / 2 * k1[1], px + h / 2 * k1[2], py + h / 2 * k1[3]);
        const k3 = f(x + h / 2 * k2[0], y + h / 2 * k2[1], px + h / 2 * k2[2], py + h / 2 * k2[3]);
        const k4 = f(x + h * k3[0], y + h * k3[1], px + h * k3[2], py + h * k3[3]);
        x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        px += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]); py += h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
        points.push([x, y]);
      }
      return points;
    },
    clockRatio(mass,r) { return Math.sqrt((1-2*this.m(mass)/r)/(1-2*this.m(mass)/(r+2))); },
    // Special relativity in units where light speed is 1 (years and light-years).
    speed: a => 0.9 * a,
    gamma(v) { return 1 / Math.sqrt(1 - v * v); },
    turnaround: b => 1.6 * b,
    agingGap(a) { return 1 - 1 / this.gamma(this.speed(a)); },
    // Light clock of height 1 moving sideways at v (light speed 1): one tick lasts T with T = hypot(1, v T).
    lightTick(v) { return 1 / Math.sqrt(1 - v * v); },
    // Spacetime length of a straight step: the time a clock carried along it shows.
    properTime(t, x) { return Math.sqrt(t * t - x * x); },
    // Two coherent sources or slits with amplitudes 1 and a.
    visibility: a => 2 * a / (1 + a * a),
    separation: b => 1.6 * b,
    // Absolute brightness relative to two equal in-phase sources at a bright stripe (maximum 1).
    brightness(a, phase) { return (1 + a * a + 2 * a * Math.cos(phase)) / 4; },
    intensity(a, phase) { return (1 + a * a + 2 * a * Math.cos(phase)) / ((1 + a) * (1 + a) || 1); },
    // A rope shaken at one end and tied to a wall: the damped wave equation, rope length 1, waves at speed 2, so the
    // slowest in-step shaking is one shake a second (drawn slowed down). Friction gamma sets how big an in-step swing
    // grows (about 6 times the hand) and how fast it builds (a few seconds).
    ropeModel: {c: 2, gamma: .33, N: 100, A: .024},
    ropeStart() {
      const N = this.ropeModel.N;
      return {t: 0, y: new Float64Array(N + 1), old: new Float64Array(N + 1), nw: new Float64Array(N + 1)};
    },
    // Advance the rope to time t1. hand(t) is the hand's height; the wall end never moves.
    ropeStep(s, t1, hand) {
      const {c, gamma, N} = this.ropeModel, dx = 1 / N, dt = .4 * dx / c, r2 = (c * dt / dx) ** 2;
      while (s.t + dt <= t1 + 1e-9) {
        s.t += dt;
        const {y, old, nw} = s;
        for (let i = 1; i < N; i++) nw[i] = (2 * y[i] - (1 - gamma * dt) * old[i] + r2 * (y[i + 1] - 2 * y[i] + y[i - 1])) / (1 + gamma * dt);
        nw[0] = hand(s.t); nw[N] = 0;
        s.old = y; s.y = nw; s.nw = old;
      }
      return s;
    },
    // How far the rope swings, as a multiple of the hand's swing, from its total energy: steady through each swing,
    // and exact for a standing wave of height Y, whose energy is Y^2 w^2 / 4.
    ropeSize(s, rate) {
      const {c, N, A} = this.ropeModel, dx = 1 / N, dt = .4 * dx / c;
      let E = 0;
      for (let i = 0; i < N; i++) { const v = (s.y[i] - s.old[i]) / dt, g = (s.y[i + 1] - s.y[i]) / dx; E += (v * v + c * c * g * g) * dx / 2; }
      return 2 * Math.sqrt(E) / (2 * Math.PI * Math.max(rate, .25)) / A;
    },
    // The hand: one up-and-down shake, or steady shaking with rates [[from, shakes a second], ...], easing in and out.
    ropeHand(plan) {
      const {A} = this.ropeModel, ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
      // The single shake is bigger than steady shaking, so its hump is easy to follow.
      if (plan.pulse) return t => t > 0 && t < .3 ? 2.5 * A * Math.sin(Math.PI * t / .3) ** 2 : 0;
      const rates = plan.rates, start = rates[0][0];
      return t => {
        let phase = 0;
        for (let k = 0; k < rates.length; k++) {
          const [t0, r] = rates[k], t1 = k + 1 < rates.length ? rates[k + 1][0] : Infinity;
          if (t <= t0) break;
          phase += 2 * Math.PI * r * (Math.min(t, t1) - t0);
        }
        const on = ease((t - start) / .6) * (plan.stop != null ? 1 - ease((t - plan.stop) / .5) : 1);
        return (plan.amp ?? 1) * A * on * Math.sin(phase);
      };
    },
    // A plucked string: pulled into a sharp bend at fraction p of its ringing length and let go. Its shape is a sum of
    // in-step patterns n (sin(n pi u)) with heights 2 sin(n pi p) / (n^2 pi^2 p (1 - p)); each swings n times per slowest
    // swing and fades, the faster ones sooner, so the string settles into mostly the slowest pattern: its note.
    // Drawn slowed down: the slowest swing takes 1 second for the open string; length len scales it to 1 / len.
    stringPluckAt: .25,
    stringMode(n, p = .25) { return 2 * Math.sin(n * Math.PI * p) / (n * n * Math.PI * Math.PI * p * (1 - p)); },
    stringFade: n => .1 + .25 * (n - 1),
    // The slowest swing of the ringing part, in drawn swings a second: a shorter string swings faster.
    stringRate: len => 1 / len,
    stringY(u, t, len = 1, M = 16) {
      let y = 0;
      for (let n = 1; n <= M; n++) y += this.stringMode(n, this.stringPluckAt) * Math.sin(n * Math.PI * u) * Math.cos(2 * Math.PI * n * this.stringRate(len) * t) * Math.exp(-this.stringFade(n) * t);
      return y;
    },
    stringChecks() {
      const p = this.stringPluckAt;
      // Share of the swing energy in the slowest pattern, at time t.
      const share = t => { let all = 0; for (let n = 1; n <= 16; n++) all += (this.stringMode(n, p) * n * Math.exp(-this.stringFade(n) * t)) ** 2; return (this.stringMode(1, p) * Math.exp(-this.stringFade(1) * t)) ** 2 / all; };
      return Object.entries({
        'A pluck starts as a sharp bend at the pluck point': Math.abs(this.stringY(p, 0, 1, 60) - 1) < .03 && Math.abs(this.stringY(.625, 0, 1, 60) - .5) < .03,
        'Both ends of the ringing string stay still': [0, 1].every(u => Math.abs(this.stringY(u, .37)) < 1e-9),
        'Faster patterns fade first, leaving mostly the slowest': share(0) < .8 && share(4) > .9,
        'Half the string rings twice as fast': this.stringRate(.5) === 2 * this.stringRate(1),
      }).map(([name, pass]) => ({name, pass}));
    },
    // Exact steady swing for steady shaking, as a multiple of the hand's swing: y(x) = sin(k(1 - x)) / sin(k) with the
    // complex wave number k^2 = (w^2 - 2 i gamma w) / c^2 of the damped rope.
    ropeSteady(rate) {
      const {c, gamma} = this.ropeModel, w = 2 * Math.PI * rate, re = w * w / (c * c), im = -2 * gamma * w / (c * c);
      const mod = Math.hypot(re, im), kr = Math.sqrt((mod + re) / 2), ki = -Math.sqrt((mod - re) / 2);
      const sinAbs = (a, b) => Math.hypot(Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b));
      let m = 0; for (let i = 0; i <= 100; i++) { const u = 1 - i / 100; m = Math.max(m, sinAbs(kr * u, ki * u)); }
      return m / sinAbs(kr, ki);
    },
    // Quantum models in units where hbar = 1 and 2m = 1, so energy E = k^2.
    cx: {
      add:(a,b)=>[a[0]+b[0],a[1]+b[1]], sub:(a,b)=>[a[0]-b[0],a[1]-b[1]],
      mul:(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]],
      div(a,b){const d=b[0]*b[0]+b[1]*b[1];return [(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];},
      exp:z=>{const m=Math.exp(z[0]);return [m*Math.cos(z[1]),m*Math.sin(z[1])];},
      scale:(a,s)=>[a[0]*s,a[1]*s], abs2:a=>a[0]*a[0]+a[1]*a[1],
    },
    barrier(a, b) {
      // Particle energy 1 (k = 1) meets a rectangular barrier of height 2a and width 0.6b.
      const C=this.cx, E=1, k=1, V=2*a+(Math.abs(2*a-1)<1e-6?1e-6:0), w=.6*b;
      const q=E>=V?[Math.sqrt(E-V),0]:[0,Math.sqrt(V-E)];
      const i=[0,1], iq=C.mul(i,q), eiqa=C.exp(C.scale(iq,w)), emiqa=C.exp(C.scale(iq,-w));
      const cosqa=C.scale(C.add(eiqa,emiqa),.5), sinqa=C.div(C.sub(eiqa,emiqa),[0,2]);
      const sHalf=C.scale(C.add(C.div([k,0],q),C.div(q,[k,0])),.5);
      const teika=C.div([1,0],C.sub(cosqa,C.mul(i,C.mul(sHalf,sinqa))));
      const t=C.mul(teika,C.exp([0,-k*w]));
      const c=C.mul(C.scale(teika,.5),C.mul(C.add([1,0],C.div([k,0],q)),emiqa));
      const d=C.mul(C.scale(teika,.5),C.mul(C.sub([1,0],C.div([k,0],q)),eiqa));
      const r=C.sub(C.add(c,d),[1,0]);
      const psi=x=>{
        if(x<0)return C.add(C.exp([0,k*x]),C.mul(r,C.exp([0,-k*x])));
        if(x<=w)return C.add(C.mul(c,C.exp(C.scale(iq,x))),C.mul(d,C.exp(C.scale(iq,-x))));
        return C.mul(t,C.exp([0,k*x]));
      };
      return {E,V,w,r,t,T:C.abs2(t),R:C.abs2(r),psi};
    },
    // A blend of waves k = kc + j*delta with amplitudes from a bell curve of width sk (all equal when sk = 0), every
    // wave at its crest at x = 0. Waves 2*pi/delta apart in x line up again, so delta keeps one burst in view.
    blendDelta: Math.PI / 16, blendCentre: 2.6,
    blendAmp(j, sk) { return sk > 0 ? Math.exp(-((j * this.blendDelta) ** 2) / (4 * sk * sk)) : 1; },
    blendRange(sk) { const n = sk > 0 ? Math.min(12, Math.ceil(3 * sk / this.blendDelta)) : 0; return Array.from({length: 2 * n + 1}, (_, i) => i - n); },
    blendWaves(comps) {
      const D = this.blendDelta, kc = this.blendCentre, tot = comps.reduce((s, [, a]) => s + a, 0) || 1;
      const sum = x => comps.reduce((s, [j, a]) => s + a * Math.cos((kc + j * D) * x), 0) / tot;
      const env = x => { let re = 0, im = 0; for (const [j, a] of comps) { const k = kc + j * D; re += a * Math.cos(k * x); im += a * Math.sin(k * x); } return Math.hypot(re, im) / tot; };
      return {sum, env};
    },
    blendSpread(sk, X = 16) {
      const B = this.blendWaves(this.blendRange(sk).map(j => [j, this.blendAmp(j, sk)]));
      let s = 0, s1 = 0, s2 = 0; const n = 4000;
      for (let i = 0; i < n; i++) { const x = -X + 2 * X * i / n, v = B.env(x) ** 2; s += v; s1 += v * x; s2 += v * x * x; }
      const m = s1 / s; return Math.sqrt(s2 / s - m * m);
    },
    // The spread of wave numbers (speeds) in a blend's recipe, each wave weighted by its share of the intensity.
    blendSpeedSpread(sk) {
      const js = this.blendRange(sk), w = js.map(j => this.blendAmp(j, sk) ** 2), all = w.reduce((s, x) => s + x, 0);
      return Math.sqrt(js.reduce((s, j, i) => s + w[i] * (j * this.blendDelta) ** 2, 0) / all);
    },
    blendChecks() {
      const D = this.blendDelta, two = this.blendWaves([[-1, 1], [1, 1]]);
      const spreads = [.12, .25, .5].map(sk => this.blendSpread(sk));
      return Object.entries({
        'Two waves line up at the centre and cancel halfway to the next line-up': Math.abs(two.sum(0) - 1) < 1e-12 && two.env(Math.PI / (2 * D)) < 1e-9,
        'A bell-curve blend leaves one burst in view': [.25, .5].every(sk => { const B = this.blendWaves(this.blendRange(sk).map(j => [j, this.blendAmp(j, sk)])), sx = this.blendSpread(sk);
          let side = 0; for (let i = 0; i <= 800; i++) { const x = -16 + 32 * i / 800; if (Math.abs(x) > 3 * sx) side = Math.max(side, B.env(x)); } return side < .12; }),
        'Burst width times blend width is the smallest allowed, one half': [.12, .25, .5].every((sk, i) => Math.abs(spreads[i] * sk - .5) < .02),
        'A wider blend gives a narrower burst': spreads[2] < spreads[1] && spreads[1] < spreads[0],
        'One wave alone is spread evenly everywhere': (() => { const B = this.blendWaves([[0, 1]]); return [0, 3.7, 11.2].every(x => Math.abs(B.env(x) - 1) < 1e-12); })(),
      }).map(([name, pass]) => ({name, pass}));
    },
    well(a, b) {
      // Bound states of a finite square well of depth 25a and width 1+(b-1); returns sorted levels.
      const V=25*a, L=1+(b-1), z0=L/2*Math.sqrt(V), levels=[];
      if(V<=0)return {V,L,levels};
      const root=(f,lo,hi)=>{for(let n=0;n<80;n++){const m=(lo+hi)/2;if(f(lo)*f(m)<=0)hi=m;else lo=m;}return (lo+hi)/2;};
      for(let n=0;;n++){
        const even=z=>z*Math.tan(z)-Math.sqrt(Math.max(0,z0*z0-z*z)), odd=z=>-z/Math.tan(z)-Math.sqrt(Math.max(0,z0*z0-z*z));
        let added=false;
        if(z0>n*Math.PI){const z=root(even,n*Math.PI+1e-9,Math.min(n*Math.PI+Math.PI/2-1e-9,z0));levels.push({z,parity:'even'});added=true;}
        if(z0>n*Math.PI+Math.PI/2){const z=root(odd,n*Math.PI+Math.PI/2+1e-9,Math.min(n*Math.PI+Math.PI-1e-9,z0));levels.push({z,parity:'odd'});added=true;}
        if(!added)break;
      }
      for(const l of levels){const k=2*l.z/L;l.E=k*k-V;l.k=k;l.kappa=Math.sqrt(Math.max(0,-l.E));}
      levels.sort((p,q)=>p.E-q.E);
      const psi=(l,x)=>{const h=L/2, inside=l.parity==='even'?Math.cos(l.k*x):Math.sin(l.k*x);
        if(Math.abs(x)<=h)return inside;
        const edge=l.parity==='even'?Math.cos(l.k*h):Math.sin(l.k*h)*Math.sign(x);
        return edge*Math.exp(-l.kappa*(Math.abs(x)-h));};
      return {V,L,levels,psi};
    },
    // The speed limit: a rocket fires the same push again and again, each leaving it at half light speed relative to a
    // marker it dropped just before. Every push adds the same rapidity, atanh(1/2), so seen from the ground the speed
    // after n pushes is tanh(n atanh(1/2)) and never reaches light speed, while everyday adding would give n/2. The
    // kinetic energy of each kilogram, seen from the ground, per unit of its rest energy, is cosh(n atanh(1/2)) - 1.
    // Units: c = 1.
    limitPush: Math.atanh(.5),
    limitSpeed(n) { return Math.tanh(n * this.limitPush); },
    limitEveryday(n) { return n * .5; },
    limitEnergy(n) { return Math.cosh(n * this.limitPush) - 1; },
    combine(u, v) { return (u + v) / (1 + u * v); },
    limitChecks() {
      const near = (a, b, e = 1e-12) => Math.abs(a - b) < e, v = n => this.limitSpeed(n), E = n => this.limitEnergy(n);
      return Object.entries({
        'One push from rest reaches half light speed': near(v(1), .5),
        'Two pushes reach 80% of light speed, not light speed': near(v(2), .8),
        'Speeds combine as (u + v) / (1 + uv)': [1, 2, 3, 5, 8].every(n => near(this.combine(v(n), .5), v(n + 1))),
        'No number of pushes reaches light speed': [1, 5, 10, 20].every(n => v(n) < 1),
        'Each push adds less speed than the one before': [1, 2, 3, 4, 5, 6].every(n => v(n + 1) - v(n) < v(n) - v(n - 1)),
        'Everyday adding would reach light speed after two pushes and pass it after three': near(this.limitEveryday(2), 1) && this.limitEveryday(3) > 1,
        'Light from a moving lamp still travels at light speed': [0, .5, .8, .99].every(u => near(this.combine(u, 1), 1)),
        'In the crew’s own view, light leaves at light speed after every push': [0, 1, 2, 3, 6, 10].every(n => near(this.combine(-v(n), 1), 1)),
        'Each push adds more energy than the one before': [1, 2, 3, 4, 5].every(n => E(n + 1) - E(n) > E(n) - E(n - 1)),
        'The energy grows without limit': E(20) > 1e4 && E(21) > E(20),
        'At everyday speeds the two ways of adding agree': near(this.combine(1e-6, 1e-6), 2e-6, 1e-15),
      }).map(([name, pass]) => ({name, pass}));
    },
    // Why the night sky is dark (Olbers' paradox), in light-years and years. Stars are treated as Sun-like and spread
    // evenly: about 1e22 of them in today's observable universe (radius 46.5 billion light-years), a common rough count
    // (estimates run from 1e22 to 1e24). A shell of radius r and thickness dr holds density 4 pi r^2 dr stars, each
    // seen 1 / (4 pi r^2) as bright, so every shell adds the same light and covers the same share of the sky. For stars
    // placed at random, the share of sky covered by discs closer than D is 1 - exp(-D / L), where L = 1 / (density pi R^2)
    // is the typical distance a sight line travels before meeting a star; the sky's brightness, as a fraction of a
    // star's surface, is that same share (distance does not dim a surface, it only shrinks it). In an unchanging
    // universe whose stars have shone for t years, only light from within D = t light-years has arrived. Expansion is
    // left out: it stretches and dims distant light further, a smaller effect.
    nightModel: {stars: 1e22, reach: 4.65e10, radius: 6.957e5 / 9.4607e12, age: 1.38e10, sunAngle: 6.957e5 / 1.496e8},
    nightDensity() { const {stars, reach} = this.nightModel; return stars / (4 / 3 * Math.PI * reach ** 3); },
    nightFree() { return 1 / (this.nightDensity() * Math.PI * this.nightModel.radius ** 2); },
    // Share of the sky covered by star discs closer than D light-years (exact for randomly placed stars).
    nightCover(D) { return D <= 0 ? 0 : D === Infinity ? 1 : -Math.expm1(-D / this.nightFree()); },
    // Stars in a thin shell, the light each sends you (per unit of one star's output), and the sky share it covers.
    nightShellStars(r, dr) { return this.nightDensity() * 4 * Math.PI * r * r * dr; },
    nightShellLight(r, dr) { return this.nightShellStars(r, dr) / (4 * Math.PI * r * r); },
    nightShellCover(r, dr) { return this.nightShellStars(r, dr) * Math.PI * this.nightModel.radius ** 2 / (4 * Math.PI * r * r); },
    // How many Sun discs fit in the half of the sky above you.
    nightSunDiscs() { return 2 / this.nightModel.sunAngle ** 2; },
    // The slider (steps of 0.01): 0 is no time at all; 0.07 is today, 13.8 billion years; each further 0.01 multiplies
    // the time by 10^0.17, up to about 10^26 years at 1.
    nightYears(a) { return a <= 0 ? 0 : this.nightModel.age * 10 ** (17 * (Math.min(1, a) - this.nightToday())); },
    nightToday() { return .07; },
    nightChecks() {
      const rel = (a, b, e = 1e-9) => Math.abs(a - b) <= e * Math.abs(b), L = this.nightFree(), {age, reach} = this.nightModel;
      return Object.entries({
        'Every shell of stars adds the same light, near or far': [1, 1e3, 1e9, 1e20].every(r => rel(this.nightShellLight(r, 1), this.nightShellLight(10, 1))),
        'Every shell covers the same share of the sky': [1, 1e6, 1e15].every(r => rel(this.nightShellCover(r, 1), this.nightShellCover(10, 1))),
        'A shell twice as far holds four times the stars, each a quarter as bright': (() => { const each = r => this.nightShellLight(r, 1) / this.nightShellStars(r, 1);
          return rel(this.nightShellStars(2e9, 1) / this.nightShellStars(1e9, 1), 4) && rel(each(2e9) / each(1e9), .25); })(),
        'Shells add up: the covered share is the sum of thin shells while it is small': rel(this.nightCover(1e12), 1e12 * this.nightShellCover(5e11, 1), 1e-6),
        'With stars forever and unchanging, every sight line ends on a star: the sky is as bright as a star’s surface': this.nightCover(Infinity) === 1 && this.nightCover(100 * L) === 1,
        'A sight line typically travels about 2 × 10^24 light-years before meeting a star': L > 1e24 && L < 1e25,
        'That is over ten trillion times farther than light travels in 13.8 billion years': L / age > 1e13,
        'Within 13.8 billion light-years, stars cover less than a ten-trillionth of the sky, but not none': this.nightCover(age) > 0 && this.nightCover(age) < 1e-13,
        'Even out to today’s 46.5 billion light-years, they cover less than a ten-trillionth': this.nightCover(reach) < 1e-13,
        'No time, no starlight: the slider’s zero covers nothing': this.nightYears(0) === 0 && this.nightCover(this.nightYears(0)) === 0,
        'The covered share grows with time and fills the sky after about 1e25 years': [0, .2, .5, .8, .9, .95].every(a => this.nightCover(this.nightYears(a + .05)) > this.nightCover(this.nightYears(a))) && this.nightCover(this.nightYears(1)) > .999,
        'The slider marks today at 13.8 billion years': rel(this.nightYears(this.nightToday()), age),
        'The half of the sky above you has room for about 92,000 Sun discs': this.nightSunDiscs() > 9e4 && this.nightSunDiscs() < 9.5e4,
      }).map(([name, pass]) => ({name, pass}));
    },
    // Attention for guessing the next word, on one hand-made sentence: "I grew up in France, so I speak fluent ___".
    // The guess (the query) is scored against every earlier word (its key) by a scaled dot product, and the scores
    // become shares by a softmax, as in "Attention Is All You Need" (2017). Key and query features: [a country,
    // a verb about language, a skill word, a small grammar word]. The vectors are hand-made, not from a trained model.
    lookWords: ['I', 'grew', 'up', 'in', 'France,', 'so', 'I', 'speak', 'fluent'],
    lookKeys: [[0,0,0,1], [0,0,0,.3], [0,0,0,1], [0,0,0,1], [1,0,0,0], [0,0,0,1], [0,0,0,1], [0,1,0,0], [0,0,1,0]],
    lookQuery: [6.4, 3.2, 2.4, 0],
    lookClue: 4,
    // Shares one query gives a list of keys: softmax of the scaled dot products; strength 0 gives equal shares.
    attend(query, keys, focus = 1) {
      const scores = keys.map(k => k.reduce((s, x, i) => s + x * query[i], 0) / Math.sqrt(query.length));
      const top = Math.max(...scores), raw = scores.map(s => Math.exp(focus * (s - top))), total = raw.reduce((s, x) => s + x, 0);
      return {scores, weights: raw.map(x => x / total)};
    },
    lookBack(strength = 1) { return this.attend(this.lookQuery, this.lookKeys, strength).weights; },
    // A one-at-a-time memory instead: each word read squeezes the older ones, so word j is kept with weight
    // fade^(words read since), and the clue is mostly gone by the end.
    memoryFade: .62,
    memoryKeeps(j) { return Math.pow(this.memoryFade, this.lookWords.length - j); },
    // A toy rule for the guess: the more of the clue reaches the guess, the surer "French" is. strength mixes the
    // memory alone (0) with attention (1).
    lookGuess(strength = 1) {
      const clue = strength * this.lookBack(1)[this.lookClue] + (1 - strength) * this.memoryKeeps(this.lookClue);
      const french = .2 + .7 * clue / (clue + .25);
      return [['French', french], ['English', (1 - french) * .55], ['Spanish', (1 - french) * .3]];
    },
    // A wave shot across a trap of depth V and width L at a trial energy E (-V < E < 0): it starts fading into the
    // left wall, wiggles inside, and in the right wall is part fading (C) and part growing (D). Only at the allowed
    // energies is the growing part zero, so the wave fades into both walls.
    wellShoot(E, V, L) {
      const h = L / 2, k = Math.sqrt(Math.max(1e-12, E + V)), kappa = Math.sqrt(Math.max(1e-12, -E));
      const P = Math.cos(k * L) + kappa / k * Math.sin(k * L), Q = -k * Math.sin(k * L) + kappa * Math.cos(k * L);
      const D = (P + Q / kappa) / 2, C = (P - Q / kappa) / 2;
      const psi = x => x < -h ? Math.exp(kappa * (x + h)) : x <= h ? Math.cos(k * (x + h)) + kappa / k * Math.sin(k * (x + h))
        : C * Math.exp(-kappa * (x - h)) + D * Math.exp(kappa * (x - h));
      // Largest size of the wave inside the trap, used to draw every trial wave at the same height.
      let top = 0; for (let i = 0; i <= 240; i++) top = Math.max(top, Math.abs(psi(-h + L * i / 240)));
      return {k, kappa, C, D, psi, h, top};
    },
    // The trap the guide sweeps: depth 16; width 2 holds three allowed energies.
    trapDepth: 16,
    trapLevels(L) { return this.well(this.trapDepth / 25, L).levels.map(l => l.E); },
    // Weak gravity, slow motion (schematic units): proper time = T + integral of (g h - v^2/2) dt.
    fall(a, b) {
      const g=.8*a, T=2+2*(b-1), ref=.8*T*T/8, best=g*T*T/8;
      const gain=apex=>(2/3)*g*apex*T-8*apex*apex/(3*T);
      const height=(apex,t)=>4*apex*t*(T-t)/(T*T);
      // The two parts of gain up to time t: height bonus g*integral(h), speed cost integral(v^2/2).
      const bonusUntil=(apex,t)=>g*4*apex/(T*T)*(T*t*t/2-t*t*t/3);
      const costUntil=(apex,t)=>8*apex*apex/Math.pow(T,4)*(T**3-Math.pow(T-2*t,3))/6;
      return {g,T,ref,best,gain,height,bonusUntil,costUntil};
    },
    // River model of a black hole (Painleve-Gullstrand, light speed 1): space flows inward at sqrt(rs/r).
    river(a, b) {
      const rs=a, re=.6+(b-1), flow=r=>rs>0?Math.sqrt(rs/r):0;
      // Light swims at light speed through the flowing space: dr/dt = +-1 - flow(r).
      const light=(r0,dir,t)=>{let r=r0;const n=Math.ceil(t/.01),h=t/Math.max(1,n),f=r=>dir-flow(Math.max(r,1e-4));
        for(let i=0;i<n&&r>.02&&r<12;i++){const k1=f(r),k2=f(r+h*k1/2),k3=f(r+h*k2/2),k4=f(r+h*k3);r+=h*(k1+2*k2+2*k3+k4)/6;}return r;};
      return {rs,re,flow,light};
    },
    // A swimmer in the river: it moves outward at speed 1 through the flowing medium while the medium flows in at
    // sqrt(rs/r), so dr/dt = 1 - sqrt(rs/r). Returns where it is after time t, and how long ago it reached the edge
    // (r = 0.05) if it was swept in. The same rule moves a fish near a waterfall and light near a black hole.
    riverSwim(r0, rs, t) {
      const f = r => 1 - Math.sqrt(rs / Math.max(r, 1e-4)), h = .01;
      let r = r0, u = 0;
      while (u < t - 1e-12) { const d = Math.min(h, t - u), k1 = f(r), k2 = f(r + d * k1 / 2), k3 = f(r + d * k2 / 2), k4 = f(r + d * k3);
        r += d * (k1 + 2 * k2 + 2 * k3 + k4) / 6; u += d; if (r <= .05) return {r: .05, fell: t - u}; }
      return {r, fell: -1};
    },
    // The speed at which space flows in at distance r from a black hole whose horizon is at rs, in light speeds.
    riverInflow(rs, r) { return rs <= 0 ? 0 : Math.sqrt(rs / Math.max(r, 1e-4)); },
    // One toss seen from the ground and from the ball (weak gravity, schematic units). The throw speed is fixed;
    // gravity g = 0.8*a, so with a = 0 the ball keeps going and with a = 1 it comes back after T.
    views(a, b) {
      const g=.8*a, T=2+2*(b-1), v0=.8*T/2;
      const h=t=>v0*t-g*t*t/2, v=t=>v0-g*t;
      return {g,T,v0,h,v};
    },
    // Two walkers start on the equator of a ball of radius 1, a longitude apart (radians), and each walks due north,
    // straight ahead on the ball: their distance apart along the surface once they reach latitude lat.
    walkersGap(lat, apart = .7) { return 2 * Math.asin(Math.cos(lat) * Math.sin(apart / 2)); },
    // Free fall from rest toward a planet of radius 1 (Newtonian, exact for weak gravity); stops at the surface.
    tides(a) {
      const GM=a;
      const fall=(x0,y0,t)=>{let x=x0,y=y0,vx=0,vy=0;const n=Math.ceil(t/.01),h=t/Math.max(1,n);
        const acc=(x,y)=>{const r=Math.hypot(x,y),k=-GM/(r*r*r);return [k*x,k*y];};
        for(let i=0;i<n&&Math.hypot(x,y)>1;i++){
          const [a1,b1]=acc(x,y),[a2,b2]=acc(x+vx*h/2,y+vy*h/2),[a3,b3]=acc(x+(vx+a1*h/2)*h/2,y+(vy+b1*h/2)*h/2),[a4,b4]=acc(x+(vx+a2*h/2)*h,y+(vy+b2*h/2)*h);
          const dx=(vx+2*(vx+a1*h/2)+2*(vx+a2*h/2)+(vx+a3*h))/6,dy=(vy+2*(vy+b1*h/2)+2*(vy+b2*h/2)+(vy+b3*h))/6;
          x+=h*dx;y+=h*dy;vx+=h*(a1+2*a2+2*a3+a4)/6;vy+=h*(b1+2*b2+2*b3+b4)/6;}
        const r=Math.hypot(x,y);return r<1?[x/r,y/r]:[x,y];};
      // Time to fall from rest at r0 to r (radial free fall).
      const fallTime=(r0,r)=>GM>0?Math.sqrt(r0**3/(2*GM))*(Math.sqrt((r/r0)*(1-r/r0))+Math.acos(Math.sqrt(r/r0))):Infinity;
      return {GM,fall,fallTime};
    },
    // The small ring of the tides chapter (radius 0.3 around a ball 3 Earth radii out), let go for as long as it takes
    // with the real mass to fall to 2.3: how much longer its height has grown than at the start (0 = still round).
    tideStretch(a) {
      const P=this.tides(a), t=this.tides(1).fallTime(3,2.3), top=P.fall(0,3.3,t), bottom=P.fall(0,2.7,t);
      return (top[1]-bottom[1])/(3.3-2.7)-1;
    },
    // A bathroom scale in a lift reads the floor's push: your weight times (g + a)/g, a being the lift's upward acceleration.
    lift() {
      const g=9.8, reading=a=>Math.max(0,(g+a)/g);
      // One ride up in seconds and metres per second squared, timed to the narration: rest, speed up, cruise, slow down, rest.
      const ride=[[1,0],[4,1],[2,0],[4,-1],[1.5,0]];
      const accelAt=t=>{let s=0;for(const [d,a] of ride){if(t<s+d)return a;s+=d;}return 0;};
      return {g,reading,ride,accelAt};
    },
    // The Moon's tidal stretch (Newtonian, exact): its pull at a point minus its pull at the Earth's centre.
    // Units: Earth radius 1, the Moon's GM = m (1 for the real Moon), the Moon on the +x axis at distance D (real distance about 60 Earth radii).
    moonTides(D = 60.3, m = 1) {
      const pull=(x,y)=>{const dx=D-x,dy=-y,r=Math.hypot(dx,dy);return [m*dx/r**3,m*dy/r**3];};
      const centre=pull(0,0), tide=(x,y)=>{const p=pull(x,y);return [p[0]-centre[0],p[1]-centre[1]];};
      // Ocean height along the surface (equilibrium tide shape), with the angle measured from the Earth-Moon line.
      const shape=angle=>(3*Math.cos(angle)**2-1)/2;
      return {D,pull,centre,tide,shape};
    },
    fallGain(a,b){const f=this.fall(a,b);return f.gain(f.best)/f.T;},
    fallChecks() {
      const f=this.fall(1,1.6), scan=Array.from({length:2001},(_,i)=>i/2000*2*f.ref), top=scan.reduce((m,x)=>f.gain(x)>f.gain(m)?x:m,0);
      const near=(x,y,e=1e-9)=>Math.abs(x-y)<e;
      return Object.entries({
        'Without gravity the straight path keeps the most time':this.fall(0,1.6).best===0&&this.fallGain(0,1.6)===0,
        'Most-time path peaks at the free-fall height gT²/8':Math.abs(top-f.best)<f.ref/1000,
        'Going higher or lower than free fall gains less':f.gain(f.best)>f.gain(f.best*.7)&&f.gain(f.best)>f.gain(f.best*1.3),
        'Time gained equals g²T²/24':near(this.fallGain(1,1.6),f.g*f.g*f.T*f.T/24,1e-12),
        'Stronger gravity throws the best path higher':this.fall(1,1.6).best>this.fall(.5,1.6).best,
        'Height bonus minus speed cost over the flight equals the gain':near(f.bonusUntil(f.best*1.3,f.T)-f.costUntil(f.best*1.3,f.T),f.gain(f.best*1.3),1e-12),
        'Throwing twice as high as free fall gains nothing':near(f.gain(2*f.best),0,1e-12),
        'Both paths start and end at the same events':near(f.height(f.best,0),0)&&near(f.height(f.best,f.T),0),
      }).map(([name,pass])=>({name,pass}));
    },
    // Single gap: width shrinks from 4.2 to 0.7 units as the first control rises (0 = no barrier); wavelength 0.7 to 1.15.
    gap(a, b) {
      const lambda=.7+.3*(b-1), width=a<.005?Infinity:.7*(6-5*a);
      return {lambda,width,sinMin:width===Infinity?0:Math.min(1,lambda/width)};
    },
    spreadAngle(a,b){const g=this.gap(a,b);return Math.asin(g.sinMin)*180/Math.PI;},
    singleSlit(a,b,sinTheta){const g=this.gap(a,b);if(g.width===Infinity)return sinTheta===0?1:0;const x=Math.PI*g.width*sinTheta/g.lambda;return x===0?1:(Math.sin(x)/x)**2;},
    gapChecks() {
      const near=(x,y,e=1e-9)=>Math.abs(x-y)<e, g=this.gap(.6,1.5);
      return Object.entries({
        'No barrier means no spreading':this.spreadAngle(0,1.5)===0,
        'First dark direction sits where sin(angle) = wavelength / gap':near(this.singleSlit(.6,1.5,g.lambda/g.width),0,1e-20),
        'A narrower gap spreads the wave wider':this.spreadAngle(1,1.5)>this.spreadAngle(.4,1.5),
        'A longer wavelength spreads wider':this.spreadAngle(.6,2.5)>this.spreadAngle(.6,1),
        'Straight ahead is the brightest direction':this.singleSlit(.6,1.5,0)===1&&this.singleSlit(.6,1.5,.05)<1,
        'A gap narrower than the wavelength spreads to every side':near(this.gap(1,1.5).sinMin,1),
      }).map(([name,pass])=>({name,pass}));
    },
    reflected(a,b){return this.barrier(a,b).R;},
    levelCount(a,b){return this.well(a,b).levels.length;},
    tunnelChecks() {
      const near=(x,y,e=1e-9)=>Math.abs(x-y)<e, cases=[[.8,1],[.8,2.5],[.3,1.6],[1,1.4]];
      const deep=this.barrier(1,2.5), C=this.cx, b=this.barrier(.8,1.7);
      const k=1,kappa=Math.sqrt(2*.8-1),w=.6*1.7, analytic=1/(1+(2*.8)**2*Math.sinh(kappa*w)**2/(4*1*(2*.8-1)));
      return Object.entries({
        'No barrier lets everything through':near(this.barrier(0,1.5).T,1),
        'Reflected plus transmitted is always 100%':cases.every(([a,c])=>near(this.barrier(a,c).T+this.barrier(a,c).R,1,1e-9)),
        'A wider barrier lets less through':this.barrier(.8,2.5).T<this.barrier(.8,1).T,
        'Some still gets through a barrier taller than the energy':deep.T>0&&deep.V>deep.E,
        'Wave is continuous at both barrier edges':C.abs2(C.sub(b.psi(-1e-9),b.psi(1e-9)))<1e-12&&C.abs2(C.sub(b.psi(b.w-1e-9),b.psi(b.w+1e-9)))<1e-12,
        'Transmission matches the textbook formula':near(b.T,analytic,1e-9),
      }).map(([name,pass])=>({name,pass}));
    },
    // The wave-packet guide draws blends of waves (blendWaves); its readout gives the blend's width as the spread of speeds.
    packetChecks() {
      return [...Object.entries({
        'A single momentum is one pure wave': this.blendRange(0).length === 1 && [0, 3.7, 11.2].every(x => Math.abs(this.blendWaves([[0, this.blendAmp(0, 0)]]).sum(x) - Math.cos(this.blendCentre * x)) < 1e-12),
        'The spread of speeds shown matches the mix of waves, and is zero for one wave': this.blendSpeedSpread(0) === 0 && [.12, .25, .5].every(sk => Math.abs(this.blendSpeedSpread(sk) / sk - 1) < .015),
      }).map(([name, pass]) => ({name, pass})), ...this.blendChecks()];
    },
    wellChecks() {
      const w=this.well(1,2.5), E=w.levels.map(l=>l.E), deep=this.well(1,2.5);
      return Object.entries({
        'No well holds no levels':this.levelCount(0,1.5)===0,
        'Any well in one dimension holds at least one level':this.levelCount(.02,1)>=1,
        'Deeper and wider wells hold more levels':this.levelCount(1,2.5)>this.levelCount(.3,1),
        'Levels sit between the well floor and zero':E.every(e=>e>-w.V&&e<0),
        'Levels alternate even and odd shapes':w.levels.every((l,i)=>l.parity===(i%2?'odd':'even')),
        'Lowest level lies below the infinite-well value':(deep.levels[0].E+deep.V)<(Math.PI/deep.L)**2,
        ...Object.fromEntries(this.shootChecks().map(c => [c.name, c.pass])),
      }).map(([name,pass])=>({name,pass}));
    },
    shootChecks() {
      const V = this.trapDepth, L = 2, E = this.trapLevels(L), S = e => this.wellShoot(e, V, L);
      const mids = [(-V + E[0]) / 2, ...E.slice(1).map((e, i) => (E[i] + e) / 2), E.at(-1) / 2];
      const humps = e => { const s = S(e); let n = 1, prev = s.psi(-s.h + 1e-9);
        for (let i = 1; i <= 400; i++) { const v = s.psi(-s.h + L * i / 400); if (v * prev < 0) n++; if (Math.abs(v) > 1e-9) prev = v; } return n; };
      const near = (a, b, e) => Math.abs(a - b) < e;
      return Object.entries({
        'The swept trap holds three allowed energies': E.length === 3,
        'At each allowed energy the wave fades into both walls': E.every(e => { const s = S(e); return Math.abs(s.D) / s.top < 1e-9 && Math.abs(s.psi(s.h + 3 / s.kappa)) < .06 * Math.abs(s.psi(s.h)); }),
        'Between allowed energies the wave grows in the right wall, flipping side each time': mids.every((e, i) => { const s = S(e); return Math.abs(s.psi(1.6 * L / 2 + .6)) > 2 * s.top && Math.sign(s.D) === (i % 2 ? -1 : 1); }),
        'The trial wave and its slope join smoothly at both trap edges': [-1, 1].every(side => { const s = S(-7), x = side * s.h, d = 1e-6;
          return near(s.psi(x - d), s.psi(x + d), 1e-4) && near((s.psi(x - d) - s.psi(x - 3 * d)) / (2 * d), (s.psi(x + 3 * d) - s.psi(x + d)) / (2 * d), 1e-3); }),
        'Each allowed wave has one more hump than the one below': E.every((e, i) => humps(e) === i + 1),
        'A wider trap holds more allowed energies, lower down': this.trapLevels(3).length > E.length && this.trapLevels(3)[0] < E[0] && this.trapLevels(1).length < E.length,
      }).map(([name, pass]) => ({name, pass}));
    },
    // Shared birthdays, with 365 equally likely birthdays. The chance that at least two of n people share one: each
    // newcomer must miss every birthday already in the room. And the chance that one of n - 1 others shares yours.
    birthdayShared(n) { let none = 1; for (let k = 0; k < n; k++) none *= (365 - k) / 365; return n > 365 ? 1 : 1 - none; },
    birthdayMine(n) { return n <= 1 ? 0 : 1 - Math.pow(364 / 365, n - 1); },
    birthdayPairs(n) { return n * (n - 1) / 2; },
    birthdayChecks() {
      const near = (x, y, e) => Math.abs(x - y) < e, P = n => this.birthdayShared(n);
      // Each newcomer pairs with everyone already in the room, as people arrive one at a time.
      const arriving = n => Array.from({length: n}, (_, k) => this.birthdayPairs(k + 1) - this.birthdayPairs(k)).every((added, k) => added === k);
      return Object.entries({
        'Someone among 22 others shares your birthday about 6% of the time': near(this.birthdayMine(23), .0586, 5e-4),
        '23 people make 253 pairs': this.birthdayPairs(23) === 253 && arriving(23),
        'With 23 people a shared birthday is just more likely than not (50.7%)': near(P(23), .5073, 5e-4),
        'With 22 people it is still less likely than not, so 23 is the smallest such group': P(22) < .5 && P(23) > .5,
        'With 30 people it is about 71%, and with 50 about 97%': near(P(30), .7063, 5e-4) && near(P(50), .9704, 5e-4),
        '50 people make 1,225 pairs': this.birthdayPairs(50) === 1225 && arriving(50),
        'The chance only grows as people arrive': Array.from({length: 60}, (_, n) => n + 1).every(n => P(n + 1) > P(n)),
        'One person alone shares a birthday with nobody': P(1) === 0,
        'Treating the 253 pairs as separate one-in-365 bets gives almost the same answer': near(1 - Math.pow(364 / 365, this.birthdayPairs(23)), P(23), .01),
      }).map(([name, pass]) => ({name, pass}));
    },
    // Sky colour: air molecules, far smaller than light's waves, scatter light as the inverse fourth power of its
    // wavelength (Rayleigh). Sea-level optical depth 0.0088 lambda^-4.05 (lambda in micrometres); the air crossed by
    // light from a Sun at elevation e degrees, in units of the air overhead, after Kasten and Young (1989).
    skyScatter(nm) { return Math.pow(700 / nm, 4); },
    skyDepth(nm) { return .0088 * Math.pow(nm / 1000, -4.05); },
    skyAirMass(e) { return 1 / (Math.sin(e * Math.PI / 180) + .50572 * Math.pow(e + 6.07995, -1.6364)); },
    skyThrough(nm, e) { return Math.exp(-this.skyDepth(nm) * this.skyAirMass(e)); },
    skyChecks() {
      const near = (a, b, e) => Math.abs(a - b) < e;
      return Object.entries({
        'Blue light (450 nm) is scattered about six times as much as red (700 nm)': near(this.skyScatter(450), 5.86, .01),
        'Blue light shakes about one and a half times as often as red, and scattering grows as the fourth power of that': (() => {
          const f = 700 / 450; return near(f, 1.56, .01) && near(this.skyScatter(450) / this.skyScatter(700), f ** 4, 1e-9) && near(this.skyDepth(450) / this.skyDepth(700), f ** 4, .2); })(),
        'With the Sun overhead, sunlight crosses one air mass': near(this.skyAirMass(90), 1, .002),
        'With the Sun on the horizon it crosses about 38 times as much air': near(this.skyAirMass(0), 38, 1),
        'Overhead, about four fifths of the blue gets through': near(this.skyThrough(450, 90), .8, .02),
        'At the horizon almost none of the blue gets through, but about a quarter of the red does': this.skyThrough(450, 0) < .001 && near(this.skyThrough(700, 0), .24, .03),
        'The lower the Sun, the less of its blue gets through': [90, 45, 20, 10, 5, 0].every((e, i, a) => i === 0 || this.skyThrough(450, e) < this.skyThrough(450, a[i - 1])),
        'Blue is always dimmed more than red': [90, 30, 5, 0].every(e => this.skyThrough(450, e) < this.skyThrough(700, e)),
      }).map(([name, pass]) => ({name, pass}));
    },
    // Which checks belong to each visual model; light bending uses checks().
    checkSets() {
      return {'gravity-clocks':this.clockChecks,'spacetime':this.spacetimeChecks,'interference':this.waveChecks,
        'two-slit-particles':this.waveChecks,'standing-waves':this.ropeChecks,'tunneling':this.tunnelChecks,'wave-packet':this.packetChecks,'quantum-well':this.wellChecks,'falling-time':this.fallChecks,'diffraction':this.gapChecks,'twin-trip':this.spacetimeChecks,'spacetime-paths':this.pathChecks,'light-clock':this.lightClockChecks,'river':this.riverChecks,'fall-views':this.viewsChecks,'tides':this.tidesChecks,'lift':this.liftChecks,'moon-tides':this.moonChecks,'attention':this.attentionChecks,'speed-limit':this.limitChecks,'birthdays':this.birthdayChecks,'sky-colour':this.skyChecks,'night-sky':this.nightChecks};
    },
    checksFor(kind) { return this.checkSets()[kind]?.call(this) || this.checks(); },
    // Every model's checks, run in CI.
    allChecks() { return [...this.checks(), ...Object.keys(this.checkSets()).flatMap(kind => this.checksFor(kind))]; },
    spacetimeChecks() {
      const near=(a,b)=>Math.abs(a-b)<1e-12;
      // The traveller's own time for the round trip: the spacetime length of each straight leg, out and back.
      const own=(a,b)=>{const v=this.speed(a),T=this.turnaround(b);return 2*this.properTime(T,v*T);};
      return Object.entries({
        'Zero speed gives equal ages':near(this.agingGap(0),0),
        'Faster trips widen the age gap':this.agingGap(1)>this.agingGap(.5),
        'Time-dilation factor at 0.6 light speed is 1.25':near(this.gamma(.6),1.25),
        'Traveller worldline stays inside the light cone':this.speed(1)<1,
        'Round-trip traveller time is home time divided by the factor':[.3,.7,1].every(a=>near(own(a,2.5),2*this.turnaround(2.5)/this.gamma(this.speed(a)))),
        'Trip length does not change the percentage gap':[1,1.6,2.5].every(b=>near(1-own(.7,b)/(2*this.turnaround(b)),this.agingGap(.7))),
      }).map(([name,pass])=>({name,pass}));
    },
    lightClockChecks() {
      const v=this.speed(1);
      return Object.entries({
        'At rest the two light clocks agree':this.lightTick(0)===1,
        'A faster rocket clock ticks less often':this.lightTick(this.speed(.9))>this.lightTick(this.speed(.4)),
        'The slanted path at light speed fits exactly one tick':[.3,.6,.8].every(u=>Math.abs(Math.hypot(1,u*this.lightTick(u))-this.lightTick(u))<1e-12),
        'The readout is one minus the tick ratio':Math.abs(this.agingGap(1)-(1-1/this.lightTick(v)))<1e-12,
      }).map(([name,pass])=>({name,pass}));
    },
    pathChecks() {
      const near=(a,b)=>Math.abs(a-b)<1e-12, T=this.turnaround(2.5), v=this.speed(8/9*1);
      const bent=(x,t,H)=>this.properTime(t,x)+this.properTime(H-t,x);
      const kinks=Array.from({length:50},(_,i)=>[(i%10)/10*.9*((i/10|0)+1)*.8,((i/10|0)+1)*.8]);
      return [...this.spacetimeChecks(),...Object.entries({
        'Worked example: 10 years out at 8 light-years gives 6 years':near(this.properTime(10,8),6),
        'Each leg holds the home time divided by the factor':near(this.properTime(T,v*T),T/this.gamma(v)),
        'Light’s path has zero length':this.properTime(3,3)===0,
        'Every bent path holds less time than the straight one':kinks.every(([x,t])=>x===0||bent(x,t,8)<8),
        'A wider turnaround holds less time':bent(2,4,8)<bent(1,4,8),
        'Moving light clock: the zigzag at light speed fits one tick':[.3,.6,.8].every(u=>Math.abs(Math.hypot(1,u*this.lightTick(u))-this.lightTick(u))<1e-12),
        'Moving light clock ticks slower by the same factor as the trip':near(this.lightTick(v),this.gamma(v)),
      }).map(([name,pass])=>({name,pass}))];
    },

    riverChecks() {
      const R=this.river(1,1.8), near=(x,y,e=1e-9)=>Math.abs(x-y)<e;
      return Object.entries({
        'Flow reaches light speed exactly at the horizon':near(R.flow(R.rs),1),
        'Flow equals the Newtonian escape speed sqrt(2GM/r)':near(R.flow(4),Math.sqrt(2*(R.rs/2)/4)),
        'Outgoing light just outside the horizon still escapes':R.light(1.2,1,4)>1.2,
        'Outgoing light at the horizon stands still':near(R.light(1,1,2),1,1e-6),
        'Outgoing light inside the horizon is swept inward':R.light(.8,1,.2)<.8,
        'With no mass, light moves at light speed':near(this.river(0,1.8).light(1,1,1.5),2.5,1e-9),
        'A swimmer at the point of no return stays in place':near(this.riverSwim(1.2,1.2,5).r,1.2,1e-9),
        'A swimmer outside it gets away; one just inside is swept to the edge':this.riverSwim(2.4,1.2,3).r>2.4&&this.riverSwim(.97,1.2,6).fell>0,
        'Space flows in at light speed at the horizon, and not at all without a black hole':this.riverInflow(1.2,1.2)===1&&this.riverInflow(0,1)===0,
      }).map(([name,pass])=>({name,pass}));
    },
    viewsChecks() {
      const V=this.views(1,1.6), near=(x,y,e)=>Math.abs(x-y)<e, n=4000, dt=V.T/n;
      let ground=0, ball=0;
      // From the ground: height gains time, speed loses it. From the ball: only the ground's motion costs time.
      for(let i=0;i<n;i++){const t=(i+.5)*dt;ground+=(V.g*V.h(t)-V.v(t)**2/2)*dt;ball+=(V.v(t)**2/2)*dt;}
      const gain=k=>{let s=0;for(let i=0;i<n;i++){const t=(i+.5)*dt;s+=(V.g*k*V.h(t)-(k*V.v(t))**2/2)*dt;}return s;};
      return Object.entries({
        'Without gravity the tossed ball keeps going in a straight line':near(this.views(0,1.6).h(2),2*this.views(0,1.6).h(1),1e-12),
        'With gravity the ball comes back to the hand at the catch':near(V.h(V.T),0,1e-12),
        'Seen from the ball, the ground speeds up at g (it is pushed)':near(-(V.h(1.01)-2*V.h(1)+V.h(.99))/1e-4,V.g,1e-6),
        'Ground view and ball view give the same extra time for the ball':near(ground,ball,1e-6)&&near(ball,V.g**2*V.T**3/24,1e-6),
        'The real toss keeps more time than a lower or higher one':gain(1)>gain(.7)&&gain(1)>gain(1.3),
      }).map(([name,pass])=>({name,pass}));
    },
    tidesChecks() {
      const P=this.tides(1), d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]), t=1.2;
      const side=[P.fall(-.1,3,t),P.fall(.1,3,t)], stack=[P.fall(0,3,t),P.fall(0,3.2,t)], e=1e-3, s=.2;
      const sq=P.fall(e,3,s)[0]-e, st=(P.fall(0,3+e,s)[1]-P.fall(0,3,s)[1])-e;
      return Object.entries({
        'Walkers heading north from the equator close their gap to zero at the pole':this.walkersGap(Math.PI/2)<1e-12&&this.walkersGap(1)<this.walkersGap(.5)&&Math.abs(this.walkersGap(0)-.7)<1e-12,
        'Balls released side by side drift together':d(...side)<.2,
        'Balls released one above the other drift apart':d(...stack)>.2,
        'Stretching starts at twice the squeezing':Math.abs(st/sq+2)<.05,
        'Without the planet nothing drifts':this.tides(0).fall(.1,3,2)[0]===.1&&this.tides(0).fall(.1,3,2)[1]===3,
        'Without the planet the small ring stays round; with it, it stretches':this.tideStretch(0)===0&&this.tideStretch(1)>0&&this.tideStretch(.5)<this.tideStretch(1),
        'Fall time from the formula matches the simulation':Math.abs(Math.hypot(...P.fall(0,2.3,P.fallTime(2.3,1.5)))-1.5)<1e-3,
      }).map(([name,pass])=>({name,pass}));
    },
    liftChecks() {
      const L=this.lift(), near=(x,y,e=1e-9)=>Math.abs(x-y)<e;
      const net=L.ride.reduce((s,[d,a])=>s+d*a,0);
      // How a released apple speeds up relative to you (downward negative): only its weight pulls it, while the scale
      // also pushes you. While the lift holds you it drops to the floor; falling freely, it stays where it is.
      const apart=a=>-L.g-L.g*(L.reading(a)-1);
      // The lift's speed during the ride, from its accelerations.
      const speed=t=>{let v=0;for(let q=.005;q<t;q+=.01)v+=L.accelAt(q)*.01;return v;};
      return Object.entries({
        'Parked, the scale reads your weight':near(L.reading(0),1),
        'Speeding up upward, it reads more':L.reading(2.5)>1,
        'Slowing on the way up, it reads less':L.reading(-2.5)<1,
        'With the cable snapped, it reads zero':L.reading(-L.g)===0,
        'A released apple keeps its place beside you':near(apart(-L.g),0)&&[1,0,-1].every(a=>apart(a)<0),
        'The ride starts and ends at rest':near(net,0),
        'Steady at any speed, the scale reads your weight; falling freely, zero':speed(6)>3.9&&near(L.reading(L.accelAt(6)),1)&&near(L.reading(L.accelAt(.5)),1)&&L.reading(-L.g)===0,
      }).map(([name,pass])=>({name,pass}));
    },
    moonChecks() {
      const M=this.moonTides(), far=this.moonTides(2*M.D), near=(x,y,e)=>Math.abs(x-y)<e;
      const a=M.tide(1,0)[0], b=-M.tide(-1,0)[0], side=-M.tide(0,1)[1];
      const peaks=Array.from({length:360},(_,i)=>M.shape(i*Math.PI/180)).filter((v,i,arr)=>v>arr[(i+359)%360]&&v>=arr[(i+1)%360]).length;
      return Object.entries({
        'The near side is pulled toward the Moon more than the centre':a>0,
        'The far side is pulled less than the centre, so it is left behind':b>0,
        'The sides are squeezed inward':side>0,
        'Near and far bulges are almost equal at the real distance':near(a/b,1,.06),
        'The squeeze is about half the stretch':near(side/((a+b)/2),.5,.03),
        'Twice as far away, the stretch is about eight times weaker':near(far.tide(1,0)[0]*8/a,1,.03),
        'Two high tides in one turn of the Earth':peaks===2,
        'No Moon, no stretch; half the Moon’s mass, half the stretch':this.moonTides(M.D,0).tide(1,0)[0]===0&&near(this.moonTides(M.D,.5).tide(1,0)[0]*2/a,1,1e-9),
      }).map(([name,pass])=>({name,pass}));
    },
    attentionChecks() {
      const near = (x, y, e = 1e-12) => Math.abs(x - y) < e, W = this.lookBack(1), Z = this.lookBack(0), n = this.lookWords.length;
      const sc = this.attend(this.lookQuery, this.lookKeys).scores;
      // Without position information, shuffling the words shuffles their shares in exactly the same way.
      const order = [3, 0, 8, 5, 1, 7, 2, 4, 6], mixed = this.attend(this.lookQuery, order.map(j => this.lookKeys[j])).weights;
      return Object.entries({
        'Shares are positive and add up to one': [0, .5, 1].every(k => { const v = this.lookBack(k); return v.every(x => x > 0) && near(v.reduce((s, x) => s + x, 0), 1); }),
        'With attention off every earlier word gets an equal share': Z.every(x => near(x, 1 / n)),
        'Scores are dot products divided by the square root of the vector size': near(sc[4], 6.4 / 2) && near(sc[7], 3.2 / 2) && near(sc[0], 0),
        'Shares follow the softmax of the scores': near(W[4] / W[7], Math.exp(sc[4] - sc[7]), 1e-9),
        'The guess looks hardest at the clue, “France”': W.indexOf(Math.max(...W)) === this.lookClue && W[this.lookClue] > .5,
        'A one-at-a-time memory keeps little of the clue': this.memoryKeeps(this.lookClue) < .1 && this.memoryKeeps(n - 1) > this.memoryKeeps(this.lookClue),
        'Looking straight back makes the right guess likelier': this.lookGuess(1)[0][1] > this.lookGuess(0)[0][1] + .2,
        'Without position information, word order does not change the shares': order.every((j, i) => near(mixed[i], W[j])),
      }).map(([name, pass]) => ({name, pass}));
    },
    waveChecks() {
      const near=(a,b)=>Math.abs(a-b)<1e-12;
      // The first dark stripe's distance from the middle of a screen 30 wavelengths away, from the brightness it shows.
      const firstDark=b=>{const d=this.separation(b), I=x=>this.brightness(1,2*Math.PI*(Math.hypot(x+d/2,30)-Math.hypot(x-d/2,30)));
        let x=0;while(x<30&&I(x+1e-3)<I(x))x+=1e-3;return x;};
      return Object.entries({
        'One source gives no stripes':near(this.visibility(0),0),
        'Equal sources give full-contrast stripes':near(this.visibility(1),1),
        'Equal path lengths give a bright stripe':near(this.intensity(1,0),1),
        'Half-wavelength path difference cancels equal waves':near(this.intensity(1,Math.PI),0),
        'Unequal sources leave dark stripes partly lit':this.intensity(.5,Math.PI)>0,
        'Two equal sources make bright stripes four times one source':near(this.brightness(1,0),4*this.brightness(0,0)),
        'Wider separation packs stripes closer':firstDark(2.5)<firstDark(1),
      }).map(([name,pass])=>({name,pass}));
    },
    ropeChecks() {
      const A = this.ropeModel.A, N = this.ropeModel.N;
      // The largest swing anywhere on the rope during the last full shake.
      const swing = (rate, seconds) => {
        const hand = this.ropeHand({rates: [[0, rate]]}), st = this.ropeStep(this.ropeStart(), seconds - 1 / rate, hand);
        let m = 0; for (let k = 1; k <= 60; k++) { this.ropeStep(st, seconds - 1 / rate + k / (60 * rate), hand); for (const v of st.y) m = Math.max(m, Math.abs(v)); }
        return m / A;
      };
      const pulse = this.ropeHand({pulse: true}), at = (t, i) => this.ropeStep(this.ropeStart(), t, pulse).y[i];
      // Twice as fast: the middle hardly moves while a quarter of the way along swings fully.
      const s2 = this.ropeStep(this.ropeStart(), 12, this.ropeHand({rates: [[0, 2]]}));
      let mid = 0, quarter = 0;
      for (let k = 0; k < 50; k++) { this.ropeStep(s2, 12 + k * .02, this.ropeHand({rates: [[0, 2]]})); mid = Math.max(mid, Math.abs(s2.y[N / 2])); quarter = Math.max(quarter, Math.abs(s2.y[N / 4])); }
      return Object.entries({
        'One shake comes back upside down from the wall': at(.4, N / 2) > .5 * A && at(.9, N / 2) < -.3 * A,
        'Shaking in step builds a swing many times the hand': swing(1, 12) > 4.5,
        'Shaking out of step only jiggles': swing(1.5, 12) < 1.6,
        'Two and three times as fast are in step too': swing(2, 12) > 4.5 && swing(3, 12) > 4.5 && swing(2.5, 12) < 1.6,
        'Twice as fast leaves a still point in the middle': mid < .15 * quarter,
        'The simulation matches the exact steady swing': [1, 1.5, 2, 3].every(r => Math.abs(swing(r, 16) / this.ropeSteady(r) - 1) < .05),
        ...Object.fromEntries(this.stringChecks().map(c => [c.name, c.pass])),
        'The energy measure gives the swing in step': Math.abs(this.ropeSize(this.ropeStep(this.ropeStart(), 16, this.ropeHand({rates: [[0, 1]]})), 1) / this.ropeSteady(1) - 1) < .08,
      }).map(([name, pass]) => ({name, pass}));
    },

    clockChecks() {
      const q=(m,r)=>this.clockRatio(m,r), near=(a,b)=>Math.abs(a-b)<1e-12;
      return Object.entries({
        'Zero mass gives equal clock rates':near(q(0,1),1),
        'Lower stationary clock accumulates less time':q(1,1)<1 && q(1,1)>0,
        'More mass increases the clock difference':q(1,1)<q(.5,1),
        'Moving both clocks outward reduces the difference':q(1,2.5)>q(1,1),
        'Ratio matches analytic Schwarzschild value':near(q(1,1),Math.sqrt(57/59)),
        'Clock hand motion stays positive':1-12*(1-q(1,1))>0,
      }).map(([name,pass])=>({name,pass}));
    },
    checks() {
      const near = (a,b) => Math.abs(a-b) < 1e-10;
      const cases = {
        'No mass gives a straight ray': near(this.deviation(5,0,1),0),
        'Doubling mass doubles weak-field deflection': near(this.deflection(1,1),2*this.deflection(.5,1)),
        'Doubling passing distance halves deflection': near(this.deflection(.5,2),this.deflection(.5,1)/2),
        'Far-field slope agrees with 4m/b': Math.abs(this.slope(1e6,.7,1.25)+this.deflection(.7,1.25))<1e-9,
        'Bending points toward the mass': this.deviation(3,.7,1.25)<0,
        'Controls remain in the weak-field regime': (()=>{const mu=this.m(1),b=1,X=7.5,p=this.lightPath(mu,b,-X,X,2000),a=p.at(-1),c=p.at(-2),bend=-Math.atan2(a[1]-c[1],a[0]-c[0]);
          return Math.abs(bend/(4*mu/b*X/Math.hypot(X,b))-1)<.04;})(),
        'Flat mesh when there is no mass': this.meshHeight(0,3)===0 && this.lightPath(0,1).every(p=>p[1]===1),
        'Mesh distances equal light travel time': [.5,1,3,7].every(R=>{const mu=.15,d=1e-5,dz=this.meshHeight(mu,R+d)-this.meshHeight(mu,R);
          return Math.abs(Math.hypot(d,dz)-(1+2*mu/R)*d)<1e-8;}),
        'Straightest mesh line bends by 4m/b for a light mass': (()=>{const mu=1e-4,b=1.25,X=7.5,p=this.lightPath(mu,b,-X,X,2000),
          a=p.at(-1),c=p.at(-2),bend=-Math.atan2(a[1]-c[1],a[0]-c[0]);return Math.abs(bend/(4*mu/b*X/Math.hypot(X,b))-1)<.02;})(),
        'Mesh light path bends toward the mass': this.lightPath(.15,1).at(-1)[1]<1,
      };
      return Object.entries(cases).map(([name,pass])=>({name,pass}));
    }
  };
  root.Physics = Physics;
  if (typeof module !== 'undefined') module.exports = Physics;
})(typeof window === 'undefined' ? globalThis : window);
