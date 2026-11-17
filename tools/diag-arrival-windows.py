#!/usr/bin/env python3
"""TEMPORARY diagnostic (never merge): Tab Router's cross-window arrival ring
on a real Windows desktop.

python tools/diag-arrival-windows.py --zen zen.exe --sine Sine/src --out OUT

Throwaway profile, real Sine loading these mods, two synced Zen windows.
Input is real OS input (Win32 SendInput); pixels are real composited desktop
pixels (PIL ImageGrab = BitBlt of the DWM screen). Chrome instrumentation
records what Gecko did (activation, occlusion, rAF ticks, ring opacity), and
the two are compared frame by frame. Marionette's recommended prefs force
focusmanager.testmode and turn off Windows occlusion tracking; both are put
back to the defaults a user has.
"""
import argparse
import ctypes
from ctypes import wintypes as wt
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback

from PIL import Image, ImageDraw, ImageGrab

ROOT = Path(__file__).resolve().parent.parent
MODS = ['glassflow', 'glassflow-library', 'groupflow', 'iconflow', 'mediaflow', 'peekflow',
        'tab-router', 'tab-unloader', 'zen-turbo', 'download-prompt']
PORT = 18765
PAGES = {
    'a': ('Arrival Alpha', '#f4d9b0'),
    'b': ('Arrival Bravo', '#e8e8e8'),
    'c': ('Arrival Charlie', '#c8ebc8'),
}


def page_html(key):
    title, bg = PAGES[key]
    links = ''.join(f'<a id="to-{k}" style="top:{150 + i * 150}px" href="http://127.0.0.1:{PORT}/{k}.html">to {k}</a>'
                    for i, k in enumerate(PAGES))
    return (f'<!doctype html><title>{title}</title><style>body{{margin:0;background:{bg};color:#222;font:28px sans-serif}}'
            f'a{{position:absolute;left:120px;right:120px;height:110px;line-height:110px;padding-left:40px;'
            f'background:#0002;color:#222}}</style><h1 style="margin:24px 120px">{title}</h1>{links}').encode()


