import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const core=url(compile(await read("src/lib/ai/document-corpus-tools.ts")));
const analytics=url(compile(await read("src/lib/ai/document-corpus-analytics.ts")).replace('"./document-corpus-tools"',JSON.stringify(core)));
const api=await import(url(compile(await read("src/lib/ai/document-corpus-validation.ts")).replace('"./document-corpus-tools"',JSON.stringify(core)).replace('"./document-corpus-analytics"',JSON.stringify(analytics))));
const doc=(id,text)=>({id,name:id+".txt",kind:"txt",text});
const rule=(id,field,operator,extra={})=>({id,field,operator,expected:"",minimum:"",maximum:"",...extra});
const template=(...rules)=>({name:"Inspection rules",rules});
const range=rule("r","Voltage","range",{minimum:"-950 mV",maximum:"-0.85 V"});
test("template JSON round trips without source data and rejects unexpected schema",()=>{
 const t=template(range,rule("s","Status","equals",{expected:"Ready"}));
 assert.deepEqual(api.decodeValidationTemplate(api.encodeValidationTemplate(t)),t);
 assert.throws(()=>api.decodeValidationTemplate('{"format":"wrong","template":{}}'));
 assert.throws(()=>api.validateTemplate({...t,extra:true}));
 assert.throws(()=>api.validateTemplate(template({...range,code:"evil"})));
 assert.throws(()=>api.validateTemplate(template(range,range)));
});
test("invalid, mixed or unordered thresholds fail closed",()=>{
 for(const bounds of [{minimum:"1 kg",maximum:"2 V"},{minimum:"2 V",maximum:"1 V"},{minimum:"1-2 V",maximum:"3 V"},{minimum:"1 V",maximum:""}]){
 assert.throws(()=>api.validateTemplate(template({...range,...bounds})),/invalid_validation_range/);
 }
});
test("text presence and literal operators use case-sensitive original values",()=>{
 const t=template(rule("a","Status","present"),rule("b","Status","equals",{expected:"Ready"}),rule("c","Status","contains",{expected:"ead"}),rule("d","Status","equals",{expected:"ready"}));
 const report=api.runValidationTemplate([doc("one","Status: Ready")],t,["one"]);
 assert.deepEqual(report.rows.map(r=>r.status),["match","match","match","exception"]);
});
test("signed ranges, compatible units and inclusive boundaries evaluate per selected source",()=>{
 const docs=[doc("a","Voltage: -950 mV\nVoltage: -0.85 V"),doc("b","Voltage: -800 mV"),doc("c","Voltage: 1 kg"),doc("d","Status: Ready")];
 const report=api.runValidationTemplate(docs,template(range),["a","b","c","d"]);
 assert.deepEqual(report.rows.map(r=>r.status),["match","exception","review","missing"]);
 assert.deepEqual(report.counts,{match:1,exception:1,missing:1,review:1});
 assert.equal(report.rows[0].observations.length,2);
});
test("all repeats must satisfy the rule and original line offsets survive",()=>{
 const d=doc("a","Header\r\nVoltage: -900 mV\r\nVoltage: -800 mV");
 const report=api.runValidationTemplate([d],template(range),["a"]);
 assert.equal(report.rows[0].status,"exception");
 for(const o of report.rows[0].observations)assert.equal(d.text.slice(o.startOffset,o.endOffset),o.rawLine);
});
test("excluded long fields force conservative review, never a false missing or match",()=>{
 const d=doc("a","Long: "+"x".repeat(241)+"\nVoltage: -900 mV");
 const report=api.runValidationTemplate([d],template(range,rule("s","Status","present")),["a"]);
 assert.deepEqual(report.rows.map(r=>r.status),["review","review"]);
});
test("unknown and duplicate source selections reject; only selected documents evaluated",()=>{
 const docs=[doc("a","Voltage: -900 mV"),doc("b","Voltage: -800 mV")];
 assert.equal(api.runValidationTemplate(docs,template(range),["a"]).rows.length,1);
 for(const ids of [[],["missing"],["a","a"]])assert.throws(()=>api.runValidationTemplate(docs,template(range),ids),/invalid_validation_sources/);
});
test("rule, template and repeated evidence bounds reject without partial output",()=>{
 assert.throws(()=>api.validateTemplate(template(...Array.from({length:21},(_,i)=>rule("r"+i,"Voltage","present")))));
 assert.throws(()=>api.decodeValidationTemplate("x".repeat(16001)),/template_too_large/);
 const d=doc("a","Voltage: 1 V\n".repeat(1500));
 assert.throws(()=>api.runValidationTemplate([d],template(...Array.from({length:3},(_,i)=>rule("r"+i,"Voltage","present"))),["a"]),/validation_evidence_limit/);
});
test("counts-only report contains no field names, private source or values; exceptions preserve evidence",()=>{
 const report=api.runValidationTemplate([doc("secret","Voltage: -800 mV"),doc("ok","Voltage: -900 mV")],template(range),["secret","ok"]);
 const counts=api.formatValidationCounts(report);
 for(const s of ["secret.txt","Voltage","-800 mV","Inspection rules"])assert.ok(!counts.includes(s));
 const exceptions=JSON.parse(api.formatValidationExceptions(report));
 assert.equal(exceptions.exceptions.length,1);
 assert.equal(exceptions.exceptions[0].observations[0].rawLine,"Voltage: -800 mV");
 assert.ok(!JSON.stringify(exceptions).includes("ok.txt"));
});
test("UI explicitly runs selected sources, fences stale reports and confirms private exports",async()=>{
 const ui=await read("src/components/ai/LocalCorpusValidation.tsx"),page=await read("src/pages/AIDocumentIntelligence.tsx");
 for(const s of ["snapshot?.documents===documents","snapshot.template===template","snapshot.selected===selected","window.confirm(","Run local validation batch","Copy exception evidence JSON","Copy reusable template JSON","setSelected([])"])assert.ok(ui.includes(s),s);
 assert.doesNotMatch(ui,/fetch\(|localStorage|functions\.invoke\(/);
 assert.match(page,/<LocalCorpusValidation documents=\{corpusFiles\}/);
});
