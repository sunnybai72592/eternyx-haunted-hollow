import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const core=url(compile(await read("src/lib/ai/document-corpus-tools.ts")));
const source=await read("src/lib/ai/document-corpus-knowledge.ts");
const api=await import(url(compile(source).replace('"./document-corpus-tools"',JSON.stringify(core))));
const doc=(id,text)=>({id,name:id+".txt",kind:"txt",text});
test("multi-line passages retain exact original offsets, CRLF and Unicode",()=>{
 const d=doc("a","First line\r\nCathodic protection پښتو\rThird line");
 const index=api.buildKnowledgeIndex([d]);
 const [p]=index.passages;
 assert.equal(p.text,d.text);
 assert.equal(p.startLine,1);assert.equal(p.endLine,3);
 assert.equal(d.text.slice(p.startOffset,p.endOffset),p.text);
 const hit=api.searchKnowledgeIndex(index,"پښتو","all").results[0];
 assert.equal(hit.documentId,"a");assert.equal(hit.text,d.text);
});
test("long sources are bounded without splitting surrogate pairs or CRLF",()=>{
 const d=doc("a","x".repeat(999)+"😀"+" y".repeat(2000)+"\r\nEnd");
 const index=api.buildKnowledgeIndex([d]);
 assert.ok(index.passages.length>1);
 assert.equal(index.passages.map(p=>p.text).join(""),d.text);
 for(const p of index.passages){
 assert.ok(p.text.length<=api.KNOWLEDGE_CHUNK_CHARS);
 assert.equal(d.text.slice(p.startOffset,p.endOffset),p.text);
 assert.doesNotMatch(p.text,/[\uD800-\uDBFF]$/);
 assert.doesNotMatch(p.text,/^[\uDC00-\uDFFF]/);
 }
 const cr=doc("b","x".repeat(999)+"\r\nnext");
 const c=api.buildKnowledgeIndex([cr]).passages;
 assert.equal(c.map(p=>p.text).join(""),cr.text);
 assert.equal(c[0].endOffset,999);
});
test("line-aligned chunks report physical line coordinates",()=>{
 const d=doc("a",("abc ".repeat(220)+"\r\n").repeat(4));
 const p=api.buildKnowledgeIndex([d]).passages;
 assert.deepEqual(p.map(x=>[x.startLine,x.endLine]),[[1,1],[2,2],[3,3],[4,4]]);
});
test("BM25 favors repeated matching terms for equal passage lengths",()=>{
 const idx=api.buildKnowledgeIndex([doc("a","steel steel steel"),doc("b","steel pipe pipe"),doc("c","paint coat dry")]);
 const r=api.searchKnowledgeIndex(idx,"steel","all");
 assert.equal(r.totalMatches,2);
 assert.deepEqual(r.results.map(x=>x.documentId),["a","b"]);
 assert.ok(r.results[0].score>r.results[1].score);
});
test("all and any modes, normalized Unicode query and source filtering",()=>{
 const idx=api.buildKnowledgeIndex([doc("a","ＰＩＰＥ protection"),doc("b","pipe corrosion"),doc("c","paint")]);
 assert.deepEqual(api.searchKnowledgeIndex(idx,"PIPE protection","all").results.map(x=>x.documentId),["a"]);
 assert.equal(api.searchKnowledgeIndex(idx,"pipe protection","any").totalMatches,2);
 assert.deepEqual(api.searchKnowledgeIndex(idx,"pipe","any","b").results.map(x=>x.documentId),["b"]);
 assert.equal(api.searchKnowledgeIndex(idx,"unknown","all").totalMatches,0);
});
test("ties are deterministic and duplicate query terms are de-duplicated",()=>{
 const idx=api.buildKnowledgeIndex([doc("a","pipe"),doc("b","pipe")]);
 const r=api.searchKnowledgeIndex(idx,"pipe PIPE","all");
 assert.deepEqual(r.terms,["pipe"]);
 assert.deepEqual(r.results.map(x=>x.documentId),["a","b"]);
});
test("result cap reports actual match count",()=>{
 const idx=api.buildKnowledgeIndex([doc("a","pipe ".repeat(9000))]);
 const r=api.searchKnowledgeIndex(idx,"pipe","all");
 assert.ok(r.totalMatches>30);
 assert.equal(r.results.length,30);
});
test("invalid query, invalid filter and punctuation-only source fail explicitly",()=>{
 const idx=api.buildKnowledgeIndex([doc("a","pipe")]);
 for(const q of ["","!!!","x".repeat(121),"a b c d e f g h i"])assert.throws(()=>api.searchKnowledgeIndex(idx,q,"all"),/invalid_query/);
 assert.throws(()=>api.searchKnowledgeIndex(idx,"pipe","all","missing"),/invalid_filter/);
 assert.throws(()=>api.searchKnowledgeIndex(api.buildKnowledgeIndex([doc("a","!!!")]),"pipe","all"),/empty_index/);
});
test("UI guards stale index, explicit builds, independent query and source-linked copy",async()=>{
 const page=await read("src/pages/AIDocumentIntelligence.tsx");
 for(const f of ["knowledgeIndex?.sources===corpusFiles","Build local knowledge index","Rank local passages","Copy source passage and location","invalidateKnowledgeIndex();","invalidateKnowledgeResults();","not semantic AI"])assert.ok(page.includes(f),f);
 assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\(/);
 const p=api.buildKnowledgeIndex([doc("a","Exact evidence")]).passages[0];
 assert.match(api.formatKnowledgePassage(p),/a\.txt \| lines 1–1/);
 assert.ok(api.formatKnowledgePassage(p).endsWith("Exact evidence"));
});
