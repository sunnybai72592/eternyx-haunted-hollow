import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const config = read('tailwind.config.ts');
const palette = read('src/styles/eternyx-palettes.css');
const css = read('src/index.css');
const store = read('src/lib/eternyxPalette.ts');
const app = read('src/App.tsx');

test('all five original auth swatches drive the same root hue and semantic tokens', () => {
  const hues = {cyan: 181, violet: 270, emerald: 157, bronze: 28, rose: 336};
  for (const [name, hue] of Object.entries(hues)) {
    const section = palette.split(":root[data-eternyx-palette='" + name + "'] {")[1]?.split('}')[0];
    assert.ok(section, name + ' palette definition missing');
    assert.match(section, new RegExp('--eternyx-color-hue: ' + hue + ';'));
    assert.match(section, /--eternyx-color-saturation:\s*\d+%/);
    assert.match(section, /--primary:/);
    assert.match(store, new RegExp("id: '" + name + "'"));
  }
  assert.match(store, /document\.documentElement\.dataset\.eternyxPalette/);
  assert.match(app, /<EternyxPaletteDock floating/);
});

test('Tailwind decorator scales apply across nine color families and all utility variants', () => {
  assert.match(config, /const paletteScale = \(hueShift = 0\)/);
  assert.match(config, /<alpha-value>/);
  assert.match(config, /--eternyx-color-hue/);
  assert.match(config, /--eternyx-color-saturation/);
  for (const family of ['cyan','sky','blue','indigo','violet','purple','fuchsia','pink','teal']) {
    assert.match(config, new RegExp('\\b' + family + ': paletteScale\\('));
  }
  for (const level of ['50','100','200','300','400','500','600','700','800','900','950']) {
    assert.match(config, new RegExp('\\b' + level + ': \\d+'));
  }
  assert.match(config, /'cyber-cyan': 'hsl\(var\(--cyber-cyan\) \/ <alpha-value>\)'/);
  assert.match(config, /'neon-purple': 'hsl\(var\(--neon-purple\) \/ <alpha-value>\)'/);
});

test('errors, statuses and security alerts retain their explicit semantic colors', () => {
  // Do not remap these shades: red/rose are errors, green/emerald success,
  // orange/amber/yellow warnings. Theme accent is orthogonal to status.
  for (const color of ['red','rose','green','emerald','orange','amber','yellow']) {
    assert.doesNotMatch(config, new RegExp('\\b' + color + ': paletteScale\\('));
  }
  assert.match(palette, /html\.high-contrast\[data-eternyx-palette\]/);
  assert.match(palette, /--foreground: 0 0% 100%/);
});

test('formerly fixed core neon glows now derive from palette variables', () => {
  for (const path of [
    'src/components/home/SectionSelector.tsx',
    'src/pages/AccountCenter.tsx',
    'src/pages/Profile.tsx',
    'src/components/AuthModal.tsx',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /rgba\((?:34,211,238|6,182,212|103,232,249|139,92,246),/);
    assert.match(source, /hsl\(var\(--(?:primary|accent)\)/);
  }
  assert.doesNotMatch(css, /rgba\(\s*(?:0,\s*255,\s*136|0,\s*191,\s*255|138,\s*43,\s*226|6,\s*182,\s*212)\s*,/);
  assert.match(css, /hsl\(var\(--cyber-pink\)/);
});

test('all standard tailwind design tokens and sidebar controls use the selected palette', () => {
  for (const token of [
    '--primary','--accent','--ring','--gradient-cyber','--sidebar-primary',
    '--sidebar-accent','--sidebar-border','--sidebar-ring'
  ]) assert.ok(palette.includes(token), token + ' missing');
  assert.match(palette, /\[data-eter-theme='matrix'\]/);
  assert.match(palette, /\[data-eter-theme='dark'\]/);
});
