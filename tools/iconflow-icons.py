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
from math import cos, sin, radians, pi
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "iconflow" / "icons.css"
G = 18            # Zen's icon grid
FRAMES = 48       # toolbar icons
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


def ease_speed(t):
    """ease_in_out's speed scaled to 0..1, for trails that grow with speed."""
    return 4 * min(t, 1 - t) ** 2


def run_up(t):
    """A short run-up for curves that would otherwise start at full speed."""
    return t * t * (2 - t)


def ease_out(t):
    return 1 - (1 - run_up(t)) ** 3


def ease_out_back(t, s=1.7):
    t = run_up(t) - 1
    return 1 + (s + 1) * t ** 3 + s * t ** 2


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
    pts, out = list(points), []
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
    """A rectangle with its corners cut at 45 degrees, the cuts rounded."""
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
            f"<use href='#{i}' stroke-width='1.4' stroke-opacity='{n(0.85 + 0.15 * lit)}'/>")
    if trace is not None and 0.02 < trace < 0.98:
        out += (f"<path d='{d}' pathLength='100' stroke-width='1.7' stroke-dasharray='16 84' "
                f"stroke-dashoffset='{n(-100 * ease_in_out(trace))}' stroke-opacity='{n(bump(trace))}'/>")
    return out


def tube(d, lit=0.0, trace=None):
    """Neon tube: a soft wide stroke and a bright core."""
    i, out = shape(d)
    out += (f"<use href='#{i}' stroke-width='3.2' stroke-opacity='{n(0.22 + 0.2 * lit)}'/>"
            f"<use href='#{i}' stroke-width='1.7'/>")
    if trace is not None and 0.02 < trace < 0.98:
        out += (f"<path d='{d}' pathLength='100' stroke-width='2.4' stroke-dasharray='22 78' "
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
    # A glass blade that dashes out, trailing fading copies while it moves fast.
    dx = 0.5 * bump(span(t, 0, 0.2)) - 1.7 * ease_out_back(span(t, 0.1, 1), 2)
    out = ghosts(lambda o: glass(blade(5.2 + dx + o, 9, 5.6, 5.8, 2.6), body=0.12), 3.6, t)
    out += glass(blade(5.2 + dx, 9, 5.6, 5.8, 2.6), lit=bump(t), trace=t)
    return g(out, "matrix(-1 0 0 1 18 0)") if flip else out


def c_forward(t):
    return c_back(t, flip=True)


def c_reload(t):
    # An open neon arc with two glass diamonds circling it at different speeds
    # and radii, trailing while they move fast.
    e = ease_in_out(t)
    a1, a2 = -30 + 360 * e, 5 + 540 * e      # both rest by the gap, never as a pair of "eyes"
    big = _diamond(9 + 6.2 * cos(radians(a1)), 9 + 6.2 * sin(radians(a1)), 1.45 + 0.3 * bump(t))
    small = _diamond(9 + 3.4 * cos(radians(a2)), 9 + 3.4 * sin(radians(a2)), 0.95)
    return (g(taper_tube(6.2, 25, 255, trace=t), f"rotate({n(90 * e)} 9 9)")
            + trail(6.2, a1, t) + trail(3.4, a2, t, reach=110) + gem(big) + gem(small))


def c_reload_comets(t):
    # Two comets going opposite ways: the outer one once round, the inner
    # one, smaller and shorter-tailed, half as far again, nearly meeting the
    # outer head at the end.
    e = ease_in_out(t)
    return comet(6.4, -40 + 360 * e, 190, t) + comet(3.3, 110 - 540 * e, 150, t, direction=-1, k=1.05, width=0.8)


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
    # The chevron drops toward the tray, trailing fading copies, and settles.
    drop = 2.6 * bump(span(t, 0, 0.55)) + 0.8 * ease_out(span(t, 0.45, 1))
    def chev(o):
        y = 4 + drop - o
        return glass(rpoly([(3.6, y), (9, y + 5.4), (14.4, y), (14.4, y + 2.6), (9, y + 8), (3.6, y + 2.6)], 0.85), body=0.12)
    return ghosts(chev, 3.3, t) + chev(0) + tube("M4 15.2H14", lit=bump(span(t, 0.3, 0.9)))


def c_extensions(t):
    # Opposite tiles lift out and sink back, turning against each other.
    e = ease_out_back(t, 2)
    tile = lambda x, y: glass(chamfer(x, y, 5.6, 5.6, 1.4, 0.55))
    up = f"translate({n(e * 0.9)} {n(-e * 0.9)}) rotate({n(e * 45)} 12.8 5.2)"
    down = f"translate({n(-e * 0.9)} {n(e * 0.9)}) rotate({n(-e * 45)} 5.2 12.8)"
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


def c_history(t):
    # A glass card with the lit edges of two more behind it, spreading on hover.
    e = 1.55 + 0.75 * ease_out_back(t, 2)
    return (glass(chamfer(5.2, 5.2, 10.4, 10.4, 1.8), lit=bump(t), trace=t) + tube(peek(e), lit=bump(t))
            + f"<g opacity='.6'>{tube(peek(2 * e))}</g>")


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
    return glass(C_SPEAKER) + g(tube("M12 6.8L16 10.8M16 6.8L12 10.8", lit=bump(t)), f"rotate({n(a)} 14 8.8)")


def c_pip(t):
    e = ease_out_back(t, 1.8)
    x, y = 9.2 - 5.4 * e, 9 - 4.4 * e
    return glass(chamfer(1.8, 2.8, 14.4, 12.4, 2.2), trace=t) + glass(chamfer(x, y, 5.2, 4, 1, 0.45), lit=1, body=0.45)


def peek(step):
    """The top and left edges of a card behind the front one, set back by step."""
    x, y = 5.2 - step, 5.2 - step
    return f"M{n(x)} {n(14.6 - step * 0.6)}V{n(y + 2.2)}C{n(x)} {n(y + 0.8)} {n(x + 0.8)} {n(y)} {n(x + 2.2)} {n(y)}H{n(14.6 - step * 0.6)}"


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
    "new-tab": ("New tab", c_plus, tb("#tabs-newtab-button", "#zen-create-new-button", "#new-tab-button")),
    "menu": ("Menu and workspace actions", c_dots, tb("#PanelUI-menu-button", ".zen-workspaces-actions")),
    "sidebar": ("Sidebar toggle", c_sidebar, tb("#zen-toggle-compact-mode", "#sidebar-button")),
    "expand-sidebar": ("Expand sidebar", c_expand, tb("#zen-expand-sidebar-button")),
    "site-data": ("Site settings", c_sliders, [("#zen-site-data-icon-button image", "#zen-site-data-icon-button:hover image")]),
    "downloads": ("Downloads", c_downloads, tb("#downloads-button")),
    "extensions": ("Extensions", c_extensions, tb("#unified-extensions-button", "#add-ons-button")),
    "bookmark": ("Bookmark", c_bookmark, [("#star-button:not([starred])", "#star-button-box:hover > #star-button:not([starred])")]
                 + tb("#bookmarks-menu-button")),
    "bookmarked": ("Bookmark, saved", c_bookmarked, [("#star-button[starred]", "#star-button-box:hover > #star-button[starred]")]),
    "reader": ("Reader view", c_reader, [("#reader-mode-button > .urlbar-icon", "#reader-mode-button:hover > .urlbar-icon")]),
    "share": ("Share and copy link", c_share, tb("#zen-copy-current-url-button", "#share-tab-button")),
    "history": ("History", c_history, tb("#history-panelmenu")),
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
}

