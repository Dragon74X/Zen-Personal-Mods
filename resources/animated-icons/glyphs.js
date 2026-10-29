/* Zen animated icon glyphs. 24-unit grid, stroke artwork, M/C/Z paths only.
   Each glyph is a function of k: 0 is rest; 1 is the action shape (or the other
   state of a toggle). Every k yields the same path commands, so any two k values
   interpolate point for point. Window close/minimize/maximize/restore are excluded. */
(() => {
  const PI = Math.PI, rad = a => a * PI / 180, cos = a => Math.cos(rad(a)), sin = a => Math.sin(rad(a));
  const L = (a, b, k) => a + (b - a) * k;
  const f = n => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? '0' : String(v); };
  const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

  class Pen {
    constructor(x, y) { this.s = `M${f(x)} ${f(y)}`; this.x = this.x0 = x; this.y = this.y0 = y; }
    c(x1, y1, x2, y2, x, y) { this.s += `C${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(x)} ${f(y)}`; this.x = x; this.y = y; return this; }
    l(x, y) { const a = this.x, b = this.y; return this.c(a + (x - a) / 3, b + (y - b) / 3, a + (x - a) * 2 / 3, b + (y - b) * 2 / 3, x, y); }
    // Continue along an ellipse arc; degrees, clockwise positive. Pen must sit at the arc start.
    a(cx, cy, rx, ry, a0, a1, n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90 - 1e-9))) {
      const s = rad(a1 - a0) / n, k = 4 / 3 * Math.tan(s / 4);
      for (let i = 0; i < n; i++) {
        const t0 = rad(a0) + s * i, t1 = t0 + s;
        const x1 = cx + rx * Math.cos(t1), y1 = cy + ry * Math.sin(t1);
        this.c(cx + rx * Math.cos(t0) - k * rx * Math.sin(t0), cy + ry * Math.sin(t0) + k * ry * Math.cos(t0),
          x1 + k * rx * Math.sin(t1), y1 - k * ry * Math.cos(t1), x1, y1);
      }
      return this;
    }
    z() { this.l(this.x0, this.y0); this.s += 'Z'; return this; }
    toString() { return this.s; }
  }
  const M = (x, y) => new Pen(x, y);
  const line = (x1, y1, x2, y2) => M(x1, y1).l(x2, y2) + '';
  const dot = (x, y) => line(x, y, x, y);
  const poly = (pts, close = false) => { const p = M(...pts[0]); for (const q of pts.slice(1)) p.l(...q); return (close ? p.z() : p) + ''; };
  const arc = (cx, cy, r, a0, a1, n, ry = r) => M(cx + r * cos(a0), cy + ry * sin(a0)).a(cx, cy, r, ry, a0, a1, n) + '';
  const circle = (cx, cy, r, ry = r) => M(cx + r, cy).a(cx, cy, r, ry, 0, 360, 4).z() + '';
  const rrect = (x, y, w, h, r) => M(x + r, y).l(x + w - r, y).a(x + w - r, y + r, r, r, -90, 0, 1).l(x + w, y + h - r)
    .a(x + w - r, y + h - r, r, r, 0, 90, 1).l(x + r, y + h).a(x + r, y + h - r, r, r, 90, 180, 1).l(x, y + r)
    .a(x + r, y + r, r, r, 180, 270, 1).z() + '';
  // Chevron with its tip at (x, y), pointing along dir degrees.
  const head = (x, y, dir, len = 3.6, spread = 42) => poly([[x - len * cos(dir - spread), y - len * sin(dir - spread)], [x, y], [x - len * cos(dir + spread), y - len * sin(dir + spread)]]);
  const star = (cx, cy, R, r, n = 5, rot = -90) => poly(Array.from({ length: n * 2 }, (_, i) => { const a = rot + i * 180 / n, q = i % 2 ? r : R; return [cx + q * cos(a), cy + q * sin(a)]; }), true);
  const xf = (d, fn) => { let i = 0, x = 0; return d.replace(NUM, m => { const v = +m; if (i++ % 2 === 0) { x = v; return '\u0000'; } const [a, b] = fn(x, v); return `${f(a)} ${f(b)}`; }).replace(/\u0000 ?/g, ''); };
  const move = (d, dx, dy) => xf(d, (x, y) => [x + dx, y + dy]);
  const rot = (d, deg, cx = 12, cy = 12) => xf(d, (x, y) => [cx + (x - cx) * cos(deg) - (y - cy) * sin(deg), cy + (x - cx) * sin(deg) + (y - cy) * cos(deg)]);
  const scl = (d, s, cx = 12, cy = 12, sy = s) => xf(d, (x, y) => [cx + (x - cx) * s, cy + (y - cy) * sy]);
  const mix = (a, b, k) => { const v = b.match(NUM); let i = 0; return a.replace(NUM, m => f(L(+m, +v[i++], k))); };
  const mirror = parts => parts.map(p => typeof p === 'string' ? xf(p, (x, y) => [24 - x, y]) : { ...p, d: xf(p.d, (x, y) => [24 - x, y]) });
  const flipY = parts => parts.map(p => typeof p === 'string' ? xf(p, (x, y) => [x, 24 - y]) : { ...p, d: xf(p.d, (x, y) => [x, 24 - y]) });
  const xLines = (cx, cy, R, a) => [line(cx + R * cos(a + 180), cy + R * sin(a + 180), cx + R * cos(a), cy + R * sin(a)), line(cx + R * cos(a + 270), cy + R * sin(a + 270), cx + R * cos(a + 90), cy + R * sin(a + 90))];
  const corners = (i, a = 3.5, b = 20.5, s = 4.5) => [
    poly([[a + i, a + s + i], [a + i, a + i], [a + s + i, a + i]]), poly([[b - s - i, a + i], [b - i, a + i], [b - i, a + s + i]]),
    poly([[b - i, b - s - i], [b - i, b - i], [b - s - i, b - i]]), poly([[a + s + i, b - i], [a + i, b - i], [a + i, b - s - i]])];
  // Crescent: outer circle O minus circle C, as an outer arc and an inner arc.
  const crescent = (ox, oy, R, cx, cy, r) => {
    const dx = cx - ox, dy = cy - oy, d = Math.hypot(dx, dy), a = (R * R - r * r + d * d) / (2 * d), h = Math.sqrt(R * R - a * a);
    const px = ox + a * dx / d, py = oy + a * dy / d, i1 = [px - h * dy / d, py + h * dx / d], i2 = [px + h * dy / d, py - h * dx / d];
    const deg = (p, c) => Math.atan2(p[1] - c[1], p[0] - c[0]) * 180 / PI;
    let o1 = deg(i1, [ox, oy]), o2 = deg(i2, [ox, oy]); if (o2 < o1) o2 += 360;
    let c1 = deg(i2, [cx, cy]), c2 = deg(i1, [cx, cy]); if (c2 > c1) c2 -= 360;
    return M(...i1).a(ox, oy, R, R, o1, o2, 4).a(cx, cy, r, r, c1, c2, 2).z() + '';
  };
  const tab = (x, y, w, h, r) => M(x, y + h).l(x, y + r).a(x + r, y + r, r, r, 180, 270, 1).l(x + w - r, y).a(x + w - r, y + r, r, r, 270, 360, 1).l(x + w, y + h).z() + '';

  const list = [];
  // meta: kind (motion intent), dir, pivot, toggle labels, used-in note
  const g = (id, label, group, meta, fn) => list.push({ id, label, group, kind: 'pop', dir: [0, -1], ...meta, fn });

  /* Navigation */
  const back = k => [line(L(19, 16.5, k), 12, L(5, 4, k), 12), poly([[L(11, 9.6, k), L(6, 5, k)], [L(5, 4, k), 12], [L(11, 9.6, k), L(18, 19, k)]])];
  g('back', 'Back', 'Navigation', { kind: 'dir', dir: [-1, 0], used: 'Toolbar, context menu' }, back);
  g('forward', 'Forward', 'Navigation', { kind: 'dir', dir: [1, 0], used: 'Toolbar, context menu' }, k => mirror(back(k)));
  const reload = k => { const r = 7.2, a0 = L(-40, 5, k), a1 = L(270, 300, k); return [arc(12, 12, r, a0, a1, 4), head(12 + r * cos(a1) + .3 * cos(a1 + 90), 12 + r * sin(a1) + .3 * sin(a1 + 90), a1 + 90, 3.5, 44)]; };
  g('reload', 'Reload', 'Navigation', { kind: 'spin', spin: 1, used: 'Toolbar, context menu, Tab Router picture refresh' }, reload);
  g('stop', 'Stop', 'Navigation', { kind: 'shake', used: 'Toolbar, context menu' }, k => xLines(12, 12, L(8.4, 6.4, k), L(45, 90, k)));
  g('home', 'Home', 'Navigation', { kind: 'dir', dir: [0, -1], used: 'Toolbar' }, k => [
    poly([[3.5, L(11.2, 10, k)], [12, L(3.8, 2.2, k)], [20.5, L(11.2, 10, k)]]),
    { d: poly([[5.8, 9.4], [5.8, 20], [18.2, 20], [18.2, 9.4]]), a: 1 },
    poly([[L(10, 10.7, k), 20], [L(10, 10.7, k), L(15, 16.2, k)], [L(14, 13.3, k), L(15, 16.2, k)], [L(14, 13.3, k), 20]])]);
  g('new-tab', 'New tab', 'Navigation', { kind: 'spin', spin: 1, used: 'Toolbar, sidebar, app menu, context menu' }, k => [
    ...xLines(12, 12, L(7, 4.4, k), L(0, 90, k)),
    { d: rrect(L(9.5, 3.5, k), L(9.5, 3.5, k), L(5, 17, k), L(5, 17, k), L(2.5, 4.5, k)), o: k }]);
  g('new-window', 'New window', 'Navigation', { kind: 'pop', used: 'App menu, context menu' }, k => [
    { d: rrect(L(3.5, 2.5, k), L(5, 4, k), L(17, 19, k), L(14, 16, k), 2.5), a: 1 },
    line(L(3.5, 2.5, k), L(9, 8.4, k), L(20.5, 21.5, k), L(9, 8.4, k)),
    ...xLines(12, L(14.2, 14.4, k), L(2.6, 3.3, k), L(0, 90, k))]);
  g('private', 'New private window', 'Navigation', { kind: 'dir', dir: [0, -1], used: 'App menu, context menu' }, k => {
    const y = L(0, -1.2, k);
    return [M(3.5, 8.6 + y).c(3.5, 6.2 + y, 8.8, 5.6 + y, 12, 7.4 + y).c(15.2, 5.6 + y, 20.5, 6.2 + y, 20.5, 8.6 + y).c(20.5, 13.2 + y, 18.2, 16.6 + y, 15.2, 16.6 + y)
      .c(13.6, 16.6 + y, 13.1, 14.6 + y, 12, 14.6 + y).c(10.9, 14.6 + y, 10.4, 16.6 + y, 8.8, 16.6 + y).c(5.8, 16.6 + y, 3.5, 13.2 + y, 3.5, 8.6 + y).z() + '',
    circle(8.3, 10.8 + y, 1.9, L(1.15, .3, k)), circle(15.7, 10.8 + y, 1.9, L(1.15, .3, k))];
  });

  /* Toolbar and app menu */
  g('app-menu', 'Menu / Close', 'Toolbar & app menu', { kind: 'pulse', toggle: ['Open application menu', 'Close application menu'], used: 'Toolbar (state follows menu)' }, k => [
    line(L(4.5, 6, k), 6, L(19.5, 18, k), L(6, 18, k)), { d: line(L(4.5, 12, k), 12, L(19.5, 12, k), 12), o: 1 - k }, line(L(4.5, 6, k), 18, L(19.5, 18, k), L(18, 6, k))]);
  g('overflow', 'More tools', 'Toolbar & app menu', { kind: 'dir', dir: [1, 0], used: 'Toolbar overflow' }, k => [
    poly([[L(6, 8, k), 6.5], [L(11.5, 13, k), 12], [L(6, 8, k), 17.5]]), poly([[L(12.5, 13.6, k), 6.5], [L(18, 19.1, k), 12], [L(12.5, 13.6, k), 17.5]])]);
  g('chevron', 'Dropdown / bookmarks overflow', 'Toolbar & app menu', { kind: 'dir', dir: [0, 1], used: 'Bookmarks toolbar chevron, dropdowns' }, k => [poly([[6, L(9, 15, k)], [12, L(15, 9, k)], [18, L(9, 15, k)]])]);
  g('downloads', 'Downloads', 'Toolbar & app menu', { kind: 'dir', dir: [0, 1], used: 'Toolbar, app menu, sidebar' }, k => [
    line(12, L(3.5, 7, k), 12, L(15, 18, k)), poly([[L(7.5, 8, k), L(10.5, 13.5, k)], [12, L(15.5, 18.5, k)], [L(16.5, 16, k), L(10.5, 13.5, k)]]),
    { d: poly([[4, 15.5], [4, L(20, 20.6, k)], [20, L(20, 20.6, k)], [20, 15.5]]), a: 1 }]);
  g('extensions', 'Extensions', 'Toolbar & app menu', { kind: 'pop', used: 'Toolbar, app menu' }, k => {
    const t = L(4.6, 3.4, k), r = L(19.9, 21, k);
    return [M(4.5, 8.5).l(8.6, 8.5).c(7.4, 7.4, 8.4, t, 10.25, t).c(12.1, t, 13.1, 7.4, 11.9, 8.5).l(16, 8.5).l(16, 12.6)
      .c(17.1, 11.4, r, 12.4, r, 14.25).c(r, 16.1, 17.1, 17.1, 16, 15.9).l(16, 20).l(4.5, 20).z() + ''];
  });
  g('bookmark', 'Bookmark / Saved', 'Toolbar & app menu', { kind: 'spin', spin: 1, toggle: ['Bookmark this page', 'Edit bookmark'], used: 'Address bar star, context menu' }, k => [
    { d: star(12, 12.6, L(8.6, 8.9, k), L(3.9, 4.3, k)), f: k }]);
  g('bookmarks', 'Bookmarks', 'Toolbar & app menu', { kind: 'dir', dir: [0, 1], used: 'Bookmarks menu, app menu' }, k => [
    { d: poly([[6.5, 3.8], [17.5, 3.8], [17.5, L(20.5, 21.2, k)], [12, L(16.3, 15, k)], [6.5, L(20.5, 21.2, k)]], true), f: k * .2 },
    line(L(9.5, 9, k), L(8, 9.4, k), L(14.5, 15, k), L(8, 9.4, k))]);
  g('history', 'History', 'Toolbar & app menu', { kind: 'spin', spin: -1, used: 'Toolbar, app menu' }, k => {
    const a0 = L(-170, -200, k), r = 8;
    return [arc(12, 12, r, a0, L(140, 110, k), 4), head(12 + r * cos(a0), 12 + r * sin(a0), a0 - 90, 3, 44), rot(poly([[12, 7.4], [12, 12], [15.2, 14]]), L(0, -70, k))];
  });
  g('library', 'Library', 'Toolbar & app menu', { kind: 'pulse', used: 'Toolbar, Zen Library button' }, k => [
    rrect(3.5, 4.5, 3.4, 15.5, 1), rrect(L(8.1, 7.6, k), 4.5, 3.4, 15.5, 1), rot(rrect(12.8, 5, 3.4, 15, 1), L(16, 4, k), 12.8, 20)]);
  g('screenshot', 'Screenshot', 'Toolbar & app menu', { kind: 'pop', used: 'Toolbar, context menu' }, k => [...corners(L(0, 1.6, k)), circle(12, 12, L(2.6, 3.6, k))]);
  g('open-file', 'Open file / folder', 'Toolbar & app menu', { kind: 'dir', dir: [0, -1], used: 'Toolbar, Groupflow convert to folder' }, k => [
    { d: poly([[3.5, 19], [3.5, 5.5], [9, 5.5], [11, 7.5], [19, 7.5], [19, L(10.5, 9, k)]]), a: 1 },
    poly([[3.5, 19], [L(6.5, 7.6, k), L(10.5, 9, k)], [L(21, 22.2, k), L(10.5, 9, k)], [18, 19]], true)]);
  g('settings', 'Settings', 'Toolbar & app menu', { kind: 'spin', spin: 1, used: 'Toolbar, app menu' }, k => {
    const R = L(8.8, 9.3, k), r = L(6.6, 6.4, k), o = L(0, 22.5, k), pts = [];
    for (let i = 0; i < 8; i++) { const c = i * 45 + o; for (const [q, a] of [[r, -17], [R, -9], [R, 9], [r, 17]]) pts.push([12 + q * cos(c + a), 12 + q * sin(c + a)]); }
    return [poly(pts, true), circle(12, 12, L(2.8, 3.3, k))];
  });
  g('find', 'Find / search', 'Toolbar & app menu', { kind: 'scan', used: 'App menu, context menu search, address bar' }, k => [
    circle(L(10.5, 10, k), L(10.5, 10, k), L(6.2, 7.2, k)), { d: line(L(15, 15.3, k), L(15, 15.3, k), L(20, 19.4, k), L(20, 19.4, k)), a: 1 }]);
  g('zoom-in', 'Zoom in', 'Toolbar & app menu', { kind: 'pop', used: 'Toolbar, app menu' }, k => [
    circle(10.5, 10.5, L(6.8, 7.6, k)), { d: line(L(15.3, 15.9, k), L(15.3, 15.9, k), 20.3, 20.3), a: 1 }, ...xLines(10.5, 10.5, L(2.6, 3.4, k), L(0, 90, k))]);
  g('zoom-out', 'Zoom out', 'Toolbar & app menu', { kind: 'pop', used: 'Toolbar, app menu' }, k => [
    circle(10.5, 10.5, L(6.8, 5.8, k)), { d: line(L(15.3, 14.6, k), L(15.3, 14.6, k), 20.3, 20.3), a: 1 }, line(L(7.9, 8.8, k), 10.5, L(13.1, 12.2, k), 10.5)]);
  g('zoom-reset', 'Reset zoom', 'Toolbar & app menu', { kind: 'pop', used: 'Address bar zoom indicator' }, k => [
    { d: rrect(L(3.5, 2.5, k), 6.5, L(17, 19, k), 11, 3), a: 1 }, line(L(8.5, 7.6, k), 9.5, L(8.5, 7.6, k), 14.5),
    dot(12, L(10.4, 10, k)) , dot(12, L(13.6, 14, k)), line(L(15.5, 16.4, k), 9.5, L(15.5, 16.4, k), 14.5)].map((d, i) => i === 2 || i === 3 ? { d, w: 1.3 } : d));
  g('cut', 'Cut', 'Toolbar & app menu', { kind: 'swing', pivot: [12, 10.4], used: 'Toolbar, context menu' }, k => {
    const o = L(0, 2.6, k);
    return [{ d: circle(L(7, 6.2, k), 17.4, 2.6), s: 1 }, { d: line(8.4, 15.2, 16.6 + o, 4.4 + o * .3), s: 1 },
      { d: circle(L(17, 17.8, k), 17.4, 2.6), s: -1 }, { d: line(15.6, 15.2, 7.4 - o, 4.4 + o * .3), s: -1 }];
  });
  g('copy', 'Copy', 'Toolbar & app menu', { kind: 'dir', dir: [.7, .7], used: 'Toolbar, context menu, Glassflow appearance, Library' }, k => {
    const d = L(0, 1.2, k);
    return [{ d: move(M(9, 15).l(6.2, 15).a(6.2, 12.8, 2.2, 2.2, 90, 180).l(4, 6.2).a(6.2, 6.2, 2.2, 2.2, 180, 270).l(12.8, 4).a(12.8, 6.2, 2.2, 2.2, 270, 360).l(15, 9) + '', -d, -d), s: -1 },
      { d: rrect(9 + d, 9 + d, 11, 11, 2.2), s: 1 }];
  });
  g('paste', 'Paste', 'Toolbar & app menu', { kind: 'dir', dir: [0, 1], used: 'Toolbar, context menu' }, k => [
    { d: rrect(5, 4.5, 14, 16.5, 2.2), a: 1 }, rrect(9, L(3, 1.4, k), 6, 3.4, 1.2),
    line(8.5, L(11, 11.6, k), L(15.5, 16, k), L(11, 11.6, k)), line(8.5, L(15, 15.8, k), L(13.5, 15.5, k), L(15, 15.8, k))]);
  g('print', 'Print', 'Toolbar & app menu', { kind: 'dir', dir: [0, 1], used: 'Toolbar, app menu, context menu' }, k => [
    { d: poly([[7, 8], [7, 3.5], [17, 3.5], [17, 8]]), a: 1 },
    { d: M(7, 16.5).l(5.5, 16.5).a(5.5, 14.5, 2, 2, 90, 180).l(3.5, 10).a(5.5, 10, 2, 2, 180, 270).l(18.5, 8).a(18.5, 10, 2, 2, 270, 360).l(20.5, 14.5).a(18.5, 14.5, 2, 2, 0, 90).l(17, 16.5) + '', a: 1 },
    poly([[7, 13.5], [7, L(20.5, 22.2, k)], [17, L(20.5, 22.2, k)], [17, 13.5]])]);
  g('save-page', 'Save', 'Toolbar & app menu', { kind: 'dir', dir: [0, 1], used: 'Toolbar, app menu, context menu, Glassflow/Groupflow save' }, k => [
    { d: poly([[4, 4], [16.5, 4], [20, 7.5], [20, 20], [4, 20]], true), a: 1 },
    poly([[L(8, 10, k), 4], [L(8, 10, k), 8.5], [L(15, 17, k), 8.5], [L(15, 17, k), 4]]), rrect(7.5, L(13, 12.2, k), 9, L(7, 7.8, k), 1.2)]);
  g('encoding', 'Text encoding', 'Toolbar & app menu', { kind: 'pop', used: 'Toolbar' }, k => [
    rot(poly([[3.5, 19], [8, 5], [12.5, 19]]) + line(5.2, 14, 10.8, 14), L(0, 10, k), 8, 19),
    move(circle(17.2, 15.6, 2.6) + line(19.8, 13, 19.8, 19), 0, L(0, -2, k))]);
  g('email', 'Email link', 'Toolbar & app menu', { kind: 'dir', dir: [.6, -.8], used: 'Toolbar' }, k => [
    { d: rrect(3.5, 5.5, 17, 13, 2), a: 1 }, poly([[4.3, 7], [12, L(13, 1.8, k)], [19.7, 7]])]);
  g('passwords', 'Passwords', 'Toolbar & app menu', { kind: 'swing', pivot: [7.5, 12], used: 'Toolbar, app menu' }, k => [
    circle(7.5, 12, L(3.8, 4.3, k)), line(L(11.3, 11.8, k), 12, 20.5, 12), line(17.6, 12, 17.6, L(15, 16.2, k)), line(20.5, 12, 20.5, L(14.5, 15.6, k))]);
  g('sync', 'Sync', 'Toolbar & app menu', { kind: 'spin', spin: 1, used: 'Toolbar' }, k => {
    const t = L(0, 70, k), r = 7, end = a => [12 + r * cos(a), 12 + r * sin(a)];
    return [arc(12, 12, r, 200 + t, 330 + t, 2), head(...end(330 + t), 420 + t, 3, 44), arc(12, 12, r, 20 + t, 150 + t, 2), head(...end(150 + t), 240 + t, 3, 44)];
  });
  g('send-tab', 'Send tab to device', 'Toolbar & app menu', { kind: 'dir', dir: [1, 0], used: 'Toolbar, context menu' }, k => [
    { d: rrect(14.5, 5, 6, 14, 1.6) + line(16.6, 16.4, 18.4, 16.4), a: 1 },
    line(L(3.5, 6.5, k), 12, L(11, 13, k), 12), head(L(11.2, 13.2, k), 12, 0, 3.6, 45)]);
  g('import', 'Import', 'Toolbar & app menu', { kind: 'dir', dir: [-.6, .8], used: 'Toolbar, download prompt replace' }, k => {
    const dx = L(0, -1.2, k), dy = L(0, 1.8, k);
    return [{ d: poly([[4, 12.5], [4, 20], [20, 20], [20, 12.5]]), a: 1 }, move(line(19, 4, 10.6, 12.4), dx, dy), move(poly([[10.6, 7.2], [10.6, 12.4], [15.8, 12.4]]), dx, dy)];
  });
  g('forget', 'Forget / clear history', 'Toolbar & app menu', { kind: 'pulse', used: 'Toolbar, app menu, Library remove from history' }, k => {
    const h = L(0, -1.8, k), n = L(0, .8, k), i = L(0, -1.4, k);
    return [M(12, 3 + h).c(14.5, 6.5 + h, 18.5 - n, 9, 18.5 - n, 14).c(18.5 - n, 18, 15.5, 21, 12, 21).c(8.5, 21, 5.5 + n, 18, 5.5 + n, 14)
      .c(5.5 + n, 10.8, 7.5, 9, 8.6, 7 + h * .5).c(9.2, 9.4, 10.4, 10.4, 11.3, 10.8).c(11.6, 8, 11.2, 5.2, 12, 3 + h).z() + '',
    M(12, 14.5 + i).c(13.6, 16 + i, 14.4, 17, 14.4, 18.3).c(14.4, 19.6, 13.3, 20.5, 12, 20.5).c(10.7, 20.5, 9.6, 19.6, 9.6, 18.3).c(9.6, 17, 10.4, 16 + i, 12, 14.5 + i).z() + ''];
  });
  g('firefox-view', 'Firefox View', 'Toolbar & app menu', { kind: 'pop', used: 'Toolbar' }, k => [
    { d: rrect(3.5, 5, 17, 14.5, 2.5), a: 1 }, line(3.5, 9, 20.5, 9), line(7, 13, L(17, 17.5, k), 13), line(7, 16, L(13, 15, k), 16)]);
  g('developer', 'Developer tools', 'Toolbar & app menu', { kind: 'swing', pivot: [15.2, 8.8], used: 'Toolbar, context menu inspect' }, k => {
    const gap = L(38, 56, k), r = L(4.2, 4.5, k);
    return [arc(15.2, 8.8, r, -45 + gap, 315 - gap, 4), { d: line(15.2 + r * cos(135), 8.8 + r * sin(135), 4.6, 19.4), w: 1.15 }];
  });
  g('fullscreen', 'Fullscreen / Restore', 'Toolbar & app menu', { kind: 'pop', toggle: ['Enter fullscreen', 'Exit fullscreen'], used: 'Toolbar, app menu' }, k => {
    const c = L(3.5, 9, k), e = L(20.5, 15, k);
    return [poly([[3.5, 9], [c, c], [9, 3.5]]), poly([[15, 3.5], [e, c], [20.5, 9]]), poly([[20.5, 15], [e, e], [15, 20.5]]), poly([[9, 20.5], [c, e], [3.5, 15]])];
  });
  g('account', 'Account', 'Toolbar & app menu', { kind: 'dir', dir: [0, -1], used: 'Toolbar' }, k => [
    circle(12, L(8.4, 7.2, k), 3.6), M(5, 20).c(5, L(15.8, 15.2, k), 8.2, L(13.6, 13, k), 12, L(13.6, 13, k)).c(15.8, L(13.6, 13, k), 19, L(15.8, 15.2, k), 19, 20) + '']);
  g('reopen', 'Reopen closed tab', 'Toolbar & app menu', { kind: 'spin', spin: -1, pivot: [12, 14], used: 'App menu, context menu, Glassflow restore appearance' }, k => {
    const t = L(0, -90, k), r = 3.7, a1 = 40 + t;
    return [{ d: tab(3.5, 5.5, 17, 15, 2.5), a: 1 }, arc(12, 14, r, 300 + t, a1, 3), head(12 + r * cos(a1), 14 + r * sin(a1), a1 - 90, 2.4, 44)];
  });
  g('help', 'Help', 'Toolbar & app menu', { kind: 'tilt', used: 'App menu, Tab Router why here' }, k => [
    { d: circle(12, 12, 8.6), a: 1 },
    rot(M(9.4, 9.4).c(9.4, 7.9, 10.6, 6.9, 12, 6.9).c(13.5, 6.9, 14.6, 7.9, 14.6, 9.3).c(14.6, 11.2, 12, 11.4, 12, 13.4) + '', L(0, -14, k), 12, 13.4),
    { d: dot(L(12, 11.6, k), L(16.6, 17.2, k)), w: 1.3 }]);
  g('quit', 'Quit', 'Toolbar & app menu', { kind: 'dir', dir: [0, 1], used: 'App menu' }, k => [arc(12, 12.5, L(7.6, 7, k), L(-50, -62, k), L(230, 242, k), 4), line(12, L(3.5, 6.6, k), 12, L(11.5, 13, k))]);
  g('minus', 'Reset pinned tab', 'Toolbar & app menu', { kind: 'shake', used: 'Pinned tab reset, unload' }, k => [M(6, 12).c(L(10, 9, k), L(12, 15, k), L(14, 15, k), L(12, 15, k), 18, 12) + '']);

  /* Zen sidebar, workspaces and tabs */
  g('sidebar', 'Show / hide sidebar', 'Zen sidebar & tabs', { kind: 'dir', dir: [-1, 0], toggle: ['Hide sidebar', 'Show sidebar'], used: 'Toolbar, expand sidebar' }, k => [
    { d: rrect(3, 4, 18, 16, 3), a: 1 }, { d: line(L(9.5, 3.6, k), 4.4, L(9.5, 3.6, k), 19.6), o: 1 - k * .85 },
    { d: line(L(5.4, 2, k), 8, L(7.4, 4, k), 8), o: 1 - k }, { d: line(L(5.4, 2, k), 11, L(7.4, 4, k), 11), o: 1 - k }]);
  g('compact', 'Compact mode', 'Zen sidebar & tabs', { kind: 'pop', toggle: ['Enable compact mode', 'Disable compact mode'], used: 'Toolbar, context menu' }, k => [
    { d: rrect(L(3, 2.4, k), L(4, 3.4, k), L(18, 19.2, k), L(16, 17.2, k), 3), a: 1 },
    { d: line(L(3, 4.5, k), L(8.5, 4.6, k), L(21, 19.5, k), L(8.5, 4.6, k)), o: 1 - k },
    { d: line(L(8.5, 3.6, k), L(8.5, 8, k), L(8.5, 3.6, k), L(20, 18.6, k)), o: 1 - k }]);
  g('workspaces', 'Workspaces', 'Zen sidebar & tabs', { kind: 'pulse', used: 'Sidebar workspace switcher' }, k => {
    const s = L(7, 5.6, k), r = L(2, 2.8, k), o = L(0, -.6, k);
    return [[4, 4], [13, 4], [13, 13], [4, 13]].map(([x, y], i) => rrect(x + (x < 12 ? o : -o + 7 - s), y + (y < 12 ? o : -o + 7 - s), s, s, r));
  });
  g('workspace-actions', 'Workspace actions', 'Zen sidebar & tabs', { kind: 'pulse', dir: [0, -1], used: 'Workspace menu, Library more' }, k =>
    [[12, 5.5], [12, 12], [12, 18.5]].map(([x, y], i) => ({ d: dot(L(x, 5.5 + i * 6.5, k), L(y, 12, k)), w: 1.5 })));
  g('page-actions', 'Page actions', 'Zen sidebar & tabs', { kind: 'pulse', dir: [0, -1], used: 'Address bar actions, overflow menus' }, k =>
    [[5.5, 12], [12, 12], [18.5, 12]].map(([x, y], i) => ({ d: dot(x, L(y, [9, 15, 9][i], k)), w: 1.5 })));
  g('create-new', 'Create new', 'Zen sidebar & tabs', { kind: 'spin', spin: 1, used: 'Sidebar new button' }, k => [rrect(3.5, 3.5, 17, 17, L(5, 8.5, k)), ...xLines(12, 12, L(4, 4.6, k), L(0, 90, k))]);
  g('essentials', 'Essentials', 'Zen sidebar & tabs', { kind: 'spin', spin: 1, used: 'Add to essentials, essentials grid' }, k => [
    { d: rrect(3.5, 3.5, 17, 17, 4), a: 1 }, { d: star(12, 12.3, L(4.8, 5.6, k), L(2.1, 2.5, k), 5, L(-90, -18, k)), f: k * .9 }]);
  g('pin', 'Pin / unpin tab', 'Zen sidebar & tabs', { kind: 'dir', dir: [0, 1], toggle: ['Pin tab', 'Unpin tab'], used: 'Tab context menu' }, k => [
    rot(poly([[9, 3.5], [15, 3.5], [14, 8.6], [17.2, 12.2], [6.8, 12.2], [10, 8.6]], true), L(0, 18, k), 12, 12.2),
    rot(line(12, 12.2, 12, 20.5), L(0, 18, k), 12, 12.2), { d: line(4.5, 4.5, L(4.5, 19.5, k), L(4.5, 19.5, k)), o: k }]);
  g('split-view', 'Split view', 'Zen sidebar & tabs', { kind: 'dir', dir: [1, 0], used: 'Open in split view, share split view' }, k => [
    { d: rrect(3, 4.5, L(8.2, 5.4, k), 15, 2.2), s: -1 }, { d: rrect(L(12.8, 10, k), 4.5, L(8.2, 11, k), 15, 2.2), s: 1 }]);
  g('glance', 'Glance', 'Zen sidebar & tabs', { kind: 'scan', used: 'Glance preview' }, k => {
    const o = L(0, 1.6, k);
    return [{ d: M(2.8, 12).c(5, 7.6 - o, 8.3, 5.5 - o, 12, 5.5 - o).c(15.7, 5.5 - o, 19, 7.6 - o, 21.2, 12).c(19, 16.4 + o, 15.7, 18.5 + o, 12, 18.5 + o).c(8.3, 18.5 + o, 5, 16.4 + o, 2.8, 12).z() + '', a: 1 },
      circle(12, 12, L(3, 2.2, k))];
  });
  g('close-unpinned', 'Clear unpinned tabs', 'Zen sidebar & tabs', { kind: 'swing', pivot: [18.5, 3.5], used: 'Workspace clear button' }, k => [
    rot(line(18.5, 3.5, 13.4, 10.4) + poly([[10.4, 9.4], [16.2, 13], [14.2, 20.3], [3.8, 16.2]], true) + line(12.4, 10.6, 9.4, 18.4) + line(14.4, 11.8, 12, 19.4), L(0, -16, k), 18.5, 3.5)]);
  g('folder', 'Folder', 'Zen sidebar & tabs', { kind: 'dir', dir: [0, -1], toggle: ['Expand folder', 'Collapse folder'], used: 'Zen folders, Groupflow' }, k => [
    { d: poly([[3.5, 19], [3.5, 5.5], [9, 5.5], [11, 7.5], [20.5, 7.5], [20.5, L(19, 11, k)]], true), a: 1 },
    poly([[3.5, 19], [L(3.5, 6.5, k), L(10.5, 11, k)], [L(20.5, 22, k), L(10.5, 11, k)], [L(20.5, 19, k), 19]], true)]);
  g('unload', 'Unload / sleep', 'Zen sidebar & tabs', { kind: 'tilt', used: 'Tab Unloader, pinned reset' }, k => [
    rot(crescent(10.5, 13, 7.6, 14.8, 9.4, 6.4), L(0, -18, k), 10.5, 13), { d: poly([[15, 4], [18.6, 4], [15, 7.6], [18.6, 7.6]]), w: .85, s: 1 }].map((p, i) => i ? { ...p, d: move(p.d, L(0, 1.6, k), L(0, -1.6, k)) } : p));
  g('container', 'Container tab', 'Zen sidebar & tabs', { kind: 'pop', used: 'Open in container tab' }, k => {
    const y = L(0, -1.6, k);
    return [poly([[12, 3.2 + y], [19.8, 7.6 + y], [19.8, 16.4], [12, 20.8], [4.2, 16.4], [4.2, 7.6 + y]], true), poly([[4.2, 7.6 + y], [12, 12 + y * .4], [19.8, 7.6 + y]]), line(12, 12 + y * .4, 12, 20.8)];
  });
  g('close', 'Close (tab, media, group)', 'Zen sidebar & tabs', { kind: 'shake', used: 'Tab close, Mediaflow close, Groupflow close group' }, k => xLines(12, 12, L(5, 3, k), L(45, 135, k)));
  g('audio', 'Sound / muted', 'Zen sidebar & tabs', { kind: 'pulse', dir: [1, 0], toggle: ['Mute', 'Unmute'], used: 'Tab audio, Mediaflow volume' }, k => [
    { d: poly([[3.5, 9.4], [7, 9.4], [11.5, 5.4], [11.5, 18.6], [7, 14.6], [3.5, 14.6]], true), a: 1 },
    mix(arc(11.5, 12, 3.8, -48, 48, 1), line(15, 9.5, 20, 14.5), k), mix(arc(11.5, 12, 7.4, -50, 50, 1), line(20, 9.5, 15, 14.5), k)]);
  g('duplicate', 'Duplicate tab', 'Zen sidebar & tabs', { kind: 'dir', dir: [.7, -.7], used: 'Tab context menu' }, k => [
    { d: tab(3.5, 9, 12, 11.5, 2.5), s: -1 }, { d: move(M(8.5, 9).l(8.5, 6.5).a(11, 6.5, 2.5, 2.5, 180, 270).l(18, 4).a(18, 6.5, 2.5, 2.5, 270, 360).l(20.5, 15.5).l(15.5, 15.5) + '', L(0, 1, k), L(0, -1, k)), s: 1 }]);
  g('move-to-workspace', 'Move to workspace', 'Zen sidebar & tabs', { kind: 'dir', dir: [1, 0], used: 'Tab context menu' }, k => [
    { d: rrect(3.5, L(6.5, 7.5, k), L(10, 8, k), L(11, 9, k), 2.5), a: 1 }, line(10, 12, L(20.5, 21.5, k), 12), head(L(20.5, 21.5, k), 12, 0, 3.6, 45)]);

  /* Address bar and site */
  g('site-settings', 'Site settings', 'Address bar & site', { kind: 'dir', dir: [1, 0], used: 'Zen site data button' }, k => [
    { d: line(4, 7, 20, 7) + line(4, 12, 20, 12) + line(4, 17, 20, 17), a: 1 },
    { d: line(L(15, 8, k), 4.6, L(15, 8, k), 9.4), s: -1 }, { d: line(L(9, 16, k), 9.6, L(9, 16, k), 14.4), s: 1 }, { d: line(L(13.5, 10, k), 14.6, L(13.5, 10, k), 19.4), s: -1 }]);
  const shackle = (lift, leg) => M(8, 10.5).l(8, 7.6).a(12, 7.6, 4, 4, 180, 360, 2).l(16, leg) + '';
  g('secure', 'Secure connection', 'Address bar & site', { kind: 'dir', dir: [0, -1], used: 'Address bar identity' }, k => [
    { d: rrect(5, 10.5, 14, 10, 2.2) + line(12, 14.4, 12, 16.6), a: 1 }, move(shackle(0, L(10.5, 8.6, k)), 0, L(0, -2.2, k))]);
  g('not-secure', 'Not secure', 'Address bar & site', { kind: 'shake', used: 'Address bar identity' }, k => [
    { d: rrect(5, 10.5, 14, 10, 2.2), a: 1 }, move(shackle(0, 7.8), 0, L(-2, -3.2, k)), line(L(4.5, 3.5, k), L(4.5, 3.5, k), L(19.5, 20.5, k), L(19.5, 20.5, k))]);
  g('shield', 'Tracking protection', 'Address bar & site', { kind: 'pop', used: 'Address bar tracking protection' }, k => {
    const w = L(0, 1, k);
    return [{ d: M(12, 3.5).c(14.5, 5, 17, 5.6, 19.5 + w, 5.6).c(19.5 + w, 13, 17, 18, 12, 20.5).c(7, 18, 4.5 - w, 13, 4.5 - w, 5.6).c(7, 5.6, 9.5, 5, 12, 3.5).z() + '', a: 1 },
      scl(poly([[8.6, 12.2], [11, 14.6], [15.6, 9.8]]), L(1, 1.25, k), 12, 12)];
  });
  g('camera', 'Camera', 'Address bar & site', { kind: 'dir', dir: [1, 0], used: 'Permission indicator' }, k => [
    { d: rrect(3, 7, 12.5, 10, 2.2), a: 1 }, poly([[15.5, L(10.4, 10.8, k)], [L(21, 21.8, k), L(7.5, 6.4, k)], [L(21, 21.8, k), L(16.5, 17.6, k)], [15.5, L(13.6, 13.2, k)]], true)]);
  g('microphone', 'Microphone', 'Address bar & site', { kind: 'pulse', used: 'Permission indicator' }, k => [
    rrect(9, L(3.5, 2.6, k), 6, 11, 3), { d: arc(12, 11, 6, 0, 180, 2) + line(12, 17, 12, 20.5) + line(8.5, 20.5, 15.5, 20.5), a: 1 }]);
  g('location', 'Location', 'Address bar & site', { kind: 'dir', dir: [0, 1], used: 'Permission indicator' }, k => {
    const t = L(3, 1.8, k);
    return [M(12, 21).c(12, 21, 5, 14.6, 5, 9.7).c(5, 5.8, 8.1, t, 12, t).c(15.9, t, 19, 5.8, 19, 9.7).c(19, 14.6, 12, 21, 12, 21).z() + '', circle(12, L(9.6, 8.8, k), 2.5)];
  });
  g('notifications', 'Notifications', 'Address bar & site', { kind: 'swing', pivot: [12, 3.2], used: 'Permission indicator' }, k => [
    rot(M(5, 17).l(6.2, 15.6).l(6.2, 10.8).c(6.2, 7.4, 8.8, 4.8, 12, 4.8).c(15.2, 4.8, 17.8, 7.4, 17.8, 10.8).l(17.8, 15.6).l(19, 17).z() + line(12, 3.2, 12, 4.8), L(0, 10, k), 12, 3.2),
    { d: rot(M(10, 19.6).c(10.4, 20.7, 11.1, 21.2, 12, 21.2).c(12.9, 21.2, 13.6, 20.7, 14, 19.6) + '', L(0, -14, k), 12, 3.2), s: 1.8 }]);
  g('autoplay', 'Autoplay', 'Address bar & site', { kind: 'pop', used: 'Permission indicator' }, k => [
    { d: rrect(3.5, 5, 17, 14, 2.5), a: 1 }, scl(poly([[10, 8.8], [15.6, 12], [10, 15.2]], true), L(1, 1.3, k), 12.4, 12)]);
  g('popup-blocked', 'Pop-up blocked', 'Address bar & site', { kind: 'dir', dir: [.7, -.7], used: 'Address bar notice' }, k => [
    { d: rrect(3.5, 7.5, 12.5, 12.5, 2.2), a: 1 }, move(line(11, 13, 19.8, 4.2) + poly([[14.6, 4.2], [19.8, 4.2], [19.8, 9.4]]), L(0, -3, k), L(0, 3, k))]);
  g('translate', 'Translate', 'Address bar & site', { kind: 'dir', dir: [1, 0], used: 'Address bar translations, context menu' }, k => [
    { d: move(poly([[3.5, 17.5], [7, 7.5], [10.5, 17.5]]) + line(4.8, 14, 9.2, 14), L(0, 9.5, k), 0), s: 1 },
    { d: move(line(16.5, 4.8, 16.5, 6.6) + line(12.8, 7.6, 20.2, 7.6) + M(14, 9).c(15, 13.5, 17.5, 16.5, 20.5, 18.5) + M(19, 9).c(18, 13.5, 15.5, 16.5, 12.5, 18.5), L(0, -9, k), 0), s: -1 }]);
  g('reader', 'Reader view', 'Address bar & site', { kind: 'pop', used: 'Address bar, Zen site data, context menu' }, k => [
    { d: M(12, 7).c(10.2, 5.6, 7.2, 5, 3.5, 5.4).l(3.5, 18.6).c(7.2, 18.2, 10.2, 18.8, 12, 20.2) + line(12, 7, 12, 20.2), a: 1 },
    mix(M(12, 7).c(13.8, 5.6, 16.8, 5, 20.5, 5.4).l(20.5, 18.6).c(16.8, 18.2, 13.8, 18.8, 12, 20.2) + '', M(12, 7).c(12.8, 5, 14.6, 3.6, 16.4, 3.2).l(16.2, 16.4).c(14.6, 16.8, 12.8, 18.4, 12, 20.2) + '', k)]);
  g('pip', 'Picture-in-Picture', 'Address bar & site', { kind: 'dir', dir: [-.7, -.7], used: 'Address bar PiP, Mediaflow popout' }, k => [
    { d: rrect(3, 4.5, 18, 15, 2.5), a: 1 }, rrect(L(11.5, 5.5, k), L(11.5, 7, k), 7, 5.5, 1.2)]);
  const link = (cx, cy) => rot(rrect(cx - 5, cy - 2.6, 10, 5.2, 2.6), -45, cx, cy);
  g('copy-link', 'Copy link / share URL', 'Address bar & site', { kind: 'dir', dir: [.7, -.7], used: 'Zen copy URL, context menu share' }, k => [
    { d: link(L(9.4, 8.2, k), L(14.6, 15.8, k)), s: -1 }, { d: link(L(14.6, 15.8, k), L(9.4, 8.2, k)), s: 1 }]);
  g('share', 'Share', 'Address bar & site', { kind: 'dir', dir: [0, -1], used: 'Share tab, share workspace/folder' }, k => [
    { d: poly([[8.2, 9.5], [5.5, 9.5], [5.5, 20.5], [18.5, 20.5], [18.5, 9.5], [15.8, 9.5]]), a: 1 },
    line(12, L(3.5, 1.8, k), 12, 14.5), poly([[8.6, L(6.9, 5.2, k)], [12, L(3.5, 1.8, k)], [15.4, L(6.9, 5.2, k)]])]);

  /* Context menu and editing */
  const undo = k => [M(L(4.5, 3.5, k), 9.5).l(15, 9.5).c(17.8, 9.5, 20, 11.6, 20, 14.5).c(20, 17.4, 17.8, 19.5, 15, 19.5).l(L(11, 9, k), 19.5) + '', head(L(4.5, 3.5, k), 9.5, 180, 4.1, 45)];
  g('undo', 'Undo', 'Context menu & editing', { kind: 'dir', dir: [-1, 0], used: 'Context menu, edit menu' }, undo);
  g('redo', 'Redo', 'Context menu & editing', { kind: 'dir', dir: [1, 0], used: 'Context menu, edit menu' }, k => mirror(undo(k)));
  g('select-all', 'Select all', 'Context menu & editing', { kind: 'pop', used: 'Context menu' }, k => [...corners(L(0, 1.4, k)), { d: rrect(8.5, 8.5, 7, 7, 1.5), f: k * .9 }]);
  g('delete', 'Delete', 'Context menu & editing', { kind: 'dir', dir: [0, -1], used: 'Context menu, Library delete file' }, k => [
    move(rot(line(4, 6.5, 20, 6.5) + poly([[9.2, 6.5], [9.7, 4], [14.3, 4], [14.8, 6.5]]), L(0, -12, k), 4.5, 6.5), 0, L(0, -1.8, k)),
    { d: poly([[6, 6.5], [7.2, 20], [16.8, 20], [18, 6.5]]) + line(10, 10, 10, 16.5) + line(14, 10, 14, 16.5), a: 1 }]);
  g('image', 'Image', 'Context menu & editing', { kind: 'pop', used: 'Context menu image items, Tab Router picture' }, k => [
    { d: rrect(3.5, 4.5, 17, 15, 2.5), a: 1 }, poly([[4, 17.5], [9, L(12, 10.6, k)], [12.8, 16], [15.3, L(13.5, 12.6, k)], [20, 18.2]]), circle(15.8, L(9, 7.6, k), 1.6)]);
  g('code', 'View source', 'Context menu & editing', { kind: 'dir', dir: [1, 0], used: 'Context menu view source' }, k => [
    { d: poly([[L(8, 7, k), 7], [L(3.5, 2.5, k), 12], [L(8, 7, k), 17]]), s: -1 }, { d: poly([[L(16, 17, k), 7], [L(20.5, 21.5, k), 12], [L(16, 17, k), 17]]), s: 1 },
    { d: line(L(13.5, 14.2, k), 5, L(10.5, 9.8, k), 19), a: 1 }]);
  g('accessibility', 'Accessibility', 'Context menu & editing', { kind: 'dir', dir: [0, -1], used: 'Context menu inspect accessibility' }, k => [
    { d: circle(12, 12, 8.6), a: 1 }, { d: dot(12, L(7.4, 6.8, k)), w: 1.5 }, line(7.6, L(10, 8.4, k), 16.4, L(10, 8.4, k)), line(12, 10, 12, 13), poly([[L(9.6, 9, k), 17.8], [12, 13], [L(14.4, 15, k), 17.8]])]);
  g('spellcheck', 'Spell check', 'Context menu & editing', { kind: 'pop', used: 'Context menu' }, k => [
    { d: poly([[3.5, 13], [7, 3.5], [10.5, 13]]) + line(4.8, 10, 9.2, 10), a: 1 }, scl(poly([[11, 16], [14.2, 19.2], [20.5, 11]]), L(1, 1.2, k), 15, 15)]);

  /* Downloads */
  const bars = [poly([[6.5, 5], [10, 5], [10, 19], [6.5, 19]], true), poly([[14, 5], [17.5, 5], [17.5, 19], [14, 19]], true)];
  const tri = [poly([[7, 4.6], [13, 8.1], [13, 15.9], [7, 19.4]], true), poly([[13, 8.1], [19.6, 12], [19.6, 12], [13, 15.9]], true)];
  g('pause-resume', 'Pause / resume download', 'Downloads', { kind: 'pulse', toggle: ['Pause download', 'Resume download'], used: 'Library download controls' }, k => [mix(bars[0], tri[0], k), mix(bars[1], tri[1], k)]);
  g('cancel', 'Cancel', 'Downloads', { kind: 'shake', used: 'Library cancel, download prompt, Groupflow gradient' }, k => [{ d: circle(12, 12, L(8.6, 8, k)), a: 1 }, ...xLines(12, 12, L(4.2, 3, k), L(45, 135, k))]);
  g('retry', 'Retry', 'Downloads', { kind: 'spin', spin: -1, used: 'Library retry download' }, k => mirror(reload(k)));
  g('show-in-folder', 'Show in folder', 'Downloads', { kind: 'dir', dir: [0, -1], used: 'Library show file' }, k => [
    { d: poly([[3.5, 19.5], [3.5, 5.5], [9, 5.5], [11, 7.5], [20.5, 7.5], [20.5, 19.5]], true), a: 1 },
    line(12, L(17.5, 14.5, k), 12, L(11, 5.6, k)), poly([[9.6, L(13.4, 8, k)], [12, L(11, 5.6, k)], [14.4, L(13.4, 8, k)]])]);
  g('delete-file', 'Delete file', 'Downloads', { kind: 'shake', used: 'Library delete file' }, k => [
    { d: poly([[6, 3.5], [14, 3.5], [18.5, 8], [18.5, 20.5], [6, 20.5]], true) + poly([[14, 3.5], [14, 8], [18.5, 8]]), a: 1 }, ...xLines(12.2, 14.2, L(2.8, 3.6, k), L(45, 135, k))]);
  g('remove-history', 'Remove from history', 'Downloads', { kind: 'shake', used: 'Library remove from history' }, k => [
    { d: line(L(4, 3, k), 7, L(14, 13, k), 7) + line(L(4, 3, k), 12, L(14, 13, k), 12) + line(L(4, 3, k), 17, L(10.5, 9.5, k), 17), a: 1 }, ...xLines(17.2, 16.2, L(2.6, 3.3, k), L(45, 135, k))]);
  g('keep-both', 'Keep both', 'Downloads', { kind: 'dir', dir: [1, 0], used: 'Download prompt keep both' }, k => [
    { d: rot(rrect(3, 5, 8, 14, 1.6) + line(5.5, 9, 8.5, 9), L(0, -8, k), 7, 19), s: -1 }, { d: rot(rrect(13, 5, 8, 14, 1.6) + line(15.5, 9, 18.5, 9), L(0, 8, k), 17, 19), s: 1 }]);
  g('replace', 'Replace', 'Downloads', { kind: 'dir', dir: [1, 0], used: 'Download prompt replace' }, k => [
    { d: move(line(4.5, 8, 19, 8) + head(19, 8, 0, 3.6, 45), L(0, 1.4, k), 0), s: 1 }, { d: move(line(19.5, 16, 5, 16) + head(5, 16, 180, 3.6, 45), L(0, -1.4, k), 0), s: -1 }]);

  /* Media (Mediaflow) */
  g('play-pause', 'Play / pause', 'Media', { kind: 'pulse', toggle: ['Play', 'Pause'], used: 'Mediaflow play' }, k => [mix(tri[0], bars[0], k), mix(tri[1], bars[1], k)]);
  const next = k => [poly([[L(5, 7, k), 5.5], [L(15, 16, k), 12], [L(5, 7, k), 18.5]], true), { d: line(18.5, 5.5, 18.5, 18.5), a: 1 }];
  g('next', 'Next track', 'Media', { kind: 'dir', dir: [1, 0], used: 'Mediaflow next' }, next);
  g('previous', 'Previous track', 'Media', { kind: 'dir', dir: [-1, 0], used: 'Mediaflow previous' }, k => mirror(next(k)));
  const seek = k => { const t = L(0, -60, k), r = 7.6, a0 = -100 + t; return [arc(12, 12, r, a0, 200 + t, 4), head(12 + r * cos(a0), 12 + r * sin(a0), a0 - 90, 3, 44), { d: line(9.8, 9.6, 9.8, 14.4) + circle(13.8, 12, 1.6, 2.4), w: .85, a: 1 }]; };
  g('seek-back', 'Back 10 seconds', 'Media', { kind: 'spin', spin: -1, used: 'Mediaflow seek back' }, seek);
  g('seek-forward', 'Forward 10 seconds', 'Media', { kind: 'spin', spin: 1, used: 'Mediaflow seek forward' }, k => { const p = mirror(seek(k)); p[2] = seek(k)[2]; return p; });

  /* Mods */
  g('palette', 'Colours / appearance', 'Mods', { kind: 'tilt', used: 'Glassflow colours and appearance' }, k => [
    M(12, 3.5).c(16.9, 3.5, 20.5, 7, 20.5, 11.4).c(20.5, 14.2, 18.4, 15.8, 16, 15.4).c(14.4, 15.1, 13.4, 16.3, 13.8, 17.6).c(14.3, 19.2, 13.4, 20.5, 12, 20.5)
      .c(7.3, 20.5, 3.5, 16.7, 3.5, 12).c(3.5, 7.3, 7.3, 3.5, 12, 3.5).z() + '',
    ...[[7.8, 11.6], [10.2, 7.6], [14.8, 7.4]].map(([x, y]) => ({ d: rot(dot(x, y), L(0, 40, k), 11.2, 12), w: 1.5 }))]);
  g('report', 'Mods report', 'Mods', { kind: 'pop', used: 'Glassflow copy Zen Mods report' }, k => [
    { d: rrect(5, 4.5, 14, 16.5, 2.2) + rrect(9, 3, 6, 3.4, 1.2), a: 1 }, scl(poly([[8.5, 13], [11, 15.5], [15.5, 10]]), L(1, 1.25, k), 12, 13)]);
  const stripe = c => { const a = Math.max(4.1, c - 19.9), b = Math.min(19.9, c - 4.1); return line(a, c - a, b, c - b); };
  g('gradient', 'Edit gradient', 'Mods', { kind: 'pop', used: 'Groupflow edit gradient' }, k => [{ d: rrect(3.5, 3.5, 17, 17, 4), a: 1 }, stripe(L(16, 19, k)), stripe(L(24, 27, k)), stripe(L(32, 35, k))]);
  g('eyedropper', 'Resample colour', 'Mods', { kind: 'dir', dir: [0, 1], used: 'Groupflow resample favicon colour' }, k => [
    rot(rrect(9.6, 2.6, 4.8, 5.6, 2.4) + line(8.4, 9, 15.6, 9) + poly([[10.4, 9], [10.4, 17.4], [12, 20], [13.6, 17.4], [13.6, 9]], true), L(45, 38, k)),
    { d: dot(6.4, L(19.4, 22, k)), w: 1.5, o: k }]);
  g('convert-group', 'Convert to tab group', 'Mods', { kind: 'pop', used: 'Groupflow convert to tab group' }, k => {
    const i = L(0, 2, k);
    return [poly([[7.5 + i, 4.5], [4.5 + i, 4.5], [4.5 + i, 19.5], [7.5 + i, 19.5]]), poly([[16.5 - i, 4.5], [19.5 - i, 4.5], [19.5 - i, 19.5], [16.5 - i, 19.5]]),
      { d: line(8.5 + i * .5, 8, 15.5 - i * .5, 8) + line(8.5 + i * .5, 12, 15.5 - i * .5, 12) + line(8.5 + i * .5, 16, 15.5 - i * .5, 16), a: 1 }];
  });
  const scrollUp = k => [poly([[7, L(11.5, 10, k)], [12, L(6.5, 4.6, k)], [17, L(11.5, 10, k)]]), poly([[7, L(17.5, 15.4, k)], [12, L(12.5, 10.4, k)], [17, L(17.5, 15.4, k)]])];
  g('scroll-up', 'Scroll folder up', 'Mods', { kind: 'dir', dir: [0, -1], used: 'Groupflow' }, scrollUp);
  g('scroll-down', 'Scroll folder down', 'Mods', { kind: 'dir', dir: [0, 1], used: 'Groupflow' }, k => flipY(scrollUp(k)));
  g('ungroup', 'Ungroup tabs', 'Mods', { kind: 'dir', dir: [1, 0], used: 'Groupflow native ungroup' }, k => [{ d: circle(L(9, 7.2, k), 12, L(5.5, 4.4, k)), s: -1 }, { d: circle(L(15, 16.8, k), 12, L(5.5, 4.4, k)), s: 1 }]);
  g('swatches', 'Use these colours', 'Mods', { kind: 'pop', used: 'Groupflow use colours' }, k => [
    { d: rot(rrect(5, 4.5, 7.5, 14, 2), L(-10, -20, k), 8.75, 19), s: -1 }, { d: rot(rrect(11.5, 4.5, 7.5, 14, 2), L(10, 20, k), 15.25, 19), s: 1 }]);
  const spark = (cx, cy, R, a = 0) => rot(poly([[cx, cy - R], [cx + R * .26, cy - R * .26], [cx + R, cy], [cx + R * .26, cy + R * .26], [cx, cy + R], [cx - R * .26, cy + R * .26], [cx - R, cy], [cx - R * .26, cy - R * .26]], true), a, cx, cy);
  g('wand', 'Generate routing rules', 'Mods', { kind: 'swing', pivot: [4, 20], used: 'Tab Router generate and resume' }, k => [
    { d: rot(line(4, 20, 14.5, 9.5), L(0, -8, k), 4, 20), w: 1.1 }, spark(17.4, 6.4, L(2.8, 3.6, k), L(0, 45, k)), spark(10.8, 4.6, L(1.5, 2, k)), spark(19.4, 13.2, L(1.3, 1.8, k))]);
  g('checklist', 'Validate routing rules', 'Mods', { kind: 'pulse', used: 'Tab Router validate' }, k =>
    [7, 12, 17].flatMap(y => [scl(poly([[3.6, y], [5.1, y + 1.5], [7.8, y - 1.6]]), L(1, 1.3, k), 5.6, y), { d: line(10.5, y, L(20, 18.5, k), y), a: 1 }]));
  g('pencil', 'Edit routing rules', 'Mods', { kind: 'scribble', used: 'Tab Router edit rules' }, k => [
    rot(M(4, 20).l(5, 15.4).l(15.4, 5).c(16.2, 4.2, 17.6, 4.2, 18.4, 5).l(19, 5.6).c(19.8, 6.4, 19.8, 7.8, 19, 8.6).l(8.6, 19).z() + line(13.4, 7, 17, 10.6), L(0, -10, k), 12, 12)]);
  g('sort', 'Preview sorting', 'Mods', { kind: 'pulse', dir: [1, 0], used: 'Tab Router preview sorting' }, k => [line(4, 7, L(11, 20, k), 7), line(4, 12, 15.5, 12), line(4, 17, L(20, 11, k), 17)]);
  g('anchor', 'Keep here', 'Mods', { kind: 'swing', pivot: [12, 5.4], used: 'Tab Router keep here' }, k => [
    circle(12, 5.4, 2.2), line(12, 7.6, 12, 20.5), line(8.4, 10.8, 15.6, 10.8), M(4.5, L(13.6, 12, k)).c(5, 17.8, 8.2, 20.5, 12, 20.5).c(15.8, 20.5, 19, 17.8, 19.5, L(13.6, 12, k)) + '']);
  g('route', 'Resume routing', 'Mods', { kind: 'dir', dir: [.7, -.7], used: 'Tab Router resume routing' }, k => [
    M(4.5, 19.5).c(4.5, L(14, 15.5, k), L(12, 9, k), L(16, 15, k), 12, 12).c(L(12, 15, k), L(8, 9, k), 18.5, L(10, 9, k), 18.5, L(5.5, 4.2, k)) + '', { d: dot(4.5, 19.5), w: 1.7, a: 1 }, head(18.5, L(5.5, 4.2, k), -90, 3.4, 45)]);
  g('gauge', 'Folder status', 'Mods', { kind: 'swing', pivot: [12, 13.5], used: 'Tab Unloader folder status' }, k => [
    { d: arc(12, 13.5, 8, 150, 390, 4) + dot(12, 13.5), a: 1 }, line(12, 13.5, 12 + 5.6 * cos(L(-130, -50, k)), 13.5 + 5.6 * sin(L(-130, -50, k)))]);

  const norm = p => typeof p === 'string' ? { d: p } : p;
  for (const gl of list) {
    const cache = new Map();
    gl.at = k => { k = Math.round(k * 1e4) / 1e4; if (!cache.has(k)) cache.set(k, gl.fn(k).map(norm)); return cache.get(k); };
  }

  // Existing Iconflow/Morph action IDs (iconflow/morph.json) and the glyph each one uses here.
  const actions = {
    back: 'back', forward: 'forward', reload: 'reload', stop: 'stop', 'new-tab': 'new-tab', 'app-menu': 'app-menu', compact: 'compact', sidebar: 'sidebar',
    'site-data': 'site-settings', downloads: 'downloads', extensions: 'extensions', 'bookmark-toggle': 'bookmark', history: 'history', screenshot: 'screenshot',
    'open-file': 'open-file', settings: 'settings', 'firefox-library': 'library', home: 'home', menu: 'workspace-actions', 'expand-sidebar': 'sidebar',
    reader: 'reader', share: 'copy-link', overflow: 'overflow', chevron: 'chevron', 'close-unpinned': 'close-unpinned', 'save-page': 'save-page', print: 'print',
    find: 'find', 'zoom-in': 'zoom-in', 'zoom-out': 'zoom-out', cut: 'cut', copy: 'copy', paste: 'paste', encoding: 'encoding', email: 'email', logins: 'passwords',
    sync: 'sync', 'send-tab': 'send-tab', import: 'import', forget: 'forget', private: 'private', 'firefox-view': 'firefox-view', developer: 'developer',
    'new-window': 'new-window', fullscreen: 'fullscreen', account: 'account', reopen: 'reopen', help: 'help', quit: 'quit', minus: 'minus',
    'groupflow--edit-gradient': 'gradient', 'groupflow--resample-favicon-colour': 'eyedropper', 'groupflow--convert-to-folder': 'folder',
    'groupflow--convert-to-tab-group': 'convert-group', 'groupflow--scroll-folder-up': 'scroll-up', 'groupflow--scroll-folder-down': 'scroll-down',
    'tab-router--generate-routing-rules': 'wand', 'tab-router--validate-routing-rules': 'checklist', 'tab-router--edit-routing-rules': 'pencil',
    'tab-router--why-here': 'help', 'tab-router--preview-sorting': 'sort', 'tab-router--keep-here': 'anchor', 'tab-router--resume-routing': 'route',
    'tab-router--refresh-automatic-picture': 'reload', 'glassflow--appearance-save': 'save-page', 'glassflow--appearance-restore': 'reopen',
    'glassflow--appearance-copy': 'copy', 'glassflow--mods-report-copy': 'report', 'tab-unloader--folder-status': 'gauge', 'tab-unloader--unload-folder': 'unload',
    'groupflow--close-group': 'close', 'download-prompt--replace': 'replace', 'download-prompt--keep': 'keep-both', 'download-prompt--cancel': 'cancel',
    'groupflow--use-colours': 'swatches', 'groupflow--save-gradient': 'save-page', 'groupflow--cancel-gradient': 'cancel',
    'glassflow-library--cancel-download': 'cancel', 'glassflow-library--show-download': 'show-in-folder', 'groupflow--native-ungroup': 'ungroup',
    'glassflow-library--show-file': 'show-in-folder', 'glassflow-library--delete-file': 'delete-file', 'glassflow-library--pause-download': 'pause-resume',
    'glassflow-library--retry-download': 'retry', 'glassflow-library--remove-download-history': 'remove-history', 'glassflow--close-tab': 'close',
    'context--back': 'back', 'context--forward': 'forward', 'context--reload': 'reload', 'context--stop': 'stop', 'context--bookmark': 'bookmark',
    'context--save-page': 'save-page', 'context--copy': 'copy', 'context--cut': 'cut', 'context--paste': 'paste', 'context--new-tab': 'new-tab',
    'context--new-window': 'new-window', 'context--private': 'private', 'context--screenshot': 'screenshot', 'context--send-tab': 'send-tab',
    'context--developer': 'developer', 'context--find': 'find', 'context--print': 'print', 'context--share': 'copy-link', 'context--reader': 'reader',
    'context--reopen': 'reopen', 'context--compact': 'compact',
    'mediaflow--play': 'play-pause', 'mediaflow--next': 'next', 'mediaflow--previous': 'previous', 'mediaflow--seek-back': 'seek-back',
    'mediaflow--seek-forward': 'seek-forward', 'mediaflow--mute': 'audio', 'mediaflow--pip': 'pip', 'mediaflow--close': 'close'
  };

  globalThis.ZenGlyphs = { list, byId: Object.fromEntries(list.map(g => [g.id, g])), actions, groups: [...new Set(list.map(g => g.group))] };
})();
