import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const section = read('src/components/ui/cyber-section.tsx');
const config = read('tailwind.config.ts');

test('shared CyberSection variants use generated, palette-reactive Tailwind class names', () => {
  for (const token of [
    'from-primary/10', 'to-accent/5', 'border-primary/20',
    'bg-background/50', 'bg-background/80', 'border-border/50',
    'text-primary', 'from-primary/20', 'via-accent/10', 'via-primary/50'
  ]) assert.ok(section.includes(token), token);
  assert.doesNotMatch(section, /from-\$\{glowColor\}/);
  assert.doesNotMatch(section, /border-\$\{glowColor\}/);
  assert.doesNotMatch(section, /text-\$\{glowColor\}/);
  assert.match(config, /primary: \{/);
  assert.match(config, /accent: \{/);
});

test('previously fixed workspaces and shared loading terminal follow semantic surfaces', () => {
  for (const path of [
    'src/pages/AdminContactSubmissions.tsx',
    'src/pages/EliteDevelopmentTeam.tsx',
    'src/pages/AIResearchStudio.tsx',
    'src/components/RouteTerminal.tsx'
  ]) {
    const source = read(path);
    assert.match(source, /bg-(?:card|background)/, path);
    assert.doesNotMatch(source, /bg-\[#(?:0a1221|0a1322|0b1424|070b14|040c08)\]/, path);
  }
});

test('five swatches and security status colors are preserved', () => {
  const css = read('src/styles/eternyx-palettes.css');
  for (const p of ['cyan', 'violet', 'emerald', 'bronze', 'rose']) {
    assert.ok(css.includes(":root[data-eternyx-palette='" + p + "']"));
  }
  assert.match(read('src/components/RouteTerminal.tsx'), /text-emerald-200/);
  assert.match(read('src/styles/lamp-auth.css'), /background: #020304;/);
});