# Settings group the starred and unstarred star, and play/pause, mute/unmute.
SETTING = {"bookmarked": "bookmark", "pause": "play", "muted": "volume"}


def lib_circuit(t):
    # Three glass plates that pull apart while a light runs round the top one.
    gap = ease_out_back(span(t, 0, 1), 2.4) * 1.2
    plate = lambda y: rpoly([(2.4, y), (9, y - 3.4), (15.6, y), (9, y + 3.4)], 0.9)
    return glass(plate(13.2 + gap * 0.6), body=0.12) + glass(plate(9.8), body=0.14) + glass(plate(6.4 - gap), lit=bump(t), trace=t, body=0.2)


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


def taper(r, a0, a1, width, alpha, steps=12, cx=9, cy=9):
    """An arc from a0 (u = 0) to a1 (u = 1) drawn in short pieces whose width
    and opacity follow width(u) and alpha(u), so it thins and fades smoothly
    instead of stopping. Pieces overlap by a hair, so no seam shows."""
    out = ""
    for i in range(steps):
        u = (i + 0.5) / steps
        b0 = a0 + (a1 - a0) * i / steps
        b1 = a0 + (a1 - a0) * (i + 1) / steps
        lo, hi = (b0, b1) if a1 >= a0 else (b1, b0)
        out += (f"<path d='{arc(r, lo - 0.4, hi + 0.4, cx, cy)}' stroke-linecap='butt' "
                f"stroke-width='{n(width(u))}' stroke-opacity='{n(alpha(u))}'/>")
    return out


def taper_tube(r, a0, a1, lit=0.0, trace=None):
    """A neon tube along an open arc whose two ends taper to a point."""
    k = lambda u: ease_in_out(clamp(min(u, 1 - u) / 0.24))   # 0 at the ends, 1 along the middle
    out = (taper(r, a0, a1, lambda u: 3.2 * (0.35 + 0.65 * k(u)), lambda u: (0.22 + 0.2 * lit) * k(u), 28)
           + taper(r, a0, a1, lambda u: 0.35 + 1.35 * k(u), lambda u: 0.3 + 0.7 * k(u), 28))
    if trace is not None and 0.02 < trace < 0.98:
        out += (f"<path d='{arc(r, a0, a1)}' pathLength='100' stroke-width='2.4' stroke-dasharray='22 78' "
                f"stroke-dashoffset='{n(-100 * ease_in_out(trace))}' stroke-opacity='{n(0.9 * bump(trace))}'/>")
    return out


