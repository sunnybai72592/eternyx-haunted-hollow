import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeveloperProject, editDeveloperFile, addDeveloperFile } from "../src/lib/developerProjectLab.mjs";
import {
  PROJECT_RECOVERY_SCHEMA, PROJECT_RECOVERY_STORAGE, MAX_PROJECT_RECOVERY,
  projectRecoveryChecksum, createProjectRecovery, normalizeProjectRecovery,
  verifyProjectRecovery, parseProjectRecoveryStorage, upsertProjectRecovery,
  deleteProjectRecovery, exportProjectRecovery, importProjectRecovery, recoverySummary,
} from "../src/lib/developerProjectRecovery.mjs";
import { DEVELOPER_PREFLIGHT_SCHEMA, runDeveloperPreflight, exportDeveloperPreflight } from "../src/lib/developerProjectPreflight.mjs";
const page=readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx", import.meta.url),"utf8");
const recovery=readFileSync(new URL("../src/components/developer/ProjectRecoveryPanel.tsx", import.meta.url),"utf8");

test("SHA-256 recovery roundtrip checks source integrity and safe project id", async () => {
  const p=createDeveloperProject("starter","test-project");
  const snapshot=await createProjectRecovery(p,"2026-11-23T12:00:00.000Z");
  assert.equal(snapshot.schema,PROJECT_RECOVERY_SCHEMA);
  assert.match(snapshot.checksum,/^[a-f0-9]{64}$/);
  assert.equal(await projectRecoveryChecksum(p),snapshot.checksum);
  assert.deepEqual((await verifyProjectRecovery(snapshot)).project,p);
  const raw=exportProjectRecovery(snapshot);
  assert.deepEqual((await importProjectRecovery(raw)).project,p);
  assert.equal(recoverySummary(snapshot).files,3);
  assert.throws(()=>normalizeProjectRecovery({schema:"wrong"}),/Unsupported/);
  await assert.rejects(()=>createProjectRecovery({name:"Wrong",files:[],id:""}),/1–12/);
});

test("tampered source, timestamps and checksum invalidation refuse restore",async()=>{
  const project=createDeveloperProject("blank","id-1");
  const snapshot=await createProjectRecovery(project);
  const changed={...snapshot,project:editDeveloperFile(project,"index.html","secret changed")};
  await assert.rejects(()=>verifyProjectRecovery(changed),/checksum mismatch/);
  await assert.rejects(()=>importProjectRecovery(JSON.stringify(changed)),/checksum mismatch/);
  assert.throws(()=>normalizeProjectRecovery({...snapshot,capturedAt:"tomorrow"}),/timestamp/);
  assert.throws(()=>normalizeProjectRecovery({...snapshot,checksum:"bad"}),/corrupted/);
  await assert.rejects(()=>importProjectRecovery("{oops"),/valid JSON/);
  await assert.rejects(()=>importProjectRecovery("x".repeat(165001)),/under 165,000/);
});

test("bounded local recovery per project replaces old and prunes corrupted entries", async()=>{
  const batch=await Promise.all(Array.from({length:7},(_,i)=>createProjectRecovery(createDeveloperProject("blank","p-"+i))));
  let collection=[];
  for (const entry of batch) collection=upsertProjectRecovery(collection,entry);
  assert.equal(collection.length,MAX_PROJECT_RECOVERY);
  assert.equal(collection[0].project.id,"p-6");
  assert.equal(collection.at(-1).project.id,"p-2");
  const updated=await createProjectRecovery(editDeveloperFile(batch[6].project,"index.html","new"));
  collection=upsertProjectRecovery(collection,updated);
  assert.equal(collection.length,MAX_PROJECT_RECOVERY);
  assert.equal(collection[0].project.files[0].content,"new");
  assert.equal(deleteProjectRecovery(collection,"p-6").length,4);
  assert.equal(parseProjectRecoveryStorage(JSON.stringify([{},...collection])).length,MAX_PROJECT_RECOVERY);
  assert.deepEqual(parseProjectRecoveryStorage("{bad"),[]);
  assert.ok(PROJECT_RECOVERY_STORAGE.includes("recovery"));
});

test("preflight integrates actual parser and static diagnostics without running code",async()=>{
  let project=addDeveloperFile(createDeveloperProject("blank","p"),"app.js","const ok=1;");
  const good=await runDeveloperPreflight(project);
  assert.equal(good.schema,DEVELOPER_PREFLIGHT_SCHEMA);
  assert.equal(good.errors,0);
  assert.equal(good.previewReadiness,"no-blocking-issues-found");
  project=editDeveloperFile(project,"app.js","function broken( {");
  project=editDeveloperFile(project,"index.html",'<a href="#missing">Bad anchor</a>');
  const bad=await runDeveloperPreflight(project);
  assert.ok(bad.errors>0);
  assert.ok(bad.warnings>0);
  assert.equal(bad.previewReadiness,"review-required");
  assert.ok(bad.syntaxFindings.length);
});

test("preflight report exports metadata only, never source strings",async()=>{
  let project=createDeveloperProject("starter","p");
  project=editDeveloperFile(project,"app.js",'const SECRET_TOKEN="RED_FLAG"; function broken( {');
  const run=await runDeveloperPreflight(project);
  const report=JSON.parse(exportDeveloperPreflight(run));
  assert.equal(report.schema,DEVELOPER_PREFLIGHT_SCHEMA);
  assert.ok(!JSON.stringify(report).includes("RED_FLAG"));
  assert.ok(!JSON.stringify(report).includes("SECRET_TOKEN"));
  assert.throws(()=>exportDeveloperPreflight({schema:"oops"}),/Run current/);
});

test("UI opts into debounced recovery explicitly, and restores only after checksum check and dirty consent",()=>{
  assert.match(page,/<ProjectRecoveryPanel/);
  assert.match(page,/runDeveloperPreflight/);
  assert.match(page,/preflightStale/);
  assert.match(recovery,/useState\(false\)/);
  assert.match(recovery,/1200\)/);
  assert.match(recovery,/await verifyProjectRecovery\(snapshot\)/);
  assert.match(recovery,/window\.confirm\("Replace current unsaved edits/);
  assert.match(recovery,/setEnabled\(false\)/);
  assert.match(recovery,/localStorage\.setItem\(PROJECT_RECOVERY_STORAGE/);
  assert.match(recovery,/exportProjectRecovery/);
  assert.doesNotMatch(recovery,/allow-same-origin|eval\(/);
});
