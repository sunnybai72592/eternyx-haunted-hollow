/**
 * Optional manual revision planning for ETERNYX Study Paths.
 *
 * A v2 portable study session wraps the unchanged v1 path and learner records.
 * Legacy v1 path and session files remain importable. Review dates are explicitly
 * entered by the learner; no grades, automatic learning inference, background
 * monitoring, server calls or progress-report sharing.
 */
import {
  STUDY_FILE_LIMIT,STUDY_SESSION_FORMAT,STUDY_PATH_FORMAT,
  validateStudyPath,emptyStudyRecords,parseStudyFile,buildStudySessionJson,
} from "./educationStudyPaths.mjs";
import {educationSafeCsvCell} from "./educationPrivateAnswerReview.mjs";

export const STUDY_REVISION_SESSION_VERSION=2;
export const STUDY_REVISION_INTERVALS=Object.freeze([1,3,7,14,30]);
export const STUDY_CONFIDENCE=Object.freeze(["unrated","needs_practice","developing","comfortable"]);
const entryFields=["number","interval_days","review_count","last_reviewed_on","next_due_on","confidence"];
const allowed=new Set(STUDY_REVISION_INTERVALS);
const exact=(value,fields)=>value!==null&&typeof value==="object"&&!Array.isArray(value)&&
  JSON.stringify(Object.keys(value).sort())===JSON.stringify([...fields].sort());
const fail=()=>{throw new Error("Invalid Education revision plan or shared study file.");};
const day=(date)=>{
  if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))fail();
  const t=Date.parse(date+"T00:00:00.000Z");
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==date)fail();
  return t;
};
function dayOffset(date,delta){
  const t=day(date)+delta*86400000;
  const next=new Date(t);
  if(!Number.isFinite(t)||next.getUTCFullYear()>9999)fail();
  return next.toISOString().slice(0,10);
}
const textSize=value=>new TextEncoder().encode(value).length;

