# Live capture follow-up — 28 October 2026

Baseline: main `06425f4` (PR #196), Zen 1.23.4b / Gecko 158.0.1.

The supplied Windows capture still reports Iconflow 1.21.3, Glassflow 3.74.5 and
Mediaflow 2.8.0, before #196. Its five motion runs show reload switching directly
to scale .82, compact-mode parent growth from 28px toward 35px, and Arc whole-tab
scale 1.03 composing with favicon growth. Four menu captures contain 73 rows and
zero Morph owners with menu animation Off. It contains no workspace motion run;
Arc workspace style 3 disables Arc's workspace styling, so the earlier workspace
conflict reproduction is not evidence of this user's workspace cause.

## Menu paint cause

The selected Context Menu Icons package is **ZenUI (2)**, not FluentUI (1), which
the earlier isolated paint check used. With the captured SVG policy disabled,
ZenUI's supplied reload SVG paints **0 non-white pixels through a file URL**, but
**278 red pixels through the existing chrome mapping** at 32px. Its paths use
`stroke="context-fill"`. This reproduces missing artwork independently of Morph.

[Sine's stylesheet generator](https://github.com/CosmoCreeper/Sine/blob/fb0bd4ca6af888f10648e126947f7d1f82228433/src/services/stylesheets.sys.mjs)
imports installed browser styles through file URLs despite already registering
their directory as `chrome://sine/content/`. Correct that generated browser import
at the existing session-owned Sine boundary. The 23-line addition ships identically
in all ten independently installable packages. It changes only imports rooted in
the installed-mod directory, only in Sine's generated chrome entrypoint. Relative
assets then inherit chrome scope. Ordering, enable gates, content sheets, unrelated
files, external URLs, write results and errors remain owned by Sine. One initial
rebuild applies the correction; there is no extra timer or CSS layer.

Browser SVG policy, third-party installed source files and saved preferences are
unchanged. The bounded adapter can be removed when upstream emits chrome imports.

## Motion and probe corrections

- Morph owns toolbar icon motion; its marked toolbarbutton target no longer
  composes Arc's parent transform. Removing Morph releases the parent. Toolbar
  customization and original window controls remain outside this rule.
- Glassflow's existing tab rule suppresses whole-tab hover transforms while
  favicon/title motion remains. Native moving-tab, closing and drag-image states
  retain their transforms.
- Probe v1 exhausted 90 samples after 368–432ms in this capture. V2 samples at
  most once per 16ms for one second, includes parent transforms/bounds, samples
  menus again after 500ms and removes profile directory names from URLs. It still
  auto-copies at 20 seconds and removes all hooks/timers. This is not an FPS test.

## Checks run

- Required Node gate with upstream Sine: **234 passed, 0 failed, 1 optional native
  check skipped**; native checks ran separately. The unmodified upstream stylesheet
  generator verifies import order, enable gates, content isolation, repeated install
  and write-error propagation.
- Native Morph: generated file import **0 → 384 red pixels** on a self-contained
  stroked SVG fixture after the production correction, with SVG policy still false;
  fixed toolbar targets under Arc press rules; compact transform ownership/release;
  **222 sprite paint cases**, eight close-glyph cases and four unchanged window-glyph
  comparisons. Menu restoration and state/lifecycle checks pass.
- Native state motion: five profiles, four lighting profiles, five rendered relief
  surfaces, fixed icon/background geometry, reduced motion and drag/close transform
  release checks pass.
- Native Sine settings: **96 assertions**, 533 controls, 182 switches, two windows
  and restart. All eight generated browser imports use chrome URLs both before and
  after restart. Probe v2 captured **53 samples across 1007ms**, a delayed menu snapshot
  and automatic clipboard/cleanup behavior.
- `git diff --check` passes. Linux headless does not verify Windows GPU frame pacing,
  antialiasing or the final appearance of the user's native popup surface.

## Releases

Update installed mods in Sine, then fully quit and restart Zen once: Sine caches
the shared background module for the session. Independent packages all carry the
same correction, hence each changed package receives release metadata.

| Package | Version |
| --- | --- |
| Iconflow | 1.21.5 |
| Glassflow | 3.74.7 |
| Mediaflow / Zenslop forwarding manifest | 2.8.2 |
| Groupflow | 1.75.2 |
| Glassflow Library | 1.4.1 |
| Download Prompt | 1.4.5 |
| Tab Router | 1.37.5 |
| Tab Unloader | 1.15.5 |
| Zen Turbo | 1.13.4 |
| Peekflow | 1.3.4 |
