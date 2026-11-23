/**
 * ETERNYX Education Study Paths — entirely local, user-authored curriculum.
 * No preloaded fabricated lessons, scoring, server calls, or silent persistence.
 * Strict schemas stop untrusted lesson imports from acquiring privileged fields.
 */
import {educationSafeCsvCell} from "./educationPrivateAnswerReview.mjs";

export const STUDY_PATH_FORMAT="eternyx-local-study-path";
export const STUDY_SESSION_FORMAT="eternyx-local-study-session";
export const STUDY_FILE_LIMIT=1_000_000;
export const STUDY_MAX_LESSONS=30;
export const STUDY_ACTIVITY_LIMIT=4000;
export const STUDY_NOTE_LIMIT=3000;
const fields=["number","title","objective","reading","activity_prompt","reflection_prompt","estimated_minutes"];
const progressFields=["number","activity","reflection","note","flagged","completed"];
const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
  JSON.stringify(Object.keys(x).sort())===JSON.stringify([...keys].sort());
const text=(s,min,max)=>typeof s==="string"&&s.length<=max&&s.trim().length>=min;
const number=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const fail=()=>{throw new Error("Invalid or unsafe local Education study path or session.");};
const size=(s)=>new TextEncoder().encode(s).length;

export function emptyStudyDraft(){
  return {title:"",description:"",lessons:[]};
}
export function emptyStudyLesson(n){
  if(!number(n,1,STUDY_MAX_LESSONS))fail();
  return {number:n,title:"",objective:"",reading:"",activity_prompt:"",
    reflection_prompt:"",estimated_minutes:20};
}
/** No partial or unknown fields in a shared curriculum. */
export function validateStudyPath(raw){
  if(!exact(raw,["format","version","title","description","lessons"])||
    raw.format!==STUDY_PATH_FORMAT||raw.version!==1||
    !text(raw.title,3,160)||!text(raw.description,0,1500)||
    !Array.isArray(raw.lessons)||raw.lessons.length===0||
    raw.lessons.length>STUDY_MAX_LESSONS)fail();
  const seen=new Set();
  const lessons=raw.lessons.map((l,i)=>{
    if(!exact(l,fields)||l.number!==i+1||
      !text(l.title,3,160)||!text(l.objective,3,600)||
      !text(l.reading,20,12000)||!text(l.activity_prompt,5,2000)||
      !text(l.reflection_prompt,5,2000)||
      !number(l.estimated_minutes,1,240))fail();
    const key=l.title.trim().toLocaleLowerCase();
    if(seen.has(key))fail();
    seen.add(key);
    return Object.freeze({...l});
  });
  return Object.freeze({
    format:STUDY_PATH_FORMAT,version:1,title:raw.title,
    description:raw.description,lessons:Object.freeze(lessons),
  });
}
/** Authoring drafts never leave the browser until explicit validated export. */
export function authorStudyPath(draft){
  if(!exact(draft,["title","description","lessons"]))fail();
  return validateStudyPath({...draft,format:STUDY_PATH_FORMAT,version:1});
}
export function buildStudyPathJson(draft){
  const json=JSON.stringify(authorStudyPath(draft),null,2)+"\n";
  if(size(json)>STUDY_FILE_LIMIT)fail();
  return json;
}
export function emptyStudyRecords(path){
  const p=validateStudyPath(path);
  return p.lessons.map(l=>Object.freeze({
    number:l.number,activity:"",reflection:"",note:"",
    flagged:false,completed:false,
  }));
}
function validateStudyRecords(p,records){
  if(!Array.isArray(records)||records.length!==p.lessons.length)fail();
  return Object.freeze(records.map((r,i)=>{
    if(!exact(r,progressFields)||r.number!==i+1||
      !text(r.activity,0,STUDY_ACTIVITY_LIMIT)||
      !text(r.reflection,0,STUDY_ACTIVITY_LIMIT)||
      !text(r.note,0,STUDY_NOTE_LIMIT)||
      typeof r.flagged!=="boolean"||typeof r.completed!=="boolean"||
      (r.completed&&(!r.activity.trim()||!r.reflection.trim())))fail();
    return Object.freeze({...r});
  }));
}
/** Imported session data is *never* promoted into official scores/certificates. */
export function parseStudyFile(rawText){
  if(typeof rawText!=="string"||!rawText.trim()||
     size(rawText)>STUDY_FILE_LIMIT)fail();
  let data;
  try{data=JSON.parse(rawText);}catch{fail();}
  if(data?.format===STUDY_PATH_FORMAT){
    const path=validateStudyPath(data);
    return {path,records:emptyStudyRecords(path)};
  }
  if(!exact(data,["format","version","path","records"])||
     data.format!==STUDY_SESSION_FORMAT||data.version!==1)fail();
  const path=validateStudyPath(data.path);
  return {path,records:validateStudyRecords(path,data.records)};
}
export function changeStudyRecord(path,records,lessonNumber,key,value){
  const p=validateStudyPath(path);
  const rows=validateStudyRecords(p,records);
  if(!number(lessonNumber,1,p.lessons.length)||
     !["activity","reflection","note","flagged","completed"].includes(key))fail();
  const result=rows.map(row=>{
    if(row.number!==lessonNumber)return row;
    if((key==="flagged"||key==="completed")?typeof value!=="boolean":typeof value!=="string")fail();
    const next={...row,[key]:value};
    if((key==="activity"||key==="reflection")&&(!next.activity.trim()||!next.reflection.trim()))
      next.completed=false;
    if(next.completed&&(!next.activity.trim()||!next.reflection.trim()))fail();
    return next;
  });
  return validateStudyRecords(p,result);
}
export function summarizeStudyPath(path,records){
  const p=validateStudyPath(path),rows=validateStudyRecords(p,records);
  const completed=rows.filter(x=>x.completed).length;
  const started=rows.filter(x=>x.activity.trim()||x.reflection.trim()||x.note.trim()).length;
  return Object.freeze({
    lessons:p.lessons.length,
    completed,remaining:p.lessons.length-completed,started,
    flagged:rows.filter(x=>x.flagged).length,
    percentage:Math.round(completed/p.lessons.length*100),
    nextLesson:rows.find(x=>!x.completed)?.number??null,
  });
}
export function buildStudySessionJson(path,records){
  const p=validateStudyPath(path);
  const safe=validateStudyRecords(p,records);
  const json=JSON.stringify({
    format:STUDY_SESSION_FORMAT,version:1,path:p,records:safe,
  },null,2)+"\n";
  if(size(json)>STUDY_FILE_LIMIT)fail();
  return json;
}
export function buildStudyProgressCsv(path,records){
  const p=validateStudyPath(path),rows=validateStudyRecords(p,records);
  const cell=fields=>fields.map(educationSafeCsvCell).join(",");
  const lines=[cell(["Study path","Lesson","Lesson title","Learning objective",
    "Practical activity","My activity response","Reflection prompt",
    "My reflection","Private notes","Manually completed","Flagged","Grade status"])];
  for(const [i,l] of p.lessons.entries()){
    const r=rows[i];
    lines.push(cell([
      p.title,l.number,l.title,l.objective,l.activity_prompt,r.activity,
      l.reflection_prompt,r.reflection,r.note,r.completed?"Yes":"No",
      r.flagged?"Yes":"No","Not graded",
    ]));
  }
  return "\uFEFF"+lines.join("\r\n")+"\r\n";
}
