import {
  EDUCATION_HISTORY_PAGE_SIZE,
  educationHistoryAction,
  filterEducationHistoryPage,
  normalizeOwnedEducationAttempt,
} from "./educationAttemptHistory.mjs";
import {educationSafeCsvCell} from "./educationPrivateAnswerReview.mjs";

export const EDUCATION_HISTORY_LOCAL_SORTS=Object.freeze(["newest","oldest","title"]);
export const EDUCATION_HISTORY_LOCAL_FOCUS=Object.freeze(["all","resume","submitted"]);
export const EDUCATION_HISTORY_EXPORT_LIMIT=EDUCATION_HISTORY_PAGE_SIZE;

function utcDate(value) {
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split("-").map(Number);
  const epoch=Date.UTC(year,month-1,day);
  if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,10)!==value)return null;
  return value;
}
export function validateEducationHistoryDates(from="",to="") {
  if((from!==""&&!utcDate(from))||(to!==""&&!utcDate(to))||
    (from&&to&&from>to))throw new Error("Invalid UTC date range.");
  return Object.freeze({from,to});
}

function attemptDay(row){
  if(typeof row?.start_time!=="string")return null;
  const time=Date.parse(row.start_time);
  return Number.isFinite(time)?new Date(time).toISOString().slice(0,10):null;
}

function strictOwnerRows(rows,ownerId){
  if(!Array.isArray(rows)||rows.length>EDUCATION_HISTORY_PAGE_SIZE)
    throw new Error("Only one authenticated history page is permitted.");
  return rows.map(row=>{
    const valid=normalizeOwnedEducationAttempt(row,ownerId);
    if(!valid)throw new Error("History contains a row outside the authenticated account.");
    return valid;
  });
}

/** Filter + sort only the current 20-record page. This is NOT global search. */
export function organizeEducationHistoryPage(rows,titles,{
  search="",from="",to="",sort="newest",focus="all",
}={},ownerId){
  if(!EDUCATION_HISTORY_LOCAL_SORTS.includes(sort)||
     !EDUCATION_HISTORY_LOCAL_FOCUS.includes(focus)||typeof search!=="string")
    throw new Error("Invalid history review controls.");
  const range=validateEducationHistoryDates(from,to);
  const owned=strictOwnerRows(rows,ownerId);
  const titleFiltered=filterEducationHistoryPage(owned,titles,search);
  const filtered=titleFiltered.filter(row=>{
    const day=attemptDay(row);
    if((range.from||range.to)&&(!day||(range.from&&day<range.from)||(range.to&&day>range.to)))return false;
    const act=educationHistoryAction(row,ownerId);
    if(focus==="resume"&&act.status!=="in_progress")return false;
    if(focus==="submitted"&&act.status!=="submitted")return false;
    return true;
  });
  const sortable=[...filtered];
  const when=row=>{
    const raw=typeof row.start_time==="string"?Date.parse(row.start_time):NaN;
    return Number.isFinite(raw)?raw:null;
  };
  const compareNewest=(a,b)=>{
    const aa=when(a),bb=when(b);
    return aa===null&&bb!==null?1:bb===null&&aa!==null?-1:
      aa!==null&&bb!==null?bb-aa:0;
  };
  sortable.sort((a,b)=>{
    if(sort==="title"){
      const ta=typeof titles?.[a.test_id]==="string"?titles[a.test_id]:"";
      const tb=typeof titles?.[b.test_id]==="string"?titles[b.test_id]:"";
      return (!ta&&tb)?1:(!tb&&ta)?-1:
        ta.localeCompare(tb)||compareNewest(a,b)||a.id.localeCompare(b.id);
    }
    const byDate=compareNewest(a,b);
    return (sort==="oldest"?-byDate:byDate)||a.id.localeCompare(b.id);
  });
  return sortable;
}

/** A focus link may only exist when exactly one attempt for a test appears on this page. */
export function educationHistoryResumeFocus(rows,ownerId,limit=3){
  if(!Number.isSafeInteger(limit)||limit<1||limit>10)
    throw new Error("Invalid focus limit");
  const valid=strictOwnerRows(rows,ownerId);
  const counts=new Map();
  for(const row of valid){
    if(row.status==="in_progress")
      counts.set(row.test_id,(counts.get(row.test_id)||0)+1);
  }
  return valid.filter(row=>row.status==="in_progress"&&counts.get(row.test_id)===1)
    .slice(0,limit)
    .map(row=>Object.freeze({
      attemptId:row.id,testId:row.test_id,
      path:educationHistoryAction(row,ownerId).path,
    })).filter(row=>row.path);
}

export function educationHistoryDisplayedSummary(rows,ownerId) {
  const valid=strictOwnerRows(rows,ownerId);
  const counts={visible:valid.length,inProgress:0,submitted:0,flagged:0};
  for(const row of valid){
    if(row.status==="in_progress")counts.inProgress++;
    else if(row.status==="cheated")counts.flagged++;
    else counts.submitted++;
  }
  return Object.freeze(counts);
}

/**
 * Exports EXACTLY the shown and owner-validated records, never entire hidden
 * history, grades, answer keys, email, or other user attributes.
 */
export function buildEducationHistoryPageCsv(rows,titles,ownerId,{
  page=0,filters="Current page",
}={}){
  if(!Number.isSafeInteger(page)||page<0||page>10000||
     typeof filters!=="string"||filters.length>180)
    throw new Error("Invalid history export context.");
  const valid=strictOwnerRows(rows,ownerId);
  const headers=["Assessment title","Attempt ID","Attempt status","Started (UTC)","Ended (UTC)",
    "Duration (seconds)","Source page","Filter scope"];
  const encode=values=>values.map(educationSafeCsvCell).join(",");
  const lines=[encode(headers)];
  for(const row of valid){
    const start=typeof row.start_time==="string"?Date.parse(row.start_time):NaN;
    const end=typeof row.end_time==="string"?Date.parse(row.end_time):NaN;
    const duration=Number.isFinite(start)&&Number.isFinite(end)&&end>=start?
      String(Math.floor((end-start)/1000)):"";
    const title=typeof titles?.[row.test_id]==="string"&&titles[row.test_id].trim()
      ? titles[row.test_id]:"Assessment title unavailable";
    lines.push(encode([
      title,row.id,row.status,row.start_time||"",row.end_time||"",
      duration,String(page+1),filters,
    ]));
  }
  return "\uFEFF"+lines.join("\r\n")+"\r\n";
}
