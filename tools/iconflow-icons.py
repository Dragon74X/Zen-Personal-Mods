#!/usr/bin/env python3
"""Draws Iconflow's Circuit icon set and writes iconflow/icons.css.

Every icon is a horizontal strip of animation frames on Zen's 18-unit icon
grid, saved as its own file under iconflow/icons/ so Zen only loads the
icons a rule actually uses. Frame 0 is the resting icon; the last frame is held while the button
is hovered. Iconflow's stylesheet steps through the strip with a transition,
so moving off plays it back in reverse and nothing plays at startup.

Style: high-tech glass and neon. Closed shapes are glass, lines are neon
tubes, and every corner is rounded, pointed shapes included. Motion starts
from rest, builds up speed and settles; fast-moving parts leave trails.
Everything uses the toolbar's icon colour (context-fill).

The Library button strips use Zen's own sprite format (36 frames), so Zen's
hover animation plays them; Iconflow only swaps the image.

python3 tools/iconflow-icons.py
"""
from math import cos, sin, radians, pi, log, exp, sqrt
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "iconflow" / "icons.css"
G = 18            # Zen's icon grid
FRAMES = 96       # toolbar icons: enough that each screen refresh advances evenly
LIB_FRAMES = 36   # Zen's library sprite format


# ---- easing ---------------------------------------------------------------

def clamp(t):
    return max(0.0, min(1.0, t))


def span(t, a, b):
    return clamp((t - a) / (b - a))


# Every curve starts from rest and builds up speed, so motion reads as
# accelerating and settling rather than moving at one speed throughout.

def ease_in_out(t):
    """Cubic: speeds up to 3x the average at the middle, then slows to rest."""
    return 4 * t ** 3 if t < 0.5 else 1 - (2 - 2 * t) ** 3 / 2


def run_up(t):
    """A short run-up for curves that would otherwise start at full speed."""
    return t * t * (2 - t)


def ease_out(t):
    return 1 - (1 - run_up(t)) ** 3


def settle(t, overshoot=0.2, swings=2.8):
    """A damped spring, the follow-through of hand-drawn animation: starts
    from rest, builds speed, overshoots by about `overshoot`, falls back past
    the mark and settles, landing exactly on 1 at t = 1. `swings` is how many
    half-swings fit in the time."""
    if t <= 0:
        return 0.0
    if t >= 1:
        return 1.0
    lo = log(overshoot)
    z = -lo / sqrt(pi * pi + lo * lo)          # damping ratio giving that overshoot
    wd = swings * pi
    wn = wd / sqrt(1 - z * z)
    x = lambda u: 1 - exp(-z * wn * u) * (cos(wd * u) + z * wn / wd * sin(wd * u))
    return x(t) + (1 - x(1)) * t ** 3


def ease_out_back(t, s=1.7):
    """Overshoot and settle; s sets how far (1.7 is about a tenth)."""
    return settle(t, 0.1 * s)


def bump(t):
    """0 -> 1 -> 0, easing out of rest and back into it."""
    return sin(pi * ease_in_out(clamp(t)))


# ---- shapes ---------------------------------------------------------------

def n(v):
    """One decimal: a tenth of a grid unit is under 0.1px at Zen's icon size."""
    return f"{v:.1f}".rstrip("0").rstrip(".") if abs(v) > 0.04 else "0"


def P(d, extra=""):
    return f"<path d='{d}'{extra}/>"


def rrect(x, y, w, h, r):
    """A rounded rectangle with squircle-like corners (longer, flatter curves)."""
    k = 0.38 * r  # control distance from the corner: flatter than a circle's 0.45r
    return (f"M{n(x + r)} {n(y)}H{n(x + w - r)}C{n(x + w - k)} {n(y)} {n(x + w)} {n(y + k)} {n(x + w)} {n(y + r)}"
            f"V{n(y + h - r)}C{n(x + w)} {n(y + h - k)} {n(x + w - k)} {n(y + h)} {n(x + w - r)} {n(y + h)}"
            f"H{n(x + r)}C{n(x + k)} {n(y + h)} {n(x)} {n(y + h - k)} {n(x)} {n(y + h - r)}"
            f"V{n(y + r)}C{n(x)} {n(y + k)} {n(x + k)} {n(y)} {n(x + r)} {n(y)}Z")


def poly(points, closed=False):
    d = "M" + "L".join(f"{n(x)} {n(y)}" for x, y in points)
    return d + ("Z" if closed else "")


def turn(points, deg, cx=9, cy=9):
    c, s = cos(radians(deg)), sin(radians(deg))
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in points]


def move(points, dx=0, dy=0):
    return [(x + dx, y + dy) for x, y in points]


def scale(points, k, cx=9, cy=9):
    return [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in points]


def g(content, transform=""):
    return f"<g transform='{transform}'>{content}</g>" if transform else content


# ---- Circuit: glass and neon, high-tech ---------------------------------------
# Closed shapes are glass: a translucent body, a white sheen over the top and
# a rim. Lines are neon tubes: a soft wide stroke with a bright core. Every
# corner is rounded, pointed shapes included. Hovering sends a pulse of light
# round the outline or along the tube.

def rpoly(points, r=0.9):
    """A closed polygon with every corner rounded by up to r."""
    pts, out = [], []
    for q in points:                       # points that coincide (a very narrow shape) count once
        if not pts or abs(q[0] - pts[-1][0]) + abs(q[1] - pts[-1][1]) > 1e-6:
            pts.append(q)
    if len(pts) > 2 and abs(pts[0][0] - pts[-1][0]) + abs(pts[0][1] - pts[-1][1]) <= 1e-6:
        pts.pop()
    m = len(pts)
    for i in range(m):
        (px, py), (x, y), (nx, ny) = pts[i - 1], pts[i], pts[(i + 1) % m]
        d1 = ((x - px) ** 2 + (y - py) ** 2) ** 0.5
        d2 = ((nx - x) ** 2 + (ny - y) ** 2) ** 0.5
        k = min(r, d1 / 2, d2 / 2)
        a = (x + (px - x) * k / d1, y + (py - y) * k / d1)
        b = (x + (nx - x) * k / d2, y + (ny - y) * k / d2)
        out.append(("L" if out else "M") + f"{n(a[0])} {n(a[1])}Q{n(x)} {n(y)} {n(b[0])} {n(b[1])}")
    return "".join(out) + "Z"


def chamfer(x, y, w, h, c=2.2, r=0.8):
    """A rectangle with short, fully rounded corners: a soft squircle. The
    corner cut is kept short and rounded through, so it never reads as an
    octagon."""
    c = min(c * 0.6, w / 2, h / 2)
    r = c
    return rpoly([(x + c, y), (x + w - c, y), (x + w, y + c), (x + w, y + h - c), (x + w - c, y + h),
                  (x + c, y + h), (x, y + h - c), (x, y + c)], r)


_ids = [0]


def shape(d):
    """Define an outline once per frame; glass and tubes reuse it with <use>."""
    _ids[0] += 1
    i = f"s{_ids[0]}"
    return i, f"<defs><path id='{i}' d='{d}'/></defs>"


def glass(d, lit=0.0, trace=None, body=0.16):
    """Glass body: fill, sheen, rim. lit brightens it; trace (0..1) runs a light round the rim."""
    i, out = shape(d)
    out += (f"<use href='#{i}' fill='context-fill' fill-opacity='{n(body + 0.3 * lit)}' stroke='none'/>"
            f"<use href='#{i}' fill='url(#sheen)' stroke='none'/>"
            f"<use href='#{i}' stroke-width='1.25' stroke-opacity='{n(0.85 + 0.15 * lit)}'/>")
    if trace is not None and 0.02 < trace < 0.98:
        out += (f"<path d='{d}' pathLength='100' stroke-width='1.5' stroke-dasharray='16 84' "
                f"stroke-dashoffset='{n(-100 * ease_in_out(trace))}' stroke-opacity='{n(bump(trace))}'/>")
    return out


def tube(d, lit=0.0, trace=None):
    """Neon tube: a bright core and a soft wide halo. The halo is painted with
    context-stroke, so the Soft glow setting can turn it off from CSS."""
    i, out = shape(d)
    out += (f"<use href='#{i}' stroke='context-stroke' stroke-width='2.8' stroke-opacity='{n(0.22 + 0.2 * lit)}'/>"
            f"<use href='#{i}' stroke-width='1.45'/>")
    if trace is not None and 0.02 < trace < 0.98:
        out += (f"<path d='{d}' pathLength='100' stroke-width='2.1' stroke-dasharray='22 78' "
                f"stroke-dashoffset='{n(-100 * ease_in_out(trace))}' stroke-opacity='{n(0.9 * bump(trace))}'/>")
    return out


def blade(tip_x, tip_y, reach=6, half=6, thick=2.5, flip=False):
    """A thick chevron pointing left (or right) with rounded corners."""
    s = -1 if flip else 1
    pts = [(tip_x + s * reach, tip_y - half), (tip_x, tip_y), (tip_x + s * reach, tip_y + half),
           (tip_x + s * (reach + thick), tip_y + half), (tip_x + s * thick, tip_y), (tip_x + s * (reach + thick), tip_y - half)]
    if flip:
        pts = pts[::-1]
    return rpoly(pts, 0.85)


def c_back(t, flip=False):
    # A glass blade that dashes out, blurring while it moves fast, then settles.
    dx = lambda tt: 0.5 * bump(span(tt, 0, 0.2)) - 1.7 * ease_out_back(span(tt, 0.1, 1), 2)
    out = blur(lambda tt: glass(blade(5.2 + dx(tt), 9, 5.6, 5.8, 2.6), body=0.12), dx, t)
    out += glass(blade(5.2 + dx(t), 9, 5.6, 5.8, 2.6), lit=bump(t), trace=t)
    return g(out, "matrix(-1 0 0 1 18 0)") if flip else out


def c_forward(t):
    return c_back(t, flip=True)


def c_reload(t):
    # An open neon arc tapering like a comet's tail, with two glass diamonds
    # circling it at different speeds and radii, trailing where they have
    # just been. Everything settles together.
    e = lambda tt: settle(tt, 0.12)
    a1 = lambda tt: -30 + 360 * e(tt)
    a2 = lambda tt: 5 + 540 * e(tt)         # both rest by the gap, never as a pair of "eyes"
    big = _diamond(9 + 6.2 * cos(radians(a1(t))), 9 + 6.2 * sin(radians(a1(t))), 1.75 + 0.3 * bump(t))
    small = _diamond(9 + 3.4 * cos(radians(a2(t))), 9 + 3.4 * sin(radians(a2(t))), 1.2)
    return (g(taper_tube(6.2, 25, 255, trace=t, comet=True), f"rotate({n(90 * e(t))} 9 9)")
            + trail(6.2, a1, t) + trail(3.4, a2, t) + gem(big) + gem(small))


