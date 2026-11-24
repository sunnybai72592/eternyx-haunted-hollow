import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const url=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const core=url(compile(await read("src/lib/ai/document-corpus-tools.ts")));
const source=await read("src/lib/ai/document-corpus-analytics.ts");
const api=await import(url(compile(source).replace('"./document-corpus-tools"',JSON.stringify(core))));
const doc=(id,text)=>({id,name:id+".txt",kind:"txt",text});
test("compatible measurements convert with correct factors, signs and affine temperature",()=>{
 for(const [literal,value,unit] of [["-850 mV",-.85,"V"],["2 mil",.0000508,"m"],["50 µm",.00005,"m"],["50 μm",.00005,"m"],["1 bar",100000,"Pa"],["32 °F",0,"°C"],["212 °F",100,"°C"],["1000 mA",1,"A"],["250 mg",.00025,"kg"]]){
 const m=api.parseAnalyticsMeasurement(literal);assert.ok(m,literal);assert.ok(Math.abs(m.canonicalValue-value)<1e-9,literal);assert.equal(m.canonicalUnit,unit);
 }
});
test("unsupported quantities are not guessed or partially interpreted",()=>{
 for(const literal of ["1,000 V","1e3 V","1-2 V","0.5 V DC","12","2026-11-24","1 Mv","1 m/s","1 ohm","1000000000001 V","2 constructor","1 __proto__","NaN V"])assert.equal(api.parseAnalyticsMeasurement(literal),null,literal);
});
test("source-linked grouping normalizes keys but preserves original field lines and offsets",()=>{
 const a=doc("a","Header\r\nPotential: -850 mV\r\nپښتو: Ready");
 const b=doc("b","ＰＯＴＥＮＴＩＡＬ = -0.85 V\rOther: text");
 const result=api.analyzeCorpusFields([a,b]);
 const field=result.fields.find(f=>f.key==="potential");
 assert.equal(field.status,"converted_match");assert.equal(field.sourceCount,2);
 for(const o of result.fields.flatMap(f=>f.observations)){const d=o.sourceId==="a"?a:b;assert.equal(d.text.slice(o.startOffset,o.endOffset),o.rawLine);assert.equal(d.text.split(/\r\n|\r|\n/)[o.line-1],o.rawLine);}
});
test("literal, converted, conflicting, incompatible and single-source states are distinct",()=>{
 const a=doc("a","Status: Ready\nVoltage: 1 V\nPressure: 1 bar\nMixed: 1 kg\nOnly A: value");
 const b=doc("b","status: Ready\nVoltage: 1000 mV\nPressure: 2 bar\nMixed: 1 V");
 const fields=Object.fromEntries(api.analyzeCorpusFields([a,b]).fields.map(f=>[f.key,f.status]));
 assert.deepEqual(fields,{mixed:"mixed_or_incompatible",pressure:"different_values",status:"literal_match",voltage:"converted_match","only a":"single_source"});
});
test("repeated observations are preserved and no value is silently chosen",()=>{
 const report=api.analyzeCorpusFields([doc("a","Voltage: 1 V\nVoltage: 2 V"),doc("b","Voltage: 1000 mV")]);
 const f=report.fields[0];assert.equal(f.repeatedSources,1);assert.equal(f.observations.length,3);assert.equal(f.status,"different_values");
});
test("zero, missing and incompatible values remain distinct",()=>{
 const report=api.analyzeCorpusFields([doc("a","Current: 0 mA\nTemperature: 32 °F"),doc("b","Temperature: 0 °C"),doc("c","Current: unknown")]);
 assert.equal(report.fields.find(f=>f.key==="current").status,"mixed_or_incompatible");
 assert.equal(report.fields.find(f=>f.key==="temperature").status,"converted_match");
 assert.equal(report.fields.find(f=>f.key==="current").sourceCount,2);
});
test("numeric comparison does not treat significantly different quantities as equivalent",()=>{
 const report=api.analyzeCorpusFields([doc("a","Voltage: 1 V"),doc("b","Voltage: 1.00001 V")]);
 assert.equal(report.fields[0].status,"different_values");
});
test("bounded field and observation limits fail closed; long values reported separately",()=>{
 const long=api.analyzeCorpusFields([doc("a","Field: "+"x".repeat(241)+"\nStatus: Ready")]);
 assert.equal(long.excludedLongFields,1);assert.equal(long.total,1);
 assert.throws(()=>api.analyzeCorpusFields([doc("a",Array.from({length:201},(_,i)=>"Field "+i+": x").join("\n"))]),/analytics_field_limit/);
 assert.throws(()=>api.analyzeCorpusFields([doc("a","Status: x\n".repeat(2001))]),/analytics_observation_limit/);
});
test("counts-only report discloses no evidence names or values; selected JSON retains exact sources",()=>{
 const report=api.analyzeCorpusFields([doc("secret","Voltage: 1 V\nOwner: Private Name"),doc("other","Voltage: 1000 mV")]);
 const counts=api.formatAnalyticsCounts(report);for(const value of ["secret.txt","Private Name","1000 mV","Voltage"])assert.ok(!counts.includes(value));
 const evidence=JSON.parse(api.formatAnalyticsEvidence(report,["voltage"]));assert.equal(evidence.fields.length,1);assert.equal(evidence.fields[0].observations[0].rawLine,"Voltage: 1 V");assert.ok(!JSON.stringify(evidence).includes("Private Name"));
 for(const keys of [[],["missing"],["voltage","voltage"]])assert.throws(()=>api.formatAnalyticsEvidence(report,keys),/invalid_analytics_selection/);
});
test("UI matrix, explicit evidence export, stale-source fencing and local-only operation",async()=>{
 const component=await read("src/components/ai/LocalCorpusAnalytics.tsx"),page=await read("src/pages/AIDocumentIntelligence.tsx");
 for(const s of ["snapshot?.documents===documents","Missing","window.confirm(","Copy selected evidence JSON","Copy counts-only analytics","setSelected([])","[documents]"])assert.ok(component.includes(s),s);
 assert.doesNotMatch(component,/fetch\(|localStorage|functions\.invoke\(/);
 assert.match(page,/<LocalCorpusAnalytics documents=\{corpusFiles\}/);
});
