#!/usr/bin/env python3
"""Draws Iconflow's Flow icon set and writes iconflow/icons.css.

Every icon is a horizontal strip of animation frames on Zen's 18-unit icon
grid, saved as its own file under iconflow/icons/ so Zen only loads the
icons a rule actually uses. Frame 0 is the resting icon; the last frame is held while the button
is hovered. Iconflow's stylesheet steps through the strip with a transition,
so moving off plays it back in reverse and nothing plays at startup.

Style: clean geometric shapes, 1.6-unit lines (about 1.4px at Zen's size),
round line ends and joins so no corner is a hard point, and squircle-like
rounded rectangles. Lines use the toolbar's icon colour (context-fill).

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


def ease_in_out(t):
    return t * t * (3 - 2 * t)


def ease_out(t):
    return 1 - (1 - t) ** 3


def ease_out_back(t, s=1.7):
    t -= 1
    return 1 + (s + 1) * t ** 3 + s * t ** 2


def bump(t):
    """0 -> 1 -> 0, smooth."""
    return sin(pi * clamp(t))


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


# ---- toolbar icons ----------------------------------------------------------
# Each takes t from 0 (resting) to 1 (hovered) and returns SVG markup.

def chevron_left(cx, cy, w=3.6, h=4.6):
    """A chevron whose point is softened into a short curve, not a hard tip."""
    return (f"M{n(cx + w)} {n(cy - h)}L{n(cx + 0.6)} {n(cy - 0.75)}Q{n(cx - 0.15)} {n(cy)} {n(cx + 0.6)} {n(cy + 0.75)}"
            f"L{n(cx + w)} {n(cy + h)}")


def back(t, flip=False):
    # The chevron leans out, squeezes a little, and settles a step further on.
    dx = 0.6 * bump(span(t, 0, 0.22)) - 1.6 * ease_out_back(span(t, 0.12, 1), 2)
    w = 4.6 - 0.9 * bump(span(t, 0.1, 0.6))
    out = P(chevron_left(5.9 + dx, 9, w, 5.4))
    return g(out, "matrix(-1 0 0 1 18 0)") if flip else out


def forward(t):
    return back(t, flip=True)


def reload(t):
    # An open ring that finishes in a short stroke turning in toward the
    # centre, instead of an arrowhead. It turns once on hover.
    r = 6
    a_end = radians(40)                       # the ring stops at lower right
    x_end, y_end = 9 + r * cos(a_end), 9 + r * sin(a_end)
    tail = 2.4 + 0.8 * bump(span(t, 0.2, 0.8))
    tx, ty = x_end - tail * cos(a_end), y_end - tail * sin(a_end)
    ring = f"M{n(x_end)} {n(y_end)}A{r} {r} 0 1 1 {n(9 + r * cos(radians(-10)))} {n(9 + r * sin(radians(-10)))}"
    # one continuous stroke: from the tail's inner end, out to the ring, round it
    d = f"M{n(tx)} {n(ty)}L{n(x_end)} {n(y_end)}" + ring[ring.index("A"):]
    return g(P(d), f"rotate({n(360 * ease_in_out(t))} 9 9)")


def stop(t):
    k = 1 - 0.18 * bump(t)
    pts = scale([(4.5, 4.5), (13.5, 13.5)], k), scale([(13.5, 4.5), (4.5, 13.5)], k)
    return g(P(poly(pts[0])) + P(poly(pts[1])), f"rotate({n(90 * ease_out_back(t))} 9 9)")


def home(t):
    lift = 1.3 * bump(span(t, 0, 0.6)) + 0.35 * ease_out(span(t, 0.4, 1))
    door = 2.6 + 1.1 * ease_out_back(span(t, 0.25, 1))
    roof = move([(2.75, 8.5), (9, 3), (15.25, 8.5)], dy=-lift)
    return (P(poly(roof)) + P("M4.5 7.5V13.25C4.5 14.6 5.15 15.25 6.5 15.25H11.5C12.85 15.25 13.5 14.6 13.5 13.25V7.5")
            + P(f"M9 15.25V{n(15.25 - door)}"))


def plus(t):
    k = 1 + 0.14 * bump(span(t, 0, 0.7))
    a = 90 * ease_out_back(t, 1.4)
    return g(P(poly(scale([(9, 3.5), (9, 14.5)], k))) + P(poly(scale([(3.5, 9), (14.5, 9)], k))), f"rotate({n(a)} 9 9)")


def dots(t):
    # Three short pills that ripple up in turn.
    out = ""
    for i, x in enumerate((3.5, 9, 14.5)):
        y = 9 - 2 * bump(span(t, i * 0.14, i * 0.14 + 0.55))
        out += P(f"M{n(x - 0.9)} {n(y)}H{n(x + 0.9)}", " stroke-width='2.4'")
    return out


def sidebar(t, expand=False):
    frame = P(rrect(1.75, 3, 14.5, 12, 3))
    if expand:
        x = 6.25 + 1.6 * ease_out_back(t, 2)
        dx = 1.1 * ease_out_back(span(t, 0.15, 1), 2)
        return frame + P(f"M{n(x)} 3V15") + g(P(chevron_left(10.25, 9, 2.2, 2.6)), f"matrix(-1 0 0 1 {n(22.75 + dx)} 0)")
    x = 7.5 - 2.1 * ease_out_back(t, 2)
    w = max(0.0, x - 5.3)
    lines = "".join(P(f"M4 {y}H{n(4 + w)}") for y in (6.25, 8.75)) if w > 0.15 else ""
    return frame + P(f"M{n(x)} 3V15") + lines


def expand_sidebar(t):
    return sidebar(t, expand=True)


def sliders(t):
    # Two rails with upright pill knobs that trade places.
    e = ease_in_out(t)
    out = ""
    for y, a, b in ((6, 11.5, 6.5), (12, 6.5, 11.5)):
        k = a + (b - a) * e
        out += P(f"M2.75 {y}H{n(k - 1.9)}M{n(k + 1.9)} {y}H15.25") + P(rrect(k - 1.1, y - 2.6, 2.2, 5.2, 1.1))
    return out


def downloads(t):
    # A chevron above a base line; it drops toward the line and settles.
    drop = 2.4 * bump(span(t, 0, 0.55)) + 0.8 * ease_out(span(t, 0.45, 1))
    squash = 0.7 * bump(span(t, 0.3, 0.7))
    y = 4.5 + drop
    y -= 1
    chev = f"M3.75 {n(y)}L8.2 {n(y + 4.5 - squash)}Q9 {n(y + 5.2 - squash)} 9.8 {n(y + 4.5 - squash)}L14.25 {n(y)}"
    return P(chev) + P(f"M{n(3.75 + squash)} 15H{n(14.25 - squash)}")


def extensions(t):
    out = ease_out_back(t, 2)
    tile = lambda x, y: P(rrect(x, y, 5.5, 5.5, 1.7))
    moved = f"translate({n(out * 0.9)} {n(-out * 0.9)}) rotate({n(out * 45)} 12.75 5.25)"
    return tile(2.5, 2.5) + tile(2.5, 10) + tile(10, 10) + g(tile(10, 2.5), moved)


def bookmark(t, saved=False):
    # A ribbon bookmark with softened corners; it lifts on hover and the
    # notch deepens. Filled once the page is saved.
    lift = 1.2 * bump(span(t, 0, 0.6)) + 0.3 * ease_out(span(t, 0.4, 1))
    notch = 11.8 - 0.8 * ease_out_back(span(t, 0.2, 1))
    y0, y1 = 2.6 - lift, 15.6 - lift
    d = (f"M4.5 {n(y1 - 0.8)}V{n(y0 + 2.2)}C4.5 {n(y0 + 0.8)} 5.3 {n(y0)} 6.7 {n(y0)}H11.3C12.7 {n(y0)} 13.5 {n(y0 + 0.8)} 13.5 {n(y0 + 2.2)}"
         f"V{n(y1 - 0.8)}C13.5 {n(y1)} 12.9 {n(y1 + 0.3)} 12.3 {n(y1 - 0.2)}L9 {n(notch - lift)}L5.7 {n(y1 - 0.2)}C5.1 {n(y1 + 0.3)} 4.5 {n(y1)} 4.5 {n(y1 - 0.8)}Z")
    return P(d, " fill='context-fill'" if saved else "")


def bookmark_saved(t):
    return bookmark(t, saved=True)


def reader(t):
    out = P(rrect(3.25, 2.25, 11.5, 13.5, 2.75))
    for i, (y, w0, w1) in enumerate(((6, 6, 4), (9, 6, 6), (12, 4, 6))):
        w = w0 + (w1 - w0) * ease_out_back(span(t, i * 0.15, i * 0.15 + 0.7), 2)
        out += P(f"M6 {y}H{n(6 + w)}")
    return out


def share(t):
    # Three linked nodes, drawn as softened diamonds; the links pulse outward.
    e = ease_out_back(span(t, 0, 1), 2)
    pts = [(4.25 - 0.5 * e, 9), (13.25 + 0.4 * e, 4.25 - 0.4 * e), (13.25 + 0.4 * e, 13.75 + 0.4 * e)]
    def link(p, q):
        dx, dy = q[0] - p[0], q[1] - p[1]
        L = (dx * dx + dy * dy) ** 0.5
        ux, uy = dx / L, dy / L
        return P(f"M{n(p[0] + ux * 2.6)} {n(p[1] + uy * 2.6)}L{n(q[0] - ux * 2.6)} {n(q[1] - uy * 2.6)}")
    soft = lambda x, y: f"M{n(x)} {n(y - 2.1)}Q{n(x + 0.3)} {n(y - 1.8)} {n(x + 1.8)} {n(y - 0.3)}Q{n(x + 2.1)} {n(y)} {n(x + 1.8)} {n(y + 0.3)}" \
                        f"Q{n(x + 0.3)} {n(y + 1.8)} {n(x)} {n(y + 2.1)}Q{n(x - 0.3)} {n(y + 1.8)} {n(x - 1.8)} {n(y + 0.3)}Q{n(x - 2.1)} {n(y)} {n(x - 1.8)} {n(y - 0.3)}" \
                        f"Q{n(x - 0.3)} {n(y - 1.8)} {n(x)} {n(y - 2.1)}Z"
    return "".join(P(soft(x, y)) for x, y in pts) + link(pts[0], pts[1]) + link(pts[0], pts[2])


def peek(step):
    """The top and left edges of a card behind the front one, set back by step."""
    x, y = 5.2 - step, 5.2 - step
    return f"M{n(x)} {n(14.6 - step * 0.6)}V{n(y + 2.2)}C{n(x)} {n(y + 0.8)} {n(x + 0.8)} {n(y)} {n(x + 2.2)} {n(y)}H{n(14.6 - step * 0.6)}"


def history(t):
    # Pages you have been to: a card with the edges of two more behind it,
    # which spread apart on hover.
    e = 1.55 + 0.75 * ease_out_back(t, 2)
    return P(rrect(5.2, 5.2, 10.4, 10.4, 2.4)) + P(peek(e)) + P(peek(2 * e), f" stroke-opacity='{n(0.6 + 0.2 * bump(t))}'")


def screenshot(t):
    k = 1.3 * ease_out_back(span(t, 0, 0.8), 2)
    a, b, L = 2.5 + k, 15.5 - k, 3.4
    corners = (f"M{n(a)} {n(a + L)}V{n(a + 1.2)}Q{n(a)} {n(a)} {n(a + 1.2)} {n(a)}H{n(a + L)}"
               f"M{n(b - L)} {n(a)}H{n(b - 1.2)}Q{n(b)} {n(a)} {n(b)} {n(a + 1.2)}V{n(a + L)}"
               f"M{n(b)} {n(b - L)}V{n(b - 1.2)}Q{n(b)} {n(b)} {n(b - 1.2)} {n(b)}H{n(b - L)}"
               f"M{n(a + L)} {n(b)}H{n(a + 1.2)}Q{n(a)} {n(b)} {n(a)} {n(b - 1.2)}V{n(b - L)}")
    r = 1.4 + 0.6 * ease_out_back(span(t, 0.2, 1))
    return P(corners) + P(poly(turn([(9, 9 - r), (9 + r, 9), (9, 9 + r), (9 - r, 9)], 90 * ease_out_back(span(t, 0.1, 1))), True), " fill='context-fill'")


def chevrons(t):
    out = ""
    for i, x in enumerate((4.6, 9.6)):
        dx = 1.6 * bump(span(t, i * 0.12, i * 0.12 + 0.6)) + 0.4 * ease_out(span(t, 0.5, 1))
        out += g(P(chevron_left(x, 9, 3.3, 4.4)), f"matrix(-1 0 0 1 {n(2 * x + 3.3 + dx)} 0)")
    return out


def chevron(t):
    dx = 1.8 * bump(span(t, 0, 0.6)) + 0.5 * ease_out(span(t, 0.45, 1))
    return g(P(chevron_left(6.4, 9)), f"matrix(-1 0 0 1 {n(18 + dx)} 0)")


def dart_down(t):
    dy = 1.6 * bump(span(t, 0, 0.6)) + 0.5 * ease_out(span(t, 0.45, 1))
    return g(P(chevron_left(9 - 1.5, 9, 4.2, 4.6)), f"translate(0 {n(dy - 0.5)}) rotate(-90 9 9)")


def play(t):
    k = 1 + 0.12 * bump(span(t, 0, 0.7))
    dx = 0.7 * ease_out_back(t, 2)
    return P(poly(move(scale([(6, 3.75), (14.25, 9), (6, 14.25)], k, 9.5, 9), dx), True))


def pause(t):
    sq = 1 - 0.2 * bump(t)
    return "".join(P(f"M{x} {n(9 - 5 * sq)}V{n(9 + 5 * sq)}") for x in (6.25, 11.75))


def skip(t, flip=False):
    dx = 1.3 * bump(span(t, 0, 0.6)) + 0.4 * ease_out(span(t, 0.45, 1))
    out = P(poly(move([(4, 4.25), (11, 9), (4, 13.75)], dx), True)) + P(f"M{n(14 + dx * 0.5)} 4.25V13.75")
    return g(out, "matrix(-1 0 0 1 18 0)") if flip else out


def next_track(t):
    return skip(t)


def previous_track(t):
    return skip(t, flip=True)


SPEAKER = "M2.75 7.25V10.75C2.75 11.3 3.2 11.75 3.75 11.75H5.75L9.25 14.75V3.25L5.75 6.25H3.75C3.2 6.25 2.75 6.7 2.75 7.25Z"


def volume(t):
    out = P(SPEAKER)
    for i, r in enumerate((2.75, 5.25)):
        e = bump(span(t, i * 0.15, i * 0.15 + 0.6))
        rr = r + 0.8 * e
        a = radians(48)
        out += P(f"M{n(9.25 + rr * cos(-a))} {n(9 + rr * sin(-a))}A{n(rr)} {n(rr)} 0 0 1 {n(9.25 + rr * cos(a))} {n(9 + rr * sin(a))}",
                 f" stroke-opacity='{n(1 - 0.35 * e)}'")
    return out


def muted(t):
    a = 90 * ease_out_back(t)
    return P(SPEAKER) + g(P("M12 6.75L16 10.75M16 6.75L12 10.75"), f"rotate({n(a)} 14 8.75)")


def pip(t):
    e = ease_out_back(t, 1.8)
    x, y = 9.25 - 5.5 * e, 9 - 4.5 * e
    return P(rrect(1.75, 2.75, 14.5, 12.5, 2.75)) + P(rrect(x, y, 5.25, 4, 1.4))


# key -> (label, frames function, [(icon selector, hover selector)])
def tb(*ids):
    """Toolbar buttons: the icon is the button's .toolbarbutton-icon."""
    return [(f"{i} > .toolbarbutton-icon", f"{i}:hover > .toolbarbutton-icon") for i in ids]