def c_reload_comets(t):
    # Two comets going opposite ways: the outer one once round, the inner
    # one, smaller and shorter-tailed, half as far again, nearly meeting the
    # outer head at the end.
    e = lambda tt: settle(tt, 0.12)
    return (comet(6.4, lambda tt: -40 + 360 * e(tt), 190, t)
            + comet(3.3, lambda tt: 110 - 540 * e(tt), 150, t, direction=-1, k=1.05, width=0.8))


def c_cross(t, plus=False):
    k = 1 + 0.1 * bump(span(t, 0, 0.7))
    a, b = (4.6, 13.4) if not plus else (3.8, 14.2)
    d = (f"M{n(9 + (a - 9) * k)} {n(9 + (a - 9) * k)}L{n(9 + (b - 9) * k)} {n(9 + (b - 9) * k)}"
         f"M{n(9 + (b - 9) * k)} {n(9 + (a - 9) * k)}L{n(9 + (a - 9) * k)} {n(9 + (b - 9) * k)}") if not plus else (
        f"M9 {n(9 - 5.2 * k)}V{n(9 + 5.2 * k)}M{n(9 - 5.2 * k)} 9H{n(9 + 5.2 * k)}")
    return g(tube(d, lit=bump(t)), f"rotate({n(90 * ease_out_back(t, 1.4))} 9 9)")


def c_stop(t):
    return c_cross(t)


def c_plus(t):
    return c_cross(t, plus=True)


def c_home(t):
    body = rpoly([(9, 2.6), (15.4, 7.6), (15.4, 15.4), (2.6, 15.4), (2.6, 7.6)], 1.1)
    door = 0.4 + 0.6 * ease_out(span(t, 0.3, 1))
    return glass(body, lit=0.5 * bump(t), trace=t) + tube(f"M9 15.4V{n(15.4 - 2.4 - 1.2 * door)}", lit=door)


def c_dots(t):
    out = ""
    for i, x in enumerate((3.8, 9, 14.2)):
        e = bump(span(t, i * 0.15, i * 0.15 + 0.55))
        y = 9 - 1.4 * e
        out += glass(rpoly([(x, y - 2.2), (x + 2.2, y), (x, y + 2.2), (x - 2.2, y)], 0.55), lit=e, body=0.35)
    return out


def c_sidebar(t, expand=False):
    frame = chamfer(1.8, 3, 14.4, 12, 2.2)
    if expand:
        x = 6.4 + 1.4 * ease_out_back(t, 2)
        dx = 0.9 * ease_out_back(span(t, 0.15, 1), 2)
        return glass(frame, trace=t) + tube(f"M{n(x)} 4V14") + glass(blade(10.2 + 2.7 + dx, 9, -2.2, 2.4, 1.4, flip=False), lit=bump(t), body=0.4)
    x = 7.4 - 2 * ease_out_back(t, 2)
    w = max(0.0, x - 5.6)
    ticks = tube(f"M4 6.4H{n(4 + w)}M4 9H{n(4 + w)}") if w > 0.2 else ""
    return glass(frame, trace=t) + tube(f"M{n(x)} 4V14", lit=bump(t)) + ticks


def c_expand(t):
    return c_sidebar(t, expand=True)


def c_sliders(t):
    e = ease_in_out(t)
    out = ""
    for y, a, b in ((6, 11.6, 6.4), (12, 6.4, 11.6)):
        k = a + (b - a) * e
        out += tube(f"M2.6 {y}H{n(k - 2.4)}M{n(k + 2.4)} {y}H15.4")
        out += glass(rpoly([(k, y - 2), (k + 2, y), (k, y + 2), (k - 2, y)], 0.55), lit=bump(t), body=0.3)
    return out


def c_downloads(t):
    # The chevron drops toward the tray, blurring as it falls, and settles.
    drop = lambda tt: 2.6 * bump(span(tt, 0, 0.55)) + 0.8 * ease_out(span(tt, 0.45, 1))
    def chev(tt):
        y = 4 + drop(tt)
        return glass(rpoly([(3.6, y), (9, y + 5.4), (14.4, y), (14.4, y + 2.6), (9, y + 8), (3.6, y + 2.6)], 0.85), body=0.12)
    return blur(chev, drop, t) + chev(t) + tube("M4 15.2H14", lit=bump(span(t, 0.3, 0.9)))


def c_extensions(t):
    # Opposite tiles lift out and sink back, turning against each other.
    e = ease_out_back(t, 2)
    tile = lambda x, y: glass(chamfer(x, y, 5.6, 5.6, 1.4, 0.55))
    up = f"translate({n(e * 0.5)} {n(-e * 0.5)}) rotate({n(e * 30)} 12.8 5.2)"
    down = f"translate({n(-e * 0.5)} {n(e * 0.5)}) rotate({n(-e * 30)} 5.2 12.8)"
    return tile(2.4, 2.4) + tile(10, 10) + g(tile(10, 2.4), up) + g(tile(2.4, 10), down)


def c_bookmark(t, saved=False):
    lift = 1.2 * bump(span(t, 0, 0.6)) + 0.3 * ease_out(span(t, 0.4, 1))
    d = rpoly(move([(4.4, 2.6), (13.6, 2.6), (13.6, 15.6), (9, 12.4), (4.4, 15.6)], dy=-lift), 1)
    return glass(d, lit=1 if saved else bump(t), trace=t, body=0.62 if saved else 0.16)


def c_bookmarked(t):
    return c_bookmark(t, saved=True)


def c_reader(t):
    out = glass(chamfer(3.2, 2.2, 11.6, 13.6, 2.4), trace=t)
    for i, (y, w0, w1) in enumerate(((6, 6, 4), (9, 6, 6), (12, 4, 6))):
        w = w0 + (w1 - w0) * ease_out_back(span(t, i * 0.15, i * 0.15 + 0.7), 2)
        out += tube(f"M6 {y}H{n(6 + w)}")
    return out


def c_share(t):
    e = ease_out_back(span(t, 0, 1), 2)
    pts = [(4.2 - 0.5 * e, 9), (13.4 + 0.4 * e, 4.3 - 0.4 * e), (13.4 + 0.4 * e, 13.7 + 0.4 * e)]
    hexa = lambda x, y: rpoly([(x + 2.1 * cos(radians(a)), y + 2.1 * sin(radians(a))) for a in range(0, 360, 60)], 0.5)
    links = "".join(tube(f"M{n(pts[0][0] + 2.4 * (q[0] - pts[0][0]) / ((q[0] - pts[0][0]) ** 2 + (q[1] - pts[0][1]) ** 2) ** 0.5)} "
                         f"{n(pts[0][1] + 2.4 * (q[1] - pts[0][1]) / ((q[0] - pts[0][0]) ** 2 + (q[1] - pts[0][1]) ** 2) ** 0.5)}"
                         f"L{n(q[0] - 2.4 * (q[0] - pts[0][0]) / ((q[0] - pts[0][0]) ** 2 + (q[1] - pts[0][1]) ** 2) ** 0.5)} "
                         f"{n(q[1] - 2.4 * (q[1] - pts[0][1]) / ((q[0] - pts[0][0]) ** 2 + (q[1] - pts[0][1]) ** 2) ** 0.5)}", trace=t)
                    for q in pts[1:])
    return links + "".join(glass(hexa(x, y), lit=bump(t), body=0.3) for x, y in pts)


def c_screenshot(t):
    k = 1.3 * ease_out_back(span(t, 0, 0.8), 2)
    a, b, L = 2.5 + k, 15.5 - k, 3.4
    corners = (f"M{n(a)} {n(a + L)}V{n(a + 1.2)}Q{n(a)} {n(a)} {n(a + 1.2)} {n(a)}H{n(a + L)}"
               f"M{n(b - L)} {n(a)}H{n(b - 1.2)}Q{n(b)} {n(a)} {n(b)} {n(a + 1.2)}V{n(a + L)}"
               f"M{n(b)} {n(b - L)}V{n(b - 1.2)}Q{n(b)} {n(b)} {n(b - 1.2)} {n(b)}H{n(b - L)}"
               f"M{n(a + L)} {n(b)}H{n(a + 1.2)}Q{n(a)} {n(b)} {n(a)} {n(b - 1.2)}V{n(b - L)}")
    r = 1.8 + 0.7 * ease_out_back(span(t, 0.2, 1))
    dia = rpoly(turn([(9, 9 - r), (9 + r, 9), (9, 9 + r), (9 - r, 9)], 90 * ease_out_back(span(t, 0.1, 1))), 0.5)
    return tube(corners, lit=bump(t)) + glass(dia, lit=bump(t), body=0.35)


def c_overflow(t):
    out = ""
    for i, x in enumerate((3.4, 8.6)):
        dx = 1.4 * bump(span(t, i * 0.12, i * 0.12 + 0.6)) + 0.4 * ease_out(span(t, 0.5, 1))
        out += glass(blade(x + 5 + dx, 9, -4.2, 4.6, 2.2), lit=bump(span(t, i * 0.12, i * 0.12 + 0.6)))
    return out


def c_chevron(t):
    dx = 1.6 * bump(span(t, 0, 0.6)) + 0.5 * ease_out(span(t, 0.45, 1))
    return glass(blade(12.6 + dx, 9, -5, 5.4, 2.5), lit=bump(t), trace=t)


def c_dart(t):
    dy = 1.6 * bump(span(t, 0, 0.6)) + 0.5 * ease_out(span(t, 0.45, 1))
    chev = rpoly([(3.6, 5 + dy), (9, 10.4 + dy), (14.4, 5 + dy), (14.4, 7.6 + dy), (9, 13 + dy), (3.6, 7.6 + dy)], 0.85)
    return glass(chev, lit=bump(t))


def c_play(t):
    k = 1 + 0.1 * bump(span(t, 0, 0.7))
    dx = 0.6 * ease_out_back(t, 2)
    return glass(rpoly(move(scale([(5.4, 3.4), (14.6, 9), (5.4, 14.6)], k, 9.5, 9), dx), 1.3), lit=bump(t), trace=t)


def c_pause(t):
    sq = 1 - 0.18 * bump(t)
    return "".join(glass(chamfer(x, 9 - 5.4 * sq, 3.2, 10.8 * sq, 0.9, 0.5), lit=bump(t)) for x in (4.4, 10.4))


