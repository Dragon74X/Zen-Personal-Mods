// ==UserScript==
// @name           Iconflow parts
// @description    Animates Zen's own icons (or New Icons') part by part.
// ==/UserScript==
//
// Zen's own icons keep their artwork, whatever it is: Zen's, or New Icons'
// when that mod is installed. Nothing is copied into this repository. In your
// browser this reads each button's own icon, splits it into points, and
// moves them so the motion has a lead and a follow-through: a back arrow's
// head sets off first and its tail catches up, reload's arc whips round
// behind its arrowhead, the downloads tray dips as the arrow lands. Every
// point rides Circuit's spring on the Linger timing, and the frames are laid
// out as a strip that Iconflow's frame counter plays, as it plays Circuit's.
(function () {
  // ---- engine (also loaded by the eye exam and the tests) ----------------
  const IconParts = (() => {
    const FRAMES = 96;
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

    // Circuit's spring: builds up from rest, overshoots, falls back, settles on 1.
    function settle(t, overshoot = 0.2, swings = 2.8) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      const lo = Math.log(overshoot), z = -lo / Math.sqrt(Math.PI ** 2 + lo * lo);
      const wd = swings * Math.PI, wn = wd / Math.sqrt(1 - z * z);
      const x = u => 1 - Math.exp(-z * wn * u) * (Math.cos(wd * u) + z * wn / wd * Math.sin(wd * u));
      return x(t) + (1 - x(1)) * t ** 3;
    }
    // Linger: speed ramps up over the first 30%, eases off over the last 40%,
    // so moves gather speed and the settle has time to read.
    const linger = (() => {
      const n = 400, w = [0], v = p => Math.min(1, p / 0.3) * (p > 0.6 ? 1 - 0.55 * (p - 0.6) / 0.4 : 1);
      for (let i = 1; i <= n; i++) w.push(w[i - 1] + v((i - 0.5) / n));
      return p => { const x = clamp(p) * n, i = Math.min(n - 1, Math.floor(x)); return (w[i] + (w[i + 1] - w[i]) * (x - i)) / w[n]; };
    })();
    // A point that sets off `delay` late still lands with the rest.
    // The follow-through is kept small (GIVE) and the overshoot firmer than
    // Circuit's, so a shape keeps its form instead of stretching like jelly.
    const GIVE = 0.3;
    const ride = (tau, delay, lag) => settle(clamp((linger(tau) - delay * GIVE) / (1 - lag * GIVE)), 0.1);
    // Out and back: a dip that lands, springs and is gone.
    const kick = u => u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u) ** 1.2 * 1.25;

    // ---- paths: everything becomes absolute moves, lines and cubics ----
    function arcToCubics(p0, rx, ry, deg, large, sweep, p1) {
      if (p0[0] === p1[0] && p0[1] === p1[1]) return [];
      rx = Math.abs(rx); ry = Math.abs(ry);
      if (!rx || !ry) return [{ t: "L", p: p1 }];
      const phi = deg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
      const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
      const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
      const lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
      let co = Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den));
      if (large === sweep) co = -co;
      const cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx;
      const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2, cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const a0 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
      let da = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
      if (!sweep && da > 0) da -= 2 * Math.PI; else if (sweep && da < 0) da += 2 * Math.PI;
      const n = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 2) - 1e-9)), step = da / n, k = 4 / 3 * Math.tan(step / 4);
      const at = a => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos];
      const dir = a => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos];
      const out = [];
      for (let j = 0, a = a0; j < n; j++, a += step) {
        const b = a + step, pa = at(a), pb = j === n - 1 ? p1 : at(b), ta = dir(a), tb = dir(b);
        out.push({ t: "C", c1: [pa[0] + k * ta[0], pa[1] + k * ta[1]], c2: [pb[0] - k * tb[0], pb[1] - k * tb[1]], p: pb });
      }
      return out;
    }

    function parsePath(d) {
      const subs = [];
      let i = 0, cmd = "", cur = [0, 0], start = [0, 0], prevC = null, prevQ = null, sub = null;
      const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
      const num = () => {
        skip();
        const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i));
        if (!m) throw new Error("bad path near " + d.slice(i, i + 12));
        i += m[0].length;
        return +m[0];
      };
      const flag = () => { skip(); const c = d[i++]; if (c !== "0" && c !== "1") throw new Error("bad arc flag"); return c === "1"; };
      const add = seg => {
        if (!sub) { sub = { start: [...cur], segs: [], closed: false }; subs.push(sub); }
        sub.segs.push(seg);
      };
      for (;;) {
        skip();
        if (i >= d.length) break;
        if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
        else if (!cmd) throw new Error("path starts without a command");
        const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase();
        const pt = () => { const x = num(), y = num(); return rel ? [cur[0] + x, cur[1] + y] : [x, y]; };
        let next = cur, c2 = null, q = null;
        switch (C) {
          case "M":
            next = pt(); start = next; sub = { start: [...next], segs: [], closed: false }; subs.push(sub);
            cmd = rel ? "l" : "L";
            break;
          case "Z":
            if (sub) sub.closed = true;
            next = [...start]; sub = null;
            break;
          case "L": next = pt(); add({ t: "L", p: next }); break;
          case "H": { const x = num(); next = [rel ? cur[0] + x : x, cur[1]]; add({ t: "L", p: next }); break; }
          case "V": { const y = num(); next = [cur[0], rel ? cur[1] + y : y]; add({ t: "L", p: next }); break; }
          case "C": { const c1 = pt(); c2 = pt(); next = pt(); add({ t: "C", c1, c2, p: next }); break; }
          case "S": {
            const c1 = prevC ? [2 * cur[0] - prevC[0], 2 * cur[1] - prevC[1]] : [...cur];
            c2 = pt(); next = pt(); add({ t: "C", c1, c2, p: next });
            break;
          }
          case "Q": case "T": {
            q = C === "Q" ? pt() : prevQ ? [2 * cur[0] - prevQ[0], 2 * cur[1] - prevQ[1]] : [...cur];
            next = pt();
            add({ t: "C", c1: [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])],
                  c2: [next[0] + 2 / 3 * (q[0] - next[0]), next[1] + 2 / 3 * (q[1] - next[1])], p: next });
            break;
          }
          case "A": {
            const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag();
            next = pt();
            for (const seg of arcToCubics(cur, rx, ry, rot, large, sweep, next)) add(seg);
            break;
          }
          default: throw new Error("unknown path command " + cmd);
        }
        prevC = c2; prevQ = q; cur = next;
      }
      return subs;
    }

    const fmt = v => (Math.round(v * 100) / 100).toString();
    function writePath(subs, map) {
      let d = "";
      subs.forEach((s, n) => {
        const P = p => { const q = map(p, n); return fmt(q[0]) + " " + fmt(q[1]); };
        d += "M" + P(s.start);
        for (const g of s.segs) d += g.t === "L" ? "L" + P(g.p) : "C" + P(g.c1) + " " + P(g.c2) + " " + P(g.p);
        if (s.closed) d += "Z";
      });
      return d;
    }

    // Points along each subpath, curves sampled, for measuring the artwork.
    function samples(subs) {
      const out = [];
      for (const s of subs) {
        let a = s.start;
        out.push(a);
        for (const g of s.segs) {
          if (g.t === "C") for (const t of [0.25, 0.5, 0.75]) {
            const u = 1 - t;
            out.push([0, 1].map(k => u * u * u * a[k] + 3 * u * u * t * g.c1[k] + 3 * u * t * t * g.c2[k] + t * t * t * g.p[k]));
          }
          out.push(a = g.p);
        }
      }
      return out;
    }

    // ---- SVG elements -----------------------------------------------------
    const GEOMETRY = new Set(["d", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "x1", "y1", "x2", "y2", "points", "pathLength"]);
    const DRAWN = "path, line, polyline, polygon, rect, circle, ellipse";
    function outline(el) {
      const a = n => +(el.getAttribute(n) || 0);
      switch (el.localName) {
        case "path": return parsePath(el.getAttribute("d") || "");
        case "line": return parsePath(`M${a("x1")} ${a("y1")}L${a("x2")} ${a("y2")}`);
        case "polyline": case "polygon": {
          const v = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
          let d = "";
          for (let k = 0; k + 1 < v.length; k += 2) d += (k ? "L" : "M") + v[k] + " " + v[k + 1];
          return parsePath(d + (el.localName === "polygon" ? "Z" : ""));
        }
        case "rect": {
          const x = a("x"), y = a("y"), w = a("width"), h = a("height");
          let rx = el.hasAttribute("rx") ? a("rx") : a("ry"), ry = el.hasAttribute("ry") ? a("ry") : rx;
          rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
          return parsePath(rx || ry
            ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
              `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
            : `M${x} ${y}H${x + w}V${y + h}H${x}Z`);
        }
        case "circle": case "ellipse": {
          const cx = a("cx"), cy = a("cy"), rx = el.localName === "circle" ? a("r") : a("rx"), ry = el.localName === "circle" ? a("r") : a("ry");
          return parsePath(`M${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy + ry}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}` +
                           `A${rx} ${ry} 0 0 1 ${cx} ${cy - ry}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}Z`);
        }
      }
      return [];
    }
    const mul = (p, q) => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3],
                           p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
    function matrix(el, root) {
      let m = [1, 0, 0, 1, 0, 0];
      for (let e = el; e && e !== root; e = e.parentNode) {
        let own = [1, 0, 0, 1, 0, 0];
        for (const [, name, args] of (e.getAttribute?.("transform") || "").matchAll(/(\w+)\(([^)]*)\)/g)) {
          const v = args.trim().split(/[\s,]+/).map(Number);
          const r = (v[0] || 0) * Math.PI / 180;
          const q = name === "translate" ? [1, 0, 0, 1, v[0], v[1] || 0]
            : name === "scale" ? [v[0], 0, 0, v[1] ?? v[0], 0, 0]
            : name === "matrix" ? v
            : name === "rotate" ? mul(mul([1, 0, 0, 1, v[1] || 0, v[2] || 0], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -(v[1] || 0), -(v[2] || 0)])
            : [1, 0, 0, 1, 0, 0];
          own = mul(own, q);
        }
        m = mul(own, m);
      }
      return m;
    }
    const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
    const invert = m => {
      const det = m[0] * m[3] - m[1] * m[2] || 1;
      return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
    };
    // A presentation attribute or style, inherited from the nearest ancestor.
    const painted = (el, root, name) => {
      for (let e = el; e; e = e === root ? null : e.parentNode) {
        const v = e.getAttribute(name) ?? (e.getAttribute("style") || "").match(new RegExp("(?:^|;)\\s*" + name + "\\s*:\\s*([^;]+)"))?.[1];
        if (v != null) return v.trim();
      }
      return null;
    };

    // ---- the artwork, measured ---------------------------------------------
    // Parts are what a choreography picks: each element of a filled icon
    // (Zen draws the arrow and the tray, the ring and the hands, as separate
    // paths, and a filled outline keeps its holes), or each stroke of a line
    // icon (New Icons).
    function measure(items, vb) {
      const parts = [], pts = [];
      for (const it of items) {
        it.parts = [];
        it.subs.forEach((sub, n) => {
          if (n && !it.line) return it.parts.push(it.parts[0]);
          const part = { closed: sub.closed, xs: [], ys: [] };
          parts.push(part); it.parts.push(part);
        });
        it.subs.forEach((sub, n) => {
          const part = it.parts[n];
          for (const q of samples([sub])) { const [x, y] = apply(it.m, q); part.xs.push(x); part.ys.push(y); pts.push({ x, y, part }); }
        });
      }
      const pad = Math.max(0, ...items.map(it => it.pad));
      const x0 = Math.min(...pts.map(p => p.x)) - pad, x1 = Math.max(...pts.map(p => p.x)) + pad;
      const y0 = Math.min(...pts.map(p => p.y)) - pad, y1 = Math.max(...pts.map(p => p.y)) + pad;
      for (const q of parts) {
        q.box = [Math.min(...q.xs), Math.min(...q.ys), Math.max(...q.xs), Math.max(...q.ys)];
        q.area = (q.box[2] - q.box[0] + 0.5) * (q.box[3] - q.box[1] + 0.5);
        q.mid = (q.box[1] + q.box[3]) / 2;
      }
      const by = f => parts.reduce((a, b) => (f(b) > f(a) ? b : a), parts[0]);
      by(q => q.area).biggest = true;
      if (parts.length > 1) { by(q => -q.mid).top = true; by(q => q.mid).bottom = true; }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const rmax = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) || 1;
      // The widest empty sector round the centre: where an arc opens.
      const angs = pts.filter(p => Math.hypot(p.x - cx, p.y - cy) > rmax * 0.55).map(p => Math.atan2(p.y - cy, p.x - cx)).sort((a, b) => a - b);
      let gap = { from: 0, to: 0, size: 0 };
      angs.forEach((ang, n) => {
        const b = n + 1 < angs.length ? angs[n + 1] : angs[0] + 2 * Math.PI;
        if (b - ang > gap.size) gap = { from: ang, to: b, size: b - ang };
      });
      const g = { vb, pts, parts, x0, x1, y0, y1, cx, cy, w: x1 - x0 || 1, h: y1 - y0 || 1, rmax, gap,
                  line: items.some(it => it.stroked) && !items.some(it => it.filled) };
      // The centre of the parts a selector picks, for pivots and anchors.
      g.centre = pick => {
        const qs = parts.filter(q => pick(0.5, 0.5, q) > 0.5);
        if (!qs.length) return [cx, cy];
        return [(Math.min(...qs.map(q => q.box[0])) + Math.max(...qs.map(q => q.box[2]))) / 2,
                (Math.min(...qs.map(q => q.box[1])) + Math.max(...qs.map(q => q.box[3]))) / 2];
      };
      return g;
    }

    // ---- motion terms ------------------------------------------------------
    // Each term moves a point by an amount scaled with `k` (shrunk if the move
    // would leave the icon's box), weighted by a region or a part. nx, ny run
    // 0..1 across the artwork's own bounds.
    const norm = (g, x, y) => [(x - g.x0) / g.w, (y - g.y0) / g.h];
    const rot = (x, y, px, py, a) => [px + (x - px) * Math.cos(a) - (y - py) * Math.sin(a) - x, py + (x - px) * Math.sin(a) + (y - py) * Math.cos(a) - y];
    const T = {
      // Slides; the edge in front sets off first and the back catches up, so
      // the shape stretches on the way and settles back to size.
      slide: (dx, dy, { lag = 0.3 } = {}) => g => {
        const len = Math.hypot(dx, dy) || 1, proj = (x, y) => (x * dx + y * dy) / len;
        const c = [[g.x0, g.y0], [g.x1, g.y0], [g.x0, g.y1], [g.x1, g.y1]].map(q => proj(...q));
        const hi = Math.max(...c), span = hi - Math.min(...c) || 1;
        return (x, y, tau, k) => { const v = ride(tau, lag * (hi - proj(x, y)) / span, lag); return [dx * k * v, dy * k * v]; };
      },
      // Turns. lead "gap": the end of an open arc (an arrowhead) leads and the
      // rest follows round; "radial": the middle leads and the tips trail,
      // like arms whipping round; "none": all at once. `trail` is how far, in
      // degrees, the back falls behind at most: the spring is quick, so a
      // small delay is already a long way round.
      spin: (deg, { trail = 30, lead = "radial", about } = {}) => g => {
        const lag = Math.min(0.4, trail / (Math.abs(deg) * 5.4));
        const [px, py] = about ? g.centre(about) : [g.cx, g.cy], arc = 2 * Math.PI - g.gap.size || 2 * Math.PI;
        const head = deg > 0 ? g.gap.from : g.gap.to;
        const s = (x, y) => {
          if (lead === "none") return 0;
          if (lead === "radial") return Math.hypot(x - px, y - py) / g.rmax;
          const ang = Math.atan2(y - py, x - px), back = deg > 0 ? head - ang : ang - head;
          return clamp((((back % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / arc);
        };
        return (x, y, tau, k) => rot(x, y, px, py, deg * k * Math.PI / 180 * ride(tau, lag * s(x, y), lag));
      },
      // Grows (or shrinks) about the centre of what it moves; the middle leads
      // and the rim follows, or the rim leads (rim: true).
      swell: (kx, ky = kx, { lag = 0.25, rim = false, about, from } = {}) => g => {
        const [ax, ay] = from ? from(g) : about ? g.centre(about) : [g.cx, g.cy];
        return (x, y, tau, k) => {
          const r = Math.hypot(x - g.cx, y - g.cy) / g.rmax, v = ride(tau, lag * (rim ? 1 - r : r), lag);
          return [(x - ax) * kx * k * v, (y - ay) * ky * k * v];
        };
      },
      // Out and back: a hop or a dip that is over by the end, staggered
      // across the artwork when `wave` is set.
      dip: (dx, dy, { at = 0, wave = 0 } = {}) => g => (x, y, tau, k) => {
        const v = kick((linger(tau) - at - wave * norm(g, x, y)[0]) / (1 - at - wave));
        return [dx * k * v, dy * k * v];
      },
    };
    // What a term moves: regions fade over a soft edge, so a shape bends where
    // a region ends instead of tearing; parts move whole.
    const R = {
      above: (e, s = 0.12) => (nx, ny) => smooth(e + s, e - s, ny),
      below: (e, s = 0.12) => (nx, ny) => smooth(e - s, e + s, ny),
      left: (e, s = 0.12) => nx => smooth(e + s, e - s, nx),
      right: (e, s = 0.12) => nx => smooth(e - s, e + s, nx),
      band: (a, b, s = 0.1) => nx => smooth(a - s, a + s, nx) * smooth(b + s, b - s, nx),
      inner: (e = 0.55, s = 0.12) => (nx, ny) => smooth(e + s, e - s, Math.hypot(nx - 0.5, ny - 0.5) * 2),
      // parts
      frame: (nx, ny, q) => +!!q.biggest,
      rest: (nx, ny, q) => +!q.biggest,
      top: (nx, ny, q) => +!!q.top,
      bottom: (nx, ny, q) => +!!q.bottom,
      closed: (nx, ny, q) => +!!q.closed,
      open: (nx, ny, q) => +!q.closed,
      all: (...fs) => (nx, ny, q) => fs.reduce((v, f) => v * f(nx, ny, q), 1),
    };
    const on = (weight, term) => Object.assign(g => term(g), { weight, turns: term.turns });
    T.spin = (spin => (...a) => Object.assign(spin(...a), { turns: true }))(T.spin);
    const { slide, spin, swell, dip } = T;

    // Each button's choreography: a list of terms, or { fill, line } when
    // Zen's filled icons and line icons (New Icons) need their own.
    const rewind = [on(R.frame, spin(-360, { lead: "gap", trail: 40 })), on(R.rest, spin(-360, { lead: "none" }))];
    const whip = [spin(90, { trail: 35 })];
    const MOTION = {
      back: [slide(-2, 0)], forward: [slide(2, 0)], chevron: [slide(1.6, 0)], overflow: [slide(1.6, 0, { lag: 0.35 })],
      previous: [slide(-1.6, 0)], next: [slide(1.6, 0)], "close-unpinned": [slide(0, 1.8, { lag: 0.35 })],
      reload: [spin(360, { lead: "gap", trail: 40 })], history: rewind, reopen: rewind,
      forget: [on(R.frame, spin(-360, { lead: "gap", trail: 40 })), on(R.rest, swell(-0.35, -0.35, { lag: 0.1, about: R.rest }))],
      sync: { fill: [slide(1.2, -0.6)], line: [dip(0, -1.6)] },
      stop: whip, quit: whip, "media-close": whip,
      "new-tab": [spin(90, { trail: 35 }), swell(0.08)],
      "zoom-in": [swell(0.22, 0.22, { lag: 0.3 })], "zoom-out": [swell(-0.25, 0, { lag: 0.3 })], minus: [swell(-0.3, 0, { lag: 0.3 })],
      menu: [dip(0, -1.6, { wave: 0.4 })], "app-menu": [swell(0.28, 0, { lag: 0.25 })],
      home: [slide(0, -1.4, { lag: 0.35 })], account: [slide(0, -1.4, { lag: 0.35 })], private: [slide(0, -1.2, { lag: 0.35 })],
      // The arrow lands in the tray, and the tray gives a little.
      downloads: [on(R.top, slide(0, 1.4, { lag: 0.25 })), on(R.bottom, dip(0, 0.8, { at: 0.28 }))],
      "save-page": [on(R.rest, slide(0, 1.2, { lag: 0.25 })), on(R.frame, dip(0, 0.6, { at: 0.3 }))],
      "send-tab": [on(R.rest, slide(0, -1.4, { lag: 0.3 }))], "open-file": [on(R.rest, slide(0, -1.4, { lag: 0.3 }))],
      share: { fill: [on(R.rest, slide(0, -1.6, { lag: 0.3 })), on(R.frame, dip(0, 0.6, { at: 0.3 }))], line: [slide(1.2, -0.9)] },
      print: [on((nx, ny) => R.band(0.3, 0.7)(nx) * R.below(0.62)(nx, ny), slide(0, 1.3, { lag: 0.3 }))],
      paste: [slide(0, 1.2, { lag: 0.35 }), on(R.above(0.15), dip(0, -0.8))],
      copy: [on(R.frame, slide(0.9, -0.9, { lag: 0.3 }))],
      cut: [on(R.left(0.5), spin(-12, { lead: "none" })), on(R.right(0.5), spin(12, { lead: "none" }))],
      extensions: [spin(-14, { trail: 6 }), slide(0, -0.6)],
      bookmark: [swell(0, 0.2, { lag: 0.35, from: g => [g.cx, g.y0] })], bookmarked: [swell(0, 0.2, { lag: 0.35, from: g => [g.cx, g.y0] })],
      reader: [on(R.rest, slide(0, -1.1, { lag: 0.35 }))],
      email: [on(R.frame, slide(0, -1, { lag: 0.3 })), on(R.rest, spin(-30, { lead: "none", about: R.rest }))],
      screenshot: { fill: [on(R.rest, swell(0.3, 0.3, { lag: 0.1, about: R.rest })), on(R.frame, dip(0, 0.5, { at: 0.25 }))],
                    line: [swell(-0.16, -0.16, { rim: true })] },
      settings: [spin(90, { trail: 20 })],
      developer: { fill: [on(R.all(R.rest, R.left(0.6)), slide(-0.9, 0)), on(R.all(R.rest, R.right(0.75)), slide(0.9, 0))],
                   line: [on(R.left(0.35), slide(-1, 0)), on(R.right(0.65), slide(1, 0)), on(R.band(0.4, 0.6), spin(14, { lead: "none" }))] },
      fullscreen: [swell(0.16, 0.16, { rim: true })], "new-window": [swell(0.12, 0.12)], "firefox-view": [swell(0.12, 0.12, { rim: true })],
      pip: [swell(-0.12, -0.12)], play: [swell(0.16, 0.16, { rim: true })], pause: [swell(0, 0.18, { rim: true })],
      volume: [on(R.right(0.6), slide(1, 0, { lag: 0.3 }))], muted: [on(R.right(0.5), dip(0.8, 0))],
      "firefox-library": { fill: [dip(0, -1.4, { wave: 0.45 })], line: [on(R.rest, dip(-1, 1))] },
      "expand-sidebar": { fill: [on(R.rest, slide(-1.4, 0))], line: [on(R.right(0.4), slide(1.2, 0))] },
      sidebar: { fill: [on(R.band(0.5, 0.8), slide(1.4, 0, { lag: 0.2 }))], line: [on(R.rest, slide(-1.6, 0, { lag: 0.2 }))] },
      compact: { fill: [on(R.rest, slide(1.2, 0)), on(R.all(R.frame, R.band(0.42, 0.66)), slide(1.2, 0, { lag: 0.2 }))],
                 line: [on(R.rest, slide(-1.6, 0, { lag: 0.2 }))] },
      // The sliders' knobs run along their tracks and back.
      "site-data": { fill: [on((nx, ny) => R.left(0.5)(nx) * R.above(0.5)(nx, ny) * R.inner(0.7)(nx, ny), dip(2.4, 0)),
                            on((nx, ny) => R.right(0.5)(nx) * R.below(0.5)(nx, ny) * R.inner(0.7)(nx, ny), dip(-2.4, 0, { at: 0.08 }))],
                     line: [on(R.all(R.closed, R.above(0.5)), dip(4, 0)), on(R.all(R.closed, R.below(0.5)), dip(-4, 0, { at: 0.08 }))] },
      find: [on(R.inner(0.4), swell(0.3, 0.3, { lag: 0.1 }))],
      logins: [spin(-16, { trail: 8 })],
      help: [spin(12, { trail: 6 })],
      encoding: [swell(0.14)],
    };
    const FALLBACK = [swell(0.12, 0.12, { rim: true })];

    // Builds the frame strip for one icon: the artwork's SVG text in, an SVG
    // FRAMES frames wide out. Throws on artwork it cannot read.
    function strip(svgText, key, frames = FRAMES) {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml"), svg = doc.documentElement;
      if (svg.localName !== "svg") throw new Error("not an SVG");
      const vb = (svg.getAttribute("viewBox") || `0 0 ${parseFloat(svg.getAttribute("width")) || 16} ${parseFloat(svg.getAttribute("height")) || 16}`)
        .trim().split(/[\s,]+/).map(Number);
      const drawn = el => !el.closest("defs, clipPath, mask, pattern, marker, symbol");
      const all = [...svg.querySelectorAll(DRAWN)].filter(drawn).map(el => {
        const subs = outline(el), m = matrix(el, svg), stroke = painted(el, svg, "stroke"), fill = painted(el, svg, "fill");
        const stroked = !!stroke && stroke !== "none", filled = fill !== "none" && !(fill == null && stroked);
        const sw = stroked ? parseFloat(painted(el, svg, "stroke-width") ?? "1") || 1 : 0;
        return { subs, m, inv: invert(m), stroked, filled, line: stroked && !filled, pad: sw / 2 };
      });
      const items = all.filter(it => it.subs.length);
      if (!items.length) throw new Error("nothing drawn");
      const g = measure(items, vb);
      const build = spec => (Array.isArray(spec) ? spec : spec[g.line ? "line" : "fill"]).map(t => ({ move: t(g), weight: t.weight, turns: t.turns }));
      let terms = build(MOTION[key] || FALLBACK);
      const field = (x, y, tau, k, part) => {
        let dx = 0, dy = 0;
        const [nx, ny] = norm(g, x, y);
        for (const t of terms) {
          const wt = t.weight ? t.weight(nx, ny, part) : 1;
          if (wt <= 0) continue;
          const d = t.move(x, y, tau, k);
          dx += d[0] * wt; dy += d[1] * wt;
        }
        return [x + dx, y + dy];
      };
      // A choreography whose parts this artwork lacks moves nothing: pop instead.
      if (!g.pts.some(p => { const q = field(p.x, p.y, 0.4, 1, p.part); return Math.hypot(q[0] - p.x, q[1] - p.y) > 0.05; })) terms = build(FALLBACK);
      // Shrink the moves until nothing leaves the box, overshoot included.
      const [vx, vy, W, H] = vb, pad = Math.max(...items.map(it => it.pad));
      let k = 1;
      for (let tries = 0; tries < 12; tries++) {
        let out = false;
        for (let f = 0; f <= 24 && !out; f++) for (const p of g.pts) {
          const q = field(p.x, p.y, f / 24, k, p.part);
          if (q[0] - pad < vx - 0.05 || q[0] + pad > vx + W + 0.05 || q[1] - pad < vy - 0.05 || q[1] + pad > vy + H + 0.05) { out = true; break; }
        }
        if (!out) break;
        k *= 0.85;
      }
      const ser = new XMLSerializer(), KEEP = "defs, clipPath, mask, linearGradient, radialGradient, pattern";
      const defs = [...svg.querySelectorAll(KEEP)].filter(e => !e.parentNode.closest?.(KEEP)).map(e => ser.serializeToString(e)).join("");
      const frame = tau => {
        const c = svg.cloneNode(true), els = [...c.querySelectorAll(DRAWN)].filter(drawn);
        els.forEach((el, n) => {
          const it = all[n];
          if (!it.subs.length) return;
          const p = doc.createElementNS(svg.namespaceURI, "path");
          for (const at of [...el.attributes]) if (!GEOMETRY.has(at.name) && at.name !== "id") p.setAttribute(at.name, at.value);
          p.setAttribute("d", writePath(it.subs, (q, sub) => apply(it.inv, field(...apply(it.m, q), tau, k, it.parts[sub]))));
          el.replaceWith(p);
        });
        for (const e of [...c.querySelectorAll(KEEP)]) if (e.isConnected) e.remove();
        return [...c.childNodes].map(e => ser.serializeToString(e)).join("");
      };
      // A faint trail while a slide is fast, gone at rest. Not on turns, where
      // a second copy reads as extra arms.
      const speed = tau => terms.some(t => t.turns) ? 0 : Math.max(...g.pts.map(p => {
        const a = field(p.x, p.y, tau, k, p.part), b = field(p.x, p.y, Math.max(0, tau - 0.045), k, p.part);
        return Math.hypot(a[0] - b[0], a[1] - b[1]);
      }));
      const keep = [...svg.attributes].filter(at => !["width", "height", "viewBox", "x", "y", "xmlns"].includes(at.name))
        .map(at => ` ${at.name}="${at.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`).join("");
      let body = "";
      for (let f = 0; f < frames; f++) {
        const tau = f / (frames - 1), sp = speed(tau), ghost = sp > 0.35 ? Math.min(0.28, (sp - 0.35) * 0.35) : 0;
        body += `<svg x="${f * W}" y="0" width="${W}" height="${H}" viewBox="${vb.join(" ")}" overflow="hidden">` +
          (ghost ? `<g opacity="${fmt(ghost)}">${frame(Math.max(0, tau - 0.045))}</g>` : "") + frame(tau) + "</svg>";
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * frames}" height="${H}" viewBox="0 0 ${W * frames} ${H}"${keep}>${defs}${body}</svg>`;
    }

    return { FRAMES, settle, linger, parsePath, writePath, strip, MOTION };
  })();
  // ---- end engine ---------------------------------------------------------

  if (typeof Services === "undefined") {   // the eye exam and the tests
    globalThis.IconParts = IconParts;
    return;
  }

  // ---- in the browser -------------------------------------------------------
  // Sine can inject a second copy on a rebuild; retire the first.
  const INSTANCE_KEY = "__zziconPartsInstance";
  try { window[INSTANCE_KEY]?.retire?.(); } catch {}
  const instance = { retire: () => {} };
  window[INSTANCE_KEY] = instance;

  const PREFIX = "zzicon.", S = Services.prefs;
  // <targets> written by tools/iconflow-icons.py: each button's setting and icon elements.
  const TARGETS = {
    "back": { setting: "back", icons: ["#back-button .toolbarbutton-icon"] },
    "forward": { setting: "forward", icons: ["#forward-button .toolbarbutton-icon"] },
    "reload": { setting: "reload", icons: ["#reload-button .toolbarbutton-icon"] },
    "stop": { setting: "stop", icons: ["#stop-button .toolbarbutton-icon"] },
    "home": { setting: "home", icons: ["#home-button .toolbarbutton-icon"] },
    "new-tab": { setting: "new-tab", icons: ["#tabs-newtab-button .toolbarbutton-icon", "#zen-create-new-button .toolbarbutton-icon", "#new-tab-button .toolbarbutton-icon", "#appMenu-new-tab-button2 .toolbarbutton-icon"] },
    "menu": { setting: "menu", icons: [".zen-workspaces-actions .toolbarbutton-icon", "#appMenu-more-button2 .toolbarbutton-icon"] },
    "app-menu": { setting: "app-menu", icons: ["#PanelUI-menu-button .toolbarbutton-icon"] },
    "compact": { setting: "compact", icons: ["#zen-toggle-compact-mode .toolbarbutton-icon"] },
    "sidebar": { setting: "sidebar", icons: ["#sidebar-button .toolbarbutton-icon"] },
    "expand-sidebar": { setting: "expand-sidebar", icons: ["#zen-expand-sidebar-button .toolbarbutton-icon"] },
    "site-data": { setting: "site-data", icons: ["#zen-site-data-icon-button image"] },
    "downloads": { setting: "downloads", icons: ["#downloads-button .toolbarbutton-icon", "#appMenu-downloads-button .toolbarbutton-icon"] },
    "extensions": { setting: "extensions", icons: ["#unified-extensions-button .toolbarbutton-icon", "#add-ons-button .toolbarbutton-icon", "#appMenu-extensions-themes-button .toolbarbutton-icon", "#appMenu-unified-extensions-button .toolbarbutton-icon"] },
    "bookmark": { setting: "bookmark", icons: ["#star-button:not([starred])", "#bookmarks-menu-button .toolbarbutton-icon", "#appMenu-bookmarks-button .toolbarbutton-icon"] },
    "bookmarked": { setting: "bookmark", icons: ["#star-button[starred]"] },
    "reader": { setting: "reader", icons: ["#reader-mode-button > .urlbar-icon"] },
    "share": { setting: "share", icons: ["#zen-copy-current-url-button .toolbarbutton-icon", "#share-tab-button .toolbarbutton-icon"] },
    "history": { setting: "history", icons: ["#history-panelmenu .toolbarbutton-icon", "#appMenu-history-button .toolbarbutton-icon", "#PanelUI-historyMore .toolbarbutton-icon"] },
    "screenshot": { setting: "screenshot", icons: ["#screenshot-button .toolbarbutton-icon"] },
    "overflow": { setting: "overflow", icons: ["#nav-bar-overflow-button .toolbarbutton-icon"] },
    "chevron": { setting: "chevron", icons: ["#PlacesChevron .toolbarbutton-icon"] },
    "close-unpinned": { setting: "close-unpinned", icons: [".zen-workspace-close-unpinned-tabs-button .toolbarbutton-icon"] },
    "play": { setting: "play", icons: [".zen-media-card:not(.playing) .zen-media-playpause-button .toolbarbutton-icon"] },
    "pause": { setting: "play", icons: [".zen-media-card.playing .zen-media-playpause-button .toolbarbutton-icon"] },
    "next": { setting: "next", icons: [".zen-media-nexttrack-button .toolbarbutton-icon"] },
    "previous": { setting: "previous", icons: [".zen-media-previoustrack-button .toolbarbutton-icon"] },
    "volume": { setting: "volume", icons: [".zen-media-card:not([muted]) .zen-media-mute-button .toolbarbutton-icon"] },
    "muted": { setting: "volume", icons: [".zen-media-card[muted] .zen-media-mute-button .toolbarbutton-icon"] },
    "media-close": { setting: "media-close", icons: [".zen-media-close-button .toolbarbutton-icon"] },
    "pip": { setting: "pip", icons: [".zen-media-pip-button .toolbarbutton-icon"] },
    "save-page": { setting: "save-page", icons: ["#save-page-button .toolbarbutton-icon", "#appMenu-save-file-button2 .toolbarbutton-icon"] },
    "print": { setting: "print", icons: ["#print-button .toolbarbutton-icon", "#appMenu-print-button2 .toolbarbutton-icon"] },
    "find": { setting: "find", icons: ["#find-button .toolbarbutton-icon", "#appMenu-find-button2 .toolbarbutton-icon", "#appMenuSearchHistory .toolbarbutton-icon"] },
    "open-file": { setting: "open-file", icons: ["#open-file-button .toolbarbutton-icon"] },
    "zoom-in": { setting: "zoom", icons: ["#zoom-in-button .toolbarbutton-icon", "#appMenu-zoomEnlarge-button2 .toolbarbutton-icon"] },
    "zoom-out": { setting: "zoom", icons: ["#zoom-out-button .toolbarbutton-icon", "#appMenu-zoomReduce-button2 .toolbarbutton-icon"] },
    "cut": { setting: "edit", icons: ["#cut-button .toolbarbutton-icon"] },
    "copy": { setting: "edit", icons: ["#copy-button .toolbarbutton-icon"] },
    "paste": { setting: "edit", icons: ["#paste-button .toolbarbutton-icon"] },
    "encoding": { setting: "encoding", icons: ["#characterencoding-button .toolbarbutton-icon"] },
    "email": { setting: "email", icons: ["#email-link-button .toolbarbutton-icon"] },
    "logins": { setting: "logins", icons: ["#logins-button .toolbarbutton-icon", "#appMenu-passwords-button .toolbarbutton-icon"] },
    "sync": { setting: "sync", icons: ["#sync-button .toolbarbutton-icon"] },
    "send-tab": { setting: "send-tab", icons: ["#send-tab-button .toolbarbutton-icon"] },
    "import": { setting: "import", icons: ["#import-button .toolbarbutton-icon"] },
    "settings": { setting: "settings", icons: ["#preferences-button .toolbarbutton-icon", "#appMenu-settings-button .toolbarbutton-icon"] },
    "forget": { setting: "forget", icons: ["#panic-button .toolbarbutton-icon", "#appMenuClearRecentHistory .toolbarbutton-icon"] },
    "private": { setting: "private", icons: ["#privatebrowsing-button .toolbarbutton-icon", "#appMenu-new-private-window-button2 .toolbarbutton-icon"] },
    "firefox-view": { setting: "firefox-view", icons: ["#firefox-view-button .toolbarbutton-icon"] },
    "developer": { setting: "developer", icons: ["#developer-button .toolbarbutton-icon"] },
    "new-window": { setting: "new-window", icons: ["#new-window-button .toolbarbutton-icon", "#appMenu-new-window-button2 .toolbarbutton-icon", "#appMenu-new-zen-unsynced-window-button .toolbarbutton-icon", "#appMenuRecentlyClosedWindows .toolbarbutton-icon"] },
    "fullscreen": { setting: "fullscreen", icons: ["#fullscreen-button .toolbarbutton-icon", "#appMenu-fullscreen-button2 .toolbarbutton-icon"] },
    "firefox-library": { setting: "firefox-library", icons: ["#library-button .toolbarbutton-icon"] },
    "account": { setting: "account", icons: ["#fxa-toolbar-menu-button .toolbarbutton-icon"] },
    "reopen": { setting: "reopen", icons: ["#appMenuRecentlyClosedTabs .toolbarbutton-icon", "#appMenu-library-recentlyClosedTabs .toolbarbutton-icon"] },
    "help": { setting: "help", icons: ["#appMenu-help-button2 .toolbarbutton-icon"] },
    "quit": { setting: "quit", icons: ["#appMenu-quit-button2 .toolbarbutton-icon"] },
    "minus": { setting: "minus", icons: [".tab-reset-button", ".tab-reset-pin-button image"] },
  };
  // </targets>
  const int = name => { try { return S.getIntPref(name, 0); } catch { return 0; } };
  // Zen's own, animated: the set is Zen's own and the button follows it, or
  // the button picks Zen's own, animated (6) itself.
  const animated = key => {
    const b = int(PREFIX + "button." + TARGETS[key].setting);
    return (int(PREFIX + "set") === 0 && b === 0) || b === 6;
  };
  const strips = new Map();   // key + artwork -> strip URL (a promise)
  async function artwork(url) {
    if (url.startsWith("data:")) {
      const comma = url.indexOf(","), head = url.slice(0, comma), body = url.slice(comma + 1);
      return head.includes(";base64") ? atob(body) : decodeURIComponent(body);
    }
    return (await fetch(url)).text();
  }
  const imageOf = el => {
    const cs = window.getComputedStyle(el);
    for (const v of [cs.listStyleImage, cs.backgroundImage]) {
      const m = /^url\("(.+)"\)$/.exec(v || "");
      if (m) return m[1];
    }
    return null;
  };
  const undress = el => { el.removeAttribute("zzicon-own"); el.style.removeProperty("--zzicon-own"); delete el.zziconKey; };
  async function dress(el, key) {
    undress(el);                  // read the button's own image, not our strip
    el.zziconKey = key;
    const url = imageOf(el);
    if (!url || !/\.svg([?#]|$)|^data:image\/svg\+xml/.test(url)) return;
    const id = key + "\n" + url;
    if (!strips.has(id)) strips.set(id, artwork(url)
      .then(text => "data:image/svg+xml," + encodeURIComponent(IconParts.strip(text, key)))
      .catch(e => { console.warn("[Iconflow] could not animate", key, url.slice(0, 80), e); return null; }));
    const strip = await strips.get(id);
    if (!strip || !el.isConnected || el.zziconKey !== key) return;
    el.style.setProperty("--zzicon-own", `url("${strip}")`);
    el.setAttribute("zzicon-own", "");
  }
  // State that swaps a button's icon: the star when a page is saved, the
  // media card's play/pause and mute. Only those elements are watched.
  const watch = new MutationObserver(() => soon());
  function scan(force) {
    for (const el of document.querySelectorAll("#star-button, .zen-media-card"))
      watch.observe(el, { attributes: true, attributeFilter: ["starred", "muted", "class"] });
    const seen = new Set(), animate = S.getBoolPref(PREFIX + "animate", true);
    for (const [key, { icons }] of Object.entries(TARGETS)) {
      if (!animate || !animated(key)) continue;
      for (const sel of icons) for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (force || el.zziconKey !== key) dress(el, key);
      }
    }
    for (const el of document.querySelectorAll("[zzicon-own]")) if (!seen.has(el)) undress(el);
  }
  let timer = 0, forced = false;
  const soon = (force = false) => {
    forced ||= force;
    clearTimeout(timer);
    timer = setTimeout(() => { const f = forced; forced = false; try { scan(f); } catch (e) { console.error("[Iconflow] parts:", e); } }, 80);
  };
  const observer = { observe: () => soon(true) };
  const events = [["TabOpen", gBrowser.tabContainer], ["popupshown", window], ["ViewShown", window], ["aftercustomization", window]];
  const onEvent = () => soon();
  S.addObserver(PREFIX, observer);
  for (const [type, target] of events) target.addEventListener(type, onEvent);
  window.addEventListener("load", () => soon(true), { once: true });
  soon(true);
  instance.retire = () => {
    clearTimeout(timer);
    watch.disconnect();
    try { S.removeObserver(PREFIX, observer); } catch {}
    for (const [type, target] of events) try { target.removeEventListener(type, onEvent); } catch {}
    for (const el of document.querySelectorAll("[zzicon-own]")) undress(el);
  };
  window.addEventListener("unload", () => instance.retire(), { once: true });
})();
