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
    'src/data/tools.ts',
    'src/lib/tools.tsx',
  ];

  for (const path of retiredPaths) {
    assert.equal(await exists(path), false, `${path} should remain retired`);
  }
});

test('legacy dashboard and catalogue URLs resolve to the real Explore surface', async () => {
  const app = await read('src/App.tsx');

  assert.match(app, /<Route path="\/dashboard" element={<Navigate to="\/explore" replace \/>} \/>/);
  assert.match(app, /<Route path="\/tools" element={<Navigate to="\/explore" replace \/>} \/>/);
  assert.match(app, /<Route path="\/tools\/category\/:categoryId" element={<Navigate to="\/explore" replace \/>} \/>/);
  assert.doesNotMatch(app, /import\(["']\.\/pages\/(?:UnifiedDashboard|Tools|ToolCategoryPage)["']\)/);
});

test('profile keeps real account management without fabricated arsenal progression', async () => {
  const profile = await read('src/pages/Profile.tsx');

  assert.match(profile, /updateProfile/);
  assert.match(profile, /\.from\('profiles'\)/);
  assert.match(profile, /handleSave/);
  assert.match(profile, /handlePrivacyUpdate/);
  assert.match(profile, /onClick={signOut}/);
  assert.doesNotMatch(profile, /fetchTools|userTools|loadingTools|ARSENAL|\bXP\b|\bLVL\b|handleDeleteAccount/);
});