def c_skip(t, flip=False):
    dx = 1.2 * bump(span(t, 0, 0.6)) + 0.4 * ease_out(span(t, 0.45, 1))
    out = glass(rpoly(move([(3.4, 4), (11, 9), (3.4, 14)], dx), 1.1), lit=bump(t)) + glass(chamfer(12.6 + dx * 0.5, 4, 2.4, 10, 0.7, 0.4), lit=bump(t))
    return g(out, "matrix(-1 0 0 1 18 0)") if flip else out


def c_next(t):
    return c_skip(t)


def c_previous(t):
    return c_skip(t, flip=True)


C_SPEAKER = rpoly([(2.4, 6.6), (5.6, 6.6), (9.4, 3.2), (9.4, 14.8), (5.6, 11.4), (2.4, 11.4)], 0.8)


def c_volume(t):
    out = glass(C_SPEAKER, lit=bump(t))
    for i, r in enumerate((2.8, 5.2)):
        e = bump(span(t, i * 0.15, i * 0.15 + 0.6))
        rr, a = r + 0.7 * e, radians(46)
        out += tube(f"M{n(9.6 + rr * cos(-a))} {n(9 + rr * sin(-a))}A{n(rr)} {n(rr)} 0 0 1 {n(9.6 + rr * cos(a))} {n(9 + rr * sin(a))}", lit=e)
    return out


def c_muted(t):
    a = 90 * ease_out_back(t)
    return glass(C_SPEAKER) + g(tube("M12.5 7.3L15.5 10.3M15.5 7.3L12.5 10.3", lit=bump(t)), f"rotate({n(a)} 14 8.8)")


def c_pip(t):
    e = ease_out_back(t, 1.8)
    x, y = 9.2 - 5.4 * e, 9 - 4.4 * e
    return glass(chamfer(1.8, 2.8, 14.4, 12.4, 2.2), trace=t) + glass(chamfer(x, y, 5.2, 4, 1, 0.45), lit=1, body=0.45)


def peek(step):
    """The top and left edges of a card behind the front one, set back by step."""
    x, y = 5.2 - step, 5.2 - step
    return f"M{n(x)} {n(14.6 - step * 0.6)}V{n(y + 2.2)}C{n(x)} {n(y + 0.8)} {n(x + 0.8)} {n(y)} {n(x + 2.2)} {n(y)}H{n(14.6 - step * 0.6)}"


# ---- the rest of the toolbar palette ------------------------------------------
# Buttons Firefox and Zen offer under Customise toolbar. Same vocabulary:
# glass bodies, neon tubes, open arcs only, no arrowheads on shapes.

def c_save(t):
    # A page with a chevron dropping into the bar at its foot, blurring as it falls.
    drop = lambda tt: 2.2 * ease_out_back(span(tt, 0, 0.75), 1.6)
    chev = lambda tt: tube(f"M6.2 {n(5.2 + drop(tt))}L9 {n(8 + drop(tt))}L11.8 {n(5.2 + drop(tt))}")
    return (glass(chamfer(3.4, 2.2, 11.2, 13.6, 2.2), trace=t, body=0.12)
            + blur(chev, drop, t) + chev(t) + tube("M6.4 13H11.6", lit=bump(span(t, 0.4, 1))))


def c_print(t):
    # A sheet slides out of a glass slot; its lines light up as it comes.
    e = ease_out(span(t, 0, 0.85))
    h = 4 + 4.6 * e
    out = glass(chamfer(5, 6, 8, h, 1.2, 0.5), body=0.12)
    for i, (dy, w) in enumerate(((2.8, 4), (1.4, 2.6))):
        k = ease_out(span(t, 0.35 + 0.15 * i, 0.85 + 0.15 * i)) * w
        if k > 0.2:
            out += tube(f"M7 {n(6 + h - dy)}H{n(7 + k)}")
    return out + glass(rpoly([(2.4, 3.6), (15.6, 3.6), (15.6, 7.6), (2.4, 7.6)], 1.3), lit=bump(t), trace=t)


def c_find(t):
    # An open lens whose gap sweeps round as it searches; a diamond lights
    # in its centre once found. The handle leaves from the gap.
    e = ease_in_out(t)
    turn_ = 360 * e                         # once round, so the gap ends by the handle again
    lens = taper_tube(4.6, 70 + turn_, 380 + turn_, lit=bump(t), cx=7.6, cy=7.6)
    k = 1.1 * ease_out_back(span(t, 0.45, 1), 2)
    found = gem(_diamond(7.6, 7.6, k)) if k > 0.1 else ""
    return lens + tube("M11.2 11.2L15 15", lit=bump(t)) + found


def c_open(t):
    # A glass folder whose front panel tilts open.
    e = ease_out_back(t, 1.8)
    back = rpoly([(2.4, 3.8), (6.8, 3.8), (8.4, 5.6), (15.6, 5.6), (15.6, 14.6), (2.4, 14.6)], 0.9)
    front = rpoly([(2.4 + 2.4 * e, 8.2 + 1.2 * e), (15.6 + 0.8 * e, 8.2 + 1.2 * e), (15.6, 14.6), (2.4, 14.6)], 0.9)
    return glass(back, body=0.1) + glass(front, lit=bump(t), trace=t, body=0.3)


def c_zoom_in(t):
    # The + reaches its arms outward and settles. Lengths change, nothing
    # scales, so the lines stay crisp.
    w = 4.4 + 1.6 * ease_out_back(t, 2)
    return tube(f"M9 {n(9 - w)}V{n(9 + w)}M{n(9 - w)} 9H{n(9 + w)}", lit=bump(t))


def c_zoom_out(t):
    w = 4.6 - 1.6 * ease_out_back(t, 2)
    return tube(f"M{n(9 - w)} 9H{n(9 + w)}", lit=bump(t))


def c_cut(t):
    # Two blades crossing at a glass pivot, with glass finger loops below,
    # snip shut and open again.
    a = 14 * bump(t)
    loop = lambda x: glass(rpoly([(x, 12.2), (x + 2.2, 15.6), (x - 2.2, 15.6)], 0.8), body=0.12)
    blade_l = g(tube("M9 9.6L4.6 2.8M9 9.6L6.8 12.4") + loop(6), f"rotate({n(a)} 9 9.6)")
    blade_r = g(tube("M9 9.6L13.4 2.8M9 9.6L11.2 12.4") + loop(12), f"rotate({n(-a)} 9 9.6)")
    return blade_l + blade_r + gem(_diamond(9, 9.6, 1 + 0.3 * bump(t)))


def c_copy(t):
    # A duplicate slides out of the card, blurring, and settles beside it.
    e = lambda tt: 3.4 * ease_out_back(tt, 1.6)
    card = lambda tt, lit=0: glass(chamfer(2.6 + e(tt), 2.6 + e(tt), 9.4, 9.4, 1.6, 0.6), lit=lit, body=0.2)
    return glass(chamfer(2.6, 2.6, 9.4, 9.4, 1.6, 0.6), body=0.1) + blur(card, e, t) + card(t, bump(t))


def c_paste(t):
    # A card drops into a bracket and settles.
    y = 1.6 + 4 * ease_out_back(span(t, 0, 0.8), 1.4)
    card = glass(chamfer(5.4, y, 7.2, 8, 1.2, 0.5), lit=bump(t), body=0.25)
    return card + tube("M3.2 9.4V14.2Q3.2 15.4 4.4 15.4H13.6Q14.8 15.4 14.8 14.2V9.4", lit=bump(span(t, 0.5, 1)), trace=t)


def c_encoding(t):
    # A glyph with a diamond cursor gliding along its baseline.
    x = 12.4 + 2.2 * ease_in_out(t)
    return (tube("M2.8 14.4L6.6 3.8L10.4 14.4M4.2 10.6H9", lit=bump(t), trace=t)
            + tube(f"M{n(x - 1.6)} 15.4H{n(x + 1.6)}") + gem(_diamond(x, 11.6 - 2 * bump(t), 1.1)))


def c_email(t):
    # The flap's V straightens into a line; that line rises as the letter's
    # top edge while the letter's sides grow down from it. One set of lines
    # morphs into the other.
    f = ease_in_out(span(t, 0, 0.45))
    rise = settle(span(t, 0.3, 1), 0.1)
    xl, xr = 3.6 + 1 * f, 14.4 - 1 * f
    top = 7 - 4.6 * rise
    tip = top + 3.4 * (1 - f)
    out = ""
    if rise > 0.02:
        out += glass(f"M{n(xl)} 7V{n(top)}H{n(xr)}V7Z", lit=bump(t), body=0.25)
    out += glass(chamfer(2.4, 5.8, 13.2, 9.4, 1.6), body=0.22)
    return out + tube(f"M{n(xl)} 7L{n(xl)} {n(top)}L9 {n(tip)}L{n(xr)} {n(top)}L{n(xr)} 7", lit=bump(t))


def c_logins(t):
    # A glass lock: the arched shackle lifts as the keyhole lights.
    up = 1.8 * ease_out_back(t, 2)
    shackle = g(tube("M6.2 8.4V6.6Q6.2 3.4 9 3.4Q11.8 3.4 11.8 6.6V8.4"), f"translate(0 {n(-up)})")
    return shackle + glass(chamfer(3.8, 8.2, 10.4, 7.4, 1.6, 0.6), trace=t, body=0.2) + gem(_diamond(9, 11.9, 0.7 + 0.5 * bump(t) + 0.2 * t))


def c_sync(t):
    # Two devices side by side: the diamond on each screen swaps to the other,
    # one over the top and one underneath, trailing; both light as they land.
    e = lambda tt: settle(tt, 0.12)
    arrive = bump(span(t, 0.55, 1))
    out = (glass(chamfer(2.2, 4.2, 5.6, 9.6, 1.4), lit=arrive, body=0.25)
           + glass(chamfer(10.2, 4.2, 5.6, 9.6, 1.4), lit=arrive, body=0.25))
    for start in (180, 0):
        a = lambda tt, s0=start: s0 + 180 * e(tt)
        x, y = 9 + 4 * cos(radians(a(t))), 9 + 4 * sin(radians(a(t)))
        out += trail(4, a, t) + gem(_diamond(x, y, 1.05))
    return out


def c_send(t):
    # A tab (a pill with its favicon) slides into the phone, shrinking to fit
    # its screen, blurring as it goes; the phone lights as it lands.
    e = lambda tt: settle(tt, 0.1)
    phone = tube(chamfer(10.4, 2.6, 5.6, 12.8, 1.8, 0.7), lit=bump(span(t, 0.55, 1)))
    def tab(tt):
        k = e(tt)
        w, h = 8.6 - 4 * k, 4.4 - 1 * k
        x, y = 1.8 + 9.4 * k, 9 - h / 2
        return (glass(rpoly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], h / 2), body=0.35)
                + gem(_diamond(x + h / 2 + 0.2, 9, 0.85)))
    return phone + blur(tab, lambda tt: 9.4 * e(tt), t) + tab(t)


