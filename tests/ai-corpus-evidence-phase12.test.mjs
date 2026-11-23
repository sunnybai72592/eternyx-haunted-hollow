import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helper = await read("src/lib/ai/document-corpus-tools.ts");
const page = await read("src/pages/AIDocumentIntelligence.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const bridge = await read("src/lib/ai/studio-chat-request.ts");
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } };
const load = source => import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, opts).outputText).toString("base64"));
const corpus = await load(helper);
const chat = await load(bridge);
const makeDoc = (id, name, text, kind = "txt") => ({ id, name, kind, text });

test("multi-file corpus admits validated text sources without modifying originals", () => {
  const first = makeDoc("a", "Coating.txt", "CP criteria\nProtective coating");
  const result = corpus.addCorpusDocuments([], [first, makeDoc("b", "readme.md", "Inspection note", "md")]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], first);
  assert.equal(corpus.MAX_CORPUS_FILES, 8);
  assert.equal(corpus.MAX_CORPUS_TOTAL_CHARS, 400000);
  assert.equal(corpus.MAX_CORPUS_FILE_CHARS, 100000);
  assert.equal(corpus.MAX_CORPUS_MATCHES, 2000);
});

test("duplicate names or IDs, unsupported formats, binary, empty and overlong files fail atomically", () => {
  const good = makeDoc("a", "first.txt", "CP");
  for (const bad of [
    makeDoc("a", "second.txt", "CP"),
    makeDoc("b", "FIRST.TXT", "CP"),
  ]) assert.throws(() => corpus.addCorpusDocuments([good], [bad]), { code: "duplicate_file" });
  for (const bad of [
    makeDoc("bad id", "bad.txt", "CP"),
    makeDoc("b", "bad.txt", "CP", "pdf"),
    makeDoc("b", "bad.txt", " "),
    makeDoc("b", "bad.txt", "a\u0000b"),
    makeDoc("b", "bad.txt", "x".repeat(100001)),
  ]) assert.throws(() => corpus.addCorpusDocuments([good], [bad]), { code: "invalid_file" });
  const full = Array.from({length:8}, (_,i)=>makeDoc("s"+i,"doc"+i+".txt","one"));
  assert.throws(()=>corpus.addCorpusDocuments(full,[makeDoc("later","later.txt","two")]),{code:"file_limit"});
  const large = Array.from({length:5}, (_,i)=>makeDoc("s"+i,"big"+i+".txt","X".repeat(90000)));
  assert.throws(()=>corpus.addCorpusDocuments([],large),{code:"too_large"});
  assert.equal(full.length, 8, "Existing input remains unchanged after refusal");
});

test("all/any queries perform exact Unicode word matching and do not hallucinate matches", () => {
  const docs = [
    makeDoc("a","a.txt","CP inspection\nCoating inspection\nNothing"),
    makeDoc("b","b.md","Inspection and CP\ncp cp coating"),
  ];
  const all = corpus.searchCorpus(docs, "CP inspection");
  assert.equal(all.totalHits, 2);
  assert.deepEqual(all.hits.map(x=>[x.documentName,x.line]),[["a.txt",1],["b.md",1]]);
  assert.equal(all.hits[0].score,202);
  assert.equal(all.hits[0].matchedTerms.length,2);
  const any = corpus.searchCorpus(docs, "CP inspection", "any");
  assert.equal(any.totalHits,4);
  assert.equal(any.hits[0].score,202);
  assert.equal(any.hits.find(x=>x.documentName==="b.md"&&x.line===2).frequency,2);
  assert.equal(corpus.searchCorpus(docs,"CP I", "all").totalHits,0);
  assert.equal(corpus.searchCorpus(docs, "CP", "any", "b").searchedFiles,1);
  assert.deepEqual(corpus.searchCorpus(docs, "CP", "any", "b").hits.map(x=>x.documentName),["b.md","b.md"]);
});

test("Unicode Arabic/Pashto and CRLF retain original source line numbers", () => {
  const doc=makeDoc("c","arabic.txt","مرحباً بالعالم\r\n\nسلام پشتو\rآخر\n");
  const ar=corpus.searchCorpus([doc], "سلام");
  assert.equal(ar.totalHits,1);
  assert.equal(ar.hits[0].line,3);
  assert.equal(ar.hits[0].snippet,"سلام پشتو");
  assert.equal(ar.hits[0].snippetStartColumn,1);
  const ps=corpus.searchCorpus([doc],"پشتو");
  assert.equal(ps.hits[0].line,3);
  assert.equal(ps.hits[0].matchedTerms[0],"پشتو");
});

test("scoring sorts by actual matched term coverage/frequency with stable source order", () => {
  const doc=makeDoc("a","a.txt","cp\ncoating\ncp coating\ncp cp coating\ncp coating");
  const results=corpus.searchCorpus([doc],"cp coating","any");
  assert.deepEqual(results.hits.map(x=>x.line),[4,3,5,1,2]);
  assert.equal(results.hits[0].frequency,3);
  assert.equal(results.hits[0].score,203);
  assert.equal(results.hits[1].score,202);
  assert.equal(results.hits[1].documentId,"a");
  assert.equal(results.hits[1].id,"a:3");
});

