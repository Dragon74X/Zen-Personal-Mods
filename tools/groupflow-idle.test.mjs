// Groupflow's idle tabs, run on the production source with tab and folder fakes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./harness.mjs";

test("Idle after reads days, hours and minutes; 0 turns automatic idling off", async () => {
  const { parseDuration } = await load("groupflow", "parseDuration", { window: {} });
  const H = 36e5;
  assert.equal(parseDuration("1d"), 24 * H);
  assert.equal(parseDuration("12h"), 12 * H);
  assert.equal(parseDuration("1d 6h"), 30 * H);
  assert.equal(parseDuration("2 days 30 minutes"), 48 * H + 30 * 6e4);
  assert.equal(parseDuration("90m"), 1.5 * H);
  assert.equal(parseDuration("45"), 45 * 6e4, "a bare number is minutes");
  assert.equal(parseDuration("0"), 0);
  assert.equal(parseDuration("off"), 0);
  assert.equal(parseDuration(""), 24 * H, "empty is the default, a day");
  assert.equal(parseDuration("soon"), 24 * H, "nonsense is the default");
});

function env({ after = "1d", now = 1e12 } = {}) {
  const values = new Map(), listeners = new Map(), micro = [];
  const node = (extra = {}) => { const attrs = new Map(); return { attrs, ...extra,
    hasAttribute: k => attrs.has(k), getAttribute: k => attrs.get(k) ?? null, setAttribute(k, v) { attrs.set(k, String(v)); },
    removeAttribute: k => attrs.delete(k), toggleAttribute(k, on = !attrs.has(k)) { if (on) attrs.set(k, ""); else attrs.delete(k); return on; } }; };
  const box = { children: [], get lastElementChild() { return this.children.at(-1) ?? null; },
    appendChild(el) { this.children = this.children.filter(c => c !== el); this.children.push(el); el.parentElement = this; } };
  const group = node({ isConnected: true, tagName: "tab-group", groupContainer: box, hasAttribute(k) { return this.attrs.has(k); } });
  const tabs = [];
  const tab = (name, { pending = false, accessed = now, selected = false } = {}) => {
    const t = node({ name, group, isConnected: true, closing: false, hidden: false, selected, multiselected: false, lastAccessed: accessed });
    if (pending) t.attrs.set("pending", "");
    tabs.push(t); return t;
  };
  const prefs = { "zzgroup.idle-after": after };
  const ctx = {
    window: { addEventListener: (t, f) => listeners.set(t, f), removeEventListener() {}, Groupflow: {} },
    document: { createElementNS: () => { const el = node({ remove() { if (el.parentElement) el.parentElement.children = el.parentElement.children.filter(c => c !== el); el.parentElement = null; },
      addEventListener() {}, textContent: "", tabIndex: -1 }); return el; }, querySelectorAll: () => [] },
    Services: { prefs: { getBoolPref: (k, d) => d, getStringPref: (k, d) => prefs[k] ?? d, getIntPref: (k, d) => d, addObserver() {}, removeObserver() {} } },
    SessionStore: { getCustomTabValue: (t, k) => values.get(t)?.[k] ?? "", setCustomTabValue: (t, k, v) => values.set(t, { ...values.get(t), [k]: v }),
      deleteCustomTabValue: (t, k) => { if (values.has(t)) delete values.get(t)[k]; } },
    gBrowser: { tabs, get selectedTab() { return tabs.find(t => t.selected); }, set selectedTab(t) { for (const x of tabs) x.selected = x === t; },
      tabContainer: { addEventListener: (t, f) => listeners.set("tc:" + t, f), removeEventListener() {}, _invalidateCachedVisibleTabs() {} },
      _findTabToBlurTo: (t, ex) => tabs.find(x => x !== t && !ex.includes(x)), discardBrowser: t => t.attrs.set("pending", ""), visibleTabs: tabs },
    MutationObserver: class { observe() {} disconnect() {} }, queueMicrotask: fn => micro.push(fn), setInterval: () => 1, clearInterval() {},
    Date: { now: () => now }, isCopy: () => false,
  };
  return { ctx, tabs, tab, group, box, listeners, values, flush() { while (micro.length) micro.shift()(); } };
}