def c_import(t):
    # A diamond comes in from the corner and lands on the card, settling.
    e = lambda tt: settle(tt, 0.1)
    dia = lambda tt: gem(_diamond(3.4 + 6 * e(tt), 3.4 + 5.4 * e(tt), 1.2))
    card = glass(chamfer(6.4, 6.6, 9.4, 8.4, 1.6, 0.6), lit=bump(span(t, 0.6, 1)), body=0.16)
    return card + blur(dia, lambda tt: 8 * e(tt), t) + dia(t)


def c_settings(t):
    # A glass hex nut turns while its centre diamond turns the other way.
    e = ease_out_back(t, 1.5)
    hexa = rpoly([(9 + 6.4 * cos(radians(a)), 9 + 6.4 * sin(radians(a))) for a in range(30, 390, 60)], 1.2)
    core = rpoly(turn([(9, 6.6), (11.4, 9), (9, 11.4), (6.6, 9)], -90 * e), 0.5)
    return g(glass(hexa, trace=t, body=0.14), f"rotate({n(60 * e)} 9 9)") + glass(core, lit=bump(t) + 0.3, body=0.4)


def c_forget(t):
    # The card's lines rise and fade away, one after another.
    out = glass(chamfer(3.4, 2.4, 11.2, 13.2, 2, 0.7), lit=bump(span(t, 0.5, 1)), body=0.14)
    for i, (y, w) in enumerate(((6.2, 6), (9.2, 6), (12.2, 4))):
        e = ease_in_out(span(t, i * 0.15, i * 0.15 + 0.55))
        if e < 0.98:
            out += f"<g opacity='{n(1 - e)}'>" + tube(f"M6 {n(y - 2.4 * e)}H{n(6 + w)}") + "</g>"
    return out


def c_private(t):
    # A glass visor lowers into place and a scan line sweeps across it.
    y = -1.6 + 1.6 * ease_out_back(span(t, 0, 0.6), 1.8)
    visor = rpoly([(2.2, 7.2 + y), (15.8, 7.2 + y), (14.6, 12 + y), (10.6, 12 + y), (9, 10.6 + y), (7.4, 12 + y), (3.4, 12 + y)], 1)
    x = 3.6 + 10.8 * ease_in_out(span(t, 0.3, 1))
    scan = tube(f"M{n(x)} {n(8 + y)}V{n(11.2 + y)}", lit=1) if 0.3 < t < 0.98 else ""
    return glass(visor, lit=bump(t), body=0.3) + scan + tube(f"M4.6 {n(14.6 + y * 0.4)}H13.4")


def c_view(t):
    # A window whose three tab pills ripple up in turn.
    out = glass(chamfer(2.2, 6.4, 13.6, 9.2, 1.6, 0.6), trace=t, body=0.12)
    for i, x in enumerate((3.6, 7.4, 11.2)):
        up = 1.4 * bump(span(t, i * 0.15, i * 0.15 + 0.6))
        out += glass(chamfer(x, 2.6 - up, 3.2, 2.6, 0.8, 0.4), lit=up / 1.4, body=0.3)
    return out


def c_developer(t):
    # Slim blades push apart round a slash that tilts and lights.
    d = 0.9 * ease_out_back(t, 2)
    slash = g(tube("M10 5.4L8 12.6", lit=bump(t)), f"rotate({n(10 * bump(t))} 9 9)")
    return (glass(blade(2.4 - d, 9, 3, 4, 1.35), lit=bump(t), body=0.3)
            + glass(blade(15.6 + d, 9, 3, 4, 1.35, flip=True), lit=bump(t), body=0.3) + slash)


def c_new_window(t):
    # A small window grows out of the frame's corner into a second window.
    e = ease_out_back(t, 1.6)
    w, h = 4.4 + 3.4 * e, 3.4 + 2.6 * e
    return glass(chamfer(2, 3.2, 12.6, 10.4, 1.8, 0.6), trace=t, body=0.1) + glass(chamfer(16 - w, 15 - h, w, h, 1, 0.45), lit=bump(t) + 0.4, body=0.45)


def c_fullscreen(t):
    # A glass panel grows out of the frame's lower corner until it fills it.
    e = ease_out_back(t, 1.6)
    w, h = 4.4 + 6.4 * e, 3.4 + 5.6 * e
    return (tube(chamfer(2.4, 3.4, 13.2, 11.2, 1.8, 0.7))
            + glass(chamfer(3.6, 13.4 - h, w, h, 1.1, 0.5), lit=bump(t), trace=t, body=0.3))


def c_account(t):
    # A glass head over glass shoulders: the head lifts and a light runs round
    # the shoulders.
    lift = 0.8 * ease_out_back(t, 2)
    head = glass(rpoly([(9, 2.4 - lift), (11.8, 5.4 - lift), (9, 8.4 - lift), (6.2, 5.4 - lift)], 0.9), lit=bump(t), body=0.4)
    return head + glass("M2.8 15.6Q2.8 10.2 9 10.2Q15.2 10.2 15.2 15.6Z", trace=t, body=0.2)

def c_app_menu(t):
    # Three glass bars, a panel's rows, spread apart while a light runs round the top one.
    gap = 1.1 * ease_out_back(t, 2.2)
    bar = lambda y, lit=0.0, trace=None: glass(rpoly([(2.6, y - 1.2), (15.4, y - 1.2), (15.4, y + 1.2), (2.6, y + 1.2)], 1.1),
                                               lit=lit, trace=trace, body=0.2)
    return bar(13.4 + gap) + bar(9) + bar(4.6 - gap, bump(t), t)


def c_compact(t):
    # A window whose sidebar pane slides away into its edge while the
    # content pane widens to fill the space.
    e = ease_out_back(t, 1.6)
    side = max(0.8, 3.8 - 2.9 * e)                # narrows to a sliver, never vanishes
    out = glass(chamfer(1.8, 3, 14.4, 12, 2, 0.7), trace=t, body=0.08)
    out += glass(chamfer(3, 4.3, side, 9.4, 0.7, 0.35), lit=bump(t), body=0.35)
    left = 3 + side + 0.8
    return out + glass(chamfer(left, 4.3, 15 - left, 9.4, 1, 0.45), body=0.18)


def c_reopen(t):
    # A closed tab rises back into its empty slot, blurring, and lights there.
    y = lambda tt: 10.2 - 6.8 * ease_out_back(span(tt, 0, 0.85), 1.6)
    tab = lambda tt: glass(chamfer(3.2, y(tt), 11.6, 5.6, 1.2, 0.5), lit=bump(span(t, 0.6, 1)), body=0.3)
    slot = f"<g opacity='.45'>{tube(chamfer(3.2, 3.4, 11.6, 5.6, 1.2, 0.5))}</g>"
    return slot + blur(tab, y, t) + tab(t)


def c_help(t):
    # A glass diamond badge turns a quarter while the question mark inside
    # stays upright and lights.
    e = ease_out_back(t, 1.6)
    badge = g(glass(rpoly([(9, 1.8), (16.2, 9), (9, 16.2), (1.8, 9)], 2.2), trace=t, body=0.14), f"rotate({n(90 * e)} 9 9)")
    q = tube("M7.2 7.4Q7.2 5.4 9 5.4Q10.8 5.4 10.8 7.1Q10.8 8.3 9.6 8.9Q9 9.2 9 10.2", lit=bump(t))
    return badge + q + gem(_diamond(9, 12.4, 0.75 + 0.3 * bump(span(t, 0.2, 0.9))))


def c_minus(t):
    # The bar narrows and settles back a little shorter, like zoom out.
    return c_zoom_out(t)

def c_history(t):
    # A timeline: a line with three pages; a diamond climbs back up it,
    # lighting each page as it passes.
    e = settle(t, 0.08)
    y = 14.2 - 10 * e
    out = tube("M5 3V15")
    for py in (3.6, 8.2, 12.8):
        passed = clamp((py + 1.4 - y) / 2.4) if t > 0 else 0
        out += glass(chamfer(7.4, py - 1.3, 7.8, 3, 1.2), lit=passed * bump(span(t, 0, 1)) + 0.0, body=0.15 + 0.15 * passed)
    return out + gem(_diamond(5, y, 1.15))


# key -> (label, frames function, [(icon selector, hover selector)])
def tb(*ids):
    """Toolbar buttons: the .toolbarbutton-icon anywhere inside, since some
    sit in a badge stack (the menu, downloads) and some buttons are wrapped
    in a toolbaritem (Zen's sidebar toggle)."""
    return [(f"{i} .toolbarbutton-icon", f"{i}:hover .toolbarbutton-icon") for i in ids]


