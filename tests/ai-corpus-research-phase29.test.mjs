import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const core=url(compile(await read("src/lib/ai/document-corpus-tools.ts")));
const knowledge=url(compile(await read("src/lib/ai/document-corpus-knowledge.ts")).replace('"./document-corpus-tools"',JSON.stringify(core)));
const api=await import(url(compile(await read("src/lib/ai/document-corpus-research.ts")).replace('"./document-corpus-tools"',JSON.stringify(core)).replace('"./document-corpus-knowledge"',JSON.stringify(knowledge))));
const doc=(id,text)=>({id,name:id+".txt",kind:"txt",text});
const q=(id,query="steel pipe",mode="all")=>({id,question:"What does this source say?",query,mode});
const plan=(...questions)=>({title:"Review plan",questions});
test("strict versioned reusable plans round trip and reject invalid fields, IDs and queries",()=>{
 const p=plan(q("a"),q("b","corrosion","any"));
 assert.deepEqual(api.decodeResearchPlan(api.encodeResearchPlan(p)),p);
 for(const invalid of [plan(q("a"),q("a")),plan(q("a","!!!")),plan(q("a","a b c d e f g h i")),plan({...q("a"),extra:true}),plan(...Array.from({length:7},(_,i)=>q("q"+i)))])assert.throws(()=>api.validateResearchPlan(invalid));
 assert.throws(()=>api.decodeResearchPlan("x".repeat(8001)),/research_plan_too_large/);
});
test("each selected source is searched independently with real BM25 matching",()=>{
 const docs=[doc("a","steel pipe corrosion"),doc("b","steel coating"),doc("c","private steel pipe")];
 const result=api.runResearchPlan(docs,plan(q("all"),q("any","steel pipe","any")),["a","b"]);
 assert.deepEqual(result.sections[0].sources.map(s=>s.totalMatches),[1,0]);
 assert.deepEqual(result.sections[1].sources.map(s=>s.totalMatches),[1,1]);
 assert.deepEqual(result.sourceIds,["a","b"]);
});
test("no matches and tokenless sources are genuine empty results",()=>{
 const result=api.runResearchPlan([doc("a","!!!")],plan(q("q")),["a"]);
 assert.equal(result.sections[0].sources[0].totalMatches,0);
 assert.deepEqual(result.sections[0].sources[0].passages,[]);
});
test("source selection is explicit, unique and current",()=>{
 for(const ids of [[],["missing"],["a","a"]])assert.throws(()=>api.runResearchPlan([doc("a","steel pipe")],plan(q("q")),ids),/invalid_research_sources/);
});
test("date mentions are sorted, Gregorian-valid and exact source substrings",()=>{
 const d=doc("a","2026-11-24\r\n1900-02-29 invalid\r2000-02-29 leap\n2026-02-30 invalid\n2024-01-01 and 2024-01-01\n0000-01-01");
 const dates=api.collectResearchDates([d]);
 assert.deepEqual(dates.events.map(e=>e.date),["2000-02-29","2024-01-01","2024-01-01","2026-11-24"]);
 assert.equal(dates.invalid,3);
 for(const e of dates.events){assert.equal(d.text.slice(e.startOffset,e.endOffset),e.date);assert.equal(d.text.slice(e.excerptStartOffset,e.excerptStartOffset+e.excerpt.length),e.excerpt);}
});
test("long timeline excerpts retain the date and display cap is explicit",()=>{
 const d=doc("a","x".repeat(700)+" 2026-01-01 "+"z".repeat(700)+"\n"+"2025-01-01\n".repeat(101));
 const all=api.collectResearchDates([d]);
 assert.equal(all.total,102);assert.equal(all.events.length,100);assert.equal(all.truncated,true);
 const e=api.collectResearchDates([doc("b","x".repeat(700)+" 2026-01-01 "+"z".repeat(700))]).events[0];
 assert.equal(e.lineTruncated,true);assert.ok(e.excerpt.includes(e.date));assert.ok(e.excerpt.length<=400);
});
test("evidence export includes only selected passages and explicitly labeled human notes",()=>{
 const report=api.runResearchPlan([doc("a","steel pipe"),doc("b","steel pipe private")],plan(q("q")),["a","b"]);
 const hit=report.sections[0].sources[0].passages[0];
 const output=JSON.parse(api.formatResearchEvidence(report,[{questionId:"q",passageId:hit.id}],{q:"My note"},false));
 assert.equal(output.sections[0].reviewerNotes,"My note");
 assert.equal(output.sections[0].sources[0].evidence[0].text,"steel pipe");
 assert.deepEqual(output.sections[0].sources[1].evidence,[]);
 assert.ok(!JSON.stringify(output).includes("steel pipe private"));
 assert.equal("timeline" in output,false);
});
test("exports reject duplicate or stale evidence selections and unknown notes",()=>{
 const report=api.runResearchPlan([doc("a","steel pipe")],plan(q("q")),["a"]);
 const sel={questionId:"q",passageId:report.sections[0].sources[0].passages[0].id};
 for(const chosen of [[],[sel,sel],[{...sel,passageId:"missing"}]])assert.throws(()=>api.formatResearchEvidence(report,chosen,{},false),/invalid_research_selection/);
 assert.throws(()=>api.formatResearchEvidence(report,[sel],{missing:"x"},false),/invalid_research_notes/);
});
test("counts-only report contains no filenames, questions or extracted content",()=>{
 const report=api.runResearchPlan([doc("secret","steel pipe 2026-01-01")],plan(q("q")),["secret"]);
 const counts=api.formatResearchCounts(report);
 for(const value of ["secret.txt","steel pipe","Review plan","2026-01-01","What does"])assert.ok(!counts.includes(value));
 const out=JSON.parse(api.formatResearchEvidence(report,[],{},true));
 assert.equal(out.timeline.events.length,1);
});
test("UI requires explicit research run, review selection and export consent, with stale fencing",async()=>{
 const ui=await read("src/components/ai/LocalCorpusResearch.tsx"),page=await read("src/pages/AIDocumentIntelligence.tsx");
 for(const v of ["snapshot?.documents===documents","snapshot.plan===plan","snapshot.sourceIds===sourceIds","window.confirm(","Run comparative research","Copy reviewed evidence report JSON","Include displayed date mentions","setNotes({})"])assert.ok(ui.includes(v),v);
 assert.doesNotMatch(ui,/fetch\(|localStorage|functions\.invoke\(/);
 assert.match(page,/<LocalCorpusResearch documents=\{corpusFiles\}/);
});
