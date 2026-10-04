#!/usr/bin/env python3
"""Draws Iconflow's Flow icon set and writes iconflow/icons.css.

Every icon is a horizontal strip of animation frames on Zen's 18-unit icon
grid. Frame 0 is the resting icon; the last frame is held while the button
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
from urllib.parse import quote

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
    return f"{v:.2f}".rstrip("0").rstrip(".") if abs(v) > 0.004 else "0"


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


def dot(x, y, r):
    return f"<circle cx='{n(x)}' cy='{n(y)}' r='{n(r)}' fill='context-fill' stroke='none'/>"


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
    out = ""
    for i, x in enumerate((3.75, 9, 14.25)):
        y = 9 - 2.2 * bump(span(t, i * 0.14, i * 0.14 + 0.55))
        out += dot(x, y, 1.3)
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
    e = ease_in_out(t)
    out = ""
    for y, a, b in ((6, 11.5, 6.5), (12, 6.5, 11.5)):
        k = a + (b - a) * e
        out += P(f"M2.75 {y}H{n(k - 2.2)}M{n(k + 2.2)} {y}H15.25")
        out += f"<circle cx='{n(k)}' cy='{y}' r='1.85'/>"
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


def star_points(r_out=6.6, r_in=3.1, cx=9, cy=9.4):
    return [(cx + (r_out if i % 2 == 0 else r_in) * cos(radians(-90 + i * 36)),
             cy + (r_out if i % 2 == 0 else r_in) * sin(radians(-90 + i * 36))) for i in range(10)]


def star(t, filled=False):
    k = 1 + 0.15 * bump(span(t, 0, 0.7))
    a = 72 * ease_out_back(t, 1.6)
    path = P(poly(scale(star_points(), k, 9, 9.4), True), " fill='context-fill'" if filled else "")
    return g(path, f"rotate({n(a)} 9 9.4)")


def star_filled(t):
    return star(t, filled=True)


def reader(t):
    out = P(rrect(3.25, 2.25, 11.5, 13.5, 2.75))
    for i, (y, w0, w1) in enumerate(((6, 6, 4), (9, 6, 6), (12, 4, 6))):
        w = w0 + (w1 - w0) * ease_out_back(span(t, i * 0.15, i * 0.15 + 0.7), 2)
        out += P(f"M6 {y}H{n(6 + w)}")
    return out


def share(t):
    # Three linked nodes; the links pulse outward and the nodes settle apart.
    e = ease_out_back(span(t, 0, 1), 2)
    a, b, c = (4.25 - 0.5 * e, 9), (13.25 + 0.4 * e, 4.25 - 0.4 * e), (13.25 + 0.4 * e, 13.75 + 0.4 * e)
    def link(p, q):
        # stop the line short of each node's ring
        dx, dy = q[0] - p[0], q[1] - p[1]
        L = (dx * dx + dy * dy) ** 0.5
        ux, uy = dx / L, dy / L
        return P(f"M{n(p[0] + ux * 2.45)} {n(p[1] + uy * 2.45)}L{n(q[0] - ux * 2.45)} {n(q[1] - uy * 2.45)}")
    nodes = "".join(f"<circle cx='{n(x)}' cy='{n(y)}' r='1.85'/>" for x, y in (a, b, c))
    return nodes + link(a, b) + link(a, c)


def history(t):
    m = 360 * ease_in_out(t)
    h = 30 * ease_out(t)
    return (f"<circle cx='9' cy='9' r='6.5'/>" + g(P("M9 9V4.75"), f"rotate({n(m)} 9 9)")
            + g(P("M9 9L11.5 10.5"), f"rotate({n(h)} 9 9)"))


def screenshot(t):
    k = 1.3 * ease_out_back(span(t, 0, 0.8), 2)
    a, b, L = 2.5 + k, 15.5 - k, 3.4
    corners = (f"M{n(a)} {n(a + L)}V{n(a + 1.2)}Q{n(a)} {n(a)} {n(a + 1.2)} {n(a)}H{n(a + L)}"
               f"M{n(b - L)} {n(a)}H{n(b - 1.2)}Q{n(b)} {n(a)} {n(b)} {n(a + 1.2)}V{n(a + L)}"
               f"M{n(b)} {n(b - L)}V{n(b - 1.2)}Q{n(b)} {n(b)} {n(b - 1.2)} {n(b)}H{n(b - L)}"
               f"M{n(a + L)} {n(b)}H{n(a + 1.2)}Q{n(a)} {n(b)} {n(a)} {n(b - 1.2)}V{n(b - L)}")
    return P(corners) + dot(9, 9, 1.1 + 0.6 * ease_out_back(span(t, 0.2, 1)))


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
    "bookmark": ("Bookmark star", star, [("#star-button:not([starred])", "#star-button-box:hover > #star-button:not([starred])")]),
    "bookmarked": ("Bookmark star, saved", star_filled, [("#star-button[starred]", "#star-button-box:hover > #star-button[starred]")]),
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
FLOW_LIBRARY = 3   # what "Follow the icon set" shows with Flow


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
    body = "".join(f"<g transform='translate({i * G})'><g clip-path='url(#f)'>{draw(i / (frames - 1))}</g></g>"
                   for i in range(frames))
    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' width='{frames * G}' height='{G}' fill='none' "
           "stroke='context-fill' stroke-opacity='context-fill-opacity' stroke-width='1.6' "
           f"stroke-linecap='round' stroke-linejoin='round'><clipPath id='f'><rect width='{G}' height='{G}'/></clipPath>{body}</svg>")
    return "url(\"data:image/svg+xml," + quote(svg, safe="/:=' ,.-()") + "\")"


def uses_flow(key):
    k = SETTING.get(key, key)
    return (f'((-moz-pref("zzicon.set", 1)) and (-moz-pref("zzicon.button.{k}", 0))), '
            f'(-moz-pref("zzicon.button.{k}", 2)), (-moz-pref("zzicon.button.{k}", 3))')


def main():
    css = ["/* Generated by tools/iconflow-icons.py; edit that, not this. */", ":root {"]
    for key, (_, draw, _) in TOOLBAR.items():
        css.append(f"  --zzicon-{key}: {strip(draw, FRAMES)};")
    for value, (_, draw) in LIBRARY.items():
        css.append(f"  --zzicon-library-{value}: {strip(draw, LIB_FRAMES)};")
    css.append("}")
    for key, (label, _, targets) in TOOLBAR.items():
        k = SETTING.get(key, key)
        icons = ", ".join(i for i, _ in targets)
        hovers = ", ".join(h for _, h in targets)
        css.append(f"/* {label} */\n@media {uses_flow(key)} {{\n"
                   f"  {icons} {{\n    list-style-image: var(--zzicon-blank) !important;\n"
                   f"    -moz-context-properties: fill, fill-opacity !important;\n"
                   f"    background: var(--zzicon-{key}) 0 0 / {FRAMES * 100}% 100% no-repeat content-box !important;\n"
                   f"    transition: background-position var(--zzicon-duration) steps({FRAMES - 1}, jump-none) !important;\n  }}\n"
                   f"  @media (-moz-pref(\"zzicon.animate\")) and (not (-moz-pref(\"zzicon.button.{k}\", 3))) {{\n"
                   f"    {hovers} {{ background-position: 100% 0 !important; }}\n  }}\n}}")
    follow = ' or ((-moz-pref("zzicon.library.style", 11)) and (-moz-pref("zzicon.set", 1)))'
    for value, (label, _) in LIBRARY.items():
        query = f'(-moz-pref("zzicon.library.style", {value}))' + (follow if value == FLOW_LIBRARY else "")
        css.append(f"/* Library: {label} */\n@media {query} {{\n"
                   f"  #zen-library-button .zen-library-sprite::before {{ background-image: var(--zzicon-library-{value}) !important; }}\n}}")
    css += motion_css()
    OUT.write_text("\n".join(css) + "\n")
    print(f"wrote {len(TOOLBAR)} icons and {len(LIBRARY)} library strips, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
