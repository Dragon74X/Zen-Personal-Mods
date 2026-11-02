/* Zen animated icon motion: exact spring engine, ten motion styles, pointer driver.
   Spring stepping follows resources/iconflow/motion-engine.js (Iconflow design studies):
   position and velocity both survive every retarget, so interrupted motion never jumps.
   This version adds damping ratio (overshoot), a held press state, loops and spin drives. */
(() => {
  const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
  const CH = ['tx', 'ty', 'r', 'sx', 'sy', 'o', 'draw', 'dash', 'w', 'f'], NC = CH.length;
  const DEF = { tx: 0, ty: 0, r: 0, sx: 1, sy: 1, o: 1, draw: 1, dash: 0, w: 1, f: 0 };
  const EVENTS = ['hover', 'press', 'release', 'leave'];
  const fmt = n => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? '0' : String(v); };
  const parse = d => ({ v: (d.match(NUM) || []).map(Number), chunks: d.split(NUM) });
  const pathOf = (chunks, a, n) => { let s = chunks[0]; for (let i = 0; i < n; i++) s += fmt(a[i]) + chunks[i + 1]; return s; };
  const cos = a => Math.cos(a * Math.PI / 180), sin = a => Math.sin(a * Math.PI / 180);
  const line = (x1, y1, x2, y2) => `M${fmt(x1)} ${fmt(y1)}C${fmt(x1 + (x2 - x1) / 3)} ${fmt(y1 + (y2 - y1) / 3)} ${fmt(x1 + (x2 - x1) * 2 / 3)} ${fmt(y1 + (y2 - y1) * 2 / 3)} ${fmt(x2)} ${fmt(y2)}`;
  const circle = (cx, cy, r) => { const k = .5522847 * r; return `M${cx + r} ${cy}C${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r}C${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy}C${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r}C${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy}Z`; };

  /* Point deformers. Paths hold only M/C/Z, so coordinates are x,y pairs. */
  const hash = (x, y, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
  const D = {
    map(c, fn) { const o = c.slice(); for (let i = 0; i < o.length; i += 2) [o[i], o[i + 1]] = fn(o[i], o[i + 1]); return o; },
    twist: (c, deg, cx = 12, cy = 12) => D.map(c, (x, y) => { const dx = x - cx, dy = y - cy, a = deg * Math.min(1, Math.hypot(dx, dy) / 10); return [cx + dx * cos(a) - dy * sin(a), cy + dx * sin(a) + dy * cos(a)]; }),
    wave: (c, amp, ph = 0, fr = .62) => D.map(c, (x, y) => [x + amp * .4 * Math.sin(y * fr + ph * 1.7), y + amp * Math.sin(x * fr + ph)]),
    // Hashing by position keeps coincident points together: closed shapes stay closed, dots stay dots.
    jitter: (c, amp, seed) => D.map(c, (x, y) => { const qx = Math.round(x * 20), qy = Math.round(y * 20); return [x + amp * (hash(qx, qy, seed) * 2 - 1), y + amp * (hash(qy, qx, seed + 9) * 2 - 1)]; }),
    snap: (c, g) => c.map(v => Math.round(v / g) * g),
    grow: (c, s, cx = 12, cy = 12) => D.map(c, (x, y) => [cx + (x - cx) * s, cy + (y - cy) * s])
  };

  // Exact damped spring. z < 1 overshoots; z >= 1 is critically damped; w <= 0 snaps.
  function spring(x, v, to, w, z, dt) {
    if (!(w > 0)) return [to, 0];
    const d = x - to;
    if (z >= 1) { const e = Math.exp(-w * dt), k = v + w * d; return [to + (d + k * dt) * e, (v - w * k * dt) * e]; }
    const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt), B = (v + z * w * d) / wd, p = d * c + B * s;
    return [to + e * p, e * (-z * w * p + wd * (B * c - d * s))];
  }

  const STYLES = {};
  const style = (id, name, tier, desc, build) => { STYLES[id] = { id, name, tier, desc, build }; };

  // Semantic motion: each glyph's kind decides how its parts travel.
  const KINDS = {
    dir(c, i, p, nxt) {
      const [dx, dy] = c.meta.dir, sg = p.s ?? 1, ux = dx * sg, uy = dy * sg, f = p.a ? .25 : 1;
      c.pose(i, 'wind', { tx: -ux * c.A(.8) * f, ty: -uy * c.A(.8) * f });
      c.pose(i, 'hover', { tx: ux * c.A(1.3) * f, ty: uy * c.A(1.3) * f });
      c.pose(i, 'press', { tx: ux * c.A(2) * f, ty: uy * c.A(2) * f, sx: 1 - Math.abs(dx) * c.A(.1) * f, sy: 1 - Math.abs(dy) * c.A(.1) * f });
      c.beat('hover', i, 0, 'wind', 22, 1); c.beat('hover', i, 70, 'hover', 16, .6);
      c.beat('press', i, 0, 'press', 30, .9);
      if (p.a) { c.pose(i, 'out', { k: c.next, sx: 1 + c.A(.05), sy: 1 + c.A(.05) }); c.beat('release', i, 0, 'out', 30, .9); c.beat('release', i, 110, nxt, 14, .5); }
      else {
        c.pose(i, 'out', { tx: ux * c.OV(9), ty: uy * c.OV(9), o: 0 }); c.pose(i, 'in', { k: c.next, tx: -ux * c.OV(7), ty: -uy * c.OV(7), o: 0 });
        c.beat('release', i, 0, 'out', 24, 1); c.beat('release', i, 130, 'in', 0); c.beat('release', i, 140, nxt, 15, .62);
      }
      c.beat('leave', i, 0, 'rest', 13, .85);
    },
    spin(c, i, p, nxt) {
      const sp = (c.meta.spin || 1) * (p.a ? 0 : 1);
      c.origin(i, c.meta.pivot || [12, 12]);
      c.pose(i, 'wind', { r: -12 * sp * c.A(1) });
      c.pose(i, 'hover', { r: 30 * sp * c.A(1) });
      c.pose(i, 'press', { r: -35 * sp * c.A(1), sx: 1 - c.A(.08), sy: 1 - c.A(.08) });
      c.pose(i, 'turn', { k: c.next, r: (360 + 30 * c.A(1)) * sp, sx: 1 + c.A(.04), sy: 1 + c.A(.04) });
      c.beat('hover', i, 0, 'wind', 20, 1); c.beat('hover', i, 80, 'hover', 14, .6);
      c.beat('press', i, 0, 'press', 24, .85);
      c.beat('release', i, 0, 'turn', 11, .72, 1); c.beat('release', i, 380, nxt, 12, .6);
      c.beat('leave', i, 0, 'rest', 12, .8);
    },
    swing(c, i, p, nxt) {
      const a = (p.s ?? 1) * c.A(1) * (p.a ? .3 : 1);
      c.origin(i, c.meta.pivot || [12, 12]);
      c.pose(i, 'hover', { r: 9 * a }); c.pose(i, 'press', { r: -12 * a, sx: .95, sy: .95 }); c.pose(i, 'kick', { k: c.next, r: 24 * a });
      c.beat('hover', i, 0, 'hover', 11, .35); c.beat('press', i, 0, 'press', 22, .8);
      c.beat('release', i, 0, 'kick', 26, .9); c.beat('release', i, 90, nxt, 8, .16);
      c.beat('leave', i, 0, 'rest', 9, .3);
    },
    shake(c, i, p, nxt) {
      const f = p.a ? .5 : 1, sg = p.s ?? 1;
      c.pose(i, 'hover', { r: 7 * sg * c.A(1) * f }); c.pose(i, 'press', { sx: 1 - c.A(.12), sy: 1 - c.A(.12), r: -4 * sg * f });
      [1.8, -1.5, 1.1, -.6].forEach((x, j) => { c.pose(i, 's' + j, { k: j > 1 ? c.next : c.s, tx: c.A(x) * f }); c.beat('release', i, j * 55, 's' + j, 42, 1); });
      c.beat('hover', i, 0, 'hover', 16, .5); c.beat('press', i, 0, 'press', 30, .9);
      c.beat('release', i, 220, nxt, 16, .7); c.beat('leave', i, 0, 'rest', 14, .8);
    },
    pop(c, i, p, nxt) {
      const f = p.a ? .5 : 1;
      c.pose(i, 'hover', { ty: -c.A(.6) * f, sx: 1 + c.A(.07) * f, sy: 1 + c.A(.07) * f });
      c.pose(i, 'press', { sx: 1 - c.A(.15), sy: 1 - c.A(.15) });
      c.pose(i, 'big', { k: c.next, ty: -c.A(.8) * f, sx: 1 + c.A(.16) * f, sy: 1 + c.A(.16) * f });
      c.beat('hover', i, 0, 'hover', 16, .6); c.beat('press', i, 0, 'press', 30, .9);
      c.beat('release', i, 0, 'big', 30, .9); c.beat('release', i, 90, nxt, 13, .45); c.beat('leave', i, 0, 'rest', 13, .85);
    },
    pulse(c, i, p, nxt) {
      const [dx, dy] = c.meta.dir, f = p.a ? .3 : 1, d = i * 45;
      c.pose(i, 'up', { tx: dx * c.A(1.6) * f, ty: dy * c.A(1.6) * f });
      c.pose(i, 'hover', { tx: dx * c.A(.4) * f, ty: dy * c.A(.4) * f });
      c.pose(i, 'press', { sx: 1 - c.A(.12), sy: 1 - c.A(.12) });
      c.pose(i, 'up2', { k: c.next, tx: dx * c.A(2.6) * f, ty: dy * c.A(2.6) * f, sx: 1 + c.A(.08), sy: 1 + c.A(.08) });
      c.beat('hover', i, d, 'up', 24, 1); c.beat('hover', i, d + 90, 'hover', 15, .55);
      c.beat('press', i, i * 20, 'press', 28, .9);
      c.beat('release', i, d, 'up2', 28, 1); c.beat('release', i, d + 110, nxt, 14, .5);
      c.beat('leave', i, i * 25, 'rest', 13, .8);
    },
    scan(c, i, p, nxt) {
      if (p.a) {
        c.pose(i, 'hover', { sx: 1.03, sy: 1.03 }); c.pose(i, 'press', { sx: .96, sy: .96 });
        c.beat('hover', i, 0, 'hover', 14, .7);
      } else {
        c.origin(i, 'c');
        const R = c.A(1.2);
        [[R, 0], [0, R], [-R, 0], [0, -R]].forEach(([x, y], j) => { c.pose(i, 's' + j, { tx: x, ty: y, sx: 1.05, sy: 1.05 }); c.beat('hover', i, j * 80, 's' + j, 26, 1); });
        c.pose(i, 'hover', { sx: 1.05, sy: 1.05 }); c.beat('hover', i, 320, 'hover', 14, .6);
        c.pose(i, 'press', { sx: .86, sy: .86 });
      }
      c.pose(i, 'zoom', { k: c.next, sx: 1 + c.A(.18), sy: 1 + c.A(.18) });
      c.beat('press', i, 0, 'press', 28, .9); c.beat('release', i, 0, 'zoom', 30, .9); c.beat('release', i, 90, nxt, 13, .45); c.beat('leave', i, 0, 'rest', 13, .85);
    },
    scribble(c, i, p, nxt) {
      [[1.2, 1.2], [-1, .5], [1, -.4], [-.6, -.8]].forEach(([x, y], j) => { c.pose(i, 'z' + j, { tx: c.A(x), ty: c.A(y) }); c.beat('hover', i, j * 70, 'z' + j, 30, 1); });
      c.pose(i, 'hover', { ty: -c.A(.4) }); c.beat('hover', i, 280, 'hover', 14, .6);
      c.pose(i, 'press', { tx: c.A(.8), ty: c.A(.8), sx: .94, sy: .94 }); c.pose(i, 'dash', { k: c.next, tx: c.A(3), ty: -c.A(3), r: -8 });
      c.beat('press', i, 0, 'press', 26, .9); c.beat('release', i, 0, 'dash', 30, 1); c.beat('release', i, 100, nxt, 13, .5); c.beat('leave', i, 0, 'rest', 13, .8);
    },
    tilt(c, i, p, nxt) {
      const f = p.a ? .3 : 1;
      c.origin(i, c.meta.pivot || [12, 12]);
      c.pose(i, 'hover', { r: -10 * f * c.A(1) }); c.pose(i, 'press', { r: 6 * f, sx: .92, sy: .92 }); c.pose(i, 'tip', { k: c.next, r: 18 * f * c.A(1) });
      c.beat('hover', i, 0, 'hover', 13, .45); c.beat('press', i, 0, 'press', 26, .85);
      c.beat('release', i, 0, 'tip', 26, .9); c.beat('release', i, 90, nxt, 10, .3); c.beat('leave', i, 0, 'rest', 10, .45);
    }
  };

  style('clean', 'Clean', 'Simple', 'One soft lift on hover, a firm press, a single spring back. The whole icon moves as one piece.', c => c.each(i => {
    const [dx, dy] = c.meta.dir;
    c.pose(i, 'hover', { tx: c.A(dx * .5), ty: c.A(dy * .5), sx: 1 + c.A(.06), sy: 1 + c.A(.06) });
    c.pose(i, 'press', { sx: 1 - c.A(.14), sy: 1 - c.A(.14) });
    c.pose(i, 'pop', { k: c.next, sx: 1 + c.A(.12), sy: 1 + c.A(.12) });
    c.beat('hover', i, 0, 'hover', 16, .75); c.beat('press', i, 0, 'press', 30, .9);
    c.beat('release', i, 0, 'pop', 30, .9); c.beat('release', i, 90, c.nxt, 14, .5); c.beat('leave', i, 0, 'rest', 13, .9);
  }));

  style('glide', 'Glide', 'Simple', 'Each icon moves the way its action does: arrows travel and re-enter, refresh spins, bells swing, warnings shake.',
    c => c.each(i => (KINDS[c.meta.kind] || KINDS.pop)(c, i, c.part(i), c.nxt)));

  style('morph', 'Morph', 'Medium', 'The outline itself reshapes: hover leans toward the action shape, holding commits to it, release springs past and settles.', c => {
    const K = c.k1, s = c.s, lean = s + (K - s) * (c.tog ? .12 : .22) * c.A(1), over = c.tog ? K + (K - s) * .14 : 1 + .16 * c.A(1);
    c.each(i => {
      c.pose(i, 'hover', { k: lean, sx: 1 + c.A(.03), sy: 1 + c.A(.03) });
      c.pose(i, 'press', { k: K, sx: 1 - c.A(.05), sy: 1 - c.A(.05) });
      c.pose(i, 'over', { k: over });
      c.beat('hover', i, 0, 'hover', 15, .7); c.beat('press', i, 0, 'press', 20, .75);
      c.beat('release', i, 0, 'over', 30, 1); c.beat('release', i, 85, c.nxt, 11, .42); c.beat('leave', i, 0, 'rest', 12, .8);
    });
  });

  style('draw', 'Line draw', 'Medium', 'Strokes retract and redraw along their own paths; release erases forward and draws the next shape in.', c => c.each(i => {
    const d = i * 40;
    c.pose(i, 'tail', { draw: .3, dash: .7 });
    c.pose(i, 'hover', { sx: 1 + c.A(.03), sy: 1 + c.A(.03) });
    c.pose(i, 'press', { draw: .6, dash: .2, w: w => w * (1 + c.A(.35)), sx: 1 - c.A(.06), sy: 1 - c.A(.06) });
    c.pose(i, 'gone', { draw: 0, dash: 1 });
    c.pose(i, 'reset', { k: c.next, draw: 0, dash: 0 });
    c.beat('hover', i, d, 'tail', 30, 1); c.beat('hover', i, d + 120, 'hover', 15, .85);
    c.beat('press', i, 0, 'press', 24, .9);
    c.beat('release', i, d * .8, 'gone', 34, 1); c.beat('release', i, d * .8 + 120, 'reset', 0); c.beat('release', i, d * .8 + 130, c.nxt, 13, .85);
    c.beat('leave', i, 0, 'rest', 14, 1);
  }));

  style('jelly', 'Jelly', 'Medium', 'Soft-body squash and stretch with a rippling outline; release wobbles back to rest.', c => c.each(i => {
    const d = i * 18;
    c.origin(i, [12, 20.5]);
    c.pose(i, 'hover', { d: v => D.wave(v, c.A(.35), 0), sx: 1 + c.A(.05), sy: 1 - c.A(.04) });
    c.pose(i, 'press', { d: v => D.wave(v, c.A(.6), 1.4), sx: 1 + c.A(.14), sy: 1 - c.A(.18) });
    c.pose(i, 'stretch', { k: c.next, d: v => D.wave(v, c.A(.45), 2.6), sx: 1 - c.A(.12), sy: 1 + c.A(.16) });
    c.beat('hover', i, d, 'hover', 14, .38); c.beat('press', i, d, 'press', 20, .5);
    c.beat('release', i, d, 'stretch', 34, .6); c.beat('release', i, d + 70, c.nxt, 11, .22); c.beat('leave', i, d, 'rest', 12, .3);
  }));

  style('halo', 'Halo', 'Medium · overflows', 'Rings gather around the icon while it is held and ripple outward past its box on release.', c => {
    [0, 1, 2].forEach(j => {
      const r = c.fx('ring' + j, circle(12, 12, 10.5), { w: .55, z: -1 }), sc = s => ({ d: v => D.grow(v, s) });
      c.pose(r, 'rest', { o: 0, ...sc(.6) });
      c.pose(r, 'hover', { o: j ? 0 : .4, ...sc(j ? .6 : 1) });
      c.pose(r, 'press', { o: [.8, .5, .3][j], ...sc([.78, .62, .5][j]) });
      c.pose(r, 'start', { o: .9, ...sc(.7) });
      c.pose(r, 'wave', { o: 0, ...sc(c.OV(2.3) + j * .25) });
      c.beat('hover', r, 0, 'hover', 12, .7); c.beat('press', r, j * 40, 'press', 22, .7);
      c.beat('release', r, j * 85, 'start', 0); c.beat('release', r, j * 85 + 16, 'wave', 5.5, 1);
      c.beat('release', r, 700 + j * 85, 'rest', 0); c.beat('release', r, 720 + j * 85, 'hover', 12, .8);
      c.beat('leave', r, 0, 'rest', 14, .9);
    });
    c.each(i => {
      c.pose(i, 'hover', { sx: 1 - c.A(.06), sy: 1 - c.A(.06) }); c.pose(i, 'press', { sx: 1 - c.A(.14), sy: 1 - c.A(.14) });
      c.pose(i, 'pop', { k: c.next, sx: 1 + c.A(.1), sy: 1 + c.A(.1) });
      c.beat('hover', i, 0, 'hover', 14, .7); c.beat('press', i, 0, 'press', 26, .8);
      c.beat('release', i, 0, 'pop', 30, .9); c.beat('release', i, 90, c.nxt, 12, .5); c.beat('leave', i, 0, 'rest', 13, .85);
    });
  });

  style('sketch', 'Sketch', 'Medium', 'Hand-drawn boil: lines wobble like pencil animation while hovered, scribble harder while held, redraw on release.', c => c.each(i => {
    for (let j = 0; j < 3; j++) {
      const r = [-1.2, .8, -.4][j];
      c.pose(i, 'h' + j, { d: v => D.jitter(v, c.A(.32), j + 1), r, sx: 1.03, sy: 1.03 });
      c.pose(i, 'p' + j, { d: v => D.jitter(v, c.A(.6), j + 5), r: -r * 1.4, sx: .93, sy: .93 });
      c.pose(i, 'n' + j, { k: c.next, d: v => D.jitter(v, c.A(.32), j + 1), r, sx: 1.03, sy: 1.03 });
    }
    c.pose(i, 'blank', { k: c.next, d: v => D.jitter(v, c.A(.32), 1), draw: 0, dash: 0 });
    c.beat('hover', i, 0, 'h0', 0); c.loop('hover', i, 0, 330, [[0, 'h0', 0], [110, 'h1', 0], [220, 'h2', 0]]);
    c.beat('press', i, 0, 'p0', 0); c.loop('press', i, 0, 180, [[0, 'p0', 0], [60, 'p1', 0], [120, 'p2', 0]]);
    c.beat('release', i, 0, 'blank', 0); c.beat('release', i, 10, 'n0', 22, 1);
    c.loop('release', i, 300, 330, [[0, 'n0', 0], [110, 'n1', 0], [220, 'n2', 0]]);
    c.beat('leave', i, 0, 'rest', 20, 1);
  }));

  style('glitch', 'Glitch', 'Complex', 'Digital split: offset ghost copies flicker on stepped timing, the outline snaps to a pixel grid, release tears and resolves.', c => c.each(i => {
    c.pose(i, 'hover', { d: v => D.snap(v, .75), sx: 1.02, sy: 1.02 });
    c.pose(i, 'press', { d: v => D.snap(v, 1.5), sx: 1.05, sy: .93 });
    c.pose(i, 't1', { d: v => D.snap(v, 2), tx: c.A(2.4), sx: 1.22, sy: .82 });
    c.pose(i, 't2', { k: c.next, d: v => D.snap(v, 1.5), tx: -c.A(1.6), sx: .9, sy: 1.14 });
    c.pose(i, 't3', { k: c.next, d: v => D.snap(v, .75), tx: c.A(.6) });
    c.beat('hover', i, 0, 'hover', 30, 1); c.beat('press', i, 0, 'press', 36, 1);
    c.beat('release', i, 0, 't1', 0); c.beat('release', i, 55, 't2', 0); c.beat('release', i, 110, 't3', 0); c.beat('release', i, 150, c.nxt, 30, 1);
    c.beat('leave', i, 0, 'rest', 30, 1);
    [1, -1].forEach((sg, gi) => {
      const g = c.fx(`ghost${gi}-${i}`, null, { src: i, z: -1, w: .85 });
      const offs = [[1.1, 0, .38], [-.6, .5, .5], [.7, -.5, .28], [-1, -.2, .42]];
      offs.forEach(([x, y, o], j) => {
        const q = (j + gi * 2) % 4;
        c.pose(g, 'h' + j, { d: v => D.snap(v, .75), tx: sg * c.A(offs[q][0]), ty: sg * c.A(offs[q][1]), o: offs[q][2] });
        c.pose(g, 'p' + j, { d: v => D.snap(v, 1.5), tx: sg * c.A(offs[q][0] * 1.7), ty: sg * c.A(offs[q][1] * 1.7), o: offs[q][2] + .15 });
      });
      c.pose(g, 'b0', { k: c.next, tx: sg * c.OV(5), o: .6 }); c.pose(g, 'b1', { k: c.next, tx: -sg * c.OV(3.5), ty: sg * 1.2, o: .35 }); c.pose(g, 'gone', { k: c.next, o: 0 });
      c.loop('hover', g, 0, 240, [0, 1, 2, 3].map(j => [j * 60, 'h' + j, 0]));
      c.loop('press', g, 0, 120, [0, 1, 2, 3].map(j => [j * 30, 'p' + j, 0]));
      c.beat('release', g, 0, 'b0', 0); c.beat('release', g, 60, 'b1', 0); c.beat('release', g, 130, 'gone', 0);
      c.beat('leave', g, 0, 'rest', 30, 1);
    });
  }));

  style('orbit', 'Orbit', 'Complex · overflows', 'Satellites fade in on a tilted orbit wider than the icon, tighten and speed up while held, and fling outward on release.', c => {
    const frame = 'translate(12 12) rotate(-18) scale(1 .42) translate(-12 -12)';
    const ring = c.fx('ring', circle(12, 12, 12.5), { w: .5, z: -1, frame });
    c.pose(ring, 'rest', { o: 0, d: v => D.grow(v, .5), draw: 0 });
    c.pose(ring, 'hover', { o: .32 }); c.pose(ring, 'press', { o: .55, d: v => D.grow(v, .62) }); c.pose(ring, 'fling', { o: 0, d: v => D.grow(v, c.OV(1.9)) });
    c.beat('hover', ring, 0, 'hover', 9, .9); c.beat('press', ring, 0, 'press', 18, .8);
    c.beat('release', ring, 0, 'fling', 6, 1); c.beat('release', ring, 620, 'rest', 0); c.beat('release', ring, 640, 'hover', 9, .9);
    c.beat('leave', ring, 0, 'rest', 12, 1);
    [0, 1, 2].forEach(j => {
      const s = c.fx('sat' + j, `M24.5 12C24.5 12 24.5 12 24.5 12`, { w: 1.25, z: 1, frame }), r = j * 120;
      c.pose(s, 'rest', { r, o: 0, sx: .35, sy: .35 }); c.pose(s, 'hover', { r }); c.pose(s, 'press', { r, sx: .6, sy: .6 });
      c.pose(s, 'fling', { r, sx: c.OV(2.3), sy: c.OV(2.3), o: 0 }); c.pose(s, 'tuck', { r, sx: .35, sy: .35, o: 0 });
      c.beat('hover', s, j * 70, 'hover', 8, .8); c.spin('hover', s, 150);
      c.beat('press', s, 0, 'press', 16, .75); c.spin('press', s, 560);
      c.beat('release', s, 0, 'fling', 6.5, 1); c.spin('release', s, 300); c.beat('release', s, 620, 'tuck', 0); c.beat('release', s, 640 + j * 70, 'hover', 8, .8);
      c.beat('leave', s, 0, 'rest', 10, 1);
    });
    c.each(i => {
      c.pose(i, 'hover', { d: v => D.twist(v, c.A(7)), sx: .9, sy: .9 });
      c.pose(i, 'press', { d: v => D.twist(v, -c.A(12)), sx: .8, sy: .8 });
      c.pose(i, 'pop', { k: c.next, sx: 1.14, sy: 1.14 });
      c.beat('hover', i, 0, 'hover', 13, .6); c.beat('press', i, 0, 'press', 18, .7);
      c.beat('release', i, 0, 'pop', 28, .9); c.beat('release', i, 90, c.nxt, 12, .5); c.beat('leave', i, 0, 'rest', 12, .75);
    });
  });

  style('burst', 'Burst', 'Complex · overflows', 'Pieces part on hover, gather and tremble while held, then blast past the box with a shockwave and sparks before reassembling.', c => {
    const wave = c.fx('wave', circle(12, 12, 6), { w: .7, z: -1 });
    c.pose(wave, 'rest', { o: 0, d: v => D.grow(v, .4) }); c.pose(wave, 's', { o: .9, d: v => D.grow(v, .4) }); c.pose(wave, 'wave', { o: 0, d: v => D.grow(v, c.OV(2.7)) });
    c.beat('release', wave, 0, 's', 0); c.beat('release', wave, 16, 'wave', 5.5, 1); c.beat('release', wave, 760, 'rest', 0); c.beat('leave', wave, 0, 'rest', 20, 1);
    for (let j = 0; j < 8; j++) {
      const a = 22.5 + j * 45, s = c.fx('spark' + j, line(12 + 8.5 * cos(a), 12 + 8.5 * sin(a), 12 + 11.5 * cos(a), 12 + 11.5 * sin(a)), { w: .8, z: 1 });
      c.pose(s, 'rest', { o: 0, draw: 0, sx: .6, sy: .6 }); c.pose(s, 's', { o: 1, draw: 0, sx: .6, sy: .6 });
      c.pose(s, 'fly', { o: 1, draw: .5, dash: .5, sx: c.OV(1.75), sy: c.OV(1.75) }); c.pose(s, 'fade', { o: 0, draw: .05, dash: .95, sx: c.OV(2.2), sy: c.OV(2.2) });
      c.beat('release', s, 0, 's', 0); c.beat('release', s, 20, 'fly', 12, 1); c.beat('release', s, 200, 'fade', 9, 1); c.beat('release', s, 760, 'rest', 0);
      c.beat('leave', s, 0, 'rest', 20, 1);
    }
    c.each(i => {
      const [ox, oy] = c.out(i), alt = i % 2 ? -1 : 1, px = -ox * c.A(.4), py = -oy * c.A(.4);
      c.origin(i, 'c');
      c.pose(i, 'hover', { tx: ox * c.A(1.1), ty: oy * c.A(1.1), r: 5 * alt * c.A(1) });
      c.pose(i, 'press', { tx: px, ty: py, r: -4 * alt, sx: .84, sy: .84 });
      c.pose(i, 'ta', { tx: px + .22, ty: py - .18, r: -4 * alt, sx: .84, sy: .84 }); c.pose(i, 'tb', { tx: px - .22, ty: py + .18, r: -4 * alt, sx: .84, sy: .84 });
      c.pose(i, 'blast', { k: c.next, tx: ox * c.OV(8.5), ty: oy * c.OV(8.5), r: 110 * alt * c.A(1), sx: .72, sy: .72, o: .85 });
      c.beat('hover', i, 0, 'hover', 16, .55);
      c.beat('press', i, 0, 'press', 26, .9); c.loop('press', i, 120, 70, [[0, 'ta', 60, 1], [35, 'tb', 60, 1]]);
      c.beat('release', i, 0, 'blast', 19, 1, 1); c.beat('release', i, 190 + i * 30, c.nxt, 15, .5);
      c.beat('leave', i, 0, 'rest', 13, .75);
    });
  });

  /* Compile a glyph + style into poses and timed beats. opts: tempo, bounce, amp, overflow. */
  function compile(glyph, styleId, opts = {}) {
    const o = { tempo: 1, bounce: 1, amp: 1, overflow: 1, ...opts }, st = STYLES[styleId];
    if (!st) throw Error('Unknown style ' + styleId);
    const tog = !!glyph.toggle, states = tog ? [0, 1] : [0], g0 = glyph.at(0), g1 = glyph.at(1);
    const parts = g0.map((p, i) => { const q = parse(p.d); return { chunks: q.chunks, n: q.v.length, o: [12, 12], glyph: true, z: 0, s: p.s, a: !!p.a, fill: (p.f ?? 0) > 0 || (g1[i].f ?? 0) > 0 }; });
    const sets = states.map(() => ({ P: parts.map(() => ({})), E: parts.map(() => ({})) }));
    const fxKeys = new Map();
    const T = ms => ms * o.tempo, W = w => w > 0 ? w / o.tempo : 0, Z = z => Math.min(1, Math.max(.08, 1 - (1 - z) * o.bounce));
    const baseOf = (i, k) => {
      const p = parts[i];
      if (p.glyph || p.src !== undefined) {
        const gp = glyph.at(k)[p.glyph ? i : p.src], v = parse(gp.d).v;
        if (v.length !== p.n) throw Error(`${glyph.id}: part ${i} changes topology at k=${k}`);
        return { d: v, ...DEF, o: p.glyph ? (gp.o ?? 1) : 0, f: gp.f ?? 0, w: (gp.w ?? 1) * (p.wm ?? 1) };
      }
      return { d: p.v0.slice(), ...DEF, o: 0, w: p.wm ?? 1 };
    };
    const baseVec = (i, k) => { const b = baseOf(i, k), v = new Float64Array(parts[i].n + NC); v.set(b.d); CH.forEach((x, j) => v[parts[i].n + j] = b[x]); return v; };
    for (const [si, s] of states.entries()) {
      const set = sets[si], ev = (e, i) => set.E[i][e] ||= { b: [], l: null, sp: 0 };
      const c = {
        s, k1: tog ? 1 - s : 1, next: tog ? 1 - s : s, tog, nxt: tog ? '>hover' : 'hover', meta: glyph, opts: o,
        A: x => x * o.amp, OV: x => x * o.overflow,
        part: i => parts[i],
        each(fn) { for (let i = 0; i < g0.length; i++) fn(i); },
        origin(i, xy) { parts[i].o = xy === 'c' ? c.cent(i) : xy; },
        cent(i) { const v = baseOf(i, s).d; let x = 0, y = 0; for (let j = 0; j < v.length; j += 2) { x += v[j]; y += v[j + 1]; } return [x * 2 / v.length, y * 2 / v.length]; },
        out(i) {
          const [x, y] = c.cent(i), dx = x - 12, dy = y - 12, m = Math.hypot(dx, dy);
          if (m >= 1.2) return [dx / m, dy / m];
          if (g0.length === 1) return glyph.dir;
          return [cos(i * 137.5 - 90), sin(i * 137.5 - 90)];
        },
        pose(i, name, over = {}) {
          const b = baseOf(i, over.k ?? s), p = parts[i], v = new Float64Array(p.n + NC);
          v.set(typeof over.d === 'function' ? over.d(b.d) : over.d || b.d);
          CH.forEach((k, j) => { const x = over[k]; v[p.n + j] = typeof x === 'function' ? x(b[k]) : x ?? b[k]; });
          if (!v.every(Number.isFinite)) throw Error(`${glyph.id}/${styleId}: nonfinite pose ${name}`);
          set.P[i][name] = v;
        },
        beat(e, i, ms, name, w = 16, z = .8, keep = 0) { ev(e, i).b.push([T(ms), name, W(w), Z(z), keep]); },
        loop(e, i, start, period, beats) { ev(e, i).l = { start: T(start), period: T(period), b: beats.map(([ms, n, w = 0, z = 1]) => [T(ms), n, W(w), Z(z), 0]) }; },
        spin(e, i, rate) { ev(e, i).sp = rate / o.tempo; },
        fx(key, d, { o: origin = [12, 12], z = 1, w = 1, frame = null, src } = {}) {
          if (fxKeys.has(key)) return fxKeys.get(key);
          const i = parts.length;
          if (src !== undefined) parts.push({ chunks: parts[src].chunks, n: parts[src].n, src, o: origin, z, frame, wm: w, fill: false });
          else { const q = parse(d); parts.push({ chunks: q.chunks, n: q.v.length, v0: q.v, o: origin, z, frame, wm: w, fill: false }); }
          fxKeys.set(key, i);
          sets.forEach((st2, sj) => { st2.P[i] = { rest: baseVec(i, states[sj]) }; st2.E[i] = {}; });
          return i;
        }
      };
      for (let i = 0; i < parts.length; i++) if (!set.P[i].rest) set.P[i].rest = baseVec(i, s);
      st.build(c);
    }
    // Defaults, cross-state references, and index resolution.
    return {
      id: glyph.id, style: styleId, toggle: tog,
      parts: parts.map(p => ({ chunks: p.chunks, n: p.n, o: p.o, z: p.glyph ? 0 : p.z, frame: p.frame || null, fill: p.fill })),
      sets: sets.map((set, si) => {
        const other = sets[1 - si] || set;
        let end = 0;
        const out = parts.map((p, i) => {
          const P = set.P[i], E = set.E[i];
          for (const e of EVENTS) if (!E[e] || !E[e].b.length) {
            const has = n => !!P[n];
            const b = e === 'hover' ? [0, has('hover') ? 'hover' : 'rest', W(16), Z(.8), 0] : e === 'press' ? [0, has('press') ? 'press' : has('hover') ? 'hover' : 'rest', W(26), Z(.9), 0]
              : e === 'leave' ? [0, 'rest', W(14), Z(.9), 0] : [0, tog ? (other.P[i].hover ? '>hover' : '>rest') : has('hover') ? 'hover' : 'rest', W(16), Z(.6), 0];
            E[e] = { ...(E[e] || { l: null, sp: 0 }), b: [b] };
          }
          const names = Object.keys(P), idx = n => {
            if (n[0] === '>') { if (!other.P[i][n.slice(1)]) throw Error(`${glyph.id}/${styleId}: missing pose ${n}`); P[n] = other.P[i][n.slice(1)]; }
            if (!P[n]) throw Error(`${glyph.id}/${styleId}: missing pose ${n}`);
            if (!names.includes(n)) names.push(n);
            return names.indexOf(n);
          };
          const map = bs => bs.map(([ms, n, w, z, k]) => [ms, idx(n), w, z, k]);
          const Ev = Object.fromEntries(EVENTS.map(e => [e, { b: map(E[e].b), l: E[e].l && { ...E[e].l, b: map(E[e].l.b) }, sp: E[e].sp || 0 }]));
          const r = Ev.release; end = Math.max(end, r.b.at(-1)[0], r.l ? r.l.start : 0);
          return { P: names.map(n => P[n]), E: Ev };
        });
        return { end: end + T(160), parts: out };
      })
    };
  }

  function attrs(part, a, stroke) {
    const n = part.n, [tx, ty, r, sx, sy, o, draw, dash, w, f] = a.subarray ? a.subarray(n) : a.slice(n), [ox, oy] = part.o;
    const op = Math.min(1, Math.max(0, o)), dr = Math.min(1, Math.max(0, draw));
    return {
      d: pathOf(part.chunks, a, n),
      t: `translate(${fmt(tx + ox)} ${fmt(ty + oy)}) rotate(${fmt(r)}) scale(${fmt(sx)} ${fmt(sy)}) translate(${fmt(-ox)} ${fmt(-oy)})`,
      o: fmt(op), vis: op > .002 && dr > .002, da: dr >= .999 ? 'none' : `${fmt(dr)} 2`, do: fmt(-dash), w: fmt(Math.max(0, w) * stroke), f: fmt(Math.min(1, Math.max(0, f)))
    };
  }

  function markup(ch, { size = 24, stroke = 1.6, set = 0, cls = '', attrs: extra = '', vecs } = {}) {
    const order = ch.parts.map((_, i) => i).sort((a, b) => ch.parts[a].z - ch.parts[b].z || a - b);
    const body = order.map(i => {
      const p = ch.parts[i], at = attrs(p, vecs ? vecs[i] : ch.sets[set].parts[i].P[0], stroke);
      const g = `<g data-p="${i}" transform="${at.t}" opacity="${at.o}"${at.vis ? '' : ' visibility="hidden"'}><path d="${at.d}" pathLength="1" stroke-width="${at.w}"${at.da === 'none' ? '' : ` stroke-dasharray="${at.da}" stroke-dashoffset="${at.do}"`}${p.fill ? ` fill="currentColor" fill-opacity="${at.f}"` : ''}/></g>`;
      return p.frame ? `<g transform="${p.frame}">${g}</g>` : g;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg"${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" width="${size}" height="${size}" overflow="visible" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</svg>`;
  }

  /* Driver: one animation-frame loop for every active icon; idle icons cost nothing. */
  const Z = { speed: 1, motion: true };
  const live = new Set(); let raf = 0, last = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function frame(t) {
    raf = 0; const dt = Math.min(.05, Math.max(0, (t - last) / 1000)) * Z.speed; last = t;
    for (const it of live) if (!step(it, dt)) live.delete(it);
    if (live.size) raf = requestAnimationFrame(frame);
  }
  function wake(it) { live.add(it); if (!raf && typeof requestAnimationFrame !== 'undefined') { last = now(); raf = requestAnimationFrame(frame); } }

  function apply(it, q, i, b) {
    const part = it.ch.parts[i], sp = it.ch.sets[it.set].parts[i], tgt = sp.P[b[1]], ri = part.n + 2, prev = q.to[ri];
    q.to.set(tgt);
    if (sp.E[it.ev].sp) q.to[ri] = prev;                    // a spin drive owns rotation
    else if (!b[4]) {                                        // nearest equivalent turn; a fast spin keeps its direction
      const x = q.x[ri], v = q.v[ri], R = tgt[ri];
      let to = R + 360 * Math.round((x - R) / 360);
      if (Math.abs(v) > 360 && (to - x) * v < 0 && Math.abs(to - x) > 30) to += 360 * Math.sign(v);
      q.to[ri] = to;
    }
    q.w = b[2]; q.z = b[3];
    if (!(q.w > 0)) { q.x.set(q.to); q.v.fill(0); }
  }

  function start(it, ev, skip = false) {
    if (it.pending !== null && ev !== 'release') { it.set = it.pending; it.pending = null; }
    if (ev === 'release' && it.ch.toggle) it.pending = 1 - it.set;
    it.ev = ev; it.t = 0;
    const S = it.ch.sets[it.set].parts;
    it.q.forEach((q, i) => {
      const ri = it.ch.parts[i].n + 2, turns = Math.round(q.x[ri] / 360);
      if (turns) { q.x[ri] -= 360 * turns; q.to[ri] -= 360 * turns; }
      q.c = 0; q.lc = 0; q.lk = -1;
    });
    if (skip) it.t = Math.max(...S.map(p => p.E[ev].b.at(-1)[0]));
    if (!Z.motion) {
      it.q.forEach((q, i) => { const E = S[i].E[ev]; for (const b of E.b) apply(it, q, i, b); q.c = E.b.length; q.x.set(q.to); q.v.fill(0); if (it.dom) paint(it, i); });
      if (ev === 'release') { it.set = it.pending ?? it.set; it.pending = null; it.ev = 'hover'; }
      return;
    }
    if (it.dom) wake(it);
    step(it, 0);
  }

  function step(it, dt) {
    if (!it.ev) return false;
    it.t += dt * 1000;
    const S = it.ch.sets[it.set];
    let busy = false;
    it.q.forEach((q, i) => {
      const part = it.ch.parts[i], E = S.parts[i].E[it.ev];
      while (q.c < E.b.length && E.b[q.c][0] <= it.t) apply(it, q, i, E.b[q.c++]);
      if (q.c < E.b.length) busy = true;
      if (E.l) {
        busy = true;
        if (it.t >= E.l.start) {
          const lt = it.t - E.l.start, k = Math.floor(lt / E.l.period), u = lt - k * E.l.period;
          if (k !== q.lk) { q.lk = k; q.lc = 0; }
          while (q.lc < E.l.b.length && E.l.b[q.lc][0] <= u) apply(it, q, i, E.l.b[q.lc++]);
        }
      }
      if (E.sp) { q.to[part.n + 2] += E.sp * dt; busy = true; }
      for (let j = 0; j < q.x.length; j++) {
        if (q.x[j] === q.to[j] && q.v[j] === 0) continue;
        const [x, v] = spring(q.x[j], q.v[j], q.to[j], q.w, q.z, dt);
        if (Math.abs(x - q.to[j]) < 2e-4 && Math.abs(v) < 2e-3) { q.x[j] = q.to[j]; q.v[j] = 0; } else { q.x[j] = x; q.v[j] = v; busy = true; }
      }
      if (it.dom) paint(it, i);
    });
    if (it.ev === 'release' && it.t >= S.end) { if (it.pending !== null) { it.set = it.pending; it.pending = null; } start(it, it.hover ? 'hover' : 'leave', it.hover); return true; }
    return busy;
  }

  function paint(it, i) {
    const q = it.q[i], at = attrs(it.ch.parts[i], q.x, it.stroke), c = q.cache, g = q.g, p = q.path;
    if (at.d !== c.d) p.setAttribute('d', c.d = at.d);
    if (at.t !== c.t) g.setAttribute('transform', c.t = at.t);
    if (at.o !== c.o) g.setAttribute('opacity', c.o = at.o);
    if (at.vis !== c.vis) { c.vis = at.vis; at.vis ? g.removeAttribute('visibility') : g.setAttribute('visibility', 'hidden'); }
    if (at.da !== c.da) { c.da = at.da; at.da === 'none' ? p.removeAttribute('stroke-dasharray') : p.setAttribute('stroke-dasharray', at.da); }
    if (at.do !== c.do) p.setAttribute('stroke-dashoffset', c.do = at.do);
    if (at.w !== c.w) p.setAttribute('stroke-width', c.w = at.w);
    if (it.ch.parts[i].fill && at.f !== c.f) p.setAttribute('fill-opacity', c.f = at.f);
  }

  function attach(svg, ch, { host = svg, set = 0, interactive = true } = {}) {
    const nodes = []; for (const g of svg.querySelectorAll('[data-p]')) nodes[+g.getAttribute('data-p')] = g;
    const it = { ch, svg, set, pending: null, ev: null, t: 0, hover: false, press: false, dom: true, stroke: +svg.getAttribute('stroke-width') || 1.6 };
    it.q = ch.parts.map((p, i) => ({ g: nodes[i], path: nodes[i].firstElementChild, x: Float64Array.from(ch.sets[set].parts[i].P[0]), v: new Float64Array(p.n + NC), to: Float64Array.from(ch.sets[set].parts[i].P[0]), w: 16, z: 1, c: 0, lc: 0, lk: -1, cache: {} }));
    it.trigger = ev => start(it, ev);
    it.stop = () => { live.delete(it); it.ev = null; };
    if (interactive) {
      const on = (t, f) => host.addEventListener(t, f), key = e => e.key === 'Enter' || e.key === ' ';
      on('pointerenter', () => { it.hover = true; if (!it.press) start(it, 'hover'); });
      on('pointerleave', () => { it.hover = false; it.press = false; start(it, 'leave'); });
      on('pointerdown', e => { if (e.button) return; it.press = true; start(it, 'press'); });
      on('pointerup', () => { if (it.press) { it.press = false; start(it, 'release'); } });
      on('pointercancel', () => { it.press = false; start(it, 'leave'); });
      on('focus', () => { if (!it.hover) start(it, 'hover'); });
      on('blur', () => { it.press = false; if (!it.hover) start(it, 'leave'); });
      on('keydown', e => { if (key(e) && !e.repeat) { e.preventDefault(); it.press = true; start(it, 'press'); } });
      on('keyup', e => { if (key(e) && it.press) { it.press = false; start(it, 'release'); } });
    }
    return it;
  }

  // Headless clock: events [[ms, 'hover'|'press'|'release'|'leave']], returns part vectors at each sample time.
  function sample(ch, events, times, set = 0) {
    const it = { ch, set, pending: null, ev: null, t: 0, hover: false, press: false, dom: false };
    it.q = ch.parts.map((p, i) => ({ x: Float64Array.from(ch.sets[set].parts[i].P[0]), v: new Float64Array(p.n + NC), to: Float64Array.from(ch.sets[set].parts[i].P[0]), w: 16, z: 1, c: 0, lc: 0, lk: -1 }));
    const evs = events.slice().sort((a, b) => a[0] - b[0]), out = [], dt = 1000 / 240;
    let t = 0, e = 0;
    for (const at of times.slice().sort((a, b) => a - b)) {
      while (t < at - 1e-9) {
        while (e < evs.length && evs[e][0] <= t + 1e-9) { const ev = evs[e++][1]; it.hover = ev !== 'leave'; start(it, ev); }
        const h = Math.min(dt, at - t); step(it, h / 1000); t += h;
      }
      while (e < evs.length && evs[e][0] <= t + 1e-9) { const ev = evs[e++][1]; it.hover = ev !== 'leave'; start(it, ev); }
      out.push(it.q.map(q => Float64Array.from(q.x)));
    }
    return out;
  }

  // Standalone asset files: <svg data-icon data-style> plus this script and glyphs.js.
  function autoAttach(svg = document.documentElement) {
    const g = globalThis.ZenGlyphs.byId[svg.getAttribute('data-icon')];
    return attach(svg, compile(g, svg.getAttribute('data-style')));
  }

  globalThis.ZenMotion = { compile, markup, attach, autoAttach, attrs, sample, spring, D, STYLES, settings: Z, EVENTS, styles: Object.values(STYLES).map(({ id, name, tier, desc }) => ({ id, name, tier, desc })) };
})();
