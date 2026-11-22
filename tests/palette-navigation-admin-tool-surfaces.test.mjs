import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const shared = [
  'src/components/Footer.tsx',
  'src/components/MobileResponsiveNavigation.tsx',
  'src/components/ProfileAvatarUploader.tsx',
  'src/components/auth/UserProfile.tsx',
];
const routes = [
  'src/pages/VulnerabilityScanner.tsx',
  'src/pages/AdminBugReports.tsx',
  'src/pages/AdminUsers.tsx',
  'src/pages/AdminSecurityMonitoring.tsx',
  'src/pages/AdminOverview.tsx',
  'src/pages/Premium.tsx',
  'src/pages/Hacked.tsx',
];

test('main navigation, mobile menu, footer and account surfaces honor the global palette', () => {
  for (const path of shared) {
    const source = read(path);
    assert.match(source, /bg-(?:background|card|muted)/, path);
    assert.doesNotMatch(source, /bg-\[#[a-f0-9]{6}\]/i, path);
  }
  assert.match(read('src/components/MobileResponsiveNavigation.tsx'), /bg-background\/95/);
  assert.match(read('src/components/MobileResponsiveNavigation.tsx'), /bg-card\/\[\.98\]/);
  assert.match(read('src/components/Footer.tsx'), /hsl\(var\(--primary\)\/\.8\)/);
  assert.match(read('src/components/ProfileAvatarUploader.tsx'), /hsl\(var\(--primary\)\/\.045\)/);
});

test('security tools and administrator routes no longer force blue-black surfaces', () => {
  for (const path of routes) {
    const source = read(path);
    assert.match(source, /bg-(?:background|card|muted)/, path);
    assert.doesNotMatch(source, /bg-\[#[a-f0-9]{6}\]/i, path);
  }
  assert.match(read('src/pages/VulnerabilityScanner.tsx'), /bg-background/);
  assert.match(read('src/pages/AdminBugReports.tsx'), /bg-card/);
});

test('shared palette still supports five swatches, contrast and real error/status colors', () => {
  const palette = read('src/styles/eternyx-palettes.css');
  const config = read('tailwind.config.ts');
  for (const name of ['cyan', 'violet', 'emerald', 'bronze', 'rose']) {
    assert.ok(palette.includes(":root[data-eternyx-palette='" + name + "']"));
  }
  assert.match(config, /DEFAULT: 'hsl\(var\(--card\) \/ <alpha-value>\)'/);
  assert.match(config, /background: 'hsl\(var\(--background\) \/ <alpha-value>\)'/);
  assert.doesNotMatch(config, /red: paletteScale\(/);
  assert.doesNotMatch(config, /emerald: neutralScale\(/);
  assert.match(read('src/styles/lamp-auth.css'), /background: #020304;/);
});