TOOLBAR = {
    "back": ("Back", c_back, tb("#back-button")),
    "forward": ("Forward", c_forward, tb("#forward-button")),
    "reload": ("Reload", c_reload, tb("#reload-button")),
    "stop": ("Stop", c_stop, tb("#stop-button")),
    "home": ("Home", c_home, tb("#home-button")),
    "new-tab": ("New tab", c_plus, tb("#tabs-newtab-button", "#zen-create-new-button", "#new-tab-button", "#appMenu-new-tab-button2")),
    "menu": ("Workspace actions", c_dots, tb(".zen-workspaces-actions", "#appMenu-more-button2")),
    "app-menu": ("Application menu", c_app_menu, tb("#PanelUI-menu-button")),
    "compact": ("Compact mode", c_compact, tb("#zen-toggle-compact-mode")),
    "sidebar": ("Sidebar toggle", c_sidebar, tb("#sidebar-button")),
    "expand-sidebar": ("Expand sidebar", c_expand, tb("#zen-expand-sidebar-button")),
    "site-data": ("Site settings", c_sliders, [("#zen-site-data-icon-button image", "#zen-site-data-icon-button:hover image")]),
    "downloads": ("Downloads", c_downloads, tb("#downloads-button", "#appMenu-downloads-button")),
    "extensions": ("Extensions", c_extensions, tb("#unified-extensions-button", "#add-ons-button", "#appMenu-extensions-themes-button", "#appMenu-unified-extensions-button")),
    "bookmark": ("Bookmark", c_bookmark, [("#star-button:not([starred])", "#star-button-box:hover > #star-button:not([starred])")]
                 + tb("#bookmarks-menu-button", "#appMenu-bookmarks-button")),
    "bookmarked": ("Bookmark, saved", c_bookmarked, [("#star-button[starred]", "#star-button-box:hover > #star-button[starred]")]),
    "reader": ("Reader view", c_reader, [("#reader-mode-button > .urlbar-icon", "#reader-mode-button:hover > .urlbar-icon")]),
    "share": ("Share and copy link", c_share, tb("#zen-copy-current-url-button", "#share-tab-button")),
    "history": ("History", c_history, tb("#history-panelmenu", "#appMenu-history-button", "#PanelUI-historyMore")),
    "screenshot": ("Screenshot", c_screenshot, tb("#screenshot-button")),
    "overflow": ("More tools", c_overflow, tb("#nav-bar-overflow-button")),
    "chevron": ("Bookmarks overflow", c_chevron, tb("#PlacesChevron")),
    "close-unpinned": ("Clear unpinned tabs", c_dart, tb(".zen-workspace-close-unpinned-tabs-button")),
    "play": ("Play", c_play, tb(".zen-media-card:not(.playing) .zen-media-playpause-button")),
    "pause": ("Pause", c_pause, tb(".zen-media-card.playing .zen-media-playpause-button")),
    "next": ("Next track", c_next, tb(".zen-media-nexttrack-button")),
    "previous": ("Previous track", c_previous, tb(".zen-media-previoustrack-button")),
    "volume": ("Mute", c_volume, tb(".zen-media-card:not([muted]) .zen-media-mute-button")),
    "muted": ("Unmute", c_muted, tb(".zen-media-card[muted] .zen-media-mute-button")),
    "media-close": ("Close player", c_stop, tb(".zen-media-close-button")),
    "pip": ("Picture-in-picture", c_pip, tb(".zen-media-pip-button")),
    "save-page": ("Save page", c_save, tb("#save-page-button", "#appMenu-save-file-button2")),
    "print": ("Print", c_print, tb("#print-button", "#appMenu-print-button2")),
    "find": ("Find in page", c_find, tb("#find-button", "#appMenu-find-button2", "#appMenuSearchHistory")),
    "open-file": ("Open file", c_open, tb("#open-file-button")),
    "zoom-in": ("Zoom in", c_zoom_in, tb("#zoom-in-button", "#appMenu-zoomEnlarge-button2")),
    "zoom-out": ("Zoom out", c_zoom_out, tb("#zoom-out-button", "#appMenu-zoomReduce-button2")),
    "cut": ("Cut", c_cut, tb("#cut-button")),
    "copy": ("Copy", c_copy, tb("#copy-button")),
    "paste": ("Paste", c_paste, tb("#paste-button")),
    "encoding": ("Text encoding", c_encoding, tb("#characterencoding-button")),
    "email": ("Email link", c_email, tb("#email-link-button")),
    "logins": ("Passwords", c_logins, tb("#logins-button", "#appMenu-passwords-button")),
    "sync": ("Sync", c_sync, tb("#sync-button")),
    "send-tab": ("Send tab to device", c_send, tb("#send-tab-button")),
    "import": ("Import", c_import, tb("#import-button")),
    "settings": ("Settings", c_settings, tb("#preferences-button", "#appMenu-settings-button")),
    "forget": ("Forget", c_forget, tb("#panic-button", "#appMenuClearRecentHistory")),
    "private": ("New private window", c_private, tb("#privatebrowsing-button", "#appMenu-new-private-window-button2")),
    "firefox-view": ("Firefox View", c_view, tb("#firefox-view-button")),
    "developer": ("Developer tools", c_developer, tb("#developer-button")),
    "new-window": ("New window", c_new_window, tb("#new-window-button", "#appMenu-new-window-button2", "#appMenu-new-zen-unsynced-window-button", "#appMenuRecentlyClosedWindows")),
    "fullscreen": ("Full screen", c_fullscreen, tb("#fullscreen-button", "#appMenu-fullscreen-button2")),
    "firefox-library": ("Firefox Library", lambda t: lib_circuit(t), tb("#library-button")),
    "account": ("Account", c_account, tb("#fxa-toolbar-menu-button")),
    "reopen": ("Recently closed tabs", c_reopen, tb("#appMenuRecentlyClosedTabs", "#appMenu-library-recentlyClosedTabs")),
    "help": ("Help", c_help, tb("#appMenu-help-button2")),
    "quit": ("Quit", c_stop, tb("#appMenu-quit-button2")),
    "minus": ("Reset pinned tab", c_minus, [(".tab-reset-button", ".tab-reset-button:hover"),
                                             (".tab-reset-pin-button image", ".tab-reset-pin-button:hover image")]),
}

# Settings group the starred and unstarred star, and play/pause, mute/unmute.
SETTING = {"bookmarked": "bookmark", "pause": "play", "muted": "volume",
           "zoom-out": "zoom", "zoom-in": "zoom", "cut": "edit", "copy": "edit", "paste": "edit"}


def lib_circuit(t):
    # Three glass plates that pull apart while a light runs round the top one.
    gap = ease_out_back(span(t, 0, 1), 1.5) * 1.05
    plate = lambda y: rpoly([(2.4, y - 0.4), (9, y - 3.8), (15.6, y - 0.4), (9, y + 3)], 0.9)
    return glass(plate(13.2 + gap * 0.45), body=0.12) + glass(plate(9.8), body=0.14) + glass(plate(6.4 - gap), lit=bump(t), trace=t, body=0.2)


# ---- motion helpers ---------------------------------------------------------

def arc(r, a0, a1, cx=9, cy=9):
    """An open arc from a0 to a1 degrees (clockwise when a1 > a0)."""
    x0, y0 = cx + r * cos(radians(a0)), cy + r * sin(radians(a0))
    x1, y1 = cx + r * cos(radians(a1)), cy + r * sin(radians(a1))
    large = 1 if abs(a1 - a0) > 180 else 0
    sweep = 1 if a1 > a0 else 0
    return f"M{n(x0)} {n(y0)}A{n(r)} {n(r)} 0 {large} {sweep} {n(x1)} {n(y1)}"


def _diamond(x, y, k):
    return rpoly([(x, y - k), (x + k, y), (x, y + k), (x - k, y)], 0.45)


def gem(d):
    """A small solid glass shape, for things that orbit."""
    return glass(d, lit=1, body=0.62)


def taper(r, a0, a1, width, alpha, steps=18, cx=9, cy=9, paint="context-fill"):
    """An arc from a0 (u = 0) to a1 (u = 1) whose width and opacity follow
    width(u) and alpha(u), so it thins and fades smoothly instead of stopping.
    One smooth filled outline; its opacity comes from a gradient mask running
    from one end to the other, so it fades continuously, with no steps or
    seams. (The gradient runs along the chord, which follows the arc closely
    for the short arcs of tails and trails.)"""
    us = [i / steps for i in range(steps + 1)]
    if max(alpha(u) for u in us) < 0.02:
        return ""
    at = lambda u, side=0: (cx + (r + side * width(u) / 2) * cos(radians(a0 + (a1 - a0) * u)),
                            cy + (r + side * width(u) / 2) * sin(radians(a0 + (a1 - a0) * u)))
    outline = smooth([at(u, 1) for u in us] + [at(u, -1) for u in reversed(us)])
    (x0, y0), (x1, y1) = at(0), at(1)
    ax, ay = x1 - x0, y1 - y0
    l2 = ax * ax + ay * ay or 1
    stops = sorted((clamp(((at(u)[0] - x0) * ax + (at(u)[1] - y0) * ay) / l2), alpha(u)) for u in us[::3] + us[-1:])
    _ids[0] += 1
    i = _ids[0]
    grad = "".join(f"<stop offset='{o:.2f}' stop-color='#fff' stop-opacity='{a:.2f}'/>" for o, a in stops)
    return (f"<defs><linearGradient id='g{i}' gradientUnits='userSpaceOnUse' x1='{n(x0)}' y1='{n(y0)}' x2='{n(x1)}' y2='{n(y1)}'>{grad}"
            f"</linearGradient><mask id='m{i}' maskUnits='userSpaceOnUse' x='-9' y='-9' width='36' height='36'>"
            f"<rect x='-9' y='-9' width='36' height='36' fill='url(#g{i})'/></mask></defs>"
            f"<path d='{outline}' fill='{paint}' stroke='none' mask='url(#m{i})'/>")


def smooth(pts):
    """A closed path through pts, rounded between the points."""
    mid = lambda p, q: ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    m0 = mid(pts[-1], pts[0])
    d = f"M{n(m0[0])} {n(m0[1])}"
    for i, p in enumerate(pts):
        q = mid(p, pts[(i + 1) % len(pts)])
        d += f"Q{n(p[0])} {n(p[1])} {n(q[0])} {n(q[1])}"
    return d + "Z"


def taper_tube(r, a0, a1, lit=0.0, trace=None, cx=9, cy=9, comet=False):
    """A neon tube along an open arc whose two ends taper to a point; as a
    comet, it swells toward its head (a1) and thins away to nothing behind."""
    if comet:
        k = lambda u: clamp(u ** 1.3 * 1.15) * ease_in_out(clamp((1 - u) / 0.06))
    else:
        k = lambda u: ease_in_out(clamp(min(u, 1 - u) / 0.24))   # 0 at the ends, 1 along the middle
    out = (taper(r, a0, a1, lambda u: 2.8 * (0.35 + 0.65 * k(u)), lambda u: (0.22 + 0.2 * lit) * k(u), 20, cx, cy, "context-stroke")
           + taper(r, a0, a1, lambda u: (0.45 + 1.6 * k(u)) if comet else (0.3 + 1.15 * k(u)), lambda u: 0.3 + 0.7 * k(u), 20, cx, cy))
    if trace is not None and 0.02 < trace < 0.98:
        out += (f"<path d='{arc(r, a0, a1, cx, cy)}' pathLength='100' stroke-width='2.1' stroke-dasharray='22 78' "
                f"stroke-dashoffset='{n(-100 * ease_in_out(trace))}' stroke-opacity='{n(0.9 * bump(trace))}'/>")
    return out


def trail(r, angle, t, back=0.07, cx=9, cy=9):
    """A trail behind something going round a circle of radius r: it runs from
    where the thing was a moment ago (angle(t - back)) to where it is, so it
    grows with speed, turns round when the motion does and is gone at rest.
    Thin and faint at its far end, building to the moving shape."""
    a0, a1 = angle(t - back), angle(t)
    if abs(a1 - a0) < 4:
        return ""
    return taper(r, a0, a1, lambda u: 0.15 + 1.25 * u ** 1.3, lambda u: 0.75 * u ** 1.6, 12, cx, cy)


def comet(r, angle, tail, t, direction=1, k=1.5, width=1.0):
    """A diamond going round a circle of radius r (angle(t) in degrees), with
    a tail that fades behind it and stretches with its real speed."""
    a = angle(t)
    tail += 0.6 * abs(a - angle(t - 0.06))
    out = taper(r, a - direction * tail, a, lambda u: width * (0.2 + 1.8 * u ** 1.2), lambda u: 0.05 + 0.9 * u ** 1.4, 16)
    x, y = 9 + r * cos(radians(a)), 9 + r * sin(radians(a))
    return out + gem(_diamond(x, y, k + 0.3 * bump(t)))


