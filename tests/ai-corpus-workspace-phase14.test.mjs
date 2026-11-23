import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const source = await read("src/lib/ai/document-corpus-tools.ts");
const workspaceSource = await read("src/lib/ai/document-corpus-workspace.ts");
const page = await read("src/pages/AIDocumentIntelligence.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const options = { compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022} };
const transpile = text => ts.transpileModule(text, options).outputText;
const dataURL = value => "data:text/javascript;base64," + Buffer.from(value).toString("base64");
const coreUrl = dataURL(transpile(source));
const workspace = await import(dataURL(transpile(workspaceSource)
  .replace(/(["'])\.\/document-corpus-tools\1/, JSON.stringify(coreUrl))));

const d = (id, name, text, kind = "txt") => ({id, name, text, kind});
const w = () => ({
  documents: [
    d("cp", "cp-results.txt", "On potential: -850 mV\r\nInspection complete"),
    d("ur", "urdu.md", "پښتو مواد او پايپ", "md"),
  ],
  query: "CP inspection",
  mode: "near",
  sourceFilter: "cp",
  question: "Explain exact source text.",
});
const sha = text => createHash("sha256").update(text, "utf8").digest("hex");

test("local snapshot is versioned, contains full original decoded text and round-trips without data loss", async () => {
  const exported = await workspace.exportCorpusWorkspace(w());
  const parsed = await workspace.parseCorpusWorkspace(exported);
  assert.equal(parsed.format, "eternyx.local-corpus-workspace");
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.documents.map(({sha256, ...doc})=>doc), w().documents);
  assert.equal(parsed.mode, "near");
  assert.equal(parsed.sourceFilter, "cp");
  assert.equal(parsed.query, w().query);
  assert.equal(parsed.question, w().question);
  assert.equal(await workspace.exportCorpusWorkspace(parsed), exported);
  assert.match(exported, /Inspection complete/);
  assert.match(exported, /پښتو/);
  for (const doc of parsed.documents) assert.equal(doc.sha256, sha(doc.text));
  assert.equal(workspace.MAX_CORPUS_WORKSPACE_BYTES, 3 * 1024 * 1024);
});

test("all four search modes and empty-but-valid workspace settings round-trip", async () => {
  for (const mode of ["all", "any", "phrase", "near"]) {
    const original = {...w(), mode, sourceFilter:null, query:"", question:""};
    const snapshot = await workspace.parseCorpusWorkspace(await workspace.exportCorpusWorkspace(original));
    assert.equal(snapshot.mode, mode);
    assert.equal(snapshot.sourceFilter, null);
    assert.equal(snapshot.query, "");
  }
  const empty = {documents:[], query:"", mode:"all", sourceFilter:null, question:""};
  const restored = await workspace.parseCorpusWorkspace(await workspace.exportCorpusWorkspace(empty));
  assert.deepEqual(restored.documents,[]);
});

test("file reading only accepts bounded, named .json files and never uploads", async () => {
  const source = await workspace.exportCorpusWorkspace(w());
  const file = (name, contents, type="application/json") => ({
    name, size: Buffer.byteLength(contents), type, text: async () => contents,
  });
  assert.deepEqual(await workspace.readCorpusWorkspaceFile(file("backup.json",source)),
    await workspace.parseCorpusWorkspace(source));
  for (const rejected of [
    file("backup.txt",source), file("backup.json",source,"image/png"),
    {...file("backup.json",source),size:0},
    {...file("backup.json",source),size:3*1024*1024+1},
    {...file("backup.json",source),size:NaN},
  ]) await assert.rejects(() => workspace.readCorpusWorkspaceFile(rejected), {code:"invalid_file"});
  await assert.rejects(() => workspace.readCorpusWorkspaceFile({
    ...file("backup.json",source),text: async () => {throw Error("unreadable");},
  }), {code:"invalid_file"});
  await assert.rejects(() => workspace.readCorpusWorkspaceFile(file("backup.json","{broken")), {code:"invalid_json"});
});

test("one modified decoded source value fails SHA-256 even if other sources are valid", async () => {
  const json=JSON.parse(await workspace.exportCorpusWorkspace(w()));
  json.documents[1].text += " CORRUPTED";
  await assert.rejects(() => workspace.parseCorpusWorkspace(JSON.stringify(json)), {code:"hash_mismatch"});
  json.documents[1].sha256 = sha(json.documents[1].text);
  const valid = await workspace.parseCorpusWorkspace(JSON.stringify(json));
  assert.equal(valid.documents[1].sha256,sha(valid.documents[1].text));
  assert.match(workspace.formatCorpusWorkspaceInventory(valid),/not author authentication/i);
});

test("strict root field names, version, unknown permissions, and document fields fail closed", async () => {
  const valid=JSON.parse(await workspace.exportCorpusWorkspace(w()));
  for (const changed of [
    {...valid,version:2}, {...valid,format:"other"},
    {...valid,permission:"admin"}, {...valid, documents:null},
    {...valid,question:123},
  ]) await assert.rejects(() => workspace.parseCorpusWorkspace(JSON.stringify(changed)), {code:"invalid_schema"});
  for (const changed of [
    {...valid,documents:[{...valid.documents[0],executable:"yes"}]},
    {...valid,documents:[{...valid.documents[0],sha256:"not-a-digest"}]},
    {...valid,documents:[{...valid.documents[0],kind:"pdf"}]},
    {...valid,documents:[{...valid.documents[0],id:"invalid id"}]},
    {...valid,documents:[valid.documents[0],{...valid.documents[0],id:"duplicate"}]},
    {...valid,documents:[{...valid.documents[0],text:"x".repeat(100001)}]},
  ]) await assert.rejects(() => workspace.parseCorpusWorkspace(JSON.stringify(changed)), {code:"invalid_document"});
});

test("malformed JSON, excessive bytes and unsafe search settings reject entire snapshot", async () => {
  const valid = JSON.parse(await workspace.exportCorpusWorkspace(w()));
  await assert.rejects(() => workspace.parseCorpusWorkspace("{bad"), {code:"invalid_json"});
  await assert.rejects(() => workspace.parseCorpusWorkspace("x".repeat(workspace.MAX_CORPUS_WORKSPACE_BYTES+1)), {code:"too_large"});
  for (const changed of [
    {...valid,mode:"semantic"}, {...valid,sourceFilter:"missing"},
    {...valid,query:"a ".repeat(125)}, {...valid,question:"x".repeat(251)},
    {...valid,query:"one two three four five six seven eight nine"},
    {...valid,mode:"phrase",query:"same same same same same same same same same"},
  ]) await assert.rejects(() => workspace.parseCorpusWorkspace(JSON.stringify(changed)), {code:"invalid_search"});
});

test("corpus file, character and duplicate name boundaries apply to restored data", async () => {
  const valid = JSON.parse(await workspace.exportCorpusWorkspace(w()));
  const make = (i, chars) => ({
    id: "doc"+i, name:"doc"+i+".txt",kind:"txt",text:chars,
    sha256:sha(chars),
  });
  for (const docs of [
    Array.from({length:9},(_,i)=>make(i,"text")),
    Array.from({length:5},(_,i)=>make(i,"m".repeat(90000))),
    [make(1,"text"),{...make(2,"another"),name:"DOC1.TXT"}],
  ]) {
    const reason=docs.length>8 ? "invalid_schema" : "invalid_document";
    await assert.rejects(()=>workspace.parseCorpusWorkspace(JSON.stringify({...valid,documents:docs})), {code:reason});
  }
});

test("manifest omits all document text while listing honest decoded-text SHA-256 checksums", async () => {
  const docs=await workspace.parseCorpusWorkspace(await workspace.exportCorpusWorkspace(w()));
  const report=workspace.formatCorpusWorkspaceInventory(docs);
  assert.match(report,/SHA-256\(decoded text\)/);
  assert.match(report,/CP inspection/);
  assert.match(report,/modified digests/);
  for(const text of ["On potential: -850", "Inspection complete","پښتو مواد"]) {
    assert.ok(!report.includes(text), "Manifest disclosed original text!");
  }
  assert.equal(report.includes(docs.documents[0].sha256),true);
  assert.match(report,/No source authenticity/);
});

test("missing WebCrypto hard-fails instead of skipping content integrity checks", async () => {
  const exported = await workspace.exportCorpusWorkspace(w());
  const original=globalThis.crypto;
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:undefined});
  try {
    await assert.rejects(()=>workspace.parseCorpusWorkspace(exported),{code:"crypto_unavailable"});
    await assert.rejects(()=>workspace.exportCorpusWorkspace(w()),{code:"crypto_unavailable"});
  } finally {
    if(original === undefined) delete globalThis.crypto;
    else Object.defineProperty(globalThis,"crypto",{configurable:true,value:original});
  }
});

test("UI has opt-in export, fail-closed preview, destructive replace confirmation and race guards", () => {
  for (const fragment of [
    "exportCorpusWorkspace({", "await readCorpusWorkspaceFile(file)",
    "if (operation !== corpusWorkspaceEpoch.current) return",
    "setPendingCorpusWorkspace(verified)",
    "window.confirm(", "setCorpusFiles(imported.documents.map",
    "setCorpusQuery(imported.query)", "setCorpusMode(imported.mode)",
    "setCorpusFilter(imported.sourceFilter ??", "setCorpusQuestion(imported.question)",
    "invalidateCorpusWorkspace()", "invalidateCorpusFingerprints()",
    "++corpusReadVersion.current", "invalidateCorpus()",
    "formatCorpusWorkspaceInventory(pendingCorpusWorkspace)",
    "does NOT prove its author",
    "no cached hits",
  ]) assert.ok(page.includes(fragment),"Missing restore boundary: "+fragment);
  assert.match(hub,/AI Document Intelligence/);
  assert.doesNotMatch(page+workspaceSource,/supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(|localStorage\./);
});
