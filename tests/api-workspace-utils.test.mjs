import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  API_COLLECTION_SCHEMA, MAX_API_HISTORY, MAX_API_TEMPLATES,
  sanitizedApiLocation, sanitizeApiTemplate, normalizeApiTemplates,
  exportApiCollections, importApiCollections, parseApiEnvironment,
  expandApiVariables, resolveApiDraft, normalizeApiHistory, recordApiHistory,
  runApiAssertions,
} from "../src/lib/apiWorkspaceUtils.mjs";

const view = readFileSync(new URL("../src/pages/ApiEngineeringWorkbench.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/developer/ApiWorkspacePanel.tsx", import.meta.url), "utf8");

test("saved request skeleton strips query, fragments, bodies, headers and userinfo", () => {
  assert.deepEqual(sanitizeApiTemplate({ id: "a", name: "Fetch users", method: "get",
    url: "https://example.com/users?api_key=SECRET#fragment", body: "token", headers: "Authorization: secret" }),
  { id: "a", name: "Fetch users", method: "GET", url: "https://example.com/users" });
  assert.equal(sanitizedApiLocation("https://example.com/users?key=X", { originOnly: true }), "https://example.com");
  assert.throws(() => sanitizeApiTemplate({ name: "x", url: "https://user:pass@example.com" }), /credentials/);
  assert.throws(() => sanitizeApiTemplate({ name: "x", url: "file:///etc/passwd" }), /HTTP/);
  assert.throws(() => sanitizeApiTemplate({ name: "x", url: "https://example.com", method: "TRACE" }), /Unsupported/);
});

test("environment placeholders resolve in all request fields without persistence", () => {
  const env = parseApiEnvironment("# staging\nbaseUrl=https://example.com\nkey=TEST_TOKEN\npath=users");
  assert.equal(expandApiVariables("{{baseUrl}}/{{path}}", env), "https://example.com/users");
  const request = resolveApiDraft({ url: "{{baseUrl}}/{{path}}", method: "POST",
    headers: "Authorization: Bearer {{key}}\nAccept: application/json", body: '{"page":1}' }, "baseUrl=https://example.com\nkey=TEST_TOKEN\npath=users");
  assert.deepEqual(request.headers[0], ["Authorization", "Bearer TEST_TOKEN"]);
  assert.equal(request.url, "https://example.com/users");
  assert.throws(() => expandApiVariables("{{unknown}}", env), /Missing environment/);
  assert.throws(() => expandApiVariables("{{a}}", parseApiEnvironment("a={{b}}\nb=value")), /Unresolved or nested/);
  assert.throws(() => parseApiEnvironment("a=1\na=2"), /Duplicate/);
  assert.equal(parseApiEnvironment("constructor=x").constructor, "x"); // own-key storage, not prototype mutation
  assert.throws(() => resolveApiDraft({ url: "{{missing}}", method: "GET" }, ""), /Missing environment/);
});

test("collections export/import roundtrip strips any secret-bearing request fields", () => {
  const saved = [{ id: "t1", name: "Get items", method: "POST", url: "https://example.com/items?token=SECRET",
    headers: "Authorization: Bearer SECRET", body: "SECRET" }];
  const json = exportApiCollections(saved);
  assert.equal(json.includes("SECRET"), false);
  const parsed = JSON.parse(json);
  assert.equal(parsed.schema, API_COLLECTION_SCHEMA);
  assert.equal(parsed.requests[0].url, "https://example.com/items");
  assert.equal(parsed.requests[0].headers, undefined);
  assert.equal(parsed.requests[0].body, undefined);
  assert.deepEqual(importApiCollections(json), [{ id: "", name: "Get items", method: "POST", url: "https://example.com/items" }]);
  assert.throws(() => importApiCollections('{"schema":"wrong","requests":[]}'), /Not an ETERNYX/);
  assert.throws(() => importApiCollections("bad-json"), /valid JSON/);
});

test("collection and history bounds reject untrusted/oversized input", () => {
  assert.deepEqual(normalizeApiTemplates([{}, {id:"a",name:"one",method:"GET",url:"https://a.test"}, {id:"a",name:"dupe",method:"GET",url:"https://a.test"}]).map(t=>t.id), ["a"]);
  assert.throws(() => importApiCollections(JSON.stringify({schema:API_COLLECTION_SCHEMA,requests:Array(MAX_API_TEMPLATES+1).fill({name:"a",url:"https://x.test"})})), /30-request/);
  const row = {url:"https://example.com/sensitive?token=SECRET",method:"GET",status:200,durationMs:17,at:"2026-11-23T00:00:00Z"};
  let history=[];
  for(let i=0;i<MAX_API_HISTORY+5;i++) history=recordApiHistory(history,row);
  assert.equal(history.length,MAX_API_HISTORY);
  assert.equal(JSON.stringify(history).includes("SECRET"),false);
  assert.equal(JSON.stringify(history).includes("sensitive"),false);
  assert.equal(history[0].origin,"https://example.com");
  assert.equal(normalizeApiHistory([{}, {method:"GET",origin:"https://example.com",status:200,durationMs:4}]).length,1);
});

test("assertions evaluate actual HTTP status, latency and JSON path without claiming monitoring", () => {
  const actual = {status:200,durationMs:31,body:'{"data":[{"id":7}]}',truncated:false};
  assert.deepEqual(runApiAssertions(actual,{status:"200",maxDurationMs:"100",jsonPath:"data.0.id",equals:"7"}).map(x=>x.passed),[true,true,true]);
  assert.deepEqual(runApiAssertions(actual,{status:"201",maxDurationMs:"10",jsonPath:"data.0.id",equals:"8"}).map(x=>x.passed),[false,false,false]);
  assert.equal(runApiAssertions(actual,{jsonPath:"data.0.missing",equals:"0"})[0].passed,false);
  assert.equal(runApiAssertions(actual,{jsonPath:"constructor",equals:"x"})[0].passed,false);
  assert.equal(runApiAssertions({...actual,truncated:true},{jsonPath:"data.0.id",equals:"7"})[0].passed,false);
  assert.equal(runApiAssertions(actual,{}).length,0);
});

test("UI binds real responses, runtime-only variables and local import/export with honest scopes", () => {
  assert.match(view,/resolveApiDraft/);
  assert.match(view,/runApiAssertions/);
  assert.match(view,/recordApiHistory/);
  assert.match(view,/<ApiWorkspacePanel/);
  assert.match(panel,/importApiCollections/);
  assert.match(panel,/exportApiCollections/);
  assert.match(panel,/localStorage\.setItem\(API_COLLECTION_STORAGE/);
  assert.doesNotMatch(panel,/localStorage\.setItem\([^)]*envText/);
  assert.doesNotMatch(panel,/scheduled monitoring|successful deployment|private GitHub integration/i);
});
