import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const source=await read("src/lib/ai/document-corpus-assurance.ts");
const api=await import("data:text/javascript;base64,"+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString("base64"));
const packet={passages:[{label:"E1",source:"private-a.txt",startOffset:100,text:"Pipe potential is -850 mV. العربية\r\nCoating intact."},{label:"E2",source:"private-b.txt",startOffset:200,text:"Pipe potential is -950 mV."},{label:"E3",source:"unused.txt",startOffset:0,text:"Private 99 mV."}]};
const claim={text:"Pipe potential is -850 mV.",citations:["E1","E2"]};
const review={valid:true,status:"answered",claims:[claim,{text:"Coating intact.",citations:["E1"]}],uncertainty:"",usedLabels:["E1","E2"],unusedLabels:["E3"]};
test("quote candidates are exact cited substrings with decoded offsets",()=>{
 const suggestions=api.suggestClaimQuotes(claim,packet);
 assert.ok(suggestions.length>0&&suggestions.length<=3);
 for(const q of suggestions){const p=packet.passages.find(p=>p.label===q.label);assert.ok(claim.citations.includes(q.label));assert.equal(p.text.slice(q.startOffset-p.startOffset,q.startOffset-p.startOffset+q.quote.length),q.quote);}
});
test("exact quoted evidence records unique location and retains case and Unicode",()=>{
 assert.deepEqual(api.assessClaimQuote(claim,packet,"E1","Pipe potential is -850 mV."),{label:"E1",startOffset:100,endOffset:100+"Pipe potential is -850 mV.".length});
 assert.equal(api.assessClaimQuote(claim,packet,"E1","pipe potential is -850 mV."),null);
 const q="العربية\r\nCoating";
 const loc=api.assessClaimQuote(claim,packet,"E1",q);
 assert.ok(loc);assert.equal(packet.passages[0].text.slice(loc.startOffset-100,loc.endOffset-100),q);
});
test("rejects uncited, fabricated, short, long and repeated quotes",()=>{
 for(const [label,q] of [["E3","Private 99 mV."],["E1","fabricated claim"],["E1","Pipe"],["E1","x".repeat(241)]])assert.equal(api.assessClaimQuote(claim,packet,label,q),null);
 const ambiguous={passages:[{...packet.passages[0],text:"repeat phrase repeat phrase"}]};
 assert.equal(api.assessClaimQuote(claim,ambiguous,"E1","repeat phrase"),null);
});
test("numeric signals distinguish missing literal measurement and same-unit discrepancy",()=>{
 const result=api.claimReviewSignals(claim,packet);
 assert.deepEqual(result.missingMeasurements,[]);
 assert.deepEqual(result.conflicts,[{unit:"mV",leftLabel:"E1",rightLabel:"E2",leftValues:["-850"],rightValues:["-950"]}]);
 const missing=api.claimReviewSignals({...claim,text:"Pipe potential is -999 mV."},packet);
 assert.deepEqual(missing.missingMeasurements,[{value:"-999",unit:"mV"}]);
 assert.ok(missing.unmatchedTerms.includes("999"));
});
test("uncited measurements and different units are not compared",()=>{
 const result=api.claimReviewSignals({text:"99 mV",citations:["E1"]},packet);
 assert.equal(result.missingMeasurements.length,1);assert.equal(result.conflicts.length,0);
 const p={passages:[{label:"E1",text:"50 V"},{label:"E2",text:"60 mV"}]};
 assert.equal(api.claimReviewSignals(claim,p).conflicts.length,0);
});
test("matching numeric values do not produce a conflict signal",()=>{
 const p={passages:[{label:"E1",text:"50 V and 70 V"},{label:"E2",text:"50 V and 70 V"}]};
 assert.equal(api.claimReviewSignals(claim,p).conflicts.length,0);
});
test("manual counts require valid excerpt and allowed verdict; no automatic verdict",()=>{
 const initial=api.summarizeClaimAssurance(review,packet,{});
 assert.equal(initial.reviewedClaims,0);assert.equal(initial.counts.unreviewed,2);
 const result=api.summarizeClaimAssurance(review,packet,{0:{verdict:"conflicting",label:"E1",quote:"Pipe potential is -850 mV."},1:{verdict:"supported",label:"E2",quote:"Pipe potential is -950 mV."}});
 assert.equal(result.reviewedClaims,1);assert.equal(result.counts.conflicting,1);assert.equal(result.counts.unreviewed,1);
 assert.equal(result.claimsWithSignals,1);
});
test("counts-only report contains no source names, quotations or claim text",()=>{
 const report=api.formatAssuranceReport(api.summarizeClaimAssurance(review,packet,{}));
 assert.match(report,/not independent verification/);
 for(const value of ["private-a.txt","Pipe potential","-850","العربية","Coating intact"])assert.ok(!report.includes(value));
});
test("insufficient evidence with no claims stays unreviewed and does not imply a score",()=>{
 const summary=api.summarizeClaimAssurance({...review,status:"insufficient",claims:[],usedLabels:[],unusedLabels:["E1","E2"]},packet,{});
 assert.equal(summary.totalClaims,0);assert.equal(summary.reviewedClaims,0);assert.equal("confidence" in summary,false);
});
test("UI requires exact excerpt, explicit verdict and clears assessment on edits or new request",async()=>{
 const page=await read("src/pages/AIDocumentIntelligence.tsx");
 for(const fragment of ["Choose assessment","disabled={!location||!draft.verdict}","clearClaimReview();knowledgeAI.invalidate()","setRagConsent(false);setRagError(null);clearClaimReview()","delete next[i]","not a proven contradiction","Copy counts-only quality report"])assert.ok(page.includes(fragment),fragment);
 assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage/);
});