def blur(shape_at, pos, t, dt=0.035, scale=1.2):
    """Motion blur: fading copies of a shape where it really was a moment
    earlier, as strong as it is moving fast. shape_at(t) draws it at time t;
    pos(t) is how far along it is (in grid units), so the copies follow every
    overshoot and fall-back exactly."""
    speed = clamp(abs(pos(t) - pos(t - 3 * dt)) / scale)
    if speed < 0.12:
        return ""
    return "".join(f"<g opacity='{n(speed * (0.32 - 0.09 * i))}'>{shape_at(t - (i + 1) * dt)}</g>" for i in range(3))


# ---- library button ---------------------------------------------------------
# Values match Iconflow's Library button setting. The line icons (2-10) are
# thin outlines that suit Zen's own icons; Circuit stack matches Circuit.

def lib_layers(t):
    gap = ease_out_back(span(t, 0, 1), 2.4) * 1.3
    top = [(2.5, 6.5 - gap), (9, 3 - gap), (15.5, 6.5 - gap), (9, 10 - gap)]
    return P(poly(top, True)) + P(poly([(2.5, 10), (9, 13.5), (15.5, 10)])) + P(poly([(2.5, 13.5 + gap * 0.7), (9, 17 + gap * 0.4), (15.5, 13.5 + gap * 0.7)]))


def lib_hex(t):
    hexagon = [(9 + 6.5 * cos(radians(a)), 9 + 6.5 * sin(radians(a))) for a in range(-90, 270, 60)]
    y = 9 + (-4.2 + ease_in_out(span(t, 0, 0.7)) * 8.4) if t < 0.7 else 9 + 4.2 - ease_out_back(span(t, 0.7, 1)) * 4.2
    half = 6.5 * cos(radians(30)) - abs(y - 9) * 0.58 - 1.5
    return P(poly(hexagon, True)) + P(f"M{n(9 - half)} {n(y)}H{n(9 + half)}")


def lib_focus(t):
    k = 1.3 * ease_out_back(span(t, 0, 0.8), 2)
    a, b, L = 2.5 + k, 15.5 - k, 3.4
    corners = (f"M{n(a)} {n(a + L)}V{n(a + 1.2)}Q{n(a)} {n(a)} {n(a + 1.2)} {n(a)}H{n(a + L)}"
               f"M{n(b - L)} {n(a)}H{n(b - 1.2)}Q{n(b)} {n(a)} {n(b)} {n(a + 1.2)}V{n(a + L)}"
               f"M{n(b)} {n(b - L)}V{n(b - 1.2)}Q{n(b)} {n(b)} {n(b - 1.2)} {n(b)}H{n(b - L)}"
               f"M{n(a + L)} {n(b)}H{n(a + 1.2)}Q{n(a)} {n(b)} {n(a)} {n(b - 1.2)}V{n(b - L)}")
    r = 1.4 + 0.6 * ease_out_back(span(t, 0.2, 1))
    return P(corners) + P(poly(turn([(9, 9 - r), (9 + r, 9), (9, 9 + r), (9 - r, 9)], 90 * ease_out_back(span(t, 0.1, 1))), True), " fill='context-fill'")


def lib_grid(t):
    out = ease_out_back(t, 2)
    tile = lambda x, y: P(rrect(x, y, 5.5, 5.5, 1.7))
    moved = f"translate({n(out * 0.9)} {n(-out * 0.9)}) rotate({n(out * 45)} 12.75 5.25)"
    return tile(2.5, 2.5) + tile(2.5, 10) + tile(10, 10) + g(tile(10, 2.5), moved)


def lib_chevrons(t):
    shift = ease_in_out(t) * 4
    out = ""
    for y0 in (-1.5, 2.5, 6.5):
        y = y0 + shift
        if -2 < y < 9.5:
            out += P(poly([(4.5, y), (9, y + 4), (13.5, y)]), f" stroke-opacity='{n(min(1, (y + 2) / 3.5))}'")
    return out + P("M3 15.5H15")


def lib_orbit(t):
    spin = ease_out_back(t, 1.4) * 200
    a0, a1 = radians(-60 + spin), radians(210 + spin)
    core = turn([(9, 6.6), (11.4, 9), (9, 11.4), (6.6, 9)], ease_out_back(span(t, 0.15, 1)) * 45)
    return (P(f"M{n(9 + 6.5 * cos(a0))} {n(9 + 6.5 * sin(a0))}A6.5 6.5 0 1 1 {n(9 + 6.5 * cos(a1))} {n(9 + 6.5 * sin(a1))}")
            + P(poly(core, True)))


def lib_split(t):
    d = ease_out_back(span(t, 0, 0.8), 2) * 1.8
    core = ease_out_back(span(t, 0.25, 1))
    out = P(f"M{n(8.25 - d)} 3H{n(4.75 - d * 0.4)}Q{n(3 - d * 0.4)} 3 {n(3 - d * 0.4)} 4.75V13.25Q{n(3 - d * 0.4)} 15 {n(4.75 - d * 0.4)} 15H{n(8.25 - d)}")
    out += P(f"M{n(9.75 + d)} 3H{n(13.25 + d * 0.4)}Q{n(15 + d * 0.4)} 3 {n(15 + d * 0.4)} 4.75V13.25Q{n(15 + d * 0.4)} 15 {n(13.25 + d * 0.4)} 15H{n(9.75 + d)}")
    return out + (P(f"M9 {n(9 - core * 3.5)}V{n(9 + core * 3.5)}") if core > 0.05 else "")


def lib_pulse(t):
    dia = lambda r: [(9, 9 - r), (9 + r, 9), (9, 9 + r), (9 - r, 9)]
    grow = ease_in_out(span(t, 0, 0.75))
    fresh = ease_out_back(span(t, 0.5, 1)) * 3
    out = P(poly(dia(7.2), True)) + P(poly(dia(3 + grow * 4), True), f" stroke-opacity='{n(1 - grow * 0.85)}'")
    return out + (P(poly(dia(fresh), True)) if fresh > 0.1 else "")


LIBRARY = {2: ("Still line icon", lambda t: lib_layers(0)), 3: ("Layers", lib_layers), 4: ("Hex scan", lib_hex),
           5: ("Focus", lib_focus), 6: ("Grid", lib_grid), 7: ("Chevrons", lib_chevrons), 8: ("Orbit", lib_orbit),
           9: ("Split", lib_split), 10: ("Pulse", lib_pulse)}
LIBRARY[12] = ("Circuit stack", lib_circuit)
FOLLOW_LIBRARY = {2: 12}   # what "Follow the icon set" shows with Circuit


# ---- Zen's own, animated --------------------------------------------------------
# Zen's icons (or New Icons', when installed) keep their artwork and move to a
# pose of their own while hovered: back slides left, reload turns, downloads
# drop. --zzicon-t carries the pose on Circuit's spring, so it builds up from
# rest, overshoots, falls back and settles, holds while hovered, and plays back
# on leave, picking up mid-way. --zzicon-v runs the same spring plus its speed,
# so v - t is how fast the icon is moving: moving icons stretch along their path
# and leave a faint trail that grows with speed and is gone at rest.
T = "var(--zzicon-t)"
V = "(var(--zzicon-v) - var(--zzicon-t))"        # signed speed, 1 at its fastest
A = f"max({V}, -1 * {V})"


def pose(x=0, y=0, turn=0, grow=0, sx=0, sy=0):
    return {"x": x, "y": y, "turn": turn, "sx": grow + sx, "sy": grow + sy}


slide = lambda x, y=0: pose(x, y)
spin = lambda deg, **k: pose(turn=deg, **k)
swell = lambda k: pose(grow=k)
stretch = lambda sx, sy: pose(sx=sx, sy=sy)


def motion_props(m):
    out, x, y = {}, m["x"], m["y"]
    if x or y:
        out["translate"] = f"calc({T} * {x:g}px) calc({T} * {y:g}px)"
    if m["turn"]:
        out["rotate"] = f"calc({T} * {m['turn']:g}deg)"
    ux, uy = (abs(x) / (abs(x) + abs(y)), abs(y) / (abs(x) + abs(y))) if x or y else (0, 0)
    sx = [f"{T} * {m['sx']:g}"] * bool(m["sx"]) + [f"{A} * {0.2 * ux - 0.08 * uy:.3g}"] * bool(ux or uy)
    sy = [f"{T} * {m['sy']:g}"] * bool(m["sy"]) + [f"{A} * {0.2 * uy - 0.08 * ux:.3g}"] * bool(ux or uy)
    if sx or sy:
        out["scale"] = f"calc(1 + {' + '.join(sx) or 0}) calc(1 + {' + '.join(sy) or 0})"
    trail = (f"drop-shadow(calc({V} * {-0.8 * x:.3g}px) calc({V} * {-0.8 * y:.3g}px) .4px "
             f"color-mix(in srgb, currentColor calc(min({A}, 1) * 45%), transparent))") if x or y else ""
    out["filter"] = f"{trail} var(--zzicon-zen-glow,)" if trail else "var(--zzicon-zen-glow, none)"
    return " ".join(f"{k}: {v} !important;" for k, v in out.items())