TOOLBAR = {
    "back": ("Back", back, tb("#back-button")),
    "forward": ("Forward", forward, tb("#forward-button")),
    "reload": ("Reload", reload, tb("#reload-button")),
    "stop": ("Stop", stop, tb("#stop-button")),
    "home": ("Home", home, tb("#home-button")),
    "new-tab": ("New tab", plus, tb("#tabs-newtab-button", "#zen-create-new-button", "#new-tab-button")),
    "menu": ("Menu and workspace actions", dots, tb("#PanelUI-menu-button", ".zen-workspaces-actions")),
    "sidebar": ("Sidebar toggle", sidebar, tb("#zen-toggle-compact-mode", "#sidebar-button")),
    "expand-sidebar": ("Expand sidebar", expand_sidebar, tb("#zen-expand-sidebar-button")),
    "site-data": ("Site settings", sliders, [("#zen-site-data-icon-button image", "#zen-site-data-icon-button:hover image")]),
    "downloads": ("Downloads", downloads, tb("#downloads-button")),
    "extensions": ("Extensions", extensions, tb("#unified-extensions-button", "#add-ons-button")),
    "bookmark": ("Bookmark", bookmark, [("#star-button:not([starred])", "#star-button-box:hover > #star-button:not([starred])")]),
    "bookmarked": ("Bookmark, saved", bookmark_saved, [("#star-button[starred]", "#star-button-box:hover > #star-button[starred]")]),
    "reader": ("Reader view", reader, [("#reader-mode-button > .urlbar-icon", "#reader-mode-button:hover > .urlbar-icon")]),
    "share": ("Share and copy link", share, tb("#zen-copy-current-url-button", "#share-tab-button")),
    "history": ("History", history, tb("#history-panelmenu")),
    "screenshot": ("Screenshot", screenshot, tb("#screenshot-button")),
    "overflow": ("More tools", chevrons, tb("#nav-bar-overflow-button")),
    "chevron": ("Bookmarks overflow", chevron, tb("#PlacesChevron")),
    "close-unpinned": ("Clear unpinned tabs", dart_down, tb(".zen-workspace-close-unpinned-tabs-button")),
    "play": ("Play", play, tb(".zen-media-card:not(.playing) .zen-media-playpause-button")),
    "pause": ("Pause", pause, tb(".zen-media-card.playing .zen-media-playpause-button")),
    "next": ("Next track", next_track, tb(".zen-media-nexttrack-button")),
    "previous": ("Previous track", previous_track, tb(".zen-media-previoustrack-button")),
    "volume": ("Mute", volume, tb(".zen-media-card:not([muted]) .zen-media-mute-button")),
    "muted": ("Unmute", muted, tb(".zen-media-card[muted] .zen-media-mute-button")),
    "media-close": ("Close player", stop, tb(".zen-media-close-button")),
    "pip": ("Picture-in-picture", pip, tb(".zen-media-pip-button")),
}

