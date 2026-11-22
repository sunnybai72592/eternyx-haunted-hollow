import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const nav = read('src/components/MobileResponsiveNavigation.tsx');
const arsenal = read('src/pages/AIArsenal.tsx');
const settings = read('src/pages/Settings.tsx');
const css = read('src/styles/eternyx-palettes.css');

test('desktop/mobile navigation uses global palette for icons, links and CTA contrast', () => {
  assert.doesNotMatch(nav, /(?:text|border|bg|ring)-cyan-\d+/);
  assert.match(nav, /border-primary\/25/);
  assert.match(nav, /focus-visible:ring-primary/);
  assert.match(nav, /bg-primary px-4 py-2\.5 text-sm font-bold text-primary-foreground/);
  assert.match(nav, /bg-primary text-sm font-bold text-primary-foreground/);
  assert.match(nav, /mobileOpen/);
  assert.match(nav, /aria-label="Main navigation"/);
});

test('AI Arsenal uses semantic accents without overriding semantic status colors', () => {
  assert.doesNotMatch(arsenal, /(?:text|border|bg|ring)-(?:cyan|violet|fuchsia)-\d+/);
  assert.match(arsenal, /eternyx-arsenal-hero/);
  assert.match(arsenal, /bg-primary text-primary-foreground/);
  assert.match(arsenal, /border-primary\/20/);
  assert.match(css, /\.eternyx-arsenal-hero\s*\{/);
});

test('Settings theme choices remain distinct from the global five accent palettes', () => {
  assert.match(settings, /normalizeAccountTheme\(profile\?\.preferences\?\.theme\)/);
  assert.match(settings, /updateProfile\(\{/);
  assert.match(settings, /applyAccountTheme\(theme\)/);
  assert.match(settings, /eternyx-settings-hero-glow/);
  assert.match(settings, /eternyx-theme-gradient/);
  assert.doesNotMatch(settings, /(?:text|border|bg|ring)-(?:cyan|violet|fuchsia)-\d+/);
  assert.match(css, /\.eternyx-settings-hero-glow\s*\{/);
  assert.match(css, /\.eternyx-theme-gradient\s*\{/);
});

test('colors are inherited from root tokens and contrast stays semantic', () => {
  assert.match(css, /:root\[data-eternyx-palette='violet'\]/);
  assert.match(css, /:root\[data-eternyx-palette='bronze'\]/);
  assert.match(css, /:root\[data-eternyx-palette='rose'\]/);
  assert.match(css, /--primary-foreground:/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