test("A folder's tabs go idle after the set time unloaded, or when sent; idle ones sit behind one row", async () => {
  const e = env({ now: 1e12 });
  const day = 864e5;
  const fresh = e.tab("fresh", { pending: true, accessed: 1e12 - day / 2 });
  const old = e.tab("old", { pending: true, accessed: 1e12 - 2 * day });
  const loadedOld = e.tab("loaded", { accessed: 1e12 - 2 * day });
  const current = e.tab("current", { pending: true, accessed: 0, selected: true });
  const { startIdleTabs } = await load("groupflow", "startIdleTabs", e.ctx);
  const idle = startIdleTabs();
  e.flush();
  const state = t => [t.hasAttribute("zzgf-idle"), t.hasAttribute("zzgf-idle-hidden")];
  assert.deepEqual(state(old), [true, true], "unloaded and unused for over a day");
  assert.deepEqual(state(fresh), [false, false], "unloaded half a day: still shown");
  assert.deepEqual(state(loadedOld), [false, false], "a loaded tab never goes idle by time");
  assert.deepEqual(state(current), [false, false], "nor the selected one");
  assert.equal(e.box.children.length, 1, "one row at the bottom of the folder");
  assert.equal(e.box.children[0].textContent, "Show 1 idle tab");
  // Sent by hand: idle and unloaded at once.
  idle.api.sendToIdle([loadedOld]); e.flush();
  assert.deepEqual(state(loadedOld), [true, true]);
  assert.ok(loadedOld.hasAttribute("pending"), "unloaded too");
  assert.equal(e.box.children[0].textContent, "Show 2 idle tabs");
  // The row shows them, the folder unfolded or not.
  e.group.toggleAttribute("zzgf-show-idle", true); idle.api.keepVisible([], true); e.flush();
  assert.deepEqual(state(old), [true, false]);
  assert.equal(e.box.children[0].textContent, "Hide 2 idle tabs");
  // Keep visible exempts; opening a tab brings it out.
  idle.api.keepVisible([old], true); e.flush();
  assert.deepEqual(state(old), [false, false]);
  e.ctx.gBrowser.selectedTab = loadedOld; loadedOld.lastAccessed = 1e12;   // Firefox stamps it when shown
  e.listeners.get("tc:TabSelect")({ target: loadedOld }); e.flush();
  assert.deepEqual(state(loadedOld), [false, false], "selected, and no longer sent");
  e.ctx.gBrowser.selectedTab = current; e.listeners.get("tc:TabSelect")({ target: current }); e.flush();
  assert.deepEqual(state(loadedOld), [false, false], "it stays out once opened (until it is unloaded a day again)");
  assert.equal(e.box.children.length, 0, "no idle tab, no row");
  idle.cleanup();
});

test("Idle after 0 idles nothing by time; sending by hand still works", async () => {
  const e = env({ after: "0" });
  const old = e.tab("old", { pending: true, accessed: 0 }), other = e.tab("other", { pending: true, accessed: 0 });
  e.tab("current", { selected: true });
  const { startIdleTabs } = await load("groupflow", "startIdleTabs", e.ctx);
  const idle = startIdleTabs(); e.flush();
  assert.equal(old.hasAttribute("zzgf-idle"), false);
  idle.api.sendToIdle([other]); e.flush();
  assert.equal(other.hasAttribute("zzgf-idle"), true);
  idle.cleanup();
});

test("Zen's own folders are left alone: their tabs never go idle and get no row", async () => {
  const e = env();
  e.group.tagName = "zen-folder"; e.group.isZenFolder = true;
  const old = e.tab("old", { pending: true, accessed: 0 });
  e.tab("current", { selected: true });
  const { startIdleTabs } = await load("groupflow", "startIdleTabs", e.ctx);
  const idle = startIdleTabs(); e.flush();
  idle.api.sendToIdle([old]); e.flush();
  assert.equal(old.hasAttribute("zzgf-idle"), false);
  assert.equal(e.box.children.length, 0, "nothing added among a Zen folder's items");
  idle.cleanup();
});