# Settings group the starred and unstarred star, and play/pause, mute/unmute.
SETTING = {"bookmarked": "bookmark", "pause": "play", "muted": "volume"}


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
            f"<use href='#{i}' stroke-width='1.2' stroke-opacity='{n(0.85 + 0.15 * lit)}'/>")
    if trace is not None and 0.02 < trace < 0.98:
        out += (f"<path d='{d}' pathLength='100' stroke-width='1.7' stroke-dasharray='16 84' "
                f"stroke-dashoffset='{n(-100 * ease_in_out(trace))}' stroke-opacity='{n(bump(trace))}'/>")
    return out


def tube(d, lit=0.0, trace=None):
    """Neon tube: a soft wide stroke and a bright core."""
    i, out = shape(d)
    out += (f"<use href='#{i}' stroke-width='2.6' stroke-opacity='{n(0.22 + 0.2 * lit)}'/>"
            f"<use href='#{i}' stroke-width='1.1'/>")
    if trace is not None and 0.02 < trace < 0.98:
        out += (f"<path d='{d}' pathLength='100' stroke-width='2' stroke-dasharray='22 78' "
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
    # A glass blade that dashes out, leaving a fading echo where it was.
    dx = 0.5 * bump(span(t, 0, 0.2)) - 1.7 * ease_out_back(span(t, 0.1, 1), 2)
    echo = bump(span(t, 0.1, 0.9))
    out = ""
    if echo > 0.05:
        out += f"<g opacity='{n(0.45 * echo)}'>" + glass(blade(6.4 + dx * 0.3, 9, 5.4, 5.6, 2.4), body=0.1) + "</g>"
    out += glass(blade(5.2 + dx, 9, 5.6, 5.8, 2.6), lit=bump(t), trace=t)
    return g(out, "matrix(-1 0 0 1 18 0)") if flip else out


def c_forward(t):
    return c_back(t, flip=True)


def c_reload(t):
    # One open neon arc ending in a short stroke that turns in toward the
    # centre, with a short inner arc on one side only, so it never reads as
    # a ring. It turns once on hover while a light runs along it.
    r, a_end, a_start = 6, 40, -10            # anticlockwise from upper right round to lower right
    xs, ys = 9 + r * cos(radians(a_start)), 9 + r * sin(radians(a_start))
    xe, ye = 9 + r * cos(radians(a_end)), 9 + r * sin(radians(a_end))
    tail = 2.6
    tx, ty = xe - tail * cos(radians(a_end)), ye - tail * sin(radians(a_end))
    main = f"M{n(xs)} {n(ys)}A{r} {r} 0 1 0 {n(xe)} {n(ye)}L{n(tx)} {n(ty)}"
    ri = 3.3
    inner = (f"M{n(9 + ri * cos(radians(150)))} {n(9 + ri * sin(radians(150)))}"
             f"A{ri} {ri} 0 0 1 {n(9 + ri * cos(radians(235)))} {n(9 + ri * sin(radians(235)))}")
    return g(tube(main, lit=bump(t), trace=t) + f"<g opacity='.7'>{tube(inner)}</g>",
             f"rotate({n(360 * ease_in_out(t))} 9 9)")


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
    drop = 2.2 * bump(span(t, 0, 0.55)) + 0.7 * ease_out(span(t, 0.45, 1))
    chev = rpoly([(3.6, 4 + drop), (9, 9.4 + drop), (14.4, 4 + drop), (14.4, 6.6 + drop), (9, 12 + drop), (3.6, 6.6 + drop)], 0.85)
    return glass(chev, lit=bump(t), trace=t) + tube("M4 15.2H14", lit=bump(span(t, 0.3, 0.9)))


def c_extensions(t):
    out = ease_out_back(t, 2)
    tile = lambda x, y, lit=0: glass(chamfer(x, y, 5.6, 5.6, 1.4, 0.55), lit=lit)
    moved = f"translate({n(out * 0.9)} {n(-out * 0.9)}) rotate({n(out * 45)} 12.8 5.2)"
    return tile(2.4, 2.4) + tile(2.4, 10) + tile(10, 10) + g(tile(10, 2.4, lit=out), moved)


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


CIRCUIT = {"back": c_back, "forward": c_forward, "reload": c_reload, "stop": c_stop, "home": c_home,
           "new-tab": c_plus, "menu": c_dots, "sidebar": c_sidebar, "expand-sidebar": c_expand,
           "site-data": c_sliders, "downloads": c_downloads, "extensions": c_extensions, "bookmark": c_bookmark,
           "bookmarked": c_bookmarked, "reader": c_reader, "share": c_share, "history": c_history,
           "screenshot": c_screenshot, "overflow": c_overflow, "chevron": c_chevron, "close-unpinned": c_dart,
           "play": c_play, "pause": c_pause, "next": c_next, "previous": c_previous, "volume": c_volume,
           "muted": c_muted, "media-close": c_stop, "pip": c_pip}


def lib_circuit(t):
    # Three glass plates that pull apart while a light runs round the top one.
    gap = ease_out_back(span(t, 0, 1), 2.4) * 1.2
    plate = lambda y: rpoly([(2.4, y), (9, y - 3.4), (15.6, y), (9, y + 3.4)], 0.9)
    return glass(plate(13.2 + gap * 0.6), body=0.12) + glass(plate(9.8), body=0.14) + glass(plate(6.4 - gap), lit=bump(t), trace=t, body=0.2)


# ---- library button ---------------------------------------------------------
# Values match Iconflow's Library button setting.

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
    return screenshot(t)


def lib_grid(t):
    return extensions(t)


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
FOLLOW_LIBRARY = {1: 3, 2: 12}   # what "Follow the icon set" shows with Flow and Circuit


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


SETS = {"flow": (1, 2, 3), "circuit": (2, 4, 5)}   # set value, animated override, still override


def uses(key, name):
    k = SETTING.get(key, key)
    value, animated, still = SETS[name]
    return (f'((-moz-pref("zzicon.set", {value})) and (-moz-pref("zzicon.button.{k}", 0))), '
            f'(-moz-pref("zzicon.button.{k}", {animated})), (-moz-pref("zzicon.button.{k}", {still}))')


def main():
    css = ["/* Generated by tools/iconflow-icons.py; edit that, not this. Strips are in icons/. */"]
    for old in (OUT.parent / "icons").glob("*/*.svg"):
        old.unlink()
    url = {}
    for key, (_, draw, _) in TOOLBAR.items():
        url["flow", key] = save(f"icons/flow/{key}.svg", strip(draw, FRAMES))
        url["circuit", key] = save(f"icons/circuit/{key}.svg", strip(CIRCUIT[key], FRAMES))
    for value, (_, draw) in LIBRARY.items():
        url["library", value] = save(f"icons/library/{value}.svg", strip(draw, LIB_FRAMES))
    for key, (label, _, targets) in TOOLBAR.items():
        k = SETTING.get(key, key)
        icons = ", ".join(i for i, _ in targets)
        hovers = ", ".join(h for _, h in targets)
        for name, (_, _, still) in SETS.items():
            glow = "\n      filter: var(--zzicon-circuit-glow, none) !important;" if name == "circuit" else ""
            css.append(f"/* {label}, {name.title()} */\n@media {uses(key, name)} {{\n"
                       f"  {icons} {{\n    list-style-image: var(--zzicon-blank) !important;\n"
                       f"    -moz-context-properties: fill, fill-opacity !important;\n"
                       f"    background-image: {url[name, key]} !important;\n"
                       f"    background-size: {FRAMES * 100}% 100% !important;\n"
                       f"    background-position: 0 0;\n    background-repeat: no-repeat !important;\n"
                       f"    background-origin: content-box !important;\n    background-clip: content-box !important;\n"
                       f"    transition: background-position var(--zzicon-duration) steps({FRAMES - 1}, jump-none), filter .2s !important;\n  }}\n"
                       f"  @media (-moz-pref(\"zzicon.animate\")) and (not (-moz-pref(\"zzicon.button.{k}\", {still}))) {{\n"
                       f"    {hovers} {{ background-position: 100% 0 !important;{glow} }}\n  }}\n}}")
    for value, (label, _) in LIBRARY.items():
        follow = "".join(f' or ((-moz-pref("zzicon.library.style", 11)) and (-moz-pref("zzicon.set", {setv})))'
                         for setv, lib in FOLLOW_LIBRARY.items() if lib == value)
        css.append(f"/* Library: {label} */\n@media (-moz-pref(\"zzicon.library.style\", {value})){follow} {{\n"
                   f"  #zen-library-button .zen-library-sprite::before {{ background-image: {url['library', value]} !important; }}\n}}")
    css += motion_css()
    OUT.write_text("\n".join(css) + "\n")
    total = sum(f.stat().st_size for f in (OUT.parent / "icons").glob("*/*.svg"))
    print(f"wrote {len(TOOLBAR)} icons in {len(SETS)} sets and {len(LIBRARY)} library strips: "
          f"icons.css {OUT.stat().st_size // 1024} KB, strips {total // 1024} KB")


if __name__ == "__main__":
    main()
