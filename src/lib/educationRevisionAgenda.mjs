/**
 * Explicit, local-only Education revision agenda and calendar export.
 * No browser storage, network, reminders, grades or private answers.
 */
import {buildStudyJourneySessionJson,revisionStatus} from "./educationStudyRevision.mjs";
import {parseStudyJourneyFile} from "./educationStudyRevision.mjs";

const validDay=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+"T00:00:00.000Z"))&&
  new Date(value+"T00:00:00.000Z").toISOString().slice(0,10)===value;
const addDays=(day,n)=>{
  const date=new Date(day+"T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate()+n);
  return date.toISOString().slice(0,10);
};
const safe=(path,records,revision,asOf)=>{
  if(!validDay(asOf))throw new Error("Invalid Education agenda date");
  return parseStudyJourneyFile(buildStudyJourneySessionJson(path,records,revision));
};
/** Due and unscheduled first, followed by future reviews, stable in lesson order. */
export function buildStudyRevisionAgenda(path,records,revision,asOf){
  const s=safe(path,records,revision,asOf);
  const entries=s.path.lessons.map((lesson,i)=>{
    const r=s.revision[i],record=s.records[i];
    const status=revisionStatus(r,record,asOf);
    const priority=!record.completed?4:r.review_count===0?1:
      r.next_due_on<=asOf?0:2;
    return Object.freeze({number:lesson.number,title:lesson.title,
      due_on:r.next_due_on,status,priority,interval_days:r.interval_days});
  });
  return Object.freeze(entries.filter(x=>x.priority!==4).sort((a,b)=>
    a.priority-b.priority||
    (a.due_on??"").localeCompare(b.due_on??"")||a.number-b.number));
}
/** Seven UTC calendar days including selected date, from actual saved review dates. */
export function buildStudyRevisionWeek(path,records,revision,asOf){
  const agenda=buildStudyRevisionAgenda(path,records,revision,asOf);
  return Object.freeze(Array.from({length:7},(_,i)=>{
    const date=addDays(asOf,i);
    return Object.freeze({date,lessons:Object.freeze(agenda.filter(x=>x.due_on===date))});
  }));
}
const escapeIcs=s=>String(s).replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n")
  .replace(/,/g,"\\,").replace(/;/g,"\\;");
const fold=line=>{
  // RFC 5545 75-octet folding, accounting for UTF-8 and CRLF continuation.
  const chunks=[];let current="",length=0;
  for(const char of line){
    const bytes=new TextEncoder().encode(char).length;
    if(length+bytes>75){chunks.push(current);current=" ";length=1;}
    current+=char;length+=bytes;
  }
  chunks.push(current);
  return chunks.join("\r\n");
};
/**
 * Importable all-day UTC review dates, with deterministic unique UIDs.
 * Only the author-supplied path title/lesson titles and review dates are included.
 */
export function buildStudyRevisionCalendarIcs(path,records,revision,asOf){
  const s=safe(path,records,revision,asOf);
  const agenda=buildStudyRevisionAgenda(s.path,s.records,s.revision,asOf);
  const dated=agenda.filter(x=>x.due_on!==null);
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ETERNYX//Local Study Revision//EN",
    "CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  for(const r of dated){
    const date=r.due_on.replace(/-/g,"");
    const end=addDays(r.due_on,1).replace(/-/g,"");
    const uid="study-"+r.number+"-"+date+"@eternyx.local";
    lines.push("BEGIN:VEVENT","UID:"+uid,"DTSTAMP:"+asOf.replace(/-/g,"")+"T000000Z",
      "DTSTART;VALUE=DATE:"+date,"DTEND;VALUE=DATE:"+end,
      "SUMMARY:"+escapeIcs("Study review: "+r.title),
      "DESCRIPTION:"+escapeIcs("Manual revision planned in ETERNYX Study Paths. No reminder or grade."),
      "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const result=lines.map(fold).join("\r\n")+"\r\n";
  if(new TextEncoder().encode(result).length>1024*1024)
    throw new Error("Education calendar exceeds safe export limit");
  return result;
}
