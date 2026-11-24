import {addCorpusDocuments,type CorpusDocument} from "./document-corpus-tools";
export const MAX_ANALYTICS_FIELDS=200;
export const MAX_ANALYTICS_OBSERVATIONS=2000;
type Unit={dimension:string;factor:number;offset?:number;canonical:string};
const units:Record<string,Unit>={
  V:{dimension:"voltage",factor:1,canonical:"V"},mV:{dimension:"voltage",factor:.001,canonical:"V"},
  A:{dimension:"current",factor:1,canonical:"A"},mA:{dimension:"current",factor:.001,canonical:"A"},
  m:{dimension:"length",factor:1,canonical:"m"},cm:{dimension:"length",factor:.01,canonical:"m"},mm:{dimension:"length",factor:.001,canonical:"m"},km:{dimension:"length",factor:1000,canonical:"m"},
  "µm":{dimension:"length",factor:1e-6,canonical:"m"},um:{dimension:"length",factor:1e-6,canonical:"m"},mil:{dimension:"length",factor:.0000254,canonical:"m"},
  kg:{dimension:"mass",factor:1,canonical:"kg"},g:{dimension:"mass",factor:.001,canonical:"kg"},mg:{dimension:"mass",factor:1e-6,canonical:"kg"},
  Pa:{dimension:"pressure",factor:1,canonical:"Pa"},kPa:{dimension:"pressure",factor:1000,canonical:"Pa"},MPa:{dimension:"pressure",factor:1e6,canonical:"Pa"},bar:{dimension:"pressure",factor:100000,canonical:"Pa"},psi:{dimension:"pressure",factor:6894.757293168,canonical:"Pa"},
  "°C":{dimension:"temperature",factor:1,canonical:"°C"},"°F":{dimension:"temperature",factor:5/9,offset:-32,canonical:"°C"},
  "%":{dimension:"percentage",factor:1,canonical:"%"},
};
export type Measurement={number:number;unit:string;dimension:string;canonicalValue:number;canonicalUnit:string};
export function parseAnalyticsMeasurement(value:string):Measurement|null{
  const match=/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([A-Za-zµμ°%]+)$/u.exec(value.trim());
  if(!match)return null;
  const unit=match[2].replace("μ","µ");
  if(!Object.prototype.hasOwnProperty.call(units,unit))return null;
  const definition=units[unit],number=Number(match[1]);
  const canonicalValue=(number+(definition.offset??0))*definition.factor;
  if(!Number.isFinite(number)||Math.abs(number)>1e12||!Number.isFinite(canonicalValue)||(number===0&&/[1-9]/.test(match[1])))return null;
  return {number,unit,dimension:definition.dimension,canonicalValue,canonicalUnit:definition.canonical};
}
export type Observation={sourceId:string;sourceName:string;line:number;startOffset:number;endOffset:number;rawLine:string;key:string;value:string;measurement:Measurement|null};
export type ReconciliationStatus="single_source"|"literal_match"|"converted_match"|"different_values"|"mixed_or_incompatible";
const keyOf=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase();
const literalOf=(s:string)=>s.trim();
const equalNumber=(a:number,b:number)=>Math.abs(a-b)<=Math.max(1e-12,1e-9*Math.max(Math.abs(a),Math.abs(b)));
function reconcile(observations:readonly Observation[]):ReconciliationStatus{
  if(new Set(observations.map(o=>o.sourceId)).size<2)return "single_source";
  if(observations.every(o=>literalOf(o.value)===literalOf(observations[0].value)))return "literal_match";
  if(observations.every(o=>o.measurement===null))return "different_values";
  const first=observations[0].measurement;
  if(!first||observations.some(o=>!o.measurement||o.measurement.dimension!==first.dimension))return "mixed_or_incompatible";
  const values=observations.map(o=>o.measurement!.canonicalValue);
  return equalNumber(Math.min(...values),Math.max(...values))?"converted_match":"different_values";
}
export function analyzeCorpusFields(documents:readonly CorpusDocument[]){
  const docs=addCorpusDocuments([],documents);
  const groups=new Map<string,Observation[]>();
  let total=0,excludedLongFields=0;
  for(const doc of docs){
    let offset=0,line=0;
    for(const entry of doc.text.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)){
      if(!entry[0].length)break;
      line++;
      const rawLine=entry[1];
      const startOffset=offset;offset+=entry[0].length;
      const match=/^\s*([\p{L}][\p{L}\p{M}\p{N} _.-]{0,59})\s*[:=]\s*(\S.*?)\s*$/u.exec(rawLine);
      if(!match)continue;
      const key=match[1].trim(),value=match[2].trim();
      if(value.length>240||rawLine.length>400){excludedLongFields++;continue;}
      const normalized=keyOf(key);
      if(!groups.has(normalized)){if(groups.size>=MAX_ANALYTICS_FIELDS)throw new Error("analytics_field_limit");groups.set(normalized,[]);}
      if(++total>MAX_ANALYTICS_OBSERVATIONS)throw new Error("analytics_observation_limit");
      groups.get(normalized)!.push({sourceId:doc.id,sourceName:doc.name,line,startOffset,endOffset:startOffset+rawLine.length,rawLine,key,value,measurement:parseAnalyticsMeasurement(value)});
    }
  }
  const fields=[...groups].map(([key,observations])=>{
    const sourceCount=new Set(observations.map(o=>o.sourceId)).size;
    const repeatedSources=docs.filter(d=>observations.filter(o=>o.sourceId===d.id).length>1).length;
    return {key,label:observations[0].key,observations,sourceCount,repeatedSources,status:reconcile(observations)};
  }).sort((a,b)=>b.sourceCount-a.sourceCount||(a.key<b.key?-1:a.key>b.key?1:0));
  return {sources:docs.map(d=>({id:d.id,name:d.name})),fields,total,excludedLongFields};
}
export type AnalyticsReport=ReturnType<typeof analyzeCorpusFields>;
export function formatAnalyticsCounts(report:AnalyticsReport){
  return ["ETERNYX local field analytics (counts only)","Same field labels do not prove the same object, conditions, time or factual agreement.","Sources: "+report.sources.length,"Fields: "+report.fields.length,"Observations: "+report.total,"Excluded long matching lines: "+report.excludedLongFields,...(["single_source","literal_match","converted_match","different_values","mixed_or_incompatible"] as const).map(s=>s+": "+report.fields.filter(f=>f.status===s).length)].join("\n");
}
export function formatAnalyticsEvidence(report:AnalyticsReport,keys:readonly string[]){
  if(!keys.length||keys.length>MAX_ANALYTICS_FIELDS||new Set(keys).size!==keys.length||keys.some(k=>!report.fields.some(f=>f.key===k)))throw new Error("invalid_analytics_selection");
  const fields=report.fields.filter(f=>keys.includes(f.key));
  return JSON.stringify({format:"eternyx-local-field-evidence-v1",notice:"Source-derived observations only; review field context. Offsets are decoded UTF-16. Conversion is arithmetic, not a compliance verdict.",fields:fields.map(f=>({label:f.label,status:f.status,sourceCount:f.sourceCount,repeatedSources:f.repeatedSources,observations:f.observations}))},null,2);
}