class Pages(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        key = self.path.strip('/').split('.')[0]
        if key not in PAGES:
            self.send_response(404)
            self.end_headers()
            return
        body = page_html(key)
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


# ------------------------------------------------------------------ Marionette
class Marionette:
    def __init__(self, port):
        self.sock = socket.create_connection(('127.0.0.1', port), timeout=120)
        self.serial = 0
        self.read()
        self.call('WebDriver:NewSession', {'capabilities': {}})
        self.call('WebDriver:SetTimeouts', {'script': 120000})
        self.call('Marionette:SetContext', {'value': 'chrome'})

    def read(self):
        length = b''
        while not length.endswith(b':'):
            chunk = self.sock.recv(1)
            if not chunk:
                raise ConnectionError('Marionette closed')
            length += chunk
        data, size = b'', int(length[:-1])
        while len(data) < size:
            chunk = self.sock.recv(size - len(data))
            if not chunk:
                raise ConnectionError('Marionette closed')
            data += chunk
        return json.loads(data)

    def call(self, name, args=None):
        self.serial += 1
        data = json.dumps([0, self.serial, name, args or {}]).encode()
        self.sock.sendall(str(len(data)).encode() + b':' + data)
        response = self.read()
        if response[2]:
            raise RuntimeError(response[2])
        return response[3]

    def js(self, source):
        return self.call('WebDriver:ExecuteScript', {
            'script': source, 'args': [], 'newSandbox': False,
            'sandbox': 'default', 'filename': 'diag-arrival'})['value']


# ------------------------------------------------------------------ Win32
user32 = ctypes.WinDLL('user32', use_last_error=True)
dwmapi = ctypes.WinDLL('dwmapi')
ULONG_PTR = ctypes.c_size_t


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [('dx', wt.LONG), ('dy', wt.LONG), ('mouseData', wt.DWORD), ('dwFlags', wt.DWORD),
                ('time', wt.DWORD), ('dwExtraInfo', ULONG_PTR)]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [('wVk', wt.WORD), ('wScan', wt.WORD), ('dwFlags', wt.DWORD), ('time', wt.DWORD),
                ('dwExtraInfo', ULONG_PTR)]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [('uMsg', wt.DWORD), ('wParamL', wt.WORD), ('wParamH', wt.WORD)]


class _INPUTU(ctypes.Union):
    _fields_ = [('mi', MOUSEINPUT), ('ki', KEYBDINPUT), ('hi', HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ('u',)
    _fields_ = [('type', wt.DWORD), ('u', _INPUTU)]


class DEVMODEW(ctypes.Structure):
    _fields_ = [('dmDeviceName', wt.WCHAR * 32), ('dmSpecVersion', wt.WORD), ('dmDriverVersion', wt.WORD),
                ('dmSize', wt.WORD), ('dmDriverExtra', wt.WORD), ('dmFields', wt.DWORD),
                ('dmUnion1', ctypes.c_byte * 16), ('dmColor', ctypes.c_short), ('dmDuplex', ctypes.c_short),
                ('dmYResolution', ctypes.c_short), ('dmTTOption', ctypes.c_short), ('dmCollate', ctypes.c_short),
                ('dmFormName', wt.WCHAR * 32), ('dmLogPixels', wt.WORD), ('dmBitsPerPel', wt.DWORD),
                ('dmPelsWidth', wt.DWORD), ('dmPelsHeight', wt.DWORD), ('dmDisplayFlags', wt.DWORD),
                ('dmDisplayFrequency', wt.DWORD), ('dmICMMethod', wt.DWORD), ('dmICMIntent', wt.DWORD),
                ('dmMediaType', wt.DWORD), ('dmDitherType', wt.DWORD), ('dmReserved1', wt.DWORD),
                ('dmReserved2', wt.DWORD), ('dmPanningWidth', wt.DWORD), ('dmPanningHeight', wt.DWORD)]


user32.SendInput.argtypes = [wt.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
user32.GetForegroundWindow.restype = wt.HWND
user32.GetWindowTextW.argtypes = [wt.HWND, wt.LPWSTR, ctypes.c_int]
user32.GetClassNameW.argtypes = [wt.HWND, wt.LPWSTR, ctypes.c_int]
user32.GetWindowRect.argtypes = [wt.HWND, ctypes.POINTER(wt.RECT)]
user32.IsZoomed.argtypes = [wt.HWND]
user32.IsIconic.argtypes = [wt.HWND]
user32.GetWindow.argtypes = [wt.HWND, wt.UINT]
user32.GetWindow.restype = wt.HWND
user32.GetTopWindow.argtypes = [wt.HWND]
user32.GetTopWindow.restype = wt.HWND
user32.IsWindowVisible.argtypes = [wt.HWND]
user32.MapVirtualKeyW.argtypes = [wt.UINT, wt.UINT]
user32.EnumDisplaySettingsW.argtypes = [wt.LPCWSTR, wt.DWORD, ctypes.POINTER(DEVMODEW)]
user32.ChangeDisplaySettingsW.argtypes = [ctypes.POINTER(DEVMODEW), wt.DWORD]
dwmapi.DwmGetWindowAttribute.argtypes = [wt.HWND, wt.DWORD, ctypes.c_void_p, wt.DWORD]

VK = {'ctrl': 0x11, 'l': 0x4C, 'down': 0x28, 'enter': 0x0D, 'esc': 0x1B, 'a': 0x41}
EXTENDED = {0x28}


def send(inputs):
    arr = (INPUT * len(inputs))(*inputs)
    n = user32.SendInput(len(inputs), arr, ctypes.sizeof(INPUT))
    err = ctypes.get_last_error() if n != len(inputs) else 0
    return {'sent': n, 'of': len(inputs), 'err': err}


def key_input(vk, up=False):
    flags = (2 if up else 0) | (1 if vk in EXTENDED else 0)
    return INPUT(type=1, ki=KEYBDINPUT(wVk=vk, wScan=user32.MapVirtualKeyW(vk, 0), dwFlags=flags, time=0, dwExtraInfo=0))


def press(*names):
    vks = [VK[n] for n in names]
    return send([key_input(v) for v in vks] + [key_input(v, True) for v in reversed(vks)])


def type_text(text, delay=0.04):
    res = []
    for ch in text:
        res.append(send([INPUT(type=1, ki=KEYBDINPUT(wVk=0, wScan=ord(ch), dwFlags=4, time=0, dwExtraInfo=0)),
                         INPUT(type=1, ki=KEYBDINPUT(wVk=0, wScan=ord(ch), dwFlags=4 | 2, time=0, dwExtraInfo=0))]))
        time.sleep(delay)
    return res


def screen_size():
    return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)


def mouse_input(x, y, flags):
    w, h = screen_size()
    nx, ny = round(x * 65535 / max(1, w - 1)), round(y * 65535 / max(1, h - 1))
    return INPUT(type=0, mi=MOUSEINPUT(dx=nx, dy=ny, mouseData=0, dwFlags=flags | 0x8000 | 0x0001, time=0, dwExtraInfo=0))


def click(x, y):
    a = send([mouse_input(x, y, 0)])
    time.sleep(0.12)
    b = send([mouse_input(x, y, 0x0002)])
    time.sleep(0.05)
    c = send([mouse_input(x, y, 0x0004)])
    return [a, b, c]


def move(x, y):
    return send([mouse_input(x, y, 0)])


def hwnd_info(h):
    if not h:
        return None
    buf = ctypes.create_unicode_buffer(256)
    user32.GetWindowTextW(h, buf, 256)
    cls = ctypes.create_unicode_buffer(128)
    user32.GetClassNameW(h, cls, 128)
    r = wt.RECT()
    user32.GetWindowRect(h, ctypes.byref(r))
    cloaked = wt.DWORD()
    dwmapi.DwmGetWindowAttribute(h, 14, ctypes.byref(cloaked), ctypes.sizeof(cloaked))
    return {'hwnd': int(h), 'title': buf.value[:80], 'class': cls.value, 'rect': [r.left, r.top, r.right, r.bottom],
            'zoomed': bool(user32.IsZoomed(h)), 'iconic': bool(user32.IsIconic(h)), 'cloaked': cloaked.value,
            'visible': bool(user32.IsWindowVisible(h))}


def zorder(limit=12):
    out, h = [], user32.GetTopWindow(None)
    while h and len(out) < 400:
        if user32.IsWindowVisible(h):
            info = hwnd_info(h)
            if info['rect'][2] - info['rect'][0] > 50:
                out.append(info)
                if len(out) >= limit:
                    break
        h = user32.GetWindow(h, 2)  # GW_HWNDNEXT
    return out


def set_resolution(w, h):
    dm = DEVMODEW()
    dm.dmSize = ctypes.sizeof(DEVMODEW)
    if not user32.EnumDisplaySettingsW(None, -1, ctypes.byref(dm)):
        return {'error': 'EnumDisplaySettings failed'}
    before = [dm.dmPelsWidth, dm.dmPelsHeight, dm.dmBitsPerPel, dm.dmDisplayFrequency]
    modes, i = set(), 0
    probe = DEVMODEW()
    probe.dmSize = ctypes.sizeof(DEVMODEW)
    while user32.EnumDisplaySettingsW(None, i, ctypes.byref(probe)) and i < 500:
        modes.add((probe.dmPelsWidth, probe.dmPelsHeight))
        i += 1
    dm.dmPelsWidth, dm.dmPelsHeight = w, h
    dm.dmFields = 0x80000 | 0x100000
    code = user32.ChangeDisplaySettingsW(ctypes.byref(dm), 0)
    return {'before': before, 'change': code, 'after': list(screen_size()),
            'modes': sorted(modes, reverse=True)[:12]}


# ------------------------------------------------------------------ capture
class Capture(threading.Thread):
    """Grab the real composited screen as fast as possible for `secs`."""

    def __init__(self, secs):
        super().__init__(daemon=True)
        self.secs, self.frames, self.error = secs, [], None

    def run(self):
        try:
            end = time.time() + self.secs
            while time.time() < end:
                t0 = time.time()
                img = ImageGrab.grab()
                t1 = time.time()
                self.frames.append({'t': (t0 + t1) / 2 * 1000, 'grabMs': (t1 - t0) * 1000,
                                    'fg': int(user32.GetForegroundWindow() or 0), 'img': img})
        except Exception as e:  # noqa: BLE001
            self.error = repr(e)


# ------------------------------------------------------------------ chrome JS
RECORDER = r'''
if (window.__arr) return true;
const T = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
const ULH = () => ChromeUtils.importESModule("resource:///modules/URILoadingHelper.sys.mjs").URILoadingHelper;
const now = () => performance.timeOrigin + performance.now();
const R = window.__arr = { rec: null, wraps: [], A: window, B: null, log: [] };
const tag = w => !w ? "none" : w === R.A ? "A" : w === R.B ? "B" : "other";
const RING = /0px 0px 0px 2px inset|inset 0px 0px 0px 2px/;
const isRing = n => n?.localName === "div" && n.getAttribute?.("aria-hidden") === "true" && (RING.test(n.style?.boxShadow || "") || n.hasAttribute("data-arr-probe"));
const st = w => {
  let bc = null; try { bc = w.browsingContext.isActive; } catch {}
  return [Services.focus.activeWindow === w ? 1 : 0, w.isFullyOccluded ? 1 : 0, w.document.hidden ? 1 : 0, bc ? 1 : 0,
    w.gBrowser?.selectedBrowser?.docShellIsActive ? 1 : 0, w.windowState, w.gBrowser?.selectedTab?.label || ""];
};
R.st = st; R.tag = tag; R.now = now;
const rel = () => Math.round((now() - (R.rec?.t0 || 0)) * 10) / 10;
R.note = o => { if (R.rec) R.rec.calls.push({ t: rel(), ...o }); };
R.wrap = () => {
  for (const w of [R.A, R.B]) {
    if (!w || w.__arrWrapped) continue;
    w.__arrWrapped = true;
    const tr = w.TabRouter;
    if (tr && typeof tr.markArrival === "function") {
      const orig = tr.markArrival;
      tr.markArrival = function (tab, switching) {
        R.note({ kind: "TabRouter.markArrival", win: tag(w), tab: tab?.label, tabWin: tag(tab?.ownerDocument?.defaultView), active: tag(Services.focus.activeWindow) });
        return orig.apply(this, arguments);
      };
      R.wraps.push(() => { tr.markArrival = orig; });
    }
    const ws = w.gZenWorkspaces;
    for (const name of ["switchIfNeeded", "switchTabIfNeeded"]) {
      if (!ws || typeof ws[name] !== "function") continue;
      const had = Object.hasOwn(ws, name), orig = ws[name];
      ws[name] = function (...a) {
        let from = "n/a";
        try { from = tag(ULH().switchToTabHavingURI.switchingFrom); } catch {}
        const t = a[0]?.localName === "tab" ? a[0] : w.gBrowser.getTabForBrowser?.(a[0]);
        R.note({ kind: "gZenWorkspaces." + name, win: tag(w), routerOwn: had, switchingFrom: from, tab: t?.label, active: tag(Services.focus.activeWindow) });
        return orig.apply(this, a);
      };
      R.wraps.push(() => { if (had) ws[name] = orig; else delete ws[name]; });
    }
  }
};

// Cost probes in B: the same kind of element markArrival draws, animated the same way.
R.probe = variant => {
  const w = R.B, doc = w.document, tab = w.gBrowser.selectedTab;
  const accent = w.getComputedStyle(doc.documentElement).getPropertyValue("--zen-primary-color").trim() || "AccentColor";
  const page = tab.linkedBrowser.closest(".browserSidebarContainer"), bg = tab.querySelector(".tab-background");
  const SOLID = `inset 0 0 0 2px ${accent}`, GLOW = `inset 0 0 28px color-mix(in srgb, ${accent} 40%, transparent)`;
  const made = [];
  const mk = (el, holder, style) => {
    const r = el.getBoundingClientRect(), h = holder.getBoundingClientRect();
    const d = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    d.setAttribute("aria-hidden", "true"); d.setAttribute("data-arr-probe", variant);
    Object.assign(d.style, { position: "absolute", left: `${r.left - h.left - holder.clientLeft}px`, top: `${r.top - h.top - holder.clientTop}px`,
      width: `${r.width}px`, height: `${r.height}px`, borderRadius: w.getComputedStyle(el).borderRadius, pointerEvents: "none", zIndex: "1", opacity: "0", ...style });
    holder.appendChild(d); made.push(d); return d;
  };
  const both = style => { mk(page, page, style); mk(bg, bg.parentNode, style); };
  if (variant === "full" || variant === "static" || variant === "hold") both({ boxShadow: `${SOLID}, ${GLOW}` });
  else if (variant === "solid") both({ boxShadow: SOLID });
  else if (variant === "glow") mk(page, page, { boxShadow: GLOW });
  else if (variant === "tab") mk(bg, bg.parentNode, { boxShadow: `${SOLID}, ${GLOW}` });
  else if (variant === "border") both({ border: `2px solid ${accent}`, boxSizing: "border-box" });
  else if (variant === "fix") for (const d of [mk(page, page, {}), mk(bg, bg.parentNode, {})]) {
    Object.assign(d.style, { border: `2px solid ${accent}`, boxSizing: "border-box" });
    const g = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    Object.assign(g.style, { position: "absolute", inset: "0", borderRadius: "inherit", border: `6px solid color-mix(in srgb, ${accent} 22%, transparent)` });
    d.appendChild(g);
  }
  else if (variant === "tiny") { const d = mk(page, page, { background: accent }); Object.assign(d.style, { width: "40px", height: "40px", left: "300px", top: "300px" }); }
  const done = () => made.forEach(d => d.remove());
  if (variant === "static") { made.forEach(d => { d.style.opacity = "1"; }); w.setTimeout(done, 700); return made.length; }
  const frames = variant === "hold" ? [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }]
    : variant === "fix" ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }]
    : [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }];
  let last; for (const d of made) last = d.animate(frames, { duration: variant === "fix" ? 1100 : 900, easing: "ease-in-out" });
  last.finished.then(done, done);
  return made.length;
};
R.inventory = () => {
  const out = [];
  for (const w of [R.A, R.B]) for (const e of w.document.querySelectorAll("*")) for (const pseudo of [null, "::before", "::after"]) {
    const s = w.getComputedStyle(e, pseudo);
    if (pseudo && s.content === "none") continue;
    const bf = s.backdropFilter, f = s.filter;
    if ((bf && bf !== "none") || /blur|url/.test(f || "")) {
      const r = e.getBoundingClientRect();
      if (r.width * r.height < 1 || s.display === "none" || s.visibility === "hidden") continue;
      out.push([R.tag(w), e.localName + (e.id ? "#" + e.id : "") + (pseudo || ""), String(e.className || "").slice(0, 40), [r.left, r.top, r.width, r.height].map(Math.round), bf.slice(0, 120), f.slice(0, 60)]);
    }
  }
  const root = R.B.document.documentElement, cs = R.B.getComputedStyle(root);
  return { blur: out.slice(0, 80), count: out.length, rootBg: cs.backgroundColor, rootAttrs: [...root.attributes].map(a => a.name + "=" + a.value.slice(0, 40)).filter(a => /zen|zz|glass|theme|lwt|acrylic|mica|transparent/i.test(a)) };
};
R.unwrap = () => { for (const f of R.wraps.splice(0)) try { f(); } catch {} for (const w of [R.A, R.B]) if (w) delete w.__arrWrapped; };
R.arm = ms => {
  if (R.rec) R.stop();
  const rec = R.rec = { t0: now(), samples: [], ticks: { A: [], B: [] }, paints: { A: [], B: [] }, rings: [], calls: [], events: [], undo: [] };
  for (const w of [R.A, R.B]) {
    const k = tag(w);
    const tick = () => { if (R.rec !== rec) return; rec.ticks[k].push(rel()); w.requestAnimationFrame(tick); };
    w.requestAnimationFrame(tick);
    const paint = () => rec.paints[k].push(rel());
    w.addEventListener("MozAfterPaint", paint);
    rec.undo.push(() => w.removeEventListener("MozAfterPaint", paint));
    for (const type of ["activate", "deactivate", "sizemodechange", "occlusionstatechange"]) {
      const f = e => { if (e.target === w || e.target === w.document) rec.events.push({ t: rel(), win: k, type, st: st(w) }); };
      w.addEventListener(type, f);
      rec.undo.push(() => w.removeEventListener(type, f));
    }
    const vis = () => rec.events.push({ t: rel(), win: k, type: "visibilitychange", st: st(w) });
    w.document.addEventListener("visibilitychange", vis);
    rec.undo.push(() => w.document.removeEventListener("visibilitychange", vis));
    const mo = new w.MutationObserver(list => {
      for (const m of list) for (const n of m.addedNodes) if (isRing(n)) {
        const r = n.getBoundingClientRect(), h = n.parentNode;
        const e = { win: k, tAdd: rel(), client: [r.left, r.top, r.width, r.height], inner: [w.mozInnerScreenX, w.mozInnerScreenY],
          dpr: w.devicePixelRatio, holder: String(h?.className || h?.localName || "").slice(0, 80), shadow: n.style.boxShadow.slice(0, 120),
          st: st(w), frames: [], removed: null };
        rec.rings.push(e);
        const step = () => {
          if (!n.isConnected) { e.removed = rel(); return; }
          const a = n.getAnimations()[0];
          e.frames.push([rel(), +w.getComputedStyle(n).opacity, a ? Math.round(a.currentTime) : null, a?.playState || null]);
          w.requestAnimationFrame(step);
        };
        w.requestAnimationFrame(step);
        n.__arrEntry = e;
      }
    });
    mo.observe(w.document.documentElement, { childList: true, subtree: true });
    rec.undo.push(() => mo.disconnect());
  }
  const timer = T.setInterval(() => {
    if (R.rec !== rec) return;
    const ringOp = [];
    for (const w of [R.A, R.B]) for (const n of w.document.querySelectorAll('div[aria-hidden="true"]')) if (isRing(n)) {
      const a = n.getAnimations()[0];
      ringOp.push([tag(w), +w.getComputedStyle(n).opacity, a ? Math.round(a.currentTime) : null]);
    }
    rec.samples.push([rel(), st(R.A), st(R.B), ringOp]);
  }, 10);
  rec.undo.push(() => T.clearInterval(timer));
  rec.stopTimer = T.setTimeout(() => R.stop(), ms);
  return rec.t0;
};
R.stop = () => { const rec = R.rec; if (!rec) return null; for (const f of rec.undo.splice(0)) try { f(); } catch {} R.done = rec; R.rec = null; return rec; };
R.collect = () => { const rec = R.rec ? R.stop() : R.done; if (!rec) return null; const { undo, stopTimer, ...out } = rec; return out; };
return true;
'''

SETUP = r'''return (async () => {
  const R = window.__arr, A = window, P = Services.scriptSecurityManager.getSystemPrincipal();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (f, ms = 15000) => { for (let t = 0; t < ms; t += 50) { try { if (f()) return true; } catch {} await sleep(50); } return false; };
  const U = k => `http://127.0.0.1:__PORT__/${k}.html`;
  const addLoaded = async (w, url, select) => {
    const t = w.gBrowser.addTab(url, { triggeringPrincipal: P, inBackground: !select });
    if (select) w.gBrowser.selectedTab = t;
    await wait(() => t.linkedBrowser.currentURI.spec === url && !t.hasAttribute("busy"));
    return t;
  };
  await gZenStartup.promiseInitialized;
  const ta = await addLoaded(A, U("a"), true);
  const tb = await addLoaded(A, U("b"), false);
  const tc = await addLoaded(A, U("c"), false);
  await sleep(800);
  const B = A.OpenBrowserWindow();
  await wait(() => B.gBrowserInit?.delayedStartupFinished, 30000);
  await B.gZenStartup?.promiseInitialized;
  await wait(() => B.TabRouter?.markArrival, 15000);
  await sleep(2500);
  R.B = B;
  window.__arrIds = { a: ta.id, b: tb.id, c: tc.id };
  // The live pages of b and c move into B (Zen sync: the window that shows a page holds it).
  const inB = id => B.gBrowser.tabs.find(t => t.id === id);
  B.gBrowser.selectedTab = inB(tb.id);
  await wait(() => inB(tb.id).linkedBrowser.currentURI.spec === U("b"));
  await sleep(1500);
  B.gBrowser.selectedTab = inB(tc.id);
  await wait(() => inB(tc.id).linkedBrowser.currentURI.spec === U("c"));
  await sleep(1500);
  R.wrap();
  return true;
})();'''.replace('__PORT__', str(PORT))

INFO = r'''const R = window.__arr, A = R.A, B = R.B, ids = window.__arrIds;
const hwnd = w => { try { return w.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIBaseWindow).nativeHandle; } catch (e) { return String(e); } };
const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
const win = w => ({ hwnd: hwnd(w), inner: [w.mozInnerScreenX, w.mozInnerScreenY], outer: [w.screenX, w.screenY, w.outerWidth, w.outerHeight],
  dpr: w.devicePixelRatio, st: R.st(w), sizemode: w.windowState,
  tabs: w.gBrowser.tabs.map(t => [t.label, t.id.slice(-6), t.linkedBrowser?.currentURI?.spec, t.hasAttribute("pending"), !!t._zenContentsVisible, t.selected]),
  page: rect(w.gBrowser.selectedBrowser.closest(".browserSidebarContainer")),
  browser: rect(w.gBrowser.selectedBrowser),
  tabB: rect(w.gBrowser.tabs.find(t => t.id === ids.b)?.querySelector(".tab-background")),
  accent: getComputedStyle(w.document.documentElement).getPropertyValue("--zen-primary-color").trim(),
  reducedMotion: w.matchMedia("(prefers-reduced-motion: reduce)").matches });
return { A: win(A), B: win(B), switchPatched: !!ChromeUtils.importESModule("resource:///modules/URILoadingHelper.sys.mjs").URILoadingHelper.switchToTabHavingURI[Symbol.for("zzrouter.switchToTabHavingURI")],
  routerOwnSwitchIfNeeded: Object.hasOwn(B.gZenWorkspaces, "switchIfNeeded") };'''

ENV = r'''const P = Services.prefs, get = k => { try { const t = P.getPrefType(k); return t === P.PREF_BOOL ? P.getBoolPref(k) : t === P.PREF_INT ? P.getIntPref(k) : t === P.PREF_STRING ? P.getStringPref(k) : null; } catch { return "err"; } };
let gfx = {}; try { const g = Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo); gfx = { adapter: g.adapterDescription, driver: g.adapterDriverVersion, webrender: windowUtils.layerManagerType, remote: windowUtils.layerManagerRemote }; } catch (e) { gfx = { err: String(e) }; }
return { zen: Services.appinfo.version, platform: Services.appinfo.platformVersion, os: Services.appinfo.OS, buildID: Services.appinfo.appBuildID,
  prefs: Object.fromEntries(["focusmanager.testmode", "widget.windows.window_occlusion_tracking.enabled", "remote.prefs.recommended",
    "zen.window-sync.enabled", "zen.window-sync.sync-only-pinned-tabs", "zzrouter.switch-to-open", "zzrouter.enabled", "ui.prefersReducedMotion",
    "widget.windows.window_occlusion_tracking_display_state.enabled", "widget.windows.window_occlusion_tracking_session_lock.enabled",
    "layout.frame_rate", "gfx.webrender.software", "sine.allow-unsafe-js", "zen.view.compact.enable-at-startup"].map(k => [k, get(k)])),
  gfx, tabRouter: typeof window.TabRouter?.markArrival };'''


def mod_defaults(mod):
    out = {}
    for row in json.loads((ROOT / mod / 'preferences.json').read_text()):
        if 'property' in row and 'defaultValue' in row:
            out[row['property']] = row['defaultValue']
    return out


# ------------------------------------------------------------------ analysis
def dist(p, q):
    return max(abs(p[0] - q[0]), abs(p[1] - q[1]), abs(p[2] - q[2]))


def parse_rgb(s, fallback=(27, 127, 255)):
    import re
    m = re.search(r'rgba?\((\d+),\s*(\d+),\s*(\d+)', s or '')
    return tuple(int(v) for v in m.groups()) if m else fallback


def band_points(rect, scale, inset=(0, 1)):
    """Pixels 0..1 px inside each edge, middle 60% of each edge (skip rounded corners)."""
    x, y, w, h = [v * scale for v in rect]
    pts = []
    x0, x1, y0, y1 = int(round(x)), int(round(x + w)) - 1, int(round(y)), int(round(y + h)) - 1
    for d in inset:
        for px in range(int(x0 + w * 0.2), int(x0 + w * 0.8), 2):
            pts += [(px, y0 + d), (px, y1 - d)]
        for py in range(int(y0 + h * 0.2), int(y0 + h * 0.8), 2):
            pts += [(x0 + d, py), (x1 - d, py)]
    return pts


def ring_metric(img, ref, pts, accent):
    """Estimated ring opacity from real pixels: projection of (pixel - settled) onto (accent - settled)."""
    W, H = img.size
    est, strict, used = [], 0, 0
    pa, pr = img.load(), ref.load()
    for x, y in pts:
        if not (0 <= x < W and 0 <= y < H):
            continue
        p, r = pa[x, y][:3], pr[x, y][:3]
        d = [accent[i] - r[i] for i in range(3)]
        n2 = sum(v * v for v in d)
        if dist(p, accent) <= 40:
            strict += 1
        if n2 < 60 * 60:
            continue
        used += 1
        est.append(sum((p[i] - r[i]) * d[i] for i in range(3)) / n2)
    est.sort()
    med = est[len(est) // 2] if est else None
    return {'opacity': None if med is None else round(med, 3), 'strict': strict, 'of': len(pts), 'used': used}


def page_shown(img, page_rect, scale):
    """Which page (a, b, c) fills the middle of window B's page area, by its background colour."""
    x, y, w, h = [v * scale for v in page_rect]
    cx, cy = int(x + w * 0.5), int(y + h * 0.88)
    W, H = img.size
    if not (0 <= cx < W and 0 <= cy < H):
        return None
    p = img.getpixel((cx, cy))[:3]
    best = min(PAGES, key=lambda k: dist(p, tuple(int(PAGES[k][1][i:i + 2], 16) for i in (1, 3, 5))))
    ref = tuple(int(PAGES[best][1][i:i + 2], 16) for i in (1, 3, 5))
    return best if dist(p, ref) <= 12 else 'other:' + ','.join(map(str, p))


def to_screen(win, rect):
    """Client CSS rect in a window -> screen CSS rect."""
    return [win['inner'][0] + rect[0], win['inner'][1] + rect[1], rect[2], rect[3]]


def analyze(name, cap, ref_img, t_input, info, rec, out_dir, offset):
    B, A = info['B'], info['A']
    scale = B['dpr'] or 1
    accent = parse_rgb(B['accent'])
    rings = rec.get('rings', []) if rec else []
    page_ring = next((r for r in rings if r['win'] == 'B' and r['client'][3] > 200), None)
    tab_ring = next((r for r in rings if r['win'] == 'B' and r['client'][3] <= 200), None)
    if page_ring:
        accent = parse_rgb(page_ring['shadow'], accent)
    page_rect = to_screen(B, page_ring['client'] if page_ring else B['page'])
    tab_rect = to_screen(B, tab_ring['client'] if tab_ring else B['tabB']) if (tab_ring or B['tabB']) else None
    page_pts = band_points(page_rect, scale)
    tab_pts = band_points(tab_rect, scale) if tab_rect else []
    fg_names = {}
    for k, w in (('A', A), ('B', B)):
        try:
            fg_names[int(w['hwnd'], 16) if isinstance(w['hwnd'], str) and w['hwnd'].startswith('0x') else int(w['hwnd'])] = k
        except (TypeError, ValueError):
            pass
    frames = []
    fdir = out_dir / 'frames' / name
    fdir.mkdir(parents=True, exist_ok=True)
    for i, f in enumerate(cap.frames):
        t = f['t'] - t_input
        img = f['img']
        pm = ring_metric(img, ref_img, page_pts, accent)
        tm = ring_metric(img, ref_img, tab_pts, accent) if tab_pts else None
        shown = page_shown(img, page_rect, scale)
        row = {'i': i, 't': round(t, 1), 'grabMs': round(f['grabMs'], 1), 'fg': fg_names.get(f['fg'], f['fg']),
               'shown': shown, 'page': pm, 'tab': tm}
        frames.append(row)
        if -300 <= t <= 2000:
            img.resize((img.width // 2, img.height // 2)).save(fdir / f'f{i:03d}_{int(t):+05d}ms.jpg', quality=82)
    # Gecko's own record, in ms after the input (offset maps the browser clock to Python's).
    shift = (rec['t0'] - offset - t_input) if rec else 0

    def rel(v):
        return None if v is None else round(v + shift, 1)
    gecko = None
    if rec:
        ticks_b = [rel(v) for v in rec['ticks']['B']]
        paints_b = [rel(v) for v in rec['paints']['B']]
        gecko = {
            'calls': [{**c, 't': rel(c['t'])} for c in rec['calls']],
            'events': [{**e, 't': rel(e['t'])} for e in rec['events']],
            'rings': [{**{k: v for k, v in r.items() if k != 'frames'}, 'tAdd': rel(r['tAdd']), 'removed': rel(r['removed']),
                       'frames': [[rel(fr[0])] + fr[1:] for fr in r['frames']]} for r in rings],
            'ticksB': ticks_b, 'paintsB': paints_b,
            'ticksA': [rel(v) for v in rec['ticks']['A']],
            'ticksBAfterInput': len([v for v in ticks_b if v is not None and 0 <= v <= 1500]),
            'paintsBAfterInput': len([v for v in paints_b if v is not None and 0 <= v <= 1500]),
            'samples': [[rel(s[0])] + s[1:] for s in rec['samples']],
        }
    best_page = max((f['page']['opacity'] or 0 for f in frames if f['shown'] == 'b'), default=0)
    best_tab = max(((f['tab'] or {}).get('opacity') or 0 for f in frames if f['shown'] == 'b'), default=0)
    first_b = next((f['t'] for f in frames if f['shown'] == 'b' and f['t'] >= 0), None)
    summary = {
        'frames': len(frames), 'fps': round(len(frames) / max(0.001, (cap.frames[-1]['t'] - cap.frames[0]['t']) / 1000), 1) if cap.frames else 0,
        'firstFrameShowingB': first_b,
        'maxPageRingOpacityOnScreen': round(best_page, 3), 'maxTabRingOpacityOnScreen': round(best_tab, 3),
        'framesWithPageRing': len([f for f in frames if f['shown'] == 'b' and (f['page']['opacity'] or 0) >= 0.25]),
        'framesWithTabRing': len([f for f in frames if f['shown'] == 'b' and ((f['tab'] or {}).get('opacity') or 0) >= 0.25]),
        'ringsAdded': [(r['win'], rel(r['tAdd']), [round(v) for v in r['client']]) for r in rings],
        'accent': accent, 'pageRect': page_rect, 'tabRect': tab_rect,
    }
    peak = max(range(len(frames)), key=lambda i: frames[i]['page']['opacity'] or 0, default=None)
    if peak is not None:
        cap.frames[peak]['img'].save(out_dir / f'peak-{name}.png')
        summary['peakFrame'] = frames[peak]
    make_sheet(name, cap, frames, t_input, page_rect, tab_rect, scale, out_dir)
    return {'summary': summary, 'frames': frames, 'gecko': gecko}


def make_sheet(name, cap, frames, t_input, page_rect, tab_rect, scale, out_dir):
    cells = []
    for f, row in zip(cap.frames, frames):
        if not -200 <= row['t'] <= 1800:
            continue
        img = f['img']
        x, y, w, h = [v * scale for v in page_rect]
        corner = img.crop((int(x) - 10, int(y) - 10, int(x) + 230, int(y) + 150))
        if tab_rect:
            tx, ty, tw, th = [v * scale for v in tab_rect]
            tab = img.crop((int(tx) - 12, int(ty) - 12, int(tx + tw) + 12, int(ty + th) + 12))
            tab = tab.resize((240, max(1, round(tab.height * 240 / max(1, tab.width)))))
        else:
            tab = Image.new('RGB', (240, 40), 'black')
        cell = Image.new('RGB', (240, 18 + tab.height + corner.height), 'white')
        d = ImageDraw.Draw(cell)
        po, to = row['page']['opacity'], (row['tab'] or {}).get('opacity')
        d.text((2, 3), f"{row['t']:+.0f}ms fg={row['fg']} pg={row['shown']} p={po} t={to}", fill='black')
        cell.paste(tab, (0, 18))
        cell.paste(corner, (0, 18 + tab.height))
        cells.append(cell)
    if not cells:
        return
    cols = 6
    cw, ch = 244, max(c.height for c in cells) + 4
    sheet = Image.new('RGB', (cw * cols, ch * ((len(cells) + cols - 1) // cols)), (90, 90, 90))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % cols) * cw, (i // cols) * ch))
    sheet.save(out_dir / f'sheet-{name}.png')


# ------------------------------------------------------------------ scenarios
def page_point(win, x, y):
    s = win['dpr'] or 1
    return round((win['inner'][0] + win['browser'][0] + x) * s), round((win['inner'][1] + win['browser'][1] + y) * s)


def layout(m, mode):
    if mode == 'max':
        m.js('const R=window.__arr;R.B.maximize();return true;')
        time.sleep(0.6)
        m.js('const R=window.__arr;R.A.maximize();return true;')
    else:
        m.js('''const R=window.__arr,s=R.A.screen;for(const w of [R.A,R.B])if(w.windowState!==w.STATE_NORMAL)w.restore();
          return true;''')
        time.sleep(0.8)
        m.js('''const R=window.__arr,s=R.A.screen,W=Math.floor(s.availWidth/2);
          R.A.moveTo(s.availLeft,s.availTop);R.A.resizeTo(W,s.availHeight);
          R.B.moveTo(s.availLeft+W,s.availTop);R.B.resizeTo(W,s.availHeight);return true;''')
    time.sleep(1.2)


def prepare(m, mode, front='A'):
    """B shows page c (b live in its background); A shows a and is in front, activated by a real click."""
    m.js('''const R=window.__arr,ids=window.__arrIds;const t=R.B.gBrowser.tabs.find(t=>t.id===ids.c);R.B.gBrowser.selectedTab=t;
      const a=R.A.gBrowser.tabs.find(t=>t.id===ids.a);R.A.gBrowser.selectedTab=a;return true;''')
    time.sleep(0.8)
    layout(m, mode)
    m.js(f'window.__arr.{front}.focus();return true;')
    time.sleep(0.8)
    info = m.js(INFO)
    w = info[front]
    # A real click on an empty part of the page activates it the way a user does.
    x, y = page_point(w, (w['browser'][2]) * 0.5, min(w['browser'][3] - 40, 640))
    res = click(x, y)
    time.sleep(1.5)
    info = m.js(INFO)
    return info, {'click': [x, y], 'sent': res, 'fg': hwnd_info(user32.GetForegroundWindow()), 'z': zorder(6)}


def run_capture(m, secs, act, pre=0.25):
    before = time.time() * 1000
    js_t0 = m.js('return window.__arr.arm(%d);' % int((secs + 1.5) * 1000))
    after = time.time() * 1000
    offset = js_t0 - (before + after) / 2  # browser epoch ms - python epoch ms
    cap = Capture(secs + pre)
    cap.start()
    time.sleep(pre)
    t_input = time.time() * 1000
    act_res = act()
    t_input_done = time.time() * 1000
    cap.join()
    time.sleep(1.6)
    rec = m.js('return window.__arr.collect();')
    return cap, rec, t_input, t_input_done, offset, act_res


def scenario(m, name, mode, action, out_dir):
    result = {'name': name, 'mode': mode, 'action': action}
    front = 'B' if action == 'direct' or action.startswith('p') else 'A'
    info, prep = prepare(m, mode, front)
    result['prepare'] = prep
    result['before'] = info
    act_res = None
    if action == 'urlbar':
        result['ctrlL'] = press('ctrl', 'l')
        time.sleep(0.6)
        result['typed'] = [r['sent'] for r in type_text(PAGES['b'][0])]
        rows = None
        for _ in range(40):
            time.sleep(0.15)
            rows = m.js('''const v=window.__arr.A.gURLBar.view,rows=[...v.panel.querySelectorAll('.urlbarView-row')];
              return {rows:rows.map(r=>[r.getAttribute('type'),r.textContent.replace(/\\s+/g,' ').trim().slice(0,70)]),
                sel:v.selectedRowIndex,open:window.__arr.A.gURLBar.view.isOpen,value:window.__arr.A.gURLBar.value,
                focused:document.activeElement?.id||document.activeElement?.localName};''')
            if any(r[0] == 'switchtab' for r in rows['rows']):
                break
        result['urlbar'] = rows
        idx = next((i for i, r in enumerate(rows['rows']) if r[0] == 'switchtab'), -1)
        downs = 0
        while idx >= 0 and downs < 8:
            sel = m.js('return window.__arr.A.gURLBar.view.selectedRowIndex;')
            if sel == idx:
                break
            press('down')
            downs += 1
            time.sleep(0.15)
        result['selectedRow'] = m.js('const v=window.__arr.A.gURLBar.view;return [v.selectedRowIndex,v.selectedElement?.getAttribute("type")];')
        time.sleep(0.4)
        act = lambda: press('enter')  # noqa: E731
    elif action == 'link':
        w = info['A']
        x, y = page_point(w, 170, 150 + 150 * list(PAGES).index('b') + 55)
        move(x, y)
        time.sleep(0.4)
        result['linkPoint'] = [x, y]
        result['hover'] = m.js('''const b=window.__arr.A.gBrowser.selectedBrowser;return [window.__arr.A.XULBrowserWindow?.overLink||null];''')
        act = lambda: (send([mouse_input(x, y, 0x0002)]), time.sleep(0.04), send([mouse_input(x, y, 0x0004)]))  # noqa: E731
    elif action.startswith('p'):  # cost probe in B, B in front and visible
        variant = action[1:]
        act = lambda: m.js('return window.__arr.probe(%s);' % json.dumps(variant))  # noqa: E731
    else:  # direct API call: calibrates the pixel detector with B in front.
        act = lambda: m.js('''const R=window.__arr,ids=window.__arrIds,t=R.B.gBrowser.tabs.find(t=>t.id===ids.b);
          R.B.gBrowser.selectedTab=t;R.B.TabRouter.markArrival(t);return true;''')  # noqa: E731
    cap, rec, t_input, t_done, offset, act_res = run_capture(m, 1.9, act)
    result['input'] = {'t': t_input, 'doneAfterMs': round(t_done - t_input, 1), 'res': repr(act_res)[:300], 'clockOffsetMs': round(offset, 1)}
    result['captureError'] = cap.error
    time.sleep(0.3)
    ref = ImageGrab.grab()
    ref.save(out_dir / f'settled-{name}.png')
    if cap.frames:
        cap.frames[0]['img'].save(out_dir / f'first-{name}.png')
    result['after'] = m.js(INFO)
    result['afterFg'] = hwnd_info(user32.GetForegroundWindow())
    result['afterZ'] = zorder(6)
    result.update(analyze(name, cap, ref, t_input, result['after'], rec, out_dir, offset))
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--zen', type=Path, required=True)
    ap.add_argument('--sine', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--scenarios', default='direct-max,pfull-max,psolid-max,pglow-max,ptab-max,pborder-max,ptiny-max,pstatic-max,phold-max,pfix-max,urlbar-max,link-max,urlbar-side')
    args = ap.parse_args()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    try:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except (AttributeError, OSError):
        pass
    report = {'started': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'resolution': set_resolution(1920, 1080)}
    time.sleep(1)
    report['screen'] = list(screen_size())
    ImageGrab.grab().save(out / 'desktop-start.png')
    report['zStart'] = zorder(8)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Pages)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix='zen-arrival-') as d:
        profile = Path(d)
        folder = profile / 'chrome' / 'sine-mods'
        folder.mkdir(parents=True)
        registry, prefs = {}, {}
        for mod in MODS:
            manifest = json.loads((ROOT / mod / 'theme.json').read_text())
            shutil.copytree(ROOT / mod, folder / manifest['id'])
            registry[manifest['id']] = {**manifest, 'enabled': True, 'origin': 'store', 'no-updates': True}
            prefs.update(mod_defaults(mod))
        (folder / 'mods.json').write_text(json.dumps(registry))
        report['mods'] = {k: v['version'] for k, v in registry.items()}
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            mport = s.getsockname()[1]
        base = {'marionette.port': mport, 'browser.shell.checkDefaultBrowser': False,
                'browser.aboutwelcome.enabled': False, 'zen.welcome-screen.seen': True,
                'zen.welcome-screen.enabled': False, 'sine.auto-updates': False, 'sine.allow-unsafe-js': True,
                'browser.sessionstore.resume_from_crash': False, 'app.update.enabled': False,
                'app.update.disabledForTesting': True, 'browser.startup.homepage_override.mstone': 'ignore',
                'datareporting.policy.dataSubmissionEnabled': False, 'toolkit.telemetry.enabled': False,
                # Windows Server has animation effects off; a desktop user normally has them on.
                'ui.prefersReducedMotion': 0,
                # What a user's Zen runs with (Marionette's recommended prefs change both).
                'focusmanager.testmode': False, 'widget.windows.window_occlusion_tracking.enabled': True}
        base.update(prefs)
        (profile / 'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k, v in base.items()))
        env = {**os.environ, 'MOZ_REMOTE_ALLOW_SYSTEM_ACCESS': '1'}
        log = (profile / 'browser.log').open('w')
        proc = subprocess.Popen([str(args.zen.resolve()), '--no-remote', '--profile', d, '--marionette',
                                 '--remote-allow-system-access', 'about:blank'], stdout=log, stderr=log, env=env)
        try:
            for _ in range(300):
                try:
                    with socket.create_connection(('127.0.0.1', mport), timeout=0.2):
                        break
                except OSError:
                    if proc.poll() is not None:
                        raise RuntimeError('Zen exited early')
                    time.sleep(0.2)
            m = Marionette(mport)
            m.js('return (async()=>{await gZenStartup.promiseInitialized;for(let i=0;i<300&&!gBrowserInit.delayedStartupFinished;i++)await new Promise(r=>setTimeout(r,50));return true;})();')
            sine = args.sine.resolve()
            m.js('window.__sineChrome=Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup)'
                 '.registerChrome(Services.io.newURI(' + json.dumps((profile / 'chrome.manifest').as_uri()) + '),'
                 + json.dumps([['content', 'userscripts', sine.as_uri() + '/'],
                               ['content', 'sine', folder.as_uri() + '/'],
                               ['content', 'locales', sine.as_uri() + '/']]) + ');return true;')
            m.js('window.manager=ChromeUtils.importESModule("chrome://userscripts/content/core/manager.sys.mjs").default;'
                 'window.newDOM=true;ChromeUtils.importESModule("chrome://userscripts/content/sine.sys.mjs");return true;')
            m.js('return (async()=>{for(let i=0;i<200&&!window.TabRouter?.markArrival;i++)await new Promise(r=>setTimeout(r,50));'
                 'await new Promise(r=>setTimeout(r,3000));return true;})();')
            report['env'] = m.js(ENV)
            m.js(RECORDER)
            report['setup'] = m.js(SETUP)
            report['info'] = m.js(INFO)
            report['inventory'] = m.js('return window.__arr.inventory();')
            report['scenarios'] = []
            for spec in args.scenarios.split(','):
                action, mode = spec.split('-')
                try:
                    report['scenarios'].append(scenario(m, spec, mode, action, out))
                except Exception:  # noqa: BLE001
                    report['scenarios'].append({'name': spec, 'error': traceback.format_exc()})
                (out / 'report.json').write_text(json.dumps(report, indent=1, default=str))
            m.js('window.__arr.unwrap();return true;')
        except Exception:  # noqa: BLE001
            report['error'] = traceback.format_exc()
        finally:
            try:
                ImageGrab.grab().save(out / 'desktop-end.png')
            except Exception:  # noqa: BLE001
                pass
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            log.close()
            text = (profile / 'browser.log').read_text(errors='replace')
            (out / 'browser.log').write_text(text[-200000:])
            (out / 'report.json').write_text(json.dumps(report, indent=1, default=str))
            server.shutdown()
    lines = []
    for s in report.get('scenarios', []):
        if 'summary' in s:
            sm = s['summary']
            calls = [(c['kind'], c.get('win'), c.get('t')) for c in (s.get('gecko') or {}).get('calls', [])]
            lines.append(f"{s['name']}: fps={sm['fps']} firstB={sm['firstFrameShowingB']} pageMax={sm['maxPageRingOpacityOnScreen']} "
                         f"tabMax={sm['maxTabRingOpacityOnScreen']} rings={sm['ringsAdded']} calls={calls} "
                         f"ticksB={(s.get('gecko') or {}).get('ticksBAfterInput')} fg={s.get('afterFg', {}).get('title')}")
        else:
            lines.append(f"{s['name']}: ERROR {s.get('error', '')[-600:]}")
    summary = '\n'.join(lines) + ('\n' + report['error'] if report.get('error') else '')
    (out / 'summary.txt').write_text(summary)
    print(summary)
    print(json.dumps({k: report.get(k) for k in ('resolution', 'screen', 'env', 'mods')}, indent=1, default=str))


if __name__ == '__main__':
    main()