def trail(r, a, t, direction=1, reach=80, cx=9, cy=9):
    """A comet trail behind something orbiting at angle a: longer while it
    moves fast, gone when it rests. Thin and faint at its far end, building
    to the moving shape."""
    lag = reach * ease_speed(t)
    if lag < 4:
        return ""
    return taper(r, a - direction * lag, a, lambda u: 0.2 + 1.4 * u ** 1.3, lambda u: 0.75 * u ** 1.6, 10, cx, cy)


def comet(r, a, tail, t, direction=1, k=1.5, width=1.0):
    """A diamond at angle a on a circle of radius r, with a tail that fades
    behind it and stretches while it moves fast."""
    tail += 50 * ease_speed(t)
    out = taper(r, a - direction * tail, a, lambda u: width * (0.25 + 2.1 * u ** 1.2), lambda u: 0.05 + 0.9 * u ** 1.4, 18)
    x, y = 9 + r * cos(radians(a)), 9 + r * sin(radians(a))
    return out + gem(_diamond(x, y, k + 0.3 * bump(t)))


def ghosts(draw, reach, t):
    """Fading copies of a glass shape at earlier positions, shown only while it
    moves fast; three blend into a smooth smear."""
    speed = ease_speed(t)
    if speed < 0.15:
        return ""
    return "".join(f"<g opacity='{n(speed * (0.32 - 0.09 * i))}'>{draw(reach * (i + 1) / 3)}</g>" for i in range(3))


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

def strip(draw, frames):
    _ids[0] = 0
    body = "".join(f"<g transform='translate({i * G})'><g clip-path='url(#f)'>{draw(i / (frames - 1))}</g></g>"
                   for i in range(frames))
    return (f"<svg xmlns='http://www.w3.org/2000/svg' width='{frames * G}' height='{G}' fill='none' "
            "stroke='context-fill' stroke-opacity='context-fill-opacity' stroke-width='1.6' "
            f"stroke-linecap='round' stroke-linejoin='round'><clipPath id='f'><rect width='{G}' height='{G}'/></clipPath>"
            "<linearGradient id='sheen' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='white' stop-opacity='.5'/>"
            f"<stop offset='.55' stop-color='white' stop-opacity='0'/></linearGradient>{body}</svg>\n")


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
        url[key] = save(f"icons/circuit/{key}.svg", strip(draw, FRAMES))
    for value, (_, draw) in LIBRARY.items():
        url["library", value] = save(f"icons/library/{value}.svg", strip(draw, LIB_FRAMES))
    for key, (label, _, targets) in TOOLBAR.items():
        k = SETTING.get(key, key)
        icons = ", ".join(i for i, _ in targets)
        hovers = ", ".join(h for _, h in targets)
        own = ", ".join(h + OWN for _, h in targets)
        css.append(f"/* {label} */\n@media {uses(key)} {{\n"
                   f"  {icons} {{\n    list-style-image: var(--zzicon-blank) !important;\n"
                   f"    -moz-context-properties: fill, fill-opacity !important;\n"
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
        rel = save(f"icons/circuit/reload-{value}.svg", strip(draw, FRAMES))
        css.append(f"/* Reload: {label} */\n@media ({uses('reload')}) and (-moz-pref(\"zzicon.reload.style\", {value})) {{\n"
                   f"  {icons} {{ background-image: {rel} !important; }}\n}}")
    for value, (label, _) in LIBRARY.items():
        follow = "".join(f' or ((-moz-pref("zzicon.library.style", 11)) and (-moz-pref("zzicon.set", {setv})))'
                         for setv, lib in FOLLOW_LIBRARY.items() if lib == value)
        css.append(f"/* Library: {label} */\n@media (-moz-pref(\"zzicon.library.style\", {value})){follow} {{\n"
                   f"  #zen-library-button .zen-library-sprite::before {{ background-image: {url['library', value]} !important; }}\n"
                   f"  #zen-library-button:hover > .zen-library-sprite{OWN} {{ {STILL_MOTION} }}\n}}")
    css += motion_css()
    OUT.write_text("\n".join(css) + "\n")
    total = sum(f.stat().st_size for f in (OUT.parent / "icons").glob("*/*.svg"))
    print(f"wrote {len(TOOLBAR)} icons, {len(RELOAD_STYLES)} reload style and {len(LIBRARY)} library strips: "
          f"icons.css {OUT.stat().st_size // 1024} KB, strips {total // 1024} KB")


if __name__ == "__main__":
    main()
