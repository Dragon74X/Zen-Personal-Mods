import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const root = new URL('../', import.meta.url);
const css = await readFile(new URL('iconflow/userChrome.css', root), 'utf8');
const glass = await readFile(new URL('glassflow/userChrome.css', root), 'utf8');
// Declarations of the first rule whose selector list is exactly `selector`.
const rule = selector => {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, 'missing rule: ' + selector);
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  return Object.fromEntries(body.split(';').map(d => d.trim()).filter(Boolean)
    .map(d => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]));
};
const FAVORITE_MINUS = ':root .tabbrowser-tab[zen-essential] > .tab-stack > .tab-content > .tab-reset-button';
const FAVORITE_PAINT = ':root .tabbrowser-tab[zen-essential] .tab-reset-button[zzicon-motion="image"]:not(#zzicon-own)';

test('a Favorite minus shown by a theme takes no slot beside the Favorite icon', () => {
  // Zen 1.24.1 sets position: relative on tab close/reset boxes for its line
  // strokes; a theme's normal position: absolute (Arc 2.0) no longer applies.
  assert.deepEqual(rule(FAVORITE_MINUS), {position: 'absolute !important'});
  assert.match(FAVORITE_MINUS, /\[zen-essential\]/, 'regular and pinned tabs keep Zen\'s own minus layout');
});

test('the Favorite Morph minus repeats the shared strip paint at ID weight', () => {
  const shared = rule(':root [zzicon-motion="image"],\n:root [zzicon-motion="before"]::before');
  const favorite = rule(FAVORITE_PAINT);
  assert.deepEqual(Object.keys(favorite).sort(), ['background-clip', 'background-image', 'background-origin', 'background-position', 'background-repeat', 'background-size']);
  for (const [property, value] of Object.entries(favorite)) assert.equal(value, shared[property], property);
  // Geometry, transforms and colour stay with the generic rule and the theme.
  assert.doesNotMatch(JSON.stringify(favorite), /transform|scale|translate|background-color/);
});

test('the Library button grows from Zen\'s own size in the icons\' proportion', () => {
  // Zen 1.24 drew the sprite 18px scaled 1.08; 1.24.1 draws it 20px unscaled.
  // Zooming Zen's own box keeps either in proportion instead of fixing 18:16.
  const sizes = [...css.matchAll(/--zzicon-box: (\d+)px; --zzicon-scale: ([\d.]+);/g)].map(m => [+m[1], +m[2]]);
  assert.deepEqual(sizes.map(([box]) => box), [16, 18, 20, 22]);
  for (const [box, scale] of sizes) assert.equal(scale, box / 16, box + 'px');
  assert.deepEqual(rule('    #zen-library-button .zen-library-sprite'), {zoom: 'var(--zzicon-scale) !important'});
  assert.doesNotMatch(css, /#zen-library-button \{ --zen-library-sprite-size: calc\(var\(--zzicon-box\) \* 1\.125\) !important; \}\n  \}/, 'the fixed 18:16 size is kept only for Circuit stack');
  const stack = css.slice(css.indexOf('Circuit stack draws its own strip'));
  assert.match(stack, /^[^\n]*\n\s*@media \(-moz-pref\("zzicon\.library\.style", 12\)\)[^{]+\{\n\s*#zen-library-button \{ --zen-library-sprite-size: calc\(var\(--zzicon-box\) \* 1\.125\) !important; \}\n\s*#zen-library-button \.zen-library-sprite \{ zoom: 1 !important; \}/);
});

test('the close X scale-in targets what draws the X, not the hit target', () => {
  // Zen 1.24 drew the X as the close <image> itself, 1.24.1 as a box with two
  // line pseudo-elements; neither has an image child, so the old rule was inert.
  const motion = glass.slice(glass.indexOf('Close targets remain stationary'), glass.indexOf('/* The X is anchored on the favicon'));
  assert.doesNotMatch(motion, /\.tab-close-button image/);
  assert.match(motion, /& \.tab-close-button::before, & \.tab-close-button::after \{\n\s*scale: \.65;/);
  assert.match(motion, /\n\s*& \.tab-close-button::before, & \.tab-close-button::after \{ scale: 1; \}/, 'hover grows the lines');
  // Zen's own line easing stays in the list the !important transition replaces.
  assert.match(motion, /transition: scale var\(--zzg-motion-time\) var\(--zzg-motion-ease\), rotate \.12s ease, width \.12s ease !important;/);
  assert.doesNotMatch(motion, /& \.tab-close-button \{[^}]*\bscale\b/, 'the hit target is not scaled');
});

test('native hover: Favorites keep their icon in place; the close X grows in on its slot', {skip: !process.env.ZEN_BINARY, timeout: 200000}, () => {
  const out = execFileSync('python3', [new URL('tools/zen1241-iconflow-hover.py', root).pathname, '--zen', process.env.ZEN_BINARY], {timeout: 190000, encoding: 'utf8', maxBuffer: 4e6});
  console.log(out.split('\n').filter(line => !line.startsWith('FAVORITES')).join('\n').trim());
  assert.match(out, /^PASS \d+ hover checks$/m);
});
