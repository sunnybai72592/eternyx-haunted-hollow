import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

async function helpers() {
  const source = await read('src/lib/serviceRequestPanels.ts');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(js, { exports: module.exports, module, URL, URLSearchParams });
  return module.exports;
}

const ID = '123e4567-e89b-42d3-a456-426614174001';
const requestLink = (panel) => '?request=' + ID + '&panel=' + panel;

test('customer section deep links are allowlisted and admin triage is private', async () => {
  const { readRequestPanel } = await helpers();
  for (const panel of ['conversation', 'scope', 'clarifications', 'brief-changes', 'journal']) {
    assert.equal(readRequestPanel(requestLink(panel), 'customer'), panel);
    assert.equal(readRequestPanel(requestLink(panel), 'admin'), panel);
  }
  assert.equal(readRequestPanel(requestLink('triage'), 'admin'), 'triage');
  assert.equal(readRequestPanel(requestLink('triage'), 'customer'), null);
  assert.equal(readRequestPanel(requestLink('unknown'), 'customer'), null);
  assert.equal(readRequestPanel(requestLink('<script>'), 'admin'), null);
  assert.equal(readRequestPanel('?panel=conversation', 'customer'), null);
  assert.equal(readRequestPanel('?request=invalid&panel=conversation', 'customer'), null);
  assert.equal(readRequestPanel('?request=' + ID, 'customer'), null);
  assert.equal(readRequestPanel(requestLink('conversation') + '&panel=journal', 'admin'), null);
  assert.equal(readRequestPanel(requestLink('conversation') + '&request=' + ID, 'admin'), null);
  assert.equal(readRequestPanel(requestLink('conversation') + '&queue=all', 'customer'), null);
});

test('section link builder emits only fixed route, valid UUID and panel', async () => {
  const { buildRequestPanelLink } = await helpers();
  assert.equal(
    buildRequestPanelLink('https://eternyx.example/path?old=secret#hash', ID, 'customer', 'journal'),
    'https://eternyx.example/services/requests?request=' + ID + '&panel=journal',
  );
  assert.equal(
    buildRequestPanelLink('https://eternyx.example', ID, 'admin', 'triage'),
    'https://eternyx.example/admin/service-requests?request=' + ID + '&panel=triage',
  );
  assert.throws(() => buildRequestPanelLink('https://eternyx.example', ID, 'customer', 'triage'));
  assert.throws(() => buildRequestPanelLink('https://eternyx.example', ID, 'admin', '../../auth'));
  assert.throws(() => buildRequestPanelLink('https://eternyx.example', '../attack', 'admin', 'triage'));
  assert.throws(() => buildRequestPanelLink('https://eternyx.example', 'not-a-uuid', 'customer', 'scope'));
});

