import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const scene = read('src/components/home/EternalConstellation.tsx');
const css = read('src/components/home/eternal-constellation.css');
const home = read('src/components/home/SectionSelector.tsx');

test('1: homepage replaces the old static orbit without removing its six-pillar links', () => {
  assert.match(home, /import EternalConstellation from "\.\/EternalConstellation"/);
  assert.match(home, /<EternalConstellation \/>/);
  assert.doesNotMatch(home, /Abstract illustration of the connected ETERNYX ecosystem/);
  assert.match(home, /ecosystemPillars\.map/);
  assert.match(home, /id="pillars"/);
});

test('2: the original central identity and all six ecosystem labels remain', () => {
  assert.match(scene, /Connected by design/);
  assert.match(scene, /ETERNYX/);
  for (const label of ['SECURITY','DEVELOP','AI','WORKSPACE','CLOUD','AUTOMATE']) {
    assert.match(scene, new RegExp('label: "' + label + '"'));
  }
  assert.match(scene, /role="img"/);
  assert.match(scene, /aria-label="ETERNYX connected by design/);
  assert.match(scene, /aria-hidden="true"/);
});

test('3: rings resonate, tilted ellipses counter-sway, and dots orbit indefinitely', () => {
  for (const motion of ['eternyx-resonance-tide','eternyx-resonance-tilt','eternyx-resonance-countertilt','eternyx-resonance-orbit','eternyx-resonance-glow','eternyx-resonance-drift']) {
    assert.match(css, new RegExp('@keyframes ' + motion));
  }
  assert.match(css, /74s linear infinite/);
  assert.match(css, /97s/);
  assert.match(css, /39s ease-in-out infinite/);
  assert.doesNotMatch(css, /animation:.*steps\(/);
});

test('4: the ETERNYX core stays fixed while orbit layers move', () => {
  const core = css.split('.eternyx-constellation__core {')[1]?.split('}')[0];
  assert.ok(core);
  assert.match(core, /transform: translate\(-50%, -50%\)/);
  assert.doesNotMatch(core, /animation:/);
  assert.match(css, /\.eternyx-constellation__track--inner/);
});

test('5: the orbital scene respects all five swatches via root tokens', () => {
  const palette = read('src/styles/eternyx-palettes.css');
  for (const swatch of ['cyan','violet','emerald','bronze','rose']) {
    assert.ok(palette.includes(":root[data-eternyx-palette='" + swatch + "']"));
  }
  assert.match(css, /hsl\(var\(--primary\)/);
  assert.match(css, /hsl\(var\(--accent\)/);
  assert.match(css, /hsl\(var\(--card\)/);
  assert.doesNotMatch(css, /#[a-f0-9]{6}\b/i);
});

test('6: mobile and reduced-motion safeguards preserve a usable static illustration', () => {
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.eternyx-constellation__node \{ animation: none !important; \}/);
  assert.match(css, /contain: layout paint/);
});
