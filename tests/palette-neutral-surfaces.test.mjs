import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const tailwind = read('tailwind.config.ts');
const palette = read('src/styles/eternyx-palettes.css');
const auth = read('src/styles/lamp-auth.css');

test('neutral palettes tint all legacy panel and text utilities with the selected hue', () => {
  assert.match(tailwind, /const neutralScale = \(offset = 0, saturation = 9\)/);
  assert.match(tailwind, /--eternyx-color-hue/);
  assert.match(tailwind, /<alpha-value>/);
  for (const family of ['slate','gray','zinc','neutral','stone']) {
    assert.match(tailwind, new RegExp('\\b' + family + ': neutralScale\\('));
  }
  for (const tone of [50,100,200,300,400,500,600,700,800,900,950]) {
    assert.match(tailwind, new RegExp('\\b' + tone + ': \\d+'));
  }
});

test('five swatches remain independently selectable with consistent surface luminance', () => {
  for (const name of ['cyan','violet','emerald','bronze','rose']) {
    assert.ok(palette.includes(":root[data-eternyx-palette='" + name + "']"));
  }
  assert.match(tailwind, /900: 10, 950: 5/);
  assert.match(tailwind, /50: 98, 100: 96/);
  assert.match(palette, /--sidebar-background: var\(--card\)/);
});

test('login modal, reset password, Settings and back button use themed surfaces', () => {
  for (const path of [
    'src/components/AuthModal.tsx',
    'src/pages/ResetPassword.tsx',
    'src/pages/Settings.tsx',
    'src/components/BackButton.tsx',
  ]) {
    const content = read(path);
    assert.match(content, /bg-(?:card|background)/, path);
    assert.doesNotMatch(content, /bg-\[#(?:030712|08111f|0a1020|080f1e|0a1322|0d192b|0a1221|09111f)\]/, path);
  }
});

test('error and warning hues remain unchanged, while accessible contrast and auth lighting persist', () => {
  for (const family of ['rose','red','emerald','green','orange','amber','yellow']) {
    assert.doesNotMatch(tailwind, new RegExp('\\b' + family + ': neutralScale\\('));
  }
  assert.match(palette, /html\.high-contrast\[data-eternyx-palette\]/);
  assert.match(auth, /\.lamp-auth-page\[data-light='off'\]\s*\{\s*background: #020304/);
  assert.match(auth, /\.lamp-auth-page\[data-light='off'\] \.lamp-auth-form:focus-within/);
});