test('section action is explicitly authenticated and admin roles are verified again', async () => {
  const src = await read('src/components/services/ServiceRequestSectionLinks.tsx');
  assert.match(src, /supabase\.auth\.getUser\(\)/);
  assert.match(src, /user\.id !== viewerId/);
  assert.match(src, /currentKey\.current !== viewerKey/);
  assert.match(src, /if \(mode === 'admin'\)/);
  assert.match(src, /supabase\.rpc\('is_admin'\)/);
  assert.match(src, /verifiedAdmin !== true/);
  assert.match(src, /user\.id !== ownerId/);
  assert.match(src, /if \(currentKey\.current !== key\) return/);
  assert.match(src, /if \(currentKey\.current === key\) navigate\(relative\)/);
  assert.match(src, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(src, /buildRequestPanelLink\(window\.location\.origin, requestId, mode, panel\)/);
  assert.doesNotMatch(src, /service_role|localStorage|sessionStorage|\.insert\(|\.update\(|\.delete\(/);
});

test('section picker is accessible and does not expose admin-only options to customers', async () => {
  const src = await read('src/components/services/ServiceRequestSectionLinks.tsx');
  assert.match(src, /const panels = mode === 'admin' \? adminRequestPanels : customerRequestPanels/);
  assert.match(src, /const viewerKey = mode \+ ':'/);
  assert.match(src, /setPanel\('conversation'\)/);
  assert.match(src, /setWorking\(null\)/);
  assert.match(src, /setFeedback\(''\)/);
  assert.match(src, /label htmlFor=/);
  assert.match(src, /Open or share a request section/);
  assert.match(src, /Open section/);
  assert.match(src, /Copy section link/);
  assert.match(src, /disabled=\{working !== null \|\| !viewerId\}/);
  assert.match(src, /role="status"/);
  assert.match(src, /Links include a request reference and the chosen section/);
});

test('owner focused link renders the requested section once, with private UUID lookup', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  assert.match(src, /const selectedPanel = readRequestPanel\(location\.search, 'customer'\)/);
  assert.match(src, /setOpenConversation\(!selectedPanel \|\| selectedPanel === 'conversation' \? selected : null\)/);
  assert.match(src, /supabase\.from\('service_customer_amendment_queue'\)/);
  assert.match(src, /\.eq\('user_id', userId\)/);
  assert.match(src, /\.eq\('id', selected\)/);
  assert.match(src, /selectedPanel !== null \|\| !visibleRows\.some/);
  assert.match(src, /if \(selectedPanel && visibleLinkedRequest\?\.id === item\.id\) return null/);
  assert.match(src, /selectedPanel === 'conversation'/);
  assert.match(src, /selectedPanel === 'scope'/);
  assert.match(src, /selectedPanel === 'clarifications'/);
  assert.match(src, /selectedPanel === 'brief-changes'/);
  assert.match(src, /selectedPanel === 'journal'/);
  assert.match(src, /<ServiceRequestSectionLinks requestId=\{visibleLinkedRequest\.id\} ownerId=\{user\.id\} mode="customer"/);
  assert.match(src, /<ServiceRequestSectionLinks requestId=\{item\.id\} ownerId=\{user\.id\} mode="customer"/);
  assert.match(src, /selectedPanel \|\| selectedPanel ===/);
});

test('admin request links restore one verified panel and preserve legacy URL filtering', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /const selectedPanel = readRequestPanel\(location\.search, 'admin'\)/);
  assert.match(src, /if \(!authorized\) return/);
  assert.match(src, /setActiveSearchField\('id'\)/);
  assert.match(src, /setActiveSearch\(selected\)/);
  for (const panel of [
    ['conversation', 'setOpenConversation'],
    ['scope', 'setOpenScope'],
    ['triage', 'setOpenTriage'],
    ['clarifications', 'setOpenClarifications'],
    ['brief-changes', 'setOpenAmendments'],
    ['journal', 'setOpenJournal'],
  ]) assert.ok(src.includes(panel[1] + "(selectedPanel === '" + panel[0] + "' ? selected : null)"), panel.join(' '));
  assert.match(src, /\[authorized, location\.search, selectedPanel\]/);
  assert.match(src, /<ServiceRequestSectionLinks requestId=\{item\.id\} ownerId=\{item\.user_id\} mode="admin"/);
  assert.match(src, /supabase\.rpc\('is_admin'\)/);
  assert.match(src, /const authorized = !!user && authorizedFor === user\.id/);
});

test('legacy whole-request deep links and queue focus links still have distinct meanings', async () => {
  const owner = await read('src/pages/MyServiceRequests.tsx');
  const admin = await read('src/pages/AdminServiceRequests.tsx');
  const helper = await read('src/lib/serviceRequestPanels.ts');
  assert.match(owner, /\/services\/requests\?request=/);
  assert.match(admin, /\/admin\/service-requests\?request=/);
  assert.match(owner, /readQueuePreset\(location\.search, 'customer'\)/);
  assert.match(admin, /readQueuePreset\(location\.search, 'admin'\)/);
  assert.match(helper, /query\.has\('queue'\)/);
  assert.match(helper, /query\.getAll\('request'\)\.length !== 1/);
  assert.match(helper, /query\.getAll\('panel'\)\.length !== 1/);
  assert.doesNotMatch(helper, /localStorage|sessionStorage|service_role/);
});

test('Phase 18 does not change SQL and documents real account handoff testing', async () => {
  const doc = await read('docs/ETERNYX_SERVICES_REQUEST_HANDOFF_PHASE18.md');
  assert.match(doc, /no new SQL migration/i);
  assert.match(doc, /Phase 13 before Phase 14/i);
  assert.match(doc, /customer A[\s\S]*customer B[\s\S]*administrator/i);
  assert.match(doc, /connection timeout/i);
  assert.match(doc, /read receipts/i);
  assert.match(doc, /Browser Back and Forward/);
});
