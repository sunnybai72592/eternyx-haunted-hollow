import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('1: EnhancedButton variants use statically detectable global palette classes', () => {
  const c = read('src/components/ui/enhanced-button.tsx');
  assert.match(c, /from-primary\/20 to-accent\/20/);
  assert.match(c, /border-primary\/60/);
  assert.match(c, /before:via-primary\/20/);
  for (const x of ['border-', 'text-', 'bg-', 'shadow-', 'from-', 'via-', 'to-']) {
    assert.ok(!c.includes(x + '${glowColor}'), x + ' dynamically generated');
  }
});

test('2: EnhancedButton glow/glitch animations respect reduced motion', () => {
  const c = read('src/components/ui/enhanced-button.tsx');
  assert.match(c, /motion-safe:animate-pulse/);
  assert.match(c, /motion-safe:animate-ping/);
  assert.match(c, /motion-safe:hover:animate-pulse/);
});

test('3: all CyberCard variants use stable palette utilities', () => {
  const c = read('src/components/ui/cyber-card.tsx');
  assert.match(c, /bg-card\/80 border-border\/50/);
  assert.match(c, /from-primary\/15 via-accent\/10 to-primary\/5/);
  assert.match(c, /border-primary\/50 hover:border-primary/);
  assert.match(c, /from-primary\/0 via-primary\/10 to-primary\/0/);
  assert.doesNotMatch(c, /(?:border|text|bg|shadow|via|from)-\$\{glowColor\}/);
});

test('4: interactive CyberCards are keyboard accessible; passive cards stay passive', () => {
  const c = read('src/components/ui/cyber-card.tsx');
  assert.match(c, /role=\{onClick \? 'button' : undefined\}/);
  assert.match(c, /tabIndex=\{onClick \? 0 : undefined\}/);
  assert.ok(c.includes("event.key === 'Enter' || event.key === ' '"));
  assert.match(c, /focus-visible:ring-primary/);
});

test('5: blocked storage does not wipe the chosen palette or DOM event sync', () => {
  const c = read('src/lib/eternyxPalette.ts');
  assert.match(c, /document\.documentElement\.dataset\.eternyxPalette/);
  assert.match(c, /if \(saved !== null\) return normalizeEternyxPalette\(saved\)/);
  assert.match(c, /applyEternyxPalette\(next\)/);
  for (const swatch of ['cyan','violet','emerald','bronze','rose']) {
    assert.match(c, new RegExp("id: '" + swatch + "'"));
  }
});

test('6: home pillar card animations honor reduced motion while retaining keyboard actions', () => {
  const c = read('src/components/home/SectionCard.tsx');
  assert.match(c, /useReducedMotion/);
  assert.match(c, /initial=\{prefersReducedMotion \? false/);
  assert.match(c, /duration: prefersReducedMotion \? 0/);
  assert.match(c, /whileTap=\{prefersReducedMotion \? undefined/);
  assert.match(c, /role="link"/);
  assert.ok(c.includes("event.key === 'Enter' || event.key === ' '"));
});

test('auth lamp, global palette dock and semantic statuses stay intact', () => {
  assert.match(read('src/styles/lamp-auth.css'), /background: #020304;/);
  assert.match(read('src/App.tsx'), /<EternyxPaletteDock floating/);
  assert.match(read('tailwind.config.ts'), /--eternyx-color-hue/);
});
