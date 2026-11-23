import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const source = await read("src/lib/ai/document-corpus-tools.ts");
const reviewSource = await read("src/lib/ai/document-corpus-review.ts");
const page = await read("src/pages/AIDocumentIntelligence.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const bridge = await read("src/lib/ai/studio-chat-request.ts");
const settings = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } };
const transpile = text => ts.transpileModule(text, settings).outputText;
const url = src => "data:text/javascript;base64," + Buffer.from(src).toString("base64");
const coreUrl = url(transpile(source));
const core = await import(coreUrl);
const review = await import(url(transpile(reviewSource)
  .replace(/(["'])\.\/document-corpus-tools\1/, JSON.stringify(coreUrl))));
const bridgeApi = await import(url(transpile(bridge)));
const doc = (id, text, name = id + ".txt") => ({ id, name, kind: "txt", text });

test("phrase matching preserves query order and repeated words, including punctuation separators", () => {
  const docs = [doc("one", [
    "coating CP inspection",
    "CP coating inspection",
    "CP coating and inspection",
    "CP, coating! inspection",
    "CP CP coating inspection",
    "cp coating inspection",
  ].join("\n"))];
  const result = core.searchCorpus(docs, "CP coating inspection", "phrase");
  assert.equal(result.mode, "phrase");
  assert.deepEqual(result.hits.map(x => x.line), [5, 2, 4, 6]);
  const exactLine = result.hits.find(hit => hit.line === 2);
  assert.equal(exactLine.matchSpan.startColumn, 1);
  assert.equal(exactLine.matchSpan.endColumn, "CP coating inspection".length);
  assert.ok(result.hits.every(hit => hit.score >= 300));
  assert.match(result.caveat, /punctuation between words is not compared literally/);
  const repeats = core.searchCorpus(docs, "CP CP coating", "phrase");
  assert.deepEqual(repeats.hits.map(x=>x.line), [5]);
  assert.equal(core.searchCorpus(docs, "CP coating inspection", "all").totalHits, 6);
});

test("proximity mode matches within exactly three intervening words in any order", () => {
  const docs=[doc("one", [
    "CP coating",
    "CP one two three coating",
    "coating 123 CP",
    "CP one two three four coating",
    "coating only",
    "CP only",
  ].join("\n"))];
  const near=core.searchCorpus(docs, "CP coating", "near");
  assert.deepEqual(near.hits.map(hit => hit.line), [1, 3, 2]);
  assert.ok(near.hits[0].score > near.hits[2].score);
  assert.equal(near.hits[0].matchSpan.startColumn, 1);
  assert.equal(near.hits[2].matchSpan.endColumn, "CP one two three coating".length);
  assert.match(near.caveat, /three intervening words/);
  const phrase=core.searchCorpus(docs,"CP coating","phrase");
  assert.deepEqual(phrase.hits.map(hit=>hit.line),[1]);
});

test("Arabic combining marks, Pashto, NFKC, CRLF, UTF-16 source columns survive exact matching", () => {
  const docs=[doc("lang","heading\r\n😀 مُعالجة الأنابيب\r\nپښتو مواد")];
  const ar=core.searchCorpus(docs,"مُعالجة الأنابيب","phrase");
  assert.equal(ar.totalHits,1);
  assert.equal(ar.hits[0].line,2);
  assert.equal(ar.hits[0].matchSpan.startColumn,4); // emoji occupies two UTF-16 units
  assert.equal(ar.hits[0].snippet,"😀 مُعالجة الأنابيب");
  const ps=core.searchCorpus(docs,"پښتو مواد","phrase");
  assert.equal(ps.hits[0].line,3);
  assert.equal(ps.hits[0].matchedTerms.length,2);
  const fullWidth=core.searchCorpus([doc("width","ＡＢＣ safety")],"ABC safety","phrase");
  assert.equal(fullWidth.totalHits,1);
});

test("phrase/proximity query limits, file filtering and max-result cap remain fail-closed", () => {
  const d=[doc("a","CP coating"),doc("b","CP coating")];
  assert.deepEqual(core.searchCorpus(d,"CP coating","phrase","b").hits.map(hit=>hit.documentId),["b"]);
  assert.throws(()=>core.searchCorpus(d,"one two three four five six seven eight nine","phrase"),{code:"invalid_query"});
  assert.throws(()=>core.searchCorpus(d,"word", "semantic"),{code:"invalid_query"});
  const many=[doc("a","CP coating\n".repeat(2001))];
  assert.throws(()=>core.searchCorpus(many,"CP coating","phrase"),{code:"too_many_matches"});
});

test("exact source verification rejects edited, renamed, stale, partial and offset-tampered hits", () => {
  const docs=[doc("src","first\nCP coating inspection\nlast")];
  const hit=core.searchCorpus(docs,"CP coating","phrase").hits[0];
  assert.equal(review.verifyCurrentCorpusHit(docs,hit),true);
  for (const changed of [
    [{...docs[0],text:"first\nCP coating corrected\nlast"}],
    [{...docs[0],name:"renamed.txt"}],
    [],
  ]) assert.throws(()=>review.verifyCurrentCorpusHit(changed,hit),{code:"stale_source"});
  for (const changed of [
    {...hit, snippet:"injected"},
    {...hit, documentName:"fake.pdf"},
    {...hit, snippetStartColumn:2},
    {...hit, sourceLineLength:2},
    {...hit, line:1},
    {...hit, matchSpan:{startColumn:0,endColumn:3}},
  ]) assert.throws(()=>review.verifyCurrentCorpusHit(docs,changed),{code:"stale_source"});
});

test("source context reveals original adjacent lines without treating partial long text as complete", () => {
  const raw="START " + "x".repeat(400) + " cp coating DONE";
  const docs=[doc("a","first\n"+raw+"\nafter\nlast")];
  const hit=core.searchCorpus(docs,"cp coating","phrase").hits[0];
  const context=review.getCorpusSourceContext(docs,hit,2);
  assert.deepEqual(context.lines.map(x=>x.line),[1,2,3,4]);
  assert.equal(context.centerLine,2);
  assert.equal(context.lines[1].selected,true);
  assert.equal(context.lines[1].snippet,hit.snippet);
  assert.equal(context.lines[1].partial,true);
  assert.equal(context.lines[1].sourceLength,raw.length);
  assert.ok(context.lines[1].startColumn > 1);
  assert.throws(()=>review.getCorpusSourceContext(docs,hit,3),{code:"invalid_selection"});
  assert.match(context.caveat,/not|No original file authentication/i);
});

test("coverage counts unique matched source lines and discloses missing keyword sources", () => {
  const docs=[
    doc("a","CP coating\nCP coating\nmaintenance"),
    doc("b","CP coating and monitoring"),
    doc("c","no matched phrase"),
  ];
  const results=core.searchCorpus(docs,"CP coating","phrase");
  const summary=review.summarizeCorpusCoverage(docs,results);
  assert.equal(summary.totalFiles,3);
  assert.equal(summary.filesWithMatches,2);
  assert.deepEqual(summary.rows.map(row=>row.matchingLines),[2,1,0]);
  assert.deepEqual(summary.rows[2].matchedTerms,[]);
  assert.match(summary.caveat,/not confirmed agreement/);
  const exportText=review.formatCorpusCoverage(summary);
  assert.match(exportText,/c.txt \[c\]: 0 matching lines/);
  assert.match(exportText,/b.txt \[b\]: 1 matching lines/);
});

test("selected evidence local report requires fresh original quote and retains nearby context", () => {
  const docs=[doc("a","heading\nCP coating inspection\nfollowup")];
  const results=core.searchCorpus(docs,"CP coating","phrase");
  const ids=[results.hits[0].id];
  const report=review.formatSelectedCorpusContext(docs,results,ids);
  assert.match(report,/line 2, starting column 1/);
  assert.match(report,/CP coating inspection/);
  assert.match(report,/heading/);
  assert.match(report,/followup/);
  assert.match(report,/have NOT been independently verified/);
  for (const invalid of [[],[ids[0],ids[0]],["stale"]]){
    assert.throws(()=>review.formatSelectedCorpusContext(docs,results,invalid),{code:"invalid_selection"});
  }
  assert.throws(()=>review.formatSelectedCorpusContext([doc("a","changed")],results,ids),{code:"stale_source"});
});

test("real browser WebCrypto SHA-256 text fingerprints are deterministic, honest and local", async () => {
  // Some Node test runners do not install global Web Crypto by default.
  const original=globalThis.crypto;
  if (!original) Object.defineProperty(globalThis, "crypto", { configurable:true, value:webcrypto });
  try {
    const docs=[doc("a","CP coating\r\nline 2"),doc("b","پښتو")];
    const fingerprints=await review.fingerprintCorpusDecodedText(docs);
    assert.equal(fingerprints.length,2);
    for(let i=0;i<docs.length;i++){
      assert.equal(fingerprints[i].sha256OfDecodedTextUtf8,
        createHash("sha256").update(docs[i].text,"utf8").digest("hex"));
      assert.equal(fingerprints[i].utf16Characters,docs[i].text.length);
    }
    assert.match(review.formatCorpusFingerprints(fingerprints),/NOT necessarily the original file bytes/);
    assert.match(review.formatCorpusFingerprints(fingerprints),/not authenticate authors/);
    assert.equal(fingerprints[0].sha256OfDecodedTextUtf8.length,64);
    const changed=await review.fingerprintCorpusDecodedText([doc("a","CP coating\nline 2")]);
    assert.notEqual(changed[0].sha256OfDecodedTextUtf8,fingerprints[0].sha256OfDecodedTextUtf8);
  } finally {
    if (!original) delete globalThis.crypto;
  }
});

test("selected evidence still passes the existing bounded opt-in AI Chat contract", () => {
  const docs=[doc("a","CP coating noted in survey\nCP current sufficient")];
  const result=core.searchCorpus(docs,"CP","near");
  const ids=result.hits.map(x=>x.id);
  ids.forEach(id=>assert.equal(review.verifyCurrentCorpusHit(docs,result.hits.find(h=>h.id===id)),true));
  const prompt=core.prepareCorpusAIRequest(result,ids,"Explain user-selected lines");
  assert.match(prompt,/BEGIN UNTRUSTED LOCAL EVIDENCE/);
  assert.match(prompt,/CP current sufficient/);
  assert.match(bridgeApi.prepareStudioChatMessage("ai.documents.analyze",prompt),/ETERNYX studio task/);
});

test("UI has phrase/near modes, direct context, explicit local reports and verified AI submission", () => {
  for (const fragment of [
    '<option value="phrase">', '<option value="near">',
    "corpusContext.lines.map", "reviewCorpusHit(hit.id)",
    "getCorpusSourceContext(corpusFiles, hit, 2)",
    "verifyCurrentCorpusHit(corpusFiles, hit)",
    "formatSelectedCorpusContext(corpusFiles, corpusResults, corpusSelectedIds)",
    "summarizeCorpusCoverage(corpusFiles, corpusResults)",
    "formatCorpusCoverage(corpusCoverage)",
    "fingerprintCorpusDecodedText(corpusFiles)", "formatCorpusFingerprints(corpusFingerprints)",
    "if (generation !== corpusHashVersion.current) return",
    "invalidateCorpusFingerprints()", "corpusAI.invalidate()",
    'corpusAI.run("ai.documents.analyze", prompt)',
    "No source verification", "not source authentication",
  ]) assert.ok(page.includes(fragment),"Missing review boundary: "+fragment);
  assert.match(hub,/AI Document Intelligence/);
  assert.doesNotMatch(page+source+reviewSource,/supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(/);
});
