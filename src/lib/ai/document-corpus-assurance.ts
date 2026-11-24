import type {prepareKnowledgeEvidence} from "./document-corpus-knowledge-evidence";
import type {RagReview} from "./document-corpus-rag";
type Packet=ReturnType<typeof prepareKnowledgeEvidence>;
type ValidReview=Extract<RagReview,{valid:true}>;
export const CLAIM_VERDICTS=["supported","partial","unsupported","conflicting"] as const;
export type ClaimVerdict=typeof CLAIM_VERDICTS[number];
export type ClaimAssessment={verdict:ClaimVerdict;label:string;quote:string};
const words=(s:string)=>new Set(s.normalize("NFKC").toLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu)??[]);
const measures=(s:string)=>Array.from(s.matchAll(/(?:^|[^\p{L}\p{N}.])([+-]?\d+(?:\.\d+)?)\s*(mV|V|mA|A|mm|cm|km|m|kg|mg|g|psi|bar|MPa|kPa|Pa|Hz|kHz|MHz|%|°C|°F)(?![\p{L}\p{N}])/gu),m=>({value:m[1],unit:m[2]}));
export function suggestClaimQuotes(claim:ValidReview["claims"][number],packet:Packet){
  const query=words(claim.text);
  return packet.passages.filter(p=>claim.citations.includes(p.label)).flatMap(p=>{
    // Exact substrings; never reconstruct or normalize the quoted text.
    const spans=Array.from(p.text.matchAll(/[^\r\n.!?]+(?:[.!?]+|(?=\r|\n|$))/g),m=>({text:m[0],offset:m.index!}));
    return spans.map(span=>{
      const leading=span.text.length-span.text.trimStart().length;
      const text=span.text.trim().slice(0,240);
      const overlap=[...words(text)].filter(t=>query.has(t)).length;
      return {label:p.label,quote:text,startOffset:p.startOffset+span.offset+leading,overlap};
    }).filter(x=>x.quote.length>=8&&x.overlap>0);
  }).sort((a,b)=>b.overlap-a.overlap||a.label.localeCompare(b.label)||a.startOffset-b.startOffset).slice(0,3);
}
export function assessClaimQuote(claim:ValidReview["claims"][number],packet:Packet,label:string,quote:string){
  if(!claim.citations.includes(label)||typeof quote!=="string"||quote.trim().length<8||quote.length>240)return null;
  const p=packet.passages.find(p=>p.label===label);
  if(!p)return null;
  const first=p.text.indexOf(quote);
  // Ambiguous occurrence must be disambiguated by expanding the quote.
  if(first<0||p.text.indexOf(quote,first+1)!==-1)return null;
  return {label,startOffset:p.startOffset+first,endOffset:p.startOffset+first+quote.length};
}
export function claimReviewSignals(claim:ValidReview["claims"][number],packet:Packet){
  const cited=packet.passages.filter(p=>claim.citations.includes(p.label));
  const sourceTerms=new Set(cited.flatMap(p=>[...words(p.text)]));
  const claimTerms=[...words(claim.text)];
  const unmatchedTerms=claimTerms.filter(t=>!sourceTerms.has(t)).slice(0,12);
  const claimMeasures=measures(claim.text);
  const missingMeasurements=claimMeasures.filter(m=>!cited.some(p=>measures(p.text).some(x=>x.value===m.value&&x.unit===m.unit)));
  const conflicts:{unit:string;leftLabel:string;rightLabel:string;leftValues:string[];rightValues:string[]}[]=[];
  for(let i=0;i<cited.length;i++)for(let j=i+1;j<cited.length;j++){
    const left=cited[i],right=cited[j];
    const a=measures(left.text),b=measures(right.text);
    for(const unit of new Set(a.map(x=>x.unit))){
      const av=[...new Set(a.filter(x=>x.unit===unit).map(x=>x.value))];
      const bv=[...new Set(b.filter(x=>x.unit===unit).map(x=>x.value))];
      if(bv.length&&av.some(v=>!bv.includes(v))&&bv.some(v=>!av.includes(v)))conflicts.push({unit,leftLabel:left.label,rightLabel:right.label,leftValues:av.slice(0,8),rightValues:bv.slice(0,8)});
    }
  }
  return {unmatchedTerms,missingMeasurements:missingMeasurements.slice(0,8),conflicts:conflicts.slice(0,12)};
}
export function summarizeClaimAssurance(review:ValidReview,packet:Packet,assessments:Readonly<Record<number,ClaimAssessment>>){
  const counts={supported:0,partial:0,unsupported:0,conflicting:0,unreviewed:0};
  let claimsWithSignals=0;
  for(const [i,claim] of review.claims.entries()){
    const a=assessments[i];
    if(a&&CLAIM_VERDICTS.includes(a.verdict)&&assessClaimQuote(claim,packet,a.label,a.quote))counts[a.verdict]++;
    else counts.unreviewed++;
    const signals=claimReviewSignals(claim,packet);
    if(signals.missingMeasurements.length||signals.conflicts.length)claimsWithSignals++;
  }
  return {modelStatus:review.status,totalClaims:review.claims.length,reviewedClaims:review.claims.length-counts.unreviewed,counts,claimsWithSignals,citedPassages:review.usedLabels.length,unusedPassages:review.unusedLabels.length};
}
export function formatAssuranceReport(summary:ReturnType<typeof summarizeClaimAssurance>){
  return ["ETERNYX local answer review (counts only)","Manual assessments; not independent verification or a confidence score.","Model status: "+summary.modelStatus,"Claims: "+summary.totalClaims,"Reviewed: "+summary.reviewedClaims,...Object.entries(summary.counts).map(([k,v])=>k+": "+v),"Claims with measurement review signals: "+summary.claimsWithSignals,"Cited passages: "+summary.citedPassages,"Unused passages: "+summary.unusedPassages].join("\n");
}
