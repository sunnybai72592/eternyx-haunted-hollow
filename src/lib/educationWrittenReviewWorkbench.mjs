/**
 * Read-only projections of the instructor's server-authorized written-review
 * queue. No exam answer keys, client-side grading or user enumeration.
 * Server RPC authorization is still the exclusive access boundary.
 */
export const WRITTEN_REVIEW_FILTERS = Object.freeze(["pending","reviewed","all"]);
export const WRITTEN_REVIEW_SORTS = Object.freeze(["returned","assessment","reviewed_recent"]);

export function writtenReviewState(entry) {
  if (!entry || typeof entry!=="object") return "unavailable";
  if (entry.reviewed_points === null) return "pending";
  if (Number.isSafeInteger(entry.reviewed_points) &&
      Number.isSafeInteger(entry.points_possible) &&
      entry.points_possible >= 1 &&
      entry.reviewed_points >= 0 &&
      entry.reviewed_points <= entry.points_possible) return "reviewed";
  return "unavailable";
}

export function summarizeWrittenReviewQueue(rows) {
  if(!Array.isArray(rows)) return Object.freeze({returned:0,pending:0,reviewed:0,unavailable:0});
  const result={returned:rows.length,pending:0,reviewed:0,unavailable:0};
  for(const entry of rows)result[writtenReviewState(entry)]++;
  return Object.freeze(result);
}

export function writtenReviewAssessments(rows) {
  if(!Array.isArray(rows))return [];
  const names=new Map();
  for(const item of rows){
    if(typeof item?.test_id==="string" &&
       typeof item.test_title==="string" && !names.has(item.test_id)) {
      names.set(item.test_id,item.test_title);
    }
  }
  return [...names.entries()].map(([id,title])=>({id,title}))
    .sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}

/** Local search is strictly limited to the 100 authorized, returned rows. */
export function filterWrittenReviewQueue(rows,{
  filter="pending",search="",assessment="all",sort="returned",
}={}) {
  if(!Array.isArray(rows)||!WRITTEN_REVIEW_FILTERS.includes(filter)||
     !WRITTEN_REVIEW_SORTS.includes(sort)||typeof search!=="string"||
     typeof assessment!=="string")
    throw new Error("Invalid written-review queue filters");
  const needle=search.trim().toLocaleLowerCase().slice(0,120);
  const result=rows.filter(item=>{
    const state=writtenReviewState(item);
    if(state==="unavailable" ||
       (filter!=="all"&&state!==filter)||
       (assessment!=="all"&&item.test_id!==assessment))return false;
    if(!needle)return true;
    return [item.test_title,item.question_text,item.response_text].some(value=>
      typeof value==="string"&&value.toLocaleLowerCase().includes(needle));
  });
  if(sort==="assessment")result.sort((a,b)=>String(a.test_title).localeCompare(String(b.test_title)) ||
    String(a.question_text).localeCompare(String(b.question_text)) ||
    String(a.answer_id).localeCompare(String(b.answer_id)));
  if(sort==="reviewed_recent")result.sort((a,b)=>{
    const aDate=typeof a.reviewed_at==="string" ? Date.parse(a.reviewed_at):NaN;
    const bDate=typeof b.reviewed_at==="string" ? Date.parse(b.reviewed_at):NaN;
    return (Number.isFinite(bDate)?bDate:0)-(Number.isFinite(aDate)?aDate:0) ||
      String(a.answer_id).localeCompare(String(b.answer_id));
  });
  return result;
}

/** The browser can prepare local provisional points, not issue a final grade. */
export function checkWrittenReviewDraft(raw,maximum,previous) {
  if(!Number.isSafeInteger(maximum)||maximum<1||maximum>1000 ||
     !(previous===null||(Number.isSafeInteger(previous)&&previous>=0&&previous<=maximum)))
    return Object.freeze({valid:false,points:null,changed:false,error:"Invalid authorized review limits."});
  if(typeof raw!=="string"||! /^(0|[1-9][0-9]{0,3})$/.test(raw))
    return Object.freeze({valid:false,points:null,changed:false,
      error:"Enter whole-number points, including 0 if appropriate."});
  const points=Number(raw);
  if(!Number.isSafeInteger(points)||points>maximum)
    return Object.freeze({valid:false,points:null,changed:false,
      error:"Marks must be between 0 and the question's maximum."});
  return Object.freeze({valid:true,points,changed:previous!==points,error:null});
}

export function isWrittenReviewDraftChanged(raw,previous) {
  if(raw===undefined)return false;
  return raw!==(previous===null?"":String(previous));
}

export function pendingWrittenReviewChanges(rows,drafts) {
  if(!Array.isArray(rows)||!drafts||typeof drafts!=="object")return 0;
  return rows.filter(row=>
    Object.hasOwn(drafts,row?.answer_id) &&
    isWrittenReviewDraftChanged(drafts[row.answer_id],row.reviewed_points)).length;
}

export function sanitizeWrittenReviewDrafts(rows,drafts) {
  if(!Array.isArray(rows)||!drafts||typeof drafts!=="object")return {};
  const next=Object.create(null);
  for(const row of rows){
    if(typeof row?.answer_id!=="string"||!Object.hasOwn(drafts,row.answer_id))continue;
    const value=drafts[row.answer_id];
    if(typeof value==="string"&&value.length<=5&&
       isWrittenReviewDraftChanged(value,row.reviewed_points))
      next[row.answer_id]=value;
  }
  return next;
}

export function writtenReviewDate(value) {
  return typeof value==="string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString() : "Not recorded";
}