export function blankStudyRevision(path){
  const p=validateStudyPath(path);
  return Object.freeze(p.lessons.map(l=>Object.freeze({
    number:l.number,interval_days:3,review_count:0,
    last_reviewed_on:null,next_due_on:null,confidence:"unrated",
  })));
}
export function validateStudyRevision(path,records,revisions){
  const p=validateStudyPath(path);
  // Reuse the already strict v1 session validator for learner records.
  const safeRecords=parseStudyFile(buildStudySessionJson(p,records)).records;
  if(!Array.isArray(revisions)||revisions.length!==p.lessons.length)fail();
  return Object.freeze(revisions.map((item,i)=>{
    if(!exact(item,entryFields)||item.number!==i+1||
      !allowed.has(item.interval_days)||
      !Number.isSafeInteger(item.review_count)||
      item.review_count<0||item.review_count>10000||
      !STUDY_CONFIDENCE.includes(item.confidence))fail();
    if(item.review_count===0){
      if(item.last_reviewed_on!==null||item.next_due_on!==null||
        item.confidence!=="unrated")fail();
    }else{
      if(!safeRecords[i].completed||
        item.confidence==="unrated"||
        dayOffset(item.last_reviewed_on,item.interval_days)!==item.next_due_on)fail();
    }
    return Object.freeze({...item});
  }));
}
export function setStudyRevisionInterval(path,records,revisions,number,interval){
  const p=validateStudyPath(path);
  const before=validateStudyRevision(p,records,revisions);
  if(!Number.isSafeInteger(number)||number<1||number>p.lessons.length||
    !allowed.has(interval))fail();
  const rows=before.map(entry=>entry.number===number
    ? {...entry,interval_days:interval,
       next_due_on:entry.last_reviewed_on===null?null:dayOffset(entry.last_reviewed_on,interval)}
    :entry);
  return validateStudyRevision(p,records,rows);
}
export function recordStudyManualReview(path,records,revisions,number,today,confidence){
  const p=validateStudyPath(path);
  const before=validateStudyRevision(p,records,revisions);
  if(!Number.isSafeInteger(number)||number<1||number>p.lessons.length||
    !STUDY_CONFIDENCE.includes(confidence)||confidence==="unrated"||
    !parseStudyFile(buildStudySessionJson(p,records)).records[number-1].completed)fail();
  day(today);
  const rows=before.map(entry=>{
    if(entry.number!==number)return entry;
    if(entry.last_reviewed_on!==null&&today<entry.last_reviewed_on)fail();
    if(entry.review_count>=10000)fail();
    return {...entry,review_count:entry.review_count+1,
      last_reviewed_on:today,
      next_due_on:dayOffset(today,entry.interval_days),
      confidence};
  });
  return validateStudyRevision(p,records,rows);
}
/** Reopening a lesson invalidates its former schedule, but keeps its cadence. */
export function reconcileStudyRevisions(path,records,revisions){
  const p=validateStudyPath(path);
  const safeRecords=parseStudyFile(buildStudySessionJson(p,records)).records;
  if(!Array.isArray(revisions)||revisions.length!==p.lessons.length)fail();
  // Validate the revision entry format independently before reconciliation.
  const safe=revisions.map((r,i)=>{
    if(!exact(r,entryFields)||r.number!==i+1||!allowed.has(r.interval_days)||
      !Number.isSafeInteger(r.review_count)||r.review_count<0||r.review_count>10000||
      !STUDY_CONFIDENCE.includes(r.confidence))fail();
    if(r.review_count===0){
      if(r.last_reviewed_on!==null||r.next_due_on!==null||r.confidence!=="unrated")fail();
    }else{
      if(r.confidence==="unrated"||
        dayOffset(r.last_reviewed_on,r.interval_days)!==r.next_due_on)fail();
    }
    return {...r};
  });
  return validateStudyRevision(p,safeRecords,safe.map((r,i)=>
    !safeRecords[i].completed&&r.review_count>0
      ? {...r,review_count:0,last_reviewed_on:null,next_due_on:null,confidence:"unrated"}
      :r));
}
export function studyRevisionInsights(path,records,revisions,asOf){
  const p=validateStudyPath(path);
  const rows=parseStudyFile(buildStudySessionJson(p,records)).records;
  const rev=validateStudyRevision(p,rows,revisions);
  day(asOf);
  const nextWeek=dayOffset(asOf,7);
  const due=rev.filter((r,i)=>rows[i].completed&&r.next_due_on!==null&&r.next_due_on<=asOf);
  const overdue=due.filter(r=>r.next_due_on<asOf);
  const upcoming=rev.filter((r,i)=>rows[i].completed&&r.next_due_on!==null&&
    r.next_due_on>asOf&&r.next_due_on<=nextWeek);
  const readyToSchedule=rev.filter((r,i)=>rows[i].completed&&r.review_count===0);
  const next=due.sort((a,b)=>a.next_due_on.localeCompare(b.next_due_on))[0]??
    readyToSchedule[0]??upcoming.sort((a,b)=>a.next_due_on.localeCompare(b.next_due_on))[0]??null;
  return Object.freeze({
    asOf,completed:rows.filter(r=>r.completed).length,
    started:rows.filter(r=>r.activity.trim()||r.reflection.trim()||r.note.trim()).length,
    due:due.length,overdue:overdue.length,upcomingWeek:upcoming.length,
    readyToSchedule:readyToSchedule.length,
    reviewed:rev.filter(r=>r.review_count>0).length,
    remainingEstimatedMinutes:p.lessons.reduce((total,l,i)=>
      total+(rows[i].completed?0:l.estimated_minutes),0),
    nextReviewLesson:next?.number??null,
  });
}
export function revisionStatus(row,record,asOf){
  day(asOf);
  if(!record.completed)return "Lesson incomplete";
  if(row.review_count===0)return "Ready to plan";
  if(row.next_due_on<asOf)return "Overdue";
  if(row.next_due_on===asOf)return "Due today";
  return "Scheduled";
}
export function parseStudyJourneyFile(raw){
  if(typeof raw!=="string"||!raw.trim()||textSize(raw)>STUDY_FILE_LIMIT)fail();
  let value;
  try{value=JSON.parse(raw);}catch{fail();}
  if(value?.format===STUDY_SESSION_FORMAT&&value?.version===2){
    if(!exact(value,["format","version","path","records","revision"]))fail();
    const path=validateStudyPath(value.path);
    // This preserves existing v1 format rejection and record validation.
    const records=parseStudyFile(JSON.stringify({
      format:STUDY_SESSION_FORMAT,version:1,path,records:value.records,
    })).records;
    return {path,records,revision:validateStudyRevision(path,records,value.revision)};
  }
  const old=parseStudyFile(raw);
  return {...old,revision:blankStudyRevision(old.path)};
}
export function buildStudyJourneySessionJson(path,records,revisions){
  const p=validateStudyPath(path);
  const safe=JSON.parse(buildStudySessionJson(p,records));
  const plan=validateStudyRevision(p,safe.records,revisions);
  const output=JSON.stringify({
    format:STUDY_SESSION_FORMAT,version:STUDY_REVISION_SESSION_VERSION,
    path:p,records:safe.records,revision:plan,
  },null,2)+"\n";
  if(textSize(output)>STUDY_FILE_LIMIT)fail();
  return output;
}
export function buildStudySharePathJson(path){
  const p=validateStudyPath(path);
  const output=JSON.stringify(p,null,2)+"\n";
  if(textSize(output)>STUDY_FILE_LIMIT)fail();
  return output;
}
export function buildStudyShareOutline(path){
  const p=validateStudyPath(path);
  const lines=[
    "ETERNYX Education — shareable study path outline",
    p.title,p.description,
    "Lessons: "+p.lessons.length,
    "Suggested total study minutes: "+p.lessons.reduce((sum,l)=>sum+l.estimated_minutes,0),
    "Contains no learner responses, private notes, progress or grade.",
    "",
  ];
  for(const l of p.lessons){
    lines.push(l.number+". "+l.title, "Objective: "+l.objective,
      "Suggested minutes: "+l.estimated_minutes,
      "Practical activity: "+l.activity_prompt,
      "Reflection: "+l.reflection_prompt,"");
  }
  const output=lines.join("\n")+"\n";
  if(textSize(output)>STUDY_FILE_LIMIT)fail();
  return output;
}
export function buildStudyRevisionCalendarCsv(path,records,revisions,asOf){
  const p=validateStudyPath(path);
  const safeRecords=parseStudyFile(buildStudySessionJson(p,records)).records;
  const plan=validateStudyRevision(p,safeRecords,revisions);
  day(asOf);
  const cell=values=>values.map(educationSafeCsvCell).join(",");
  const lines=[cell([
    "Study path","Lesson","Lesson title","Completion","Review status",
    "Next review UTC","Review interval days","Manual review count","Self-reported confidence",
  ])];
  for(const [i,l] of p.lessons.entries()){
    const r=plan[i],record=safeRecords[i];
    lines.push(cell([p.title,l.number,l.title,record.completed?"Manually completed":"Incomplete",
      revisionStatus(r,record,asOf),r.next_due_on??"",r.interval_days,
      r.review_count,r.confidence]));
  }
  return "\uFEFF"+lines.join("\r\n")+"\r\n";
}
