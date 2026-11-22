import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const cards = read('src/components/home/SectionCard.tsx');
const headings = read('src/components/ui/responsive-text.tsx');
const themes = read('src/styles/section-themes.css');
const enquiries = read('src/pages/AdminContactSubmissions.tsx');

test('1: shared headings use generated global accent gradient classes and respect reduced motion', () => {
  assert.match(headings, /from-primary to-accent bg-clip-text/);
  assert.doesNotMatch(headings, /from-\$\{glowColor\}/);
  assert.match(headings, /motion-safe:animate-pulse/);
});

test('2: pillar cards now use palette-driven background, icon and glow effects', () => {
  assert.match(cards, /background: 'linear-gradient\(140deg, hsl\(var\(--primary\)/);
  assert.match(cards, /stroke="hsl\(var\(--primary\)\)"/);
  assert.match(cards, /backgroundImage: 'radial-gradient\(circle, hsl\(var\(--primary\)\)/);
  assert.doesNotMatch(cards, /\$\{section\.accentColor\}/);
  assert.doesNotMatch(cards, /background: section\.gradient/);
});

test('3: pillar cards can be activated from keyboard with visible focus', () => {
  for (const expected of ['role="link"', 'tabIndex={0}', "event.key === 'Enter'", "event.key === ' '", 'focus-visible:ring-primary']) {
    assert.ok(cards.includes(expected), expected);
  }
});

test('4: legacy section-level themes inherit all five palette tokens and reduced motion', () => {
  assert.match(themes, /:root\[data-eternyx-palette\] \[data-theme\]/);
  for (const token of ['--section-primary: var(--primary)','--section-accent: var(--primary)','--section-bg: var(--background)','--section-aurora-1: hsl(var(--primary) / .15)']) {
    assert.ok(themes.includes(token), token);
  }
  assert.match(themes, /prefers-reduced-motion: reduce/);
});

test('5: business inquiry decorative UI follows primary while status badges retain meanings', () => {
  assert.match(enquiries, /bg-primary\/\[0\.06\] blur/);
  assert.match(enquiries, /border-primary\/15 bg-primary\/\[0\.06\]/);
  assert.match(enquiries, /text-primary hover:text-foreground/);
  assert.match(enquiries, /completed: 'border-emerald-300\/20/);
  assert.match(enquiries, /urgent: 'text-rose-200'/);
});

test('all five swatches, auth lamp darkness and account themes remain intact', () => {
  const css = read('src/styles/eternyx-palettes.css');
  for (const swatch of ['cyan','violet','emerald','bronze','rose']) {
    assert.ok(css.includes(":root[data-eternyx-palette='" + swatch + "']"));
  }
  assert.match(read('src/styles/lamp-auth.css'), /background: #020304;/);
});
