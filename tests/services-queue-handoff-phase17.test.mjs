import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (name) => readFile(new URL('../' + name, import.meta.url), 'utf8');

async function helpers() {
  const src = await read('src/lib/serviceQueueViews.ts');
  const output = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(output, { exports: module.exports, module, URL, URLSearchParams });
  return module.exports;
}

test('queue presets have strict customer/admin allowlists and request-link precedence', async () => {
  const { readQueuePreset } = await helpers();
  assert.equal(readQueuePreset('?queue=activity', 'customer'), 'activity');
  assert.equal(readQueuePreset('?queue=answers', 'customer'), 'answers');
  assert.equal(readQueuePreset('?queue=brief-reviews', 'customer'), 'brief-reviews');
  assert.equal(readQueuePreset('?queue=all', 'customer'), 'all');
  assert.equal(readQueuePreset('?queue=follow-up', 'admin'), 'follow-up');
  assert.equal(readQueuePreset('?queue=clarifications', 'admin'), 'clarifications');
  assert.equal(readQueuePreset('?queue=unassigned', 'admin'), 'unassigned');
  assert.equal(readQueuePreset('?queue=activity', 'admin'), null);
  assert.equal(readQueuePreset('?queue=unassigned', 'customer'), null);
  assert.equal(readQueuePreset('?queue=%3Cscript%3E', 'admin'), null);
  assert.equal(readQueuePreset('?queue=all&queue=activity', 'customer'), null);
  assert.equal(readQueuePreset('?request=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa&queue=activity', 'customer'), null);
  assert.equal(readQueuePreset('?queue=answers&request=x', 'admin'), null);
  assert.equal(readQueuePreset('', 'customer'), null);
});

test('copied links contain only the origin, official route and one allowlisted task filter', async () => {
  const { buildQueuePresetLink } = await helpers();
  assert.equal(
    buildQueuePresetLink('https://eternyx.example/path?secret=token', 'customer', 'answers'),
    'https://eternyx.example/services/requests?queue=answers',
  );
  assert.equal(
    buildQueuePresetLink('https://eternyx.example', 'admin', 'clarifications'),
    'https://eternyx.example/admin/service-requests?queue=clarifications',
  );
  assert.throws(() => buildQueuePresetLink('https://eternyx.example', 'customer', 'unassigned'));
  assert.throws(() => buildQueuePresetLink('https://eternyx.example', 'admin', '../../auth'));
});

test('CSV cells are quoted and spreadsheet-formula entries are neutralized', async () => {
  const { escapeServiceCsvCell } = await helpers();
  for (const cell of ['=HYPERLINK("https://example.com")', '+CMD', '-1+5', '@SUM(A1:A2)', '  =SUM(1,2)', '\t+cmd', '\uFEFF=evil']) {
    const value = escapeServiceCsvCell(cell);
    assert.ok(value.startsWith("\"'"), 'Formula prefix missing: ' + JSON.stringify(cell));
    assert.ok(value.endsWith('"'));
  }
  assert.equal(escapeServiceCsvCell('simple'), '"simple"');
  assert.equal(escapeServiceCsvCell('comma, and "quotes"'), '"comma, and ""quotes"""');
  assert.equal(escapeServiceCsvCell(null), '""');
  assert.equal(escapeServiceCsvCell(5), '"5"');
});

