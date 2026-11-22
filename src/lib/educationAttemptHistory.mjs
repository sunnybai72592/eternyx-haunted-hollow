import { validExamId } from "./educationExam.mjs";
import { educationAttemptNavigation } from "./educationAttemptNavigation.mjs";

export const EDUCATION_HISTORY_PAGE_SIZE=20;
export const EDUCATION_HISTORY_STATUSES=Object.freeze(["all","in_progress","completed"]);

const statuses=Object.freeze({
 in_progress:"In progress",
 submitted:"Submitted",
 auto_submitted:"Automatically submitted",
 cheated:"Submitted — flagged",
});

/**
 * Keep status interpretation separate from grading. This history does not
 * have a trusted final-grade receipt and MUST NOT show numeric scores.
 */
export function educationHistoryStatus(status) {
 return statuses[status]??"Unavailable";
}
export function educationHistoryFilter(status) {
 if(!EDUCATION_HISTORY_STATUSES.includes(status))throw new Error("Invalid history filter");
 return status==="completed"?["submitted","auto_submitted","cheated"]:
   status==="in_progress"?["in_progress"]:null;
}
export function educationHistoryRange(page) {
 if(!Number.isSafeInteger(page)||page<0||page>10000)
  throw new Error("Invalid assessment history page");
 const start=page*EDUCATION_HISTORY_PAGE_SIZE;
 return Object.freeze({start,end:start+EDUCATION_HISTORY_PAGE_SIZE-1});
}
function safeDate(value) {
 return typeof value==="string"&&Number.isFinite(Date.parse(value))?value:null;
}
export function normalizeOwnedEducationAttempt(row,userId) {
 if(!row||!validExamId(userId)||!validExamId(row.id)||
  !validExamId(row.test_id)||row.user_id!==userId||
  !Object.hasOwn(statuses,row.status))return null;
 return Object.freeze({
  id:row.id,test_id:row.test_id,user_id:row.user_id,
  status:row.status,
  start_time:safeDate(row.start_time),
  end_time:safeDate(row.end_time),
 });
}
export function educationHistoryAction(row,userId) {
 if(!row)return {label:"Attempt unavailable",path:null,status:"unavailable"};
 return educationAttemptNavigation(row.test_id,row,true,userId);
}
export function filterEducationHistoryPage(rows,titles,search) {
 const term=typeof search==="string"?search.trim().toLocaleLowerCase().slice(0,120):"";
 if(!term)return rows;
 return rows.filter(row=>{
  const title=titles?.[row.test_id];
  return typeof title==="string"&&title.toLocaleLowerCase().includes(term);
 });
}
export function educationHistoryPageSummary(rows) {
 const counts={inProgress:0,submitted:0,flagged:0};
 for(const row of rows){
  if(row?.status==="in_progress")counts.inProgress++;
  else if(row?.status==="cheated")counts.flagged++;
  else if(row?.status==="submitted"||row?.status==="auto_submitted")counts.submitted++;
 }
 return Object.freeze(counts);
}
export function educationHistoryHasNext(page,count,returned) {
 if(!Number.isSafeInteger(page)||page<0||
  !Number.isSafeInteger(returned)||returned<0)return false;
 if(Number.isSafeInteger(count)&&count>=0)
  return (page+1)*EDUCATION_HISTORY_PAGE_SIZE<count;
 return returned===EDUCATION_HISTORY_PAGE_SIZE;
}
