# Native integration and console findings

Follow-up to [the Zen 1.24 suite audit](AUDIT-2026-10-30-WHOLE-SUITE-ZEN124.md).

| Owner | Change and reason |
| --- | --- |
| Groupflow 1.75.4 | Pass the same explicit window scope to both SessionStore history queries. Zen 1.24's `#prepareClosedTabOptions` uses `Object.assign` on its argument: passing Window enumerates DOM getters, matching the supplied `NS_ERROR_NOT_AVAILABLE` stack. Retention on genuine history-store failure remains intact. Collapsed visibility now uses actual selection rather than stale `visuallyselected` paint state, so the last-used Off choice also works after native pin restoration. |
| Tab Router 1.37.9 | One Live Folder ownership predicate protects routing, final placement, Nexus capture, picture learning and explicit refresh actions. Group membership changes release stale Router image overrides while preserving the provider's native image. Ordinary pinned/grouped choices cannot override provider ownership. |
| Iconflow 1.21.11 | The optional New Tab hide-label rule yields during native `zen-paste-and-search`, restoring the action label without replacing the native clipboard or command handler. |
| Glassflow Library 1.4.3 | Code-only warm includes SpaceRouting on Zen 1.24b+. Importing the native Library entry was rejected because it upgrades the element and starts observers. The bounded section list remains documented pending a native side-effect-free registry/preload API. Cards use opaque system colors under accessibility preferences. |
| Glassflow 3.74.16 | Shared blur recipes and fills respect reduced transparency and chrome contrast signals. The native runtime reproduced custom-sidebar blur bypassing reduced transparency. The transparent-page filter and redraw nudge remain pending Windows pixel evidence. |
| Mediaflow 2.8.9 | Caption and control backplates respect reduced transparency/contrast. Runtime reproduced translucent captions under reduced transparency. Original glyphs, normal motion and playback behavior retain their existing owners. Zenslop's alias metadata matches. |

## Console triage

- **Groupflow history exception:** actionable and fixed as above; its prior catch
  retained metadata instead of deleting it. No other production call sites use
  the obsolete window shorthand.
- **Mediaflow `event:pause` / `pagehide`:** existing source lifecycle messages.
  Pausing via preview controls retains the preview; an external pause hides it.
  The reported landscape/portrait changes can reflect different source videos.
  Logs without input/state timestamps cannot prove missed clicks or explain an
  unexpected pause. Native controls regression passed independently.
- **WindowsJumpLists favicon warnings:** native Windows integration, including a
  [matching upstream ChatGPT report](https://bugzilla.mozilla.org/show_bug.cgi?id=1983762).
  No favicon/network workaround was added to the mods.
- **Bare `NS_ERROR_NOT_AVAILABLE` and `Object { message }`:** source and stack
  remain unknown; do not assign them to Mediaflow solely because logs are nearby.
- **ZenSessionManager save:** a save announcement alone is not a measured stall.

## Refactoring decisions

Consolidate policy at existing ownership boundaries. Avoid a new Library loader,
Live Folder polling provider, icon motion engine or global keyboard dispatcher.
A broad rewrite of the now-smooth icon path has no demonstrated benefit. Turbo
pack defaults and saved choices remain unchanged until a stock-vs-pack workload
benchmark measures benefit. The blur implementation is the next removal candidate,
but only after [the automatic capture](../tools/NATIVE-BLUR-PROBE.md).

Firefox chrome does not use the same forced-color regime as content. Use chrome's
`(forced-colors)` / `(prefers-contrast)` signals, not only `(forced-colors: active)`;
see [Mozilla's CSS guidance](https://github.com/mozilla-firefox/firefox/blob/main/docs/code-quality/coding-style/css_guidelines.md).

## Verification

- Repository gate with upstream Sine manager: **250 passed, 0 failed, 1 optional native entry skipped**; native checks ran separately.
- Native Zen 1.24b integration: code-only preload without Library construction;
  explicit SessionStore scope; native Paste & Search labels and clipboard preview
  via synthetic mouse events; reduced-transparency sidebar/overlay/caption checks;
  selected-tab indicator with open/collapsed groups on both sides and native Off;
  contrast token/card checks. Headless screenshot reviewed for visible sidebar
  text. This is not a complete Windows high-contrast theme/menus rendering matrix.
- Native routing/session runner initially exposed a restored unloaded pin with stale `visuallyselected` bypassing last-used Off. A focused regression reproduced it; the visibility owner was corrected and all three launches of the full runner passed after correction (140 / 89 / 89 boolean checks). Popup and shape checks now await the required native state rather than assuming settling within 50–100ms.
- Native Mediaflow actor/playback + WebDriver: hover growth, six original glyph
  paints, four hover timings, eight seeks, focus/keyboard/canvas navigation, and
  diagnostic capture of delivered presses, commands and misses all passed.
- Automatic blur orchestration: 32 real Zen chrome phases, state restoration and
  ZIP output passed using a simulated screen backend; Node failure/cancellation/window-close
  coverage passed; global preferences restore synchronously on window unload. Windows PowerShell/GDI execution remains unverified here.
- Remaining coverage: selected-tab indicator inside independently scrolled nested
  folder bodies and Library copies; complete Windows accessibility palettes;
  Windows presented blur pixels; stock-vs-Turbo workload benchmarking. No blanket
  performance or visual-smoothness claim follows from these tests.
