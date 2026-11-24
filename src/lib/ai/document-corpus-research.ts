import {addCorpusDocuments,type CorpusDocument} from "./document-corpus-tools";
import {buildKnowledgeIndex,searchKnowledgeIndex} from "./document-corpus-knowledge";
export const MAX_RESEARCH_QUESTIONS=6;
export const MAX_RESEARCH_PLAN_CHARS=8000;
export const MAX_TIMELINE_EVENTS=100;
export type ResearchPlan={title:string;questions:{id:string;question:string;query:string;mode:"all"|"any"}[]};
function fail(code="invalid_research_plan"):never{throw new Error(code);}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,k:string[])=>Object.keys(v).length===k.length&&k.every(x=>Object.prototype.hasOwnProperty.call(v,x));
const clean=(v:unknown,n:number):v is string=>typeof v==="string"&&v.length<=n&&!!v.trim()&&!/[\u0000-\u001f\u007f]/.test(v);
export function validateResearchPlan(input:unknown):ResearchPlan{
  if(!obj(input)||!keys(input,["title","questions"])||!clean(input.title,100)||!Array.isArray(input.questions)||!input.questions.length||input.questions.length>MAX_RESEARCH_QUESTIONS)fail();
  const ids=new Set<string>();
  const questions:ResearchPlan["questions"]=input.questions.map(q=>{
    if(!obj(q)||!keys(q,["id","question","query","mode"])||!clean(q.id,64)||! /^[A-Za-z0-9_-]+$/.test(q.id)||ids.has(q.id)||!clean(q.question,250)||!clean(q.query,120)||(q.mode!=="all"&&q.mode!=="any"))fail();
    const terms=new Set(q.query.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu)??[]);
    if(!terms.size||terms.size>8)fail();
    ids.add(q.id);
    return {id:q.id,question:q.question.trim(),query:q.query.trim(),mode:q.mode};
  });
  return {title:input.title.trim(),questions};
}
export function encodeResearchPlan(plan:ResearchPlan){
  const raw=JSON.stringify({format:"eternyx-research-plan-v1",plan:validateResearchPlan(plan)},null,2);
  if(raw.length>MAX_RESEARCH_PLAN_CHARS)fail("research_plan_too_large");
  return raw;
}
export function decodeResearchPlan(raw:string){
  if(typeof raw!=="string"||raw.length>MAX_RESEARCH_PLAN_CHARS)fail("research_plan_too_large");
  let data:unknown;try{data=JSON.parse(raw);}catch{fail();}
  if(!obj(data)||!keys(data,["format","plan"])||data.format!=="eternyx-research-plan-v1")fail();
  return validateResearchPlan(data.plan);
}
type DateMention={date:string;sourceId:string;sourceName:string;line:number;startOffset:number;endOffset:number;rawLine:string;lineTruncated:boolean};
function validDate(date:string){
  const [y,m,d]=date.split("-").map(Number);
  if(y<1||m<1||m>12||d<1)return false;
  const leap=y%4===0&&(y%100!==0||y%400===0);
  return d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}
export function collectResearchDates(documents:readonly CorpusDocument[]){
  const docs=addCorpusDocuments([],documents);
  const events:DateMention[]=[];let total=0,invalid=0;
  for(const doc of docs){
    let offset=0,line=0;
    for(const m of doc.text.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)){
      if(!m[0].length)break;
      line++;
      for(const hit of m[1].matchAll(/(?<![\p{L}\p{N}_-])\d{4}-\d{2}-\d{2}(?![\p{L}\p{N}_-])/gu)){
        const date=hit[0];
        if(!validDate(date)){invalid++;continue;}
        total++;
        const event={date,sourceId:doc.id,sourceName:doc.name,line,startOffset:offset+hit.index!,endOffset:offset+hit.index!+10,rawLine:m[1].slice(0,400),lineTruncated:m[1].length>400};
        events.push(event);
      }
      offset+=m[0].length;
    }
  }
  events.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.sourceId<b.sourceId?-1:a.sourceId>b.sourceId?1:a.startOffset-b.startOffset);
  return {events:events.slice(0,MAX_TIMELINE_EVENTS),total,invalid,truncated:total>MAX_TIMELINE_EVENTS};
}
export function runResearchPlan(documents:readonly CorpusDocument[],plan:ResearchPlan,sourceIds:readonly string[]){
  const docs=addCorpusDocuments([],documents),checked=validateResearchPlan(plan);
  if(!sourceIds.length||new Set(sourceIds).size!==sourceIds.length||sourceIds.some(id=>!docs.some(d=>d.id===id)))fail("invalid_research_sources");
  const chosen=docs.filter(d=>sourceIds.includes(d.id));
  const index=buildKnowledgeIndex(chosen);
  const sections=checked.questions.map(q=>{
    const sources=chosen.map(doc=>{
      const result=index.passages.length?searchKnowledgeIndex(index,q.query,q.mode,doc.id):null;
      return {id:doc.id,name:doc.name,totalMatches:result?.totalMatches??0,passages:(result?.results??[]).slice(0,2)};
    });
    return {question:q,sources};
  });
  return {plan:checked,sourceIds:chosen.map(d=>d.id),sections,timeline:collectResearchDates(chosen)};
}
export type ResearchReport=ReturnType<typeof runResearchPlan>;
export type ResearchSelection={questionId:string;passageId:string};
export function formatResearchCounts(report:ResearchReport){
  return ["ETERNYX local research (counts only)","Lexical retrieval, not factual verification or generated conclusions.","Sources: "+report.sourceIds.length,"Questions: "+report.sections.length,"Question/source pairs with matches: "+report.sections.reduce((n,s)=>n+s.sources.filter(x=>x.totalMatches>0).length,0),"Question/source pairs without matches: "+report.sections.reduce((n,s)=>n+s.sources.filter(x=>!x.totalMatches).length,0),"Valid ISO date mentions: "+report.timeline.total,"Invalid ISO date candidates: "+report.timeline.invalid,"Date mentions displayed: "+report.timeline.events.length].join("\n");
}
export function formatResearchEvidence(report:ResearchReport,selection:readonly ResearchSelection[],notes:Readonly<Record<string,string>>,includeTimeline:boolean){
  const choices=new Set(selection.map(s=>JSON.stringify([s.questionId,s.passageId])));
  if(choices.size!==selection.length||selection.length>24||(!selection.length&&!includeTimeline))fail("invalid_research_selection");
  if(Object.keys(notes).some(k=>!report.sections.some(s=>s.question.id===k))||Object.values(notes).some(n=>typeof n!=="string"||n.length>1000||n.includes("\u0000")))fail("invalid_research_notes");
  let included=0;
  const sections=report.sections.map(s=>({question:s.question,reviewerNotes:Object.prototype.hasOwnProperty.call(notes,s.question.id)?notes[s.question.id]:"",sources:s.sources.map(src=>({id:src.id,name:src.name,totalMatches:src.totalMatches,evidence:src.passages.filter(p=>choices.has(JSON.stringify([s.question.id,p.id]))).map(p=>{included++;return {source:p.documentName,startLine:p.startLine,endLine:p.endLine,startOffset:p.startOffset,endOffset:p.endOffset,text:p.text};})}))}));
  if(included!==selection.length)fail("invalid_research_selection");
  return JSON.stringify({format:"eternyx-research-evidence-v1",title:report.plan.title,notice:"Selected source extracts and human-authored notes only. Retrieval counts are lexical. Dates are literal mentions, not verified events.",sections,...(includeTimeline?{timeline:report.timeline}:{})},null,2);
}