ZEN_MOTION = {
    "back": slide(-1.5), "forward": slide(1.5), "reload": spin(360), "stop": spin(90), "home": slide(0, -1.5),
    "new-tab": spin(90), "menu": stretch(0.18, -0.1), "sidebar": pose(x=-1.2, sx=-0.1), "expand-sidebar": slide(1.2),
    "site-data": spin(-15), "downloads": slide(0, 1.5), "extensions": pose(y=-0.6, turn=-15),
    "bookmark": pose(y=-0.8, grow=0.15), "bookmarked": pose(y=-0.8, grow=0.15), "reader": pose(y=-1, turn=-8),
    "share": slide(1, -1), "history": spin(-360), "screenshot": swell(-0.15), "overflow": slide(1.4), "chevron": slide(0, 1.2),
    "close-unpinned": slide(0, 1.5), "play": swell(0.15), "pause": swell(0.15), "next": slide(1.5), "previous": slide(-1.5),
    "volume": stretch(0.12, 0), "muted": stretch(0.12, 0), "media-close": spin(90), "pip": swell(-0.12),
    "save-page": slide(0, 1.5), "print": slide(0, 1.5), "find": spin(-12, grow=0.1), "open-file": spin(-10),
    "zoom-in": swell(0.2), "zoom-out": swell(-0.2), "cut": spin(12), "copy": slide(0.9, 0.9), "paste": slide(0, 1.5),
    "encoding": swell(0.15), "email": slide(0, -1.5), "logins": spin(-12), "sync": spin(180), "send-tab": slide(1.2, -1.2),
    "import": slide(-1.2, 1.2), "settings": spin(90), "forget": swell(-0.2), "private": slide(0, -1.2),
    "firefox-view": swell(0.12), "developer": stretch(0.2, 0), "new-window": swell(0.15), "fullscreen": swell(0.2),
    "firefox-library": slide(0, -1.5), "account": slide(0, -1.5), "app-menu": stretch(0, 0.2), "compact": stretch(-0.18, 0),
    "reopen": slide(0, -1.5), "help": spin(12), "quit": spin(90), "minus": stretch(-0.35, 0),
}
MENU_DEFAULT = swell(0.15)
# Context menu items that do what a toolbar button does move the same way.
MENU_ITEMS = {
    "back": ["context-back"], "forward": ["context-forward"], "reload": ["context-reload", "context_reloadTab", "context_reloadSelectedTabs"],
    "stop": ["context-stop", "context_closeTab"], "bookmark": ["context-bookmarkpage", "context-bookmarklink", "context_bookmarkTab"],
    "save-page": ["context-savepage", "context-savelink", "context-saveimage", "context-savevideo", "context-saveaudio"],
    "copy": ["context-copy", "context-copylink", "context-copyimage", "context-copyimage-contents", "context-copyemail", "context-copyvideourl", "context-copyaudiourl"],
    "cut": ["context-cut"], "paste": ["context-paste", "context-paste-no-formatting"],
    "new-tab": ["context-openlinkintab", "context-openlinkincontainertab", "context_openANewTab"],
    "new-window": ["context-openlink"], "private": ["context-openlinkprivate"], "screenshot": ["context-take-screenshot"],
    "send-tab": ["context-sendpagetodevice", "context-sendlinktodevice", "context_sendTabToDevice"],
    "developer": ["context-inspect", "context-inspect-a11y", "context-viewsource"], "find": ["context-searchselect", "context-searchselect-private"],
    "print": ["context-print-selection"], "share": ["context-sharepage", "context_shareTabURL"], "reader": ["context-viewpartialsource-selection"],
    "reopen": ["context_undoCloseTab", "toolbar-context-undoCloseTab"],
    "compact": ["zen-context-menu-compact-mode-toggle", "zen-toolbar-context-compact-mode-enable"],
}
ZEN_ANIMATED = 6                 # per-button override: Zen's own, animated


def warp(x):
    """How the motion gathers speed: the time warp the eye exam tunes."""
    return x


def _spring_easings(n=60):
    """The spring and its speed as linear() easings, for hover and for leave.
    Leave replays the spring backwards, as Circuit plays its strip back."""
    pos = [settle(warp(i / n)) for i in range(n + 1)]
    vel = [(pos[min(i + 1, n)] - pos[max(i - 1, 0)]) / ((min(i + 1, n) - max(i - 1, 0)) / n) for i in range(n + 1)]
    top = max(abs(v) for v in vel)
    back = [1 - p for p in reversed(pos)]
    curves = (pos, [p + v / top for p, v in zip(pos, vel)], back, [q + v / top for q, v in zip(back, reversed(vel))])
    for c in curves:
        c[0], c[-1] = 0, 1
    return tuple("linear(" + ", ".join(f"{v:.3f}" for v in c) + ")" for c in curves)


# Builds up from rest, overshoots, falls back and settles, like Circuit's frames.
EASE, SPEED_EASE, BACK_EASE, BACK_SPEED_EASE = _spring_easings()


def zen_css():
    out = ["/* Zen's own, animated */",
           '@property --zzicon-t { syntax: "<number>"; inherits: false; initial-value: 0; }',
           '@property --zzicon-v { syntax: "<number>"; inherits: false; initial-value: 0; }']
    out.append(f":root {{ --zzicon-spring: {EASE};\n  --zzicon-spring-speed: {SPEED_EASE};\n"
               f"  --zzicon-spring-back: {BACK_EASE};\n  --zzicon-spring-back-speed: {BACK_SPEED_EASE}; }}")
    ride = lambda way: (f"transition: --zzicon-t var(--zzicon-duration) var(--zzicon-spring{way}), "
                        f"--zzicon-v var(--zzicon-duration) var(--zzicon-spring{way}-speed) !important;")
    move = ride("-back") + " animation: none !important;"
    lit = ride("") + " --zzicon-t: 1 !important; --zzicon-v: 1 !important;"
    every = []
    for key, (label, _, targets) in TOOLBAR.items():
        k = SETTING.get(key, key)
        icons = ", ".join(i + OWN for i, _ in targets)
        hovers = ", ".join(h + OWN for _, h in targets)
        every += [i for i, _ in targets]
        out.append(f"/* {label}, Zen's own animated */\n"
                   f'@media ((-moz-pref("zzicon.set", 0)) and (-moz-pref("zzicon.button.{k}", 0))) or (-moz-pref("zzicon.button.{k}", {ZEN_ANIMATED})) {{\n'
                   f"  {icons} {{ {move} {motion_props(ZEN_MOTION[key])} }}\n"
                   f'  @media (-moz-pref("zzicon.animate")) {{ {hovers} {{ {lit} }} }}\n}}')
    # The glow rises with the pose, so it lights as the icon moves.
    out.append('@media (-moz-pref("zzicon.circuit.glow")) {\n'
               f"  {', '.join(dict.fromkeys(every))} {{ --zzicon-zen-glow: drop-shadow(0 0 2.5px color-mix(in srgb, currentColor calc(clamp(0, {T}, 1) * 65%), transparent)); }}\n}}")
    items = "menupopup :is(menuitem, menu)"         # descendants: the Back/Reload row sits in a menugroup
    out.append(f"/* Menu icons */\n@media (-moz-pref(\"zzicon.menu.animate\")) {{\n"
               f"  {items} > .menu-icon {{ {move} {motion_props(MENU_DEFAULT)} }}\n"
               f"  {items}[_moz-menuactive] > .menu-icon {{ {lit} }}")
    for key, ids in MENU_ITEMS.items():
        out.append(f"  {', '.join('#' + i + ' > .menu-icon' for i in ids)} {{ {motion_props(ZEN_MOTION[key])} }}")
    out.append("}")
    return out


# ---- hover motion -------------------------------------------------------------
# Plain CSS motion on the icon (or button) itself, so it works with any icon,
# Zen's own included. Values match Iconflow's Hover motion settings.
MOTIONS = {
    2: ("Spin (like Arc's +)", "zzicon-spin", "to { rotate: 180deg; }", "ease-out"),
    3: ("Full turn", "zzicon-turn", "to { rotate: 360deg; }", "cubic-bezier(.45,0,.25,1)"),
    4: ("Pop", "zzicon-pop", "45% { scale: 1.22; } 75% { scale: .96; }", "ease-out"),
    5: ("Press", "zzicon-press", "45% { scale: .8; } 75% { scale: 1.04; }", "ease-out"),
    6: ("Pulse", "zzicon-pulse", "25%, 75% { scale: 1.14; } 50% { scale: 1; }", "ease-in-out"),
    7: ("Wiggle", "zzicon-wiggle", "20% { rotate: -12deg; } 40% { rotate: 10deg; } 60% { rotate: -6deg; } 80% { rotate: 3deg; }", "ease-in-out"),
    8: ("Bounce", "zzicon-bounce", "35% { translate: 0 -3px; } 65% { translate: 0 1px; } 85% { translate: 0 -.5px; }", "ease-out"),
    9: ("Ripple", "zzicon-ripple", "0% { border-radius: 50%; box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 40%, transparent); } "
                                   "100% { border-radius: 50%; box-shadow: 0 0 0 9px transparent; }", "ease-out"),
    11: ("Narrow (like zoom out)", "zzicon-narrow", "45% { scale: .55 1; } 75% { scale: .85 1; }", "cubic-bezier(.45,0,.25,1)"),
    10: ("Wave", "zzicon-wave", "20% { translate: 0 -1.5px; rotate: -7deg; } 50% { translate: 0 1px; rotate: 6deg; } 80% { translate: 0 -.5px; rotate: -2deg; }", "ease-in-out"),
}
# group -> (label, hovered elements that move)
MOTION_GROUPS = {
    "close": ("Close buttons", ".tab-close-button:hover, .zen-glance-sidebar-close:hover, .zen-media-close-button:hover > .toolbarbutton-icon, #stop-button:hover > .toolbarbutton-icon"),
    "plus": ("Plus buttons", ":is(#zen-create-new-button, #tabs-newtab-button, #new-tab-button):hover > .toolbarbutton-icon"),
    "minus": ("Minus (reset) buttons", ".tab-reset-button:hover, .tab-reset-pin-button:hover image"),
    "library": ("Library button", "#zen-library-button:hover > .zen-library-sprite"),
    "toolbar": ("Other toolbar buttons", ".toolbarbutton-1:not(#zen-create-new-button, #tabs-newtab-button, #new-tab-button, #zen-library-button, #stop-button, .zen-media-close-button):hover > .toolbarbutton-icon"),
    "media": ("Media controls", ".zen-media-controls-hbox .toolbarbutton-1:hover > .toolbarbutton-icon"),
}


def motion_css():
    out = [f"@keyframes {name} {{ {frames} }}" for _, name, frames, _ in MOTIONS.values()]
    for key, (label, targets) in MOTION_GROUPS.items():
        out.append(f"/* Hover motion: {label} */")
        out.append(f'@media (-moz-pref("zzicon.motion.{key}", 1)) {{ {targets} {{ animation: none !important; rotate: none !important; scale: none !important; translate: none !important; }} }}')
        for value, (_, name, _, timing) in MOTIONS.items():
            out.append(f'@media (-moz-pref("zzicon.motion.{key}", {value})) {{ {targets} {{ animation: {name} var(--zzicon-motion-duration) {timing} !important; }} }}')
    return out


# ---- output -----------------------------------------------------------------

def strip(draw, frames, zoom=1.0):
    """Frames side by side. zoom > 1 crops each frame to its middle 18/zoom
    units and fills the frame with that, so a design drawn across 1.5-16.5
    of the 18-unit grid fills Zen's 16px slot as Zen's own icons do."""
    _ids[0] = 0
    z = f"<g transform='translate(9 9) scale({zoom}) translate(-9 -9)'>" if zoom != 1 else "<g>"
    body = "".join(f"<g transform='translate({i * G})'><g clip-path='url(#f)'>{z}{draw(i / (frames - 1))}</g></g></g>"
                   for i in range(frames))
    return (f"<svg xmlns='http://www.w3.org/2000/svg' width='{frames * G}' height='{G}' fill='none' "
            "stroke='context-fill' stroke-opacity='context-fill-opacity' stroke-width='1.4' "
            f"stroke-linecap='round' stroke-linejoin='round'><clipPath id='f'><rect width='{G}' height='{G}'/></clipPath>"
            "<linearGradient id='sheen' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='white' stop-opacity='.5'/>"
            f"<stop offset='.55' stop-color='white' stop-opacity='0'/></linearGradient>{body}</svg>\n")


