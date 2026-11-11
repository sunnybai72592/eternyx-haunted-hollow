import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = async (path) => {
  try {
    await access(new URL(`../${path}`, import.meta.url));
    return true;
  } catch {
    return false;
  }
};

test('retired legacy dashboard and fake tool engine are no longer shipped', async () => {
  const retiredPaths = [
    'src/pages/UnifiedDashboard.tsx',
    'src/pages/Tools.tsx',
    'src/pages/ToolCategoryPage.tsx',
    'src/components/SimpleToolCard.tsx',
    'src/components/ToolCard.tsx',
    'src/components/ToolsGrid.tsx',
    'src/pages/tools/NetworkScanner.tsx',
    'src/pages/tools/CodeAnalyzer.tsx',
    'src/data/tools.ts',
    'src/lib/tools.tsx',
    'tests/legacy-tool-card-interaction.test.mjs',
  ];

  for (const path of retiredPaths) {
    assert.equal(await exists(path), false, `${path} should remain retired`);
  }
});

test('legacy dashboard opens the account center while retired catalogue URLs resolve to Explore', async () => {
  const app = await read('src/App.tsx');

  assert.match(app, /<Route path="\/dashboard" element={<Navigate to="\/account" replace \/>} \/>/);
  assert.match(app, /<Route path="\/tools" element={<Navigate to="\/explore" replace \/>} \/>/);
  assert.match(app, /<Route path="\/tools\/category\/:categoryId" element={<Navigate to="\/explore" replace \/>} \/>/);
  assert.ok(app.includes('<Route path="/tools/network-scanner" element={<Navigate to="/explore" replace />} />'));
  assert.ok(app.includes('<Route path="/tools/code-analyzer" element={<Navigate to="/explore" replace />} />'));
  for (const retiredImport of [
    'import("./pages/UnifiedDashboard")',
    'import("./pages/Tools")',
    'import("./pages/ToolCategoryPage")',
    'import("./pages/tools/NetworkScanner")',
    'import("./pages/tools/CodeAnalyzer")',
  ]) {
    assert.equal(app.includes(retiredImport), false, `${retiredImport} should not be imported`);
  }
});

test('the retained public exposure check does not invent scan progress or capabilities', async () => {
  const scanner = await read('src/pages/VulnerabilityScanner.tsx');

  assert.match(scanner, /toolExecutionService\.executeVulnerabilityScanner/);
  assert.match(scanner, /Public CVE & HTTP Security Check/);
  assert.match(scanner, /not a full vulnerability assessment/);
  assert.doesNotMatch(scanner, /setInterval|setTimeout|Math\.random|Zero-Day Detection|Military-grade|AI-powered analysis/);
});

test('profile keeps real account management without fabricated arsenal progression', async () => {
  const profile = await read('src/pages/Profile.tsx');

  assert.match(profile, /useAuthStore/);
  assert.match(profile, /updateProfile/);
  assert.match(profile, /ProfileAvatarUploader/);
  assert.doesNotMatch(profile, /\.from\('profiles'\)/);
  assert.match(profile, /handleSave/);
  assert.match(profile, /handlePrivacyUpdate/);
  assert.match(profile, /updateProfile\(local\)/);
  assert.doesNotMatch(profile, /fetchTools|userTools|loadingTools|ARSENAL|\bXP\b|\bLVL\b|handleDeleteAccount/);
});

test('profile avatar upload and public URL use the provisioned storage bucket', async () => {
  const uploader = await read('src/components/ProfileAvatarUploader.tsx');
  const migration = await read('supabase/migrations/20251004122829_a8554bfe-efa3-4057-858d-edee58f73e61.sql');

  assert.match(migration, /'avatars'/);
  assert.match(uploader, /storage\\s*\\.from\\('avatars'\\)\\s*\\.upload/);
  assert.match(uploader, /storage\\.from\\('avatars'\\)\\.getPublicUrl/);
  assert.doesNotMatch(uploader, /user-avatars/);
});
