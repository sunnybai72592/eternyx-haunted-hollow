import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/ErrorBoundary.tsx',import.meta.url),'utf8');
test('shared error screen never renders exception message or stack',()=>{
  assert.doesNotMatch(source,/this\.state\.error|errorInfo|\.stack|\.message/);
  assert.match(source,/Local reference/);
  assert.match(source,/ETERNYX_RENDER_FAILURE/);
});
test('accessible mobile recovery and uncertainty warning remain',()=>{
  assert.match(source,/role="alert"/);
  assert.match(source,/flex-col gap-3 pt-4 sm:flex-row/);
  assert.match(source,/Check whether your previous action completed before repeating it/);
  assert.match(source,/window\.location\.reload/);
  assert.match(source,/window\.location\.href = '\/'/);
});