def _mul(p, q):
    return (p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3],
            p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5])


def _matrix(spec):
    """An SVG transform list as a 2x3 matrix (a, b, c, d, e, f)."""
    m = (1, 0, 0, 1, 0, 0)
    for name, args in re.findall(r"(\w+)\(([^)]*)\)", spec or ""):
        v = [float(x) for x in re.split(r"[ ,]+", args.strip())]
        if name == "translate":
            q = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == "scale":
            q = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == "matrix":
            q = tuple(v)
        elif name == "rotate":
            a, (cx, cy) = radians(v[0]), (v[1:3] if len(v) > 2 else (0, 0))
            c, s_ = cos(a), sin(a)
            q = (c, s_, -s_, c, cx - c * cx + s_ * cy, cy - s_ * cx - c * cy)
        else:
            continue
        m = _mul(m, q)
    return m


NUM = r"-?\d*\.?\d+(?:e-?\d+)?"


def _points(d):
    """Every point and control point of an absolute path (M L H V Q C A Z)."""
    pts, x, y = [], 0.0, 0.0
    for cmd, args in re.findall(r"([MLHVQCAZ])([^MLHVQCAZ]*)", d):
        v = [float(a) for a in re.findall(NUM, args)]
        if cmd in "ML":
            for k in range(0, len(v) - 1, 2):
                x, y = v[k], v[k + 1]
                pts.append((x, y))
        elif cmd in "HV":
            for k in v:
                x, y = (k, y) if cmd == "H" else (x, k)
                pts.append((x, y))
        elif cmd in "QC":
            pts += [(v[k], v[k + 1]) for k in range(0, len(v) - 1, 2)]
            x, y = (v[-2], v[-1]) if len(v) >= 2 else (x, y)
        elif cmd == "A":
            for k in range(0, len(v) - 6, 7):
                x, y = v[k + 5], v[k + 6]
                pts.append((x, y))
    return pts


def extent(draw, frames):
    """How far a design reaches from the frame's centre over all its frames,
    lines' half-widths included. Points and control points are used, so
    curves are covered; arcs count by their ends (only light traces use them)."""
    reach = 0.0
    def walk(el, m, width, defs):
        nonlocal reach
        m = _mul(m, _matrix(el.get("transform")))
        width = float(el.get("stroke-width", width))
        ref = (el.get("href") or "").lstrip("#")
        d = el.get("d") if el.tag == "path" and not el.get("id") else defs.get(ref) if el.tag == "use" else None
        if d and "context-stroke" not in (el.get("stroke"), el.get("fill")):   # the soft halo may clip
            pad = 0 if el.get("stroke") == "none" else width / 2
            for x, y in _points(d):
                X, Y = m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]
                reach = max(reach, abs(X - 9) + pad, abs(Y - 9) + pad)
        for c in el:
            if c.tag != "defs":
                walk(c, m, width, defs)
    for i in range(frames):
        _ids[0] = 0
        root = ET.fromstring(f"<g>{draw(i / (frames - 1))}</g>")
        walk(root, (1, 0, 0, 1, 0, 0), 1.4, {e.get("id"): e.get("d") for e in root.iter("path") if e.get("id")})
    return reach


def fit(draw, frames, most=1.25):
    """The largest zoom, up to most, that keeps every frame of a design inside
    its frame: small designs fill the slot, wide ones are not cut off."""
    return round(max(1.0, min(most, 8.6 / max(extent(draw, frames), 1e-6))), 3)


def save(rel, svg):
    """Write one strip next to icons.css; Zen loads it only when a rule uses it."""
    path = OUT.parent / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg)
    return f'url("{rel}")'


# An icon that plays its own animation does not also take a whole-icon hover motion.
STILL_MOTION = "animation: none !important; rotate: none !important; scale: none !important; translate: none !important;"
OWN = ":not(#zzicon-own)"   # an id's weight, so this outranks the motion rules' :not(#id) lists
SET, ANIMATED, STILL = 2, 4, 5   # zzicon.set value for Circuit; per-button overrides
RELOAD_STYLES = {1: ("Twin comets", c_reload_comets)}   # zzicon.reload.style; 0 is Orbit pair


def uses(key):
    k = SETTING.get(key, key)
    return (f'((-moz-pref("zzicon.set", {SET})) and (-moz-pref("zzicon.button.{k}", 0))) or '
            f'(-moz-pref("zzicon.button.{k}", {ANIMATED})) or (-moz-pref("zzicon.button.{k}", {STILL}))')


def main():
    css = ["/* Generated by tools/iconflow-icons.py; edit that, not this. Strips are in icons/. */",
           "/* The frame shown. An <integer> only ever transitions through whole\n"
           "   numbers, so a hover that interrupts one in progress still lands on\n"
           "   whole frames and never shows the strip sliding between two. */",
           '@property --zzicon-frame { syntax: "<integer>"; inherits: false; initial-value: 0; }']
    for old in (OUT.parent / "icons").glob("*/*.svg"):
        old.unlink()
    url = {}
    for key, (_, draw, _) in TOOLBAR.items():
        url[key] = save(f"icons/circuit/{key}.svg", strip(draw, FRAMES, fit(draw, FRAMES)))
    for value, (_, draw) in LIBRARY.items():
        if value != 12:                     # Circuit stack uses the toolbar strip
            url["library", value] = save(f"icons/library/{value}.svg", strip(draw, LIB_FRAMES))
    for key, (label, _, targets) in TOOLBAR.items():
        k = SETTING.get(key, key)
        icons = ", ".join(i for i, _ in targets)
        hovers = ", ".join(h for _, h in targets)
        own = ", ".join(h + OWN for _, h in targets)
        css.append(f"/* {label} */\n@media {uses(key)} {{\n"
                   f"  {icons} {{\n    list-style-image: var(--zzicon-blank) !important;\n"
                   f"    -moz-context-properties: fill, fill-opacity, stroke !important;\n    stroke: var(--zzicon-halo, currentColor) !important;\n"
                   f"    background-image: {url[key]} !important;\n"
                   f"    background-size: {FRAMES * 100}% 100% !important;\n"
                   f"    background-position: calc(var(--zzicon-frame) * 100% / {FRAMES - 1}) 0 !important;\n"
                   f"    background-repeat: no-repeat !important;\n"
                   f"    background-origin: content-box !important;\n    background-clip: content-box !important;\n"
                   f"    transition: --zzicon-frame var(--zzicon-duration) linear, filter .2s !important;\n  }}\n"
                   f"  @media (-moz-pref(\"zzicon.animate\")) and (not (-moz-pref(\"zzicon.button.{k}\", {STILL}))) {{\n"
                   f"    {hovers} {{ --zzicon-frame: {FRAMES - 1} !important;\n      filter: var(--zzicon-circuit-glow, none) !important; }}\n"
                   f"    {own} {{ {STILL_MOTION} }}\n  }}\n}}")
    icons = ", ".join(i for i, _ in TOOLBAR["reload"][2])
    for value, (label, draw) in RELOAD_STYLES.items():
        rel = save(f"icons/circuit/reload-{value}.svg", strip(draw, FRAMES, fit(draw, FRAMES)))
        css.append(f"/* Reload: {label} */\n@media ({uses('reload')}) and (-moz-pref(\"zzicon.reload.style\", {value})) {{\n"
                   f"  {icons} {{ background-image: {rel} !important; }}\n}}")
    for value, (label, _) in LIBRARY.items():
        follow = "".join(f' or ((-moz-pref("zzicon.library.style", 11)) and (-moz-pref("zzicon.set", {setv})))'
                         for setv, lib in FOLLOW_LIBRARY.items() if lib == value)
        if value == 12:
            # Circuit stack: the Firefox Library icon itself, stepped by the
            # frame counter at 16px like every toolbar icon, not Zen's sprite.
            css.append(f"/* Library: {label} */\n@media (-moz-pref(\"zzicon.library.style\", {value})){follow} {{\n"
                       "  #zen-library-button { --zen-library-sprite-size: 16px !important; }\n"
                       "  #zen-library-button .zen-library-sprite { scale: 1 !important; translate: none !important; }\n"
                       "  #zen-library-button .zen-library-sprite::before {\n"
                       # Zen's own ::before is 36 frames wide; one frame here.
                       "    width: 100% !important;\n"
                       f"    background-image: {url['firefox-library']} !important;\n"
                       f"    background-size: {FRAMES * 100}% 100% !important;\n"
                       f"    background-position: calc(var(--zzicon-frame) * 100% / {FRAMES - 1}) 0 !important;\n"
                       "    background-repeat: no-repeat !important;\n    animation: none !important;\n"
                       "    -moz-context-properties: fill, fill-opacity, stroke !important;\n"
                       "    stroke: var(--zzicon-halo, currentColor) !important;\n"
                       "    transition: --zzicon-frame var(--zzicon-duration) linear, filter .2s !important;\n  }\n"
                       "  @media (-moz-pref(\"zzicon.animate\")) {\n"
                       f"    #zen-library-button:hover .zen-library-sprite::before {{ --zzicon-frame: {FRAMES - 1} !important;\n"
                       "      filter: var(--zzicon-circuit-glow, none) !important; }\n  }\n"
                       f"  #zen-library-button:hover > .zen-library-sprite{OWN} {{ {STILL_MOTION} }}\n}}")
            continue
        css.append(f"/* Library: {label} */\n@media (-moz-pref(\"zzicon.library.style\", {value})){follow} {{\n"
                   f"  #zen-library-button .zen-library-sprite::before {{ background-image: {url['library', value]} !important; }}\n"
                   f"  #zen-library-button:hover > .zen-library-sprite{OWN} {{ {STILL_MOTION} }}\n}}")
    css += motion_css()
    css += zen_css()
    OUT.write_text("\n".join(css) + "\n")
    total = sum(f.stat().st_size for f in (OUT.parent / "icons").glob("*/*.svg"))
    print(f"wrote {len(TOOLBAR)} icons, {len(RELOAD_STYLES)} reload style and {len(LIBRARY)} library strips: "
          f"icons.css {OUT.stat().st_size // 1024} KB, strips {total // 1024} KB")


if __name__ == "__main__":
    main()
