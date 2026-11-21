    // A passing siren: the Doppler effect for sound in still air. Each crest of squeezed air leaves the siren from where
    // it is at that moment and spreads at the speed of sound, however fast the siren moves. Speeds in metres a second,
    // notes in crests a second (hertz), for a listener standing still: a siren of 700 crests a second on an ambulance at
    // 30 metres a second (108 km/h), in air at 20 degrees C.
    soundSpeed: 343,
    sirenNote: 700,
    sirenSpeed: 30,
    // The note heard from a crest a siren sent while moving at speed v (slower than sound), at angle `angle` (radians)
    // between its direction of travel and the line to the listener: f c / (c - v cos angle).
    dopplerHeard(f, v, angle = 0) { return f * this.soundSpeed / (this.soundSpeed - v * Math.cos(angle)); },
    // How far apart neighbouring crests are in that direction.
    crestGap(f, v, angle = 0) { return (this.soundSpeed - v * Math.cos(angle)) / f; },
    // Semitones between two notes; a semitone is the step between neighbouring piano keys.
    semitones(f1, f2) { return 12 * Math.log2(f1 / f2); },
    // For a siren at x along a straight road, and a listener `side` metres from the road opposite x = 0: where the siren
    // was when it sent the crest the listener hears now. That crest took its distance over c to arrive while the siren
    // drove on, so x - xe = (v / c) * hypot(xe, side).
    sentFrom(v, side, x) { const b = v / this.soundSpeed; return (x - b * Math.sqrt(x * x + (1 - b * b) * side * side)) / (1 - b * b); },
    // The note the listener hears now, from a siren passing at speed v that is at x.
    passingNote(f, v, side, x) { const xe = this.sentFrom(v, side, x); return f * this.soundSpeed / (this.soundSpeed + v * xe / Math.hypot(xe, side)); },
    // The crests a siren has sent by time t (seconds), one every `period` from time 0 while it drives from x0 at speed
    // v: where each one started and how far it has spread, newest first.
    sirenCrests(v, period, t, x0 = 0, count = 60) {
      const out = [];
      for (let k = Math.floor(t / period); k >= 0 && out.length < count; k--) { const tk = k * period; out.push({ x: x0 + v * tk, r: this.soundSpeed * (t - tk) }); }
      return out;
    },
    dopplerChecks() {
      const near = (a, b, e) => Math.abs(a - b) <= e, f = this.sirenNote, v = this.sirenSpeed, c = this.soundSpeed;
      const ahead = this.dopplerHeard(f, v, 0), behind = this.dopplerHeard(f, v, Math.PI);
      const [now, before] = this.sirenCrests(v, 1 / f, .1), slide = Array.from({ length: 81 }, (_, i) => this.passingNote(f, v, 7, -200 + 5 * i));
      return Object.entries({
        'Ahead of a 700-hertz siren at 108 km/h, 767 crests arrive each second': near(ahead, 767.1, .05) && near(v * 3.6, 108, 1e-9),
        'Behind it, 644 crests arrive each second': near(behind, 643.7, .05),
        'The notes ahead and behind are about three semitones apart': near(this.semitones(ahead, behind), 3.04, .01),
        'A parked siren sounds the same in every direction': this.dopplerHeard(f, 0, 0) === f && this.dopplerHeard(f, 0, Math.PI) === f && this.dopplerHeard(f, 0, 1) === f,
        'Crests sent from where the siren is bunch up ahead and spread out behind': near((before.x + before.r) - (now.x + now.r), this.crestGap(f, v, 0), 1e-9) && near((now.x - now.r) - (before.x - before.r), this.crestGap(f, v, Math.PI), 1e-9) && this.crestGap(f, v, 0) < c / f && this.crestGap(f, v, Math.PI) > c / f,
        'Crest spacing times crests a second is always the speed of sound': [0, 1, 2, Math.PI].every(a => near(this.crestGap(f, v, a) * this.dopplerHeard(f, v, a), c, 1e-9)),
        'Passing a listener 7 m from the siren’s line, the note slides steadily from the high note to the low one': slide.every((n, i) => i === 0 || n < slide[i - 1]) && near(slide[0], ahead, 1.5) && near(slide.at(-1), behind, 1.5),
        'The siren’s own note arrives just after it passes': near(this.passingNote(f, v, 7, v / c * 7), f, 1e-9) && this.passingNote(f, v, 7, 0) > f,
        'A faster siren spreads the two notes further apart': this.semitones(this.dopplerHeard(f, 60, 0), this.dopplerHeard(f, 60, Math.PI)) > this.semitones(ahead, behind),
      }).map(([name, pass]) => ({ name, pass }));
    },
