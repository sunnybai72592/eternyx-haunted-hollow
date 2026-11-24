import {analyzeCorpusFields,parseAnalyticsMeasurement,type Observation} from "./document-corpus-analytics";
import {addCorpusDocuments,type CorpusDocument} from "./document-corpus-tools";
export const MAX_VALIDATION_RULES=20;
export const MAX_TEMPLATE_CHARS=16000;
export const MAX_VALIDATION_EVIDENCE=4000;
export const RULE_OPERATORS=["present","equals","contains","range"] as const;
export type RuleOperator=typeof RULE_OPERATORS[number];
export type ValidationRule={id:string;field:string;operator:RuleOperator;expected:string;minimum:string;maximum:string};
export type ValidationTemplate={name:string;rules:ValidationRule[]};
export type ValidationStatus="match"|"exception"|"missing"|"review";
const own=(x:object,k:string)=>Object.prototype.hasOwnProperty.call(x,k);
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const exactKeys=(x:Record<string,unknown>,keys:string[])=>Object.keys(x).length===keys.length&&keys.every(k=>own(x,k));
const safe=(x:unknown,n:number):x is string=>typeof x==="string"&&x.length<=n&&!/[\u0000-\u001f\u007f]/.test(x);
const keyOf=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase();
function fail(code="invalid_validation_template"):never{throw new Error(code);}
export function validateTemplate(input:unknown):ValidationTemplate{
  if(!object(input)||!exactKeys(input,["name","rules"])||!safe(input.name,80)||!input.name.trim()||!Array.isArray(input.rules)||!input.rules.length||input.rules.length>MAX_VALIDATION_RULES)fail();
  const ids=new Set<string>();
  const rules:ValidationRule[]=input.rules.map(rule=>{
    if(!object(rule)||!exactKeys(rule,["id","field","operator","expected","minimum","maximum"])||!safe(rule.id,64)||! /^[A-Za-z0-9_-]{1,64}$/.test(rule.id)||ids.has(rule.id)||!safe(rule.field,60)||! /^[\p{L}][\p{L}\p{M}\p{N} _.-]{0,59}$/u.test(rule.field.trim())||!RULE_OPERATORS.includes(rule.operator as RuleOperator)||!safe(rule.expected,240)||!safe(rule.minimum,80)||!safe(rule.maximum,80))fail();
    ids.add(rule.id);
    const op=rule.operator as RuleOperator;
    if(op==="present"&&(rule.expected||rule.minimum||rule.maximum))fail();
    if((op==="equals"||op==="contains")&&(!rule.expected.trim()||rule.minimum||rule.maximum))fail();
    if(op==="range"){
      if(rule.expected)fail();
      const min=parseAnalyticsMeasurement(rule.minimum),max=parseAnalyticsMeasurement(rule.maximum);
      if(!min||!max||min.dimension!==max.dimension||min.canonicalValue>max.canonicalValue)fail("invalid_validation_range");
    }
    return {id:rule.id,field:rule.field.trim(),operator:op,expected:rule.expected,minimum:rule.minimum,maximum:rule.maximum};
  });
  return {name:input.name.trim(),rules};
}
export function encodeValidationTemplate(template:ValidationTemplate){
  const result=JSON.stringify({format:"eternyx-validation-template-v1",template:validateTemplate(template)},null,2);
  if(result.length>MAX_TEMPLATE_CHARS)fail("template_too_large");
  return result;
}
export function decodeValidationTemplate(raw:string){
  if(typeof raw!=="string"||raw.length>MAX_TEMPLATE_CHARS)fail("template_too_large");
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{fail();}
  if(!object(parsed)||!exactKeys(parsed,["format","template"])||parsed.format!=="eternyx-validation-template-v1")fail();
  return validateTemplate(parsed.template);
}
export type ValidationRow={sourceId:string;sourceName:string;ruleId:string;field:string;operator:RuleOperator;status:ValidationStatus;reason:string;observations:Observation[]};
function evaluate(rule:ValidationRule,observations:Observation[],excluded:boolean):{status:ValidationStatus;reason:string}{
  if(excluded)return {status:"review",reason:"Some matching lines exceeded extraction limits; completeness is uncertain."};
  if(!observations.length)return {status:"missing",reason:"No matching literal field extracted."};
  if(rule.operator==="present")return {status:"match",reason:"At least one literal field is present."};
  if(rule.operator==="equals"||rule.operator==="contains"){
    const pass=observations.every(o=>rule.operator==="equals"?o.value===rule.expected:o.value.includes(rule.expected));
    return pass?{status:"match",reason:"All recorded values match the explicit text rule."}:{status:"exception",reason:"At least one recorded value differs from the text rule."};
  }
  const min=parseAnalyticsMeasurement(rule.minimum)!,max=parseAnalyticsMeasurement(rule.maximum)!;
  if(observations.some(o=>!o.measurement||o.measurement.dimension!==min.dimension))return {status:"review",reason:"At least one value has an unsupported or incompatible measurement unit."};
  const near=(a:number,b:number)=>Math.abs(a-b)<=8*Number.EPSILON*Math.max(Math.abs(a),Math.abs(b),Number.MIN_VALUE);
  const values=observations.map(o=>o.measurement!.canonicalValue);
  if(values.some(v=>(v<min.canonicalValue&&near(v,min.canonicalValue))||(v>max.canonicalValue&&near(v,max.canonicalValue))))return {status:"review",reason:"A converted value is just outside a bound within floating-point rounding uncertainty; review the original units."};
  const pass=values.every(v=>v>=min.canonicalValue&&v<=max.canonicalValue);
  return pass?{status:"match",reason:"All recorded measurements fall within the inclusive user-defined bounds."}:{status:"exception",reason:"At least one recorded measurement falls outside the user-defined bounds."};
}
export function runValidationTemplate(documents:readonly CorpusDocument[],template:ValidationTemplate,sourceIds:readonly string[]){
  const docs=addCorpusDocuments([],documents),validated=validateTemplate(template);
  if(!sourceIds.length||new Set(sourceIds).size!==sourceIds.length||sourceIds.some(id=>!docs.some(d=>d.id===id)))fail("invalid_validation_sources");
  const rows:ValidationRow[]=[];
  let evidenceCount=0;
  for(const doc of docs.filter(d=>sourceIds.includes(d.id))){
    const report=analyzeCorpusFields([doc]);
    for(const rule of validated.rules){
      const observations=report.fields.find(f=>f.key===keyOf(rule.field))?.observations??[];
      evidenceCount+=observations.length;
      if(evidenceCount>MAX_VALIDATION_EVIDENCE)fail("validation_evidence_limit");
      const result=evaluate(rule,observations,report.excludedLongFields>0);
      rows.push({sourceId:doc.id,sourceName:doc.name,ruleId:rule.id,field:rule.field,operator:rule.operator,...result,observations});
    }
  }
  const counts={match:0,exception:0,missing:0,review:0};
  for(const row of rows)counts[row.status]++;
  return {template:validated,sourceCount:sourceIds.length,rows,counts};
}
export type ValidationReport=ReturnType<typeof runValidationTemplate>;
export function formatValidationCounts(report:ValidationReport){
  return ["ETERNYX local rule evaluation (counts only)","User-defined rules; not engineering certification or factual verification.","Sources: "+report.sourceCount,"Rules: "+report.template.rules.length,"Evaluations: "+report.rows.length,...Object.entries(report.counts).map(([k,v])=>k+": "+v)].join("\n");
}
export function formatValidationExceptions(report:ValidationReport){
  return JSON.stringify({format:"eternyx-validation-exceptions-v1",notice:"User-defined local evaluation, not a compliance certificate. Missing means no extracted matching field, not proof of absence.",template:report.template,sourceCount:report.sourceCount,counts:report.counts,exceptions:report.rows.filter(r=>r.status!=="match")},null,2);
}
