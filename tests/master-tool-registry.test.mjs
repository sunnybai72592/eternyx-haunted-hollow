import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { filterToolRegistry, summarizeToolRegistry, READINESS_LABELS, READINESS_VALUES } from "../src/lib/toolRegistryUtils.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const registry = JSON.parse(read("src/data/toolRegistry.json"));
const app = read("src/App.tsx");
const explore = read("src/pages/Explore.tsx");
const pillars = ["cybersecurity","developer-studio","ai-arsenal","workspace","integrations","automation"];
const statuses = ["local-foundation","backend-dependent","preview-only","external-dependent"];

test("master registry expands to 30+ real source-linked capabilities across all six pillars", () => {
  assert.ok(registry.length >= 30, "At least 30 distinct indexed capabilities");
  assert.deepEqual([...new Set(registry.map(x=>x.pillar))].sort(),pillars.sort());
  assert.equal(new Set(registry.map(x=>x.id)).size,registry.length);
  assert.equal(new Set(registry.map(x=>x.name)).size,registry.length);
});

test("every registry entry has a concrete non-redirect route and exact checked source file", () => {
  for (const tool of registry) {
    assert.match(tool.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(app.includes('path="'+tool.route+'"'),"Route not in App: "+tool.route);
    assert.ok(!app.includes('path="'+tool.route+'" element={<Navigate'),"Redirect is not a tool: "+tool.id);
    assert.ok(existsSync(new URL(tool.source, root)), "Missing source: "+tool.source);
    if (tool.test) assert.ok(existsSync(new URL(tool.test, root)), "Missing test: "+tool.test);
    assert.ok(typeof tool.description==="string" && tool.description.length > 25);
    assert.ok(tool.provider && tool.execution && tool.access && tool.securityScope);
  }
});

test("every entry has a truthful fail-closed production readiness state", () => {
  for (const tool of registry) {
    assert.ok(statuses.includes(tool.readiness),"Unknown readiness: "+tool.id);
    assert.equal(tool.releaseVerified,false,tool.id+" must not claim live certification");
    assert.equal(tool.verification,"Deployed check pending");
    assert.equal(tool.owner,null,"Owner assignment requires evidence");
    assert.match(tool.reviewedAt,/^2026-11-/);
    assert.match(tool.audit,/live browser acceptance pending/i);
    assert.ok(READINESS_LABELS[tool.readiness]);
  }
});

test("readiness categories correctly distinguish local, backend, preview and external integrations", () => {
  const summary=summarizeToolRegistry(registry);
  assert.equal(summary.indexed,registry.length);
  assert.equal(summary.productionVerified,0);
  assert.equal(summary.liveQAPending,registry.length);
  assert.deepEqual(READINESS_VALUES.sort(),statuses.sort());
  assert.equal(Object.values(summary.byReadiness).reduce((a,b)=>a+b,0),registry.length);
  assert.ok(summary.byReadiness["local-foundation"] >= 10);
  assert.ok(summary.byReadiness["backend-dependent"] >= 3);
  assert.ok(summary.byReadiness["preview-only"] >= 4);
});

test("search works across names, descriptions, provider types and scope", () => {
  assert.ok(filterToolRegistry(registry,{q:"jwt"}).some(x=>x.id==="jwt-inspection"));
  assert.ok(filterToolRegistry(registry,{q:"github"}).some(x=>x.pillar==="integrations"));
  assert.ok(filterToolRegistry(registry,{q:"authorization"}).length >= 0);
  assert.ok(filterToolRegistry(registry,{q:"this-does-not-exist"}).length===0);
  assert.deepEqual(filterToolRegistry(registry,{q:"   "}).length,registry.length);
  assert.ok(filterToolRegistry(registry,{q:"video",pillar:"ai-arsenal"}).length>=1);
});

test("pillars and readiness filters combine, preserve inputs and never invent results", () => {
  const copy=JSON.stringify(registry);
  assert.ok(filterToolRegistry(registry,{pillar:"automation"}).every(x=>x.pillar==="automation"));
  assert.ok(filterToolRegistry(registry,{readiness:"preview-only"}).every(x=>x.readiness==="preview-only"));
  assert.ok(filterToolRegistry(registry,{pillar:"ai-arsenal",readiness:"preview-only"}).every(x=>x.pillar==="ai-arsenal" && x.readiness==="preview-only"));
  assert.equal(filterToolRegistry(registry,{pillar:"invalid"}).length,0);
  assert.equal(filterToolRegistry(registry,{readiness:"invalid"}).length,0);
  assert.equal(JSON.stringify(registry),copy);
});

test("user-visible Explore has controlled pillar/readiness filters and marks unverified status", () => {
  assert.match(explore,/filterToolRegistry\(tools/);
  assert.match(explore,/summarizeToolRegistry\(tools\)/);
  assert.match(explore,/aria-label="Filter tools by pillar"/);
  assert.match(explore,/aria-label="Filter tools by readiness"/);
  assert.match(explore,/READINESS_LABELS\[tool\.readiness\]/);
  assert.match(explore,/No production verification claimed/);
  assert.match(explore,/tool\.test \?\? "Source review only"/);
  assert.match(explore,/setParams\(next, \{ replace: true, preventScrollReset: true \}\)/);
  assert.match(explore,/No indexed capabilities match these filters/);
});

test("AI provider-dependent tools cannot claim live AI generation", () => {
  for (const id of ["ai-image-workspace","ai-video-workspace","eternyx-ai-chat"]) {
    const tool=registry.find(x=>x.id===id);
    assert.ok(tool,"Missing AI capability "+id);
    assert.equal(tool.readiness,"backend-dependent");
    assert.equal(tool.releaseVerified,false);
  }
  const source=read("src/lib/ai/registry.ts");
  assert.match(source,/export const AI_PROVIDERS: readonly AIProviderDefinition\[\] = \[\];/);
  assert.match(source,/export const AI_MODELS: readonly AIModelDefinition\[\] = \[\];/);
});

test("registry standalone audit script passes and prints coverage by route", () => {
  const run=spawnSync(process.execPath,["scripts/audit-tool-registry.mjs"],{
    cwd: new URL("../",import.meta.url), encoding:"utf8",timeout:12000,maxBuffer:1024*1024,
  });
  assert.equal(run.status,0,run.stderr || run.stdout);
  assert.match(run.stdout, /indexed tools across 6 pillars/);
  assert.match(run.stdout,/unreviewed/);
});
