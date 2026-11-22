import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const config = read('tailwind.config.ts');
const palette = read('src/styles/eternyx-palettes.css');
const lamp = read('src/styles/lamp-auth.css');

test('all semantic Tailwind tokens support opacity utilities used by every route', () => {
  const tokens = [
    'border','input','ring','background','foreground',
    'primary','primary-foreground','secondary','secondary-foreground',
    'destructive','destructive-foreground','muted','muted-foreground',
    'accent','accent-foreground','popover','popover-foreground',
    'card','card-foreground','sidebar-background','sidebar-foreground',
    'sidebar-primary','sidebar-primary-foreground','sidebar-accent',
    'sidebar-accent-foreground','sidebar-border','sidebar-ring',
  ];
  for (const token of tokens) {
    const fragment = `hsl(var(--${token}) / <alpha-value>)`;
    assert.ok(config.includes(fragment), token + ' is missing alpha modifier support');
  }
});

test('each of the five palettes tints shared surfaces as well as accent colors', () => {
  for (const name of ['cyan','violet','emerald','bronze','rose']) {
    assert.ok(palette.includes(`:root[data-eternyx-palette='${name}']`), name);
  }
  for (const surface of ['background','card','popover','muted','input','secondary']) {
    assert.match(palette, new RegExp('--' + surface + ': var\\(--eternyx-color-hue\\)'));
  }
  assert.match(palette, /--sidebar-primary: var\(--primary\)/);
});

test('core pillars and account pages use shared palette surfaces rather than rigid blue-black backgrounds', () => {
  const routes = [
    'src/pages/CybersecurityHub.tsx',
    'src/pages/BlackHatPentesting.tsx',
    'src/pages/DeveloperStudio.tsx',
    'src/pages/AIVideoStudio.tsx',
    'src/pages/AIImageStudio.tsx',
    'src/pages/Profile.tsx',
    'src/pages/AccountCenter.tsx',
    'src/components/home/SectionSelector.tsx',
  ];
  for (const path of routes) {
    const content = read(path);
    assert.match(content, /bg-(?:background|card)(?:\b|\/)/, path);
    assert.doesNotMatch(content, /bg-\[#(?:070b13|070b14|050914|0c1421|080f1b|101c2c|111a2a|0b1b2b|0a1221|0a1322|0a1020|080f1e|070e19|09111f|0d192b)\]/, path);
  }
});

test('the cinematic auth lamp remains near-black when off and the focused form remains legible', () => {
  assert.match(lamp, /\.lamp-auth-page\[data-light='off'\]\s*\{\s*background: #020304/);
  assert.match(lamp, /\.lamp-auth-page\[data-light='off'\] \.lamp-auth-form:focus-within/);
  assert.match(lamp, /prefers-reduced-motion: reduce/);
});

test('status colors and account theme options are not overwritten by global palette changes', () => {
  assert.doesNotMatch(palette, /--destructive:/);
  assert.match(palette, /\[data-eter-theme='matrix'\]/);
  assert.match(palette, /\[data-eter-theme='dark'\]/);
});
