import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helperSource = await read("src/lib/ai/research-local-tools.ts");
const backupSource = await read("src/lib/ai/research-backup-tools.ts");
const page = await read("src/pages/AIResearchStudio.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const options = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } };
function dataURL(source) {
  return "data:text/javascript;base64," + Buffer.from(source).toString("base64");
}
const helper = await import(dataURL(ts.transpileModule(helperSource, options).outputText));
const helperURL = dataURL(ts.transpileModule(helperSource, options).outputText);
const backupJs = ts.transpileModule(backupSource, options).outputText
  .replace(/(["'])\.\/research-local-tools\1/, JSON.stringify(helperURL));
const backup = await import(dataURL(backupJs));

const source = (id = "s1", url = "https://example.org/paper") =>
  ({ id, title: "Source " + id, url, publisher: "User entered" });
const note = (id = "e1", sourceId = "s1", stance = "supports", claim = "The reported coating is sound") =>
  ({ id, sourceId, stance, claim, excerpt: "User-entered excerpt", notes: "Check context" });
const notebook = () => ({
  sources: [source()], evidence: [note()],
  question: "What do our notes suggest?", mode: "research",
});

test("versioned backup serializes and restores the actual user notebook without data loss", () => {
  const json = backup.serializeResearchBackup(notebook());
  const parsed = backup.parseResearchBackup(json);
  assert.equal(parsed.format, "eternyx.research-notebook");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.question, notebook().question);
  assert.equal(parsed.mode, "research");
  assert.deepEqual(parsed.sources, notebook().sources);
  assert.deepEqual(parsed.evidence, notebook().evidence);
  assert.equal(backup.serializeResearchBackup(parsed), json);
  assert.equal(backup.MAX_RESEARCH_BACKUP_BYTES, 512 * 1024);
});

test("empty notebooks, optional fields and the summarize request mode round-trip", () => {
  const sourceOnly = { ...notebook(), mode: "summarize", question: "", sources: [{id:"s1", title:"Source", url:"https://example.org"}], evidence:[] };
  const parsed = backup.parseResearchBackup(backup.serializeResearchBackup(sourceOnly));
  assert.equal(parsed.evidence.length, 0);
  assert.equal(parsed.sources[0].publisher, undefined);
  assert.equal(parsed.mode, "summarize");
  assert.equal(parsed.question, "");
  const empty = backup.parseResearchBackup(backup.serializeResearchBackup({sources:[], evidence:[], mode:"research", question:""}));
  assert.deepEqual(empty.sources, []);
});

test("unrecognized schema, extra fields and invalid JSON fail closed without salvage", () => {
  const valid = JSON.parse(backup.serializeResearchBackup(notebook()));
  for (const altered of [
    {...valid, version:2}, {...valid, format:"not-eternyx"},
    {...valid, trusted:true}, {...valid, question:42},
    {...valid, question:"x".repeat(1001)}, {...valid, mode:"execute"},
    {...valid, evidence:null}, {...valid, sources:{}},
    {...valid, sources:Array(26).fill(valid.sources[0])},
    {...valid, evidence:Array(101).fill(valid.evidence[0])},
    ["unexpected"],
  ]) assert.throws(() => backup.parseResearchBackup(JSON.stringify(altered)), {code:"invalid_schema"});
  assert.throws(() => backup.parseResearchBackup("{bad"), {code:"invalid_json"});
  assert.throws(() => backup.parseResearchBackup(" "), {code:"invalid_json"});
  assert.throws(() => backup.parseResearchBackup("x".repeat(512 * 1024 + 1)), {code:"too_large"});
});

test("source validation preserves HTTPS-only and rejects tampering, credentials, duplicates", () => {
  const valid = JSON.parse(backup.serializeResearchBackup(notebook()));
  const examples = [
    {...source(), url:"http://example.org"}, {...source(), url:"https://name:pwd@example.org"},
    {...source(), url:"javascript:alert(1)"}, {...source(), id:"bad id"},
    {...source(), admin:true}, {...source(), title:""}, {...source(), title:"x".repeat(201)},
  ];
  for (const sourceData of examples) {
    assert.throws(() => backup.parseResearchBackup(JSON.stringify({...valid, sources:[sourceData]})), {code:"invalid_source"});
  }
  assert.throws(() => backup.parseResearchBackup(JSON.stringify({
    ...valid, sources:[source(), source("s2", "https://example.org/paper")],
  })), {code:"invalid_source"});
  assert.throws(() => backup.parseResearchBackup(JSON.stringify({
    ...valid, sources:[source(), source("s1", "https://example.org/two")],
  })), {code:"invalid_source"});
});

test("evidence validation rejects orphan links, duplicate IDs, unapproved tags and extra privileges", () => {
  const valid = JSON.parse(backup.serializeResearchBackup(notebook()));
  const examples = [
    {...note(), sourceId:"missing"}, {...note(), id:"bad id"},
    {...note(), stance:"verified"}, {...note(), claim:""},
    {...note(), permission:"external_write"}, {...note(), executed:true},
    {...note(), excerpt:"x".repeat(2001)},
  ];
  for (const value of examples) {
    assert.throws(() => backup.parseResearchBackup(JSON.stringify({...valid, evidence:[value]})), {code:"invalid_evidence"});
  }
  assert.throws(() => backup.parseResearchBackup(JSON.stringify({
    ...valid, evidence:[note(), note("e1")],
  })), {code:"invalid_evidence"});
});

test("real local File reader validates size, MIME, extension and import bytes", async () => {
  const json = backup.serializeResearchBackup(notebook());
  const file = (name, text, type = "application/json") => ({
    name, size: Buffer.byteLength(text), type, text: async () => text,
  });
  const restored = await backup.readResearchBackupFile(file("backup.json", json));
  assert.equal(restored.evidence.length, 1);
  for (const f of [
    file("backup.txt", json), file("backup.json", json, "image/png"),
    {...file("backup.json", json), size:0},
    {...file("backup.json", json), size:512*1024+1},
  ]) await assert.rejects(() => backup.readResearchBackupFile(f), {code:"invalid_file"});
  await assert.rejects(() => backup.readResearchBackupFile({
    ...file("backup.json", json), text: async () => {throw Error("read");},
  }), {code:"invalid_file"});
  await assert.rejects(() => backup.readResearchBackupFile(file("backup.json", "{}")), {code:"invalid_schema"});
});

test("coverage totals actual linked notes and finds sources without evidence", () => {
  const sources = [source(), source("s2", "https://example.org/second"), source("s3", "https://example.org/third")];
  const notes = [note(), note("e2","s1","context"), note("e3","s2","challenges")];
  const report = backup.assessResearchCoverage(sources,notes);
  assert.equal(report.totalSources,3);
  assert.equal(report.totalEvidence,3);
  assert.equal(report.sourcesWithEvidence,2);
  assert.equal(report.sourcesWithoutEvidence,1);
  assert.equal(report.perSource[0].supports,1);
  assert.equal(report.perSource[0].context,1);
  assert.equal(report.perSource[2].evidenceCount,0);
  assert.match(report.caveat, /unverified/);
  assert.match(backup.formatResearchCoverage(report), /No URLs were opened or verified/);
});

test("opposing tags only for identically worded claims, not invented semantic contradictions", () => {
  const sources = [source(), source("s2","https://example.org/second")];
  const notes = [
    note("e1","s1","supports","  Data   supports CP  "),
    note("e2","s2","challenges","data supports cp"),
    note("e3","s2","context","Data supports CP"),
    note("e4","s1","challenges","A separate claim"),
  ];
  const result=backup.assessResearchCoverage(sources,notes);
  assert.equal(result.tagDisagreements.length,1);
  assert.equal(result.tagDisagreements[0].supportingSources,1);
  assert.equal(result.tagDisagreements[0].challengingSources,1);
  assert.equal(backup.assessResearchCoverage(sources,[notes[0],{...notes[1],claim:"not the same claim"}]).tagDisagreements.length,0);
  assert.match(backup.formatResearchCoverage(result), /USER tags/);
});

test("research studio performs explicit local download, validates before replacement and protects stale reads", () => {
  for (const token of [
    "readResearchBackupFile(file)", "const version = ++backupReadVersion.current",
    "if (version !== backupReadVersion.current) return",
    "setPendingBackup(parsed)", "window.confirm(", "setSources([...imported.sources])",
    "setEvidence([...imported.evidence])", "setQuestion(imported.question)",
    "setMode(imported.mode)", "invalidate();", "ai.invalidate();",
    "formatResearchCoverage(coverage)", "serializeResearchBackup({ sources, evidence, question, mode })",
    "URL.createObjectURL(new Blob([content]", "URL.revokeObjectURL(url)",
    "not a merge", "No notebook data was uploaded", "pendingBackup.sources.length",
    "setPendingBackup(null)", "setBackupBusy(false)",
  ]) assert.ok(page.includes(token), "Missing local control: " + token);
  assert.match(hub, /portable validated backups/);
  assert.doesNotMatch(page + backupSource, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(|\beval\(|localStorage\./);
});
