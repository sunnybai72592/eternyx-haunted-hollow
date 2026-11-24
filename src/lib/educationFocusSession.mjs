/**
 * ETERNYX Education: deterministic private study session planning.
 * Estimates come exclusively from author-provided lesson minutes; completion is manual.
 */
import {buildStudyRevisionAgenda} from "./educationRevisionAgenda.mjs";
import {buildStudyJourneySessionJson,parseStudyJourneyFile} from "./educationStudyRevision.mjs";

export const STUDY_FOCUS_BUDGETS=Object.freeze([15,30,60,120]);
const clampEstimate=(n)=>Math.max(1,Math.min(n,240));
export function planStudyFocusSession(path,records,revisions,asOf,budget=30){
  if(!STUDY_FOCUS_BUDGETS.includes(budget))throw new Error("Invalid Education focus budget");
  const safe=parseStudyJourneyFile(buildStudyJourneySessionJson(path,records,revisions));
  const agenda=buildStudyRevisionAgenda(safe.path,safe.records,safe.revision,asOf);
  const priorities=agenda.map(item=>({
    number:item.number,title:item.title,kind:item.priority===0?"due":item.priority===1?"unscheduled":"upcoming",
    due_on:item.due_on,estimated_minutes:clampEstimate(Math.ceil(safe.path.lessons[item.number-1].estimated_minutes/2)),
  }));
  const incomplete=safe.path.lessons.filter((l,i)=>!safe.records[i].completed).map(l=>({
    number:l.number,title:l.title,kind:"unfinished",due_on:null,
    estimated_minutes:l.estimated_minutes,
  }));
  // Due reviews first; then unscheduled reviews; then unfinished lessons.
  // Future reviews are shown as upcoming but never included ahead of unfinished work.
  const candidates=[...priorities.filter(x=>x.kind!=="upcoming"),...incomplete,
    ...priorities.filter(x=>x.kind==="upcoming")];
  let used=0;
  const selected=[];
  for(const item of candidates){
    if(used+item.estimated_minutes<=budget){
      selected.push(Object.freeze(item));used+=item.estimated_minutes;
    }
  }
  return Object.freeze({
    asOf,budget,estimated_minutes:used,remaining_minutes:budget-used,
    items:Object.freeze(selected),
    excluded_count:candidates.length-selected.length,
    total_candidates:candidates.length,
  });
}
export function buildStudyFocusChecklist(path,records,revisions,asOf,budget){
  const plan=planStudyFocusSession(path,records,revisions,asOf,budget);
  const safe=parseStudyJourneyFile(buildStudyJourneySessionJson(path,records,revisions));
  // Never interpolate answers, notes, confidence, review counts, or marks.
  const lines=["ETERNYX Education — private, estimated study checklist",
    "Course: "+safe.path.title,
    "Snapshot UTC: "+asOf,
    "Time budget: "+budget+" min",
    "Selected estimated minutes: "+plan.estimated_minutes,
    "No automatic tracking, reminders, scores or certificates.",""];
  for(const item of plan.items)lines.push(
    "[ ] Lesson "+item.number+": "+item.title,
    "    Task: "+item.kind+(item.due_on?" (review due "+item.due_on+" UTC)":""),
    "    Suggested minutes: "+item.estimated_minutes);
  if(plan.items.length===0)lines.push("No tasks fit this selected time budget.");
  lines.push("","Exported locally. Study activity must be marked manually in the app.");
  const result=lines.join("\n")+"\n";
  if(new TextEncoder().encode(result).length>1024*1024)throw new Error("Education checklist exceeds size limit");
  return result;
}