test("long lines show exact source-derived partial excerpts without claiming to show full line", () => {
  const raw="X".repeat(425)+" inspection CHECK "+"Y".repeat(360);
  const result=corpus.searchCorpus([makeDoc("a","long.txt",raw)],"inspection");
  const hit=result.hits[0];
  assert.equal(hit.partial,true);
  assert.equal(hit.sourceLineLength,raw.length);
  assert.equal(hit.snippet.length,340);
  assert.equal(raw.slice(hit.snippetStartColumn-1, hit.snippetStartColumn-1+hit.snippet.length),hit.snippet);
  assert.match(hit.snippet,/inspection/);
  assert.match(corpus.formatCorpusSearch(result), /Partial excerpt: yes/);
});

test("query grammar, unknown filters and more than 2,000 matched lines refuse partial reports", () => {
  const doc=makeDoc("a","a.txt","cp");
  for(const query of ["", "+++", "w ".repeat(9), "x".repeat(121)]){
    assert.throws(()=>corpus.searchCorpus([doc],query),{code:"invalid_query"});
  }
  assert.throws(()=>corpus.searchCorpus([doc],"cp","foo"),{code:"invalid_query"});
  assert.throws(()=>corpus.searchCorpus([doc],"cp","semantic"),{code:"invalid_query"});
  const large=makeDoc("many","many.txt","cp\n".repeat(2001));
  assert.throws(()=>corpus.searchCorpus([large],"cp"),{code:"too_many_matches"});
});

test("full TXT and JSON exports cover all recorded hits even when preview shows 80", () => {
  const d=makeDoc("a","many.txt","cp\n".repeat(100));
  const r=corpus.searchCorpus([d],"cp");
  assert.equal(r.totalHits,100);
  assert.equal(r.hits.length,100);
  assert.equal(corpus.MAX_CORPUS_PREVIEW,80);
  const exported=corpus.formatCorpusSearch(r);
  assert.match(exported,/Complete matched lines: 100/);
  assert.match(exported,/Line: 100 /);
  assert.match(exported,/not semantic search or verified citations/);
});

test("only whole selected exact excerpts can be prepared for optional AI Chat", () => {
  const docs=[makeDoc("a","a.txt","cp criterion -850\ncoating system\ncp survey")];
  const result=corpus.searchCorpus(docs,"cp");
  const prompt=corpus.prepareCorpusAIRequest(result,[result.hits[0].id,result.hits[1].id],"Review the evidence.");
  assert.match(prompt,/BEGIN UNTRUSTED LOCAL EVIDENCE/);
  assert.match(prompt,/source a.txt \/ line 1 \/ column 1/);
  assert.match(prompt,/source a.txt \/ line 3 \/ column 1/);
  assert.match(prompt,/cp criterion -850/);
  assert.match(prompt,/cp survey/);
  assert.match(prompt,/untrusted data/);
  assert.ok(prompt.length<=3600);
  const request=chat.prepareStudioChatMessage("ai.documents.analyze",prompt);
  assert.ok(request.length<=chat.STUDIO_CHAT_MAX_MESSAGE_LENGTH);
});

test("AI evidence limit and stale/missing selections are refused before network", () => {
  const docs=[makeDoc("a","a.txt","cp\n".repeat(9))];
  const r=corpus.searchCorpus(docs,"cp");
  const ids=r.hits.map(x=>x.id);
  for(const bad of [[],ids.slice(0,7),[ids[0],ids[0]]]){
    assert.throws(()=>corpus.prepareCorpusAIRequest(r,bad,""),{code:"too_many_evidence"});
  }
  assert.throws(()=>corpus.prepareCorpusAIRequest(r,["nonexistent"],""),{code:"invalid_evidence"});
  assert.throws(()=>corpus.prepareCorpusAIRequest(r,[ids[0]],"x".repeat(251)),{code:"invalid_question"});
});

test("oversized AI evidence is rejected instead of silently truncating", () => {
  const docs=Array.from({length:6},(_,i)=>makeDoc("d"+i,"filename_"+i+"X".repeat(220)+".txt","cp "+"Y".repeat(700)));
  const r=corpus.searchCorpus(docs,"cp");
  assert.equal(r.hits.length,6);
  assert.throws(()=>corpus.prepareCorpusAIRequest(r,r.hits.map(x=>x.id),""),{code:"too_large"});
});

test("UI performs local file selection, honest search and privacy-gated optional AI submission", () => {
  for(const token of [
    "MAX_CORPUS_FILES", "addCorpusDocuments(corpusFiles, additions)",
    "await Promise.all(files.map(file => readLocalDocument(file)))",
    "if (version !== corpusReadVersion.current) return",
    "++corpusReadVersion.current", "invalidateCorpus()", "corpusAI.invalidate()",
    "searchCorpus(corpusFiles, corpusQuery, corpusMode, corpusFilter || null)",
    "corpusResults.hits.slice(0, MAX_CORPUS_PREVIEW)",
    "formatCorpusSearch(corpusResults)", "JSON.stringify(corpusResults, null, 2)",
    "prepareCorpusAIRequest(corpusResults, corpusSelectedIds, corpusQuestion)",
    "inspectDocumentPrivacy(prompt).findings.length", "window.confirm(",
    'corpusAI.run("ai.documents.analyze", prompt)', "original source line contains",
    "Only an explicit click sends the full selected excerpts",
    "Complete local result export requested",
    'type="file" multiple', "No source verification",
  ]) assert.ok(page.includes(token),"Missing local-corpus boundary: "+token);
  assert.match(hub,/AI Document Intelligence/);
  assert.doesNotMatch(page+helper,/supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(/);
});