test('CSV builder produces UTF-8 BOM, CRLF rows and rejects mismatched columns', async () => {
  const { buildServiceQueueCsv } = await helpers();
  const output = buildServiceQueueCsv(['Reference', 'Title'], [
    ['111', 'Normal title'],
    ['222', '=cmd|"thing"'],
    ['333', 'With\nline break'],
  ]);
  assert.ok(output.startsWith('\uFEFF'));
  assert.ok(output.includes('\r\n'));
  assert.ok(output.includes('"222","\\'=cmd|""thing"""'));
  assert.ok(output.includes('"333","With\nline break"'));
  assert.throws(() => buildServiceQueueCsv([], []));
  assert.throws(() => buildServiceQueueCsv(['Only one'], [['A', 'B']]));
});

test('customer links restore only approved server filters and disable ambiguous sharing', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  assert.match(src, /readQueuePreset\(location\.search, 'customer'\)/);
  assert.match(src, /new URLSearchParams\(location\.search\)\.has\('request'\)/);
  assert.match(src, /setUpdatesOnly\(preset === 'activity'\)/);
  assert.match(src, /setAnswersOnly\(preset === 'answers'\)/);
  assert.match(src, /setPendingReviewsOnly\(preset === 'brief-reviews'\)/);
  assert.match(src, /setActiveSearch\(''\)/);
  assert.match(src, /setSortOrder\('newest'\)/);
  assert.match(src, /setPage\(0\)/);
  assert.match(src, /buildQueuePresetLink\(window\.location\.origin, 'customer', preset\)/);
  assert.match(src, /disabled=\{!currentFocusPreset\(\)\}/);
});

test('customer CSV contains only the owned loaded page and excludes full brief text', async () => {
  const src = await read('src/pages/MyServiceRequests.tsx');
  const start = src.indexOf('  const exportLoadedQueue = async () => {');
  const end = src.indexOf('\n  };', start);
  assert.ok(start >= 0 && end > start);
  const segment = src.slice(start, end);
  assert.match(segment, /rowsOwner !== userId/);
  assert.match(segment, /visibleRows\.length === 0/);
  assert.match(segment, /supabase\.auth\.getUser\(\)/);
  assert.match(segment, /verified\?\.id !== userId/);
  assert.match(segment, /downloadServiceQueueCsv\(/);
  assert.match(segment, /visibleRows\.map\(/);
  assert.match(segment, /row\.awaiting_customer_count/);
  assert.match(segment, /row\.pending_amendment_count/);
  assert.doesNotMatch(segment, /row\.description|row\.constraints|row\.contact_email/);
  assert.match(src, /Export loaded rows/);
});

test('administrator links restore approved filters only after authorization', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /readQueuePreset\(location\.search, 'admin'\)/);
  assert.match(src, /if \(!authorized\) return/);
  assert.match(src, /setAttentionOnly\(preset === 'follow-up'\)/);
  assert.match(src, /setPendingAmendmentsOnly\(preset === 'brief-reviews'\)/);
  assert.match(src, /setClarificationFilter\(preset === 'clarifications' \? 'needs_review' : 'all'\)/);
  assert.match(src, /setAssignmentFilter\(preset === 'unassigned' \? 'unassigned' : 'all'\)/);
  assert.match(src, /new URLSearchParams\(location\.search\)\.has\('request'\)/);
  assert.match(src, /disabled=\{!currentAdminFocus\(\)\}/);
  assert.match(src, /buildQueuePresetLink\(window\.location\.origin, 'admin', focus\)/);
});

test('administrator CSV requires refreshed verified role and exports loaded operational metadata only', async () => {
  const src = await read('src/pages/AdminServiceRequests.tsx');
  assert.match(src, /const confirmAdminForLocalAction = async/);
  assert.match(src, /supabase\.auth\.getUser\(\)/);
  assert.match(src, /supabase\.rpc\('is_admin'\)/);
  assert.match(src, /isAdmin === true/);
  const start = src.indexOf('  const exportLoadedAdminQueue = async () => {');
  const end = src.indexOf('\n  };', start);
  assert.ok(start >= 0 && end > start);
  const segment = src.slice(start, end);
  assert.match(segment, /!authorized/);
  assert.match(segment, /filtered\.length === 0/);
  assert.match(segment, /confirmAdminForLocalAction\(\)/);
  assert.match(segment, /filtered\.map\(/);
  assert.match(segment, /item\.priority/);
  assert.match(segment, /item\.next_review_on/);
  assert.match(segment, /item\.pending_amendment_count/);
  assert.doesNotMatch(segment, /item\.contact_email|item\.description|item\.company|item\.user_id/);
  assert.match(src, /Export loaded worklist/);
});

test('the rollout remains no-new-migration and preserves real multi-account verification', async () => {
  const doc = await read('docs/ETERNYX_SERVICES_QUEUE_HANDOFF_PHASE17.md');
  assert.match(doc, /no new SQL migration/i);
  assert.match(doc, /Phase 13[\s\S]*Phase 14/);
  assert.match(doc, /connection timeout/i);
  assert.match(doc, /customer A[\s\S]*customer B[\s\S]*administrator/i);
  assert.match(doc, /not read receipts/i);
  assert.match(doc, /Spreadsheet.formula/i);
});
