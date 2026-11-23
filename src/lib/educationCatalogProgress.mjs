import {validExamId} from "./educationExam.mjs";
import {educationAttemptNavigation} from "./educationAttemptNavigation.mjs";

/**
 * The learner dashboard is an owner-scoped, read-only projection.
 * In an atomic CBT rollout the attempt lookup MUST have completed before
 * a "new attempt" is offered; frontend checks are supplementary to RLS/RPC.
 */
export const EDUCATION_CATALOG_PROGRESS_FILTERS = Object.freeze([
  "all","in_progress","available","submitted","unavailable",
]);
const statuses=new Set(EDUCATION_CATALOG_PROGRESS_FILTERS);

/** Different returned attempts for the same exam must never pick an arbitrary winner. */
export function indexEducationOwnedAttempts(rows,ownerId){
  if(!validExamId(ownerId)||!Array.isArray(rows))throw new Error("Authorized attempt list required.");
  const byTest=new Map(),conflicts=new Set();
  for(const row of rows){
    if(!row||!validExamId(row.id)||!validExamId(row.test_id)||
        row.user_id!==ownerId||typeof row.status!=="string"){
      throw new Error("Exam attempt scope or record validation failed.");
    }
    const previous=byTest.get(row.test_id);
    if(!previous){
      byTest.set(row.test_id,row);
      continue;
    }
    if(previous.id!==row.id||previous.status!==row.status){
      conflicts.add(row.test_id);
      byTest.set(row.test_id,{
        id:"ambiguous-attempt",test_id:row.test_id,
        user_id:ownerId,status:"unavailable",
      });
    }
  }
  // Freeze the conflict list for safe presentation; never disclose another
  // learner's attempts or attach an arbitrary attempt to a results link.
  return {byTest,conflictTests:Object.freeze([...conflicts])};
}

function action(test,attempts,checked,ownerId){
  return educationAttemptNavigation(test?.id,attempts.get(test?.id),checked,ownerId);
}

export function countEducationCatalogProgress(tests,attempts,checked,ownerId){
  if(!Array.isArray(tests)||!(attempts instanceof Map))throw new Error("Invalid assessment catalog.");
  const counts={total:tests.length,in_progress:0,available:0,submitted:0,unavailable:0};
  for(const test of tests)counts[action(test,attempts,checked,ownerId).status]++;
  return Object.freeze(counts);
}

export function filterEducationCatalogProgress(tests,attempts,checked,ownerId,filter="all"){
  if(!Array.isArray(tests)||!(attempts instanceof Map)||!statuses.has(filter))
    throw new Error("Invalid catalog status filter.");
  if(filter==="all")return [...tests];
  return tests.filter(test=>action(test,attempts,checked,ownerId).status===filter);
}

const priority={in_progress:0,available:1,submitted:2,unavailable:3};
export function prioritizeEducationCatalog(tests,attempts,checked,ownerId){
  if(!Array.isArray(tests)||!(attempts instanceof Map))
    throw new Error("Invalid catalog ordering.");
  return [...tests].sort((a,b)=>{
    const aa=action(a,attempts,checked,ownerId).status;
    const bb=action(b,attempts,checked,ownerId).status;
    return (priority[aa]??4)-(priority[bb]??4)||
      String(a.title).localeCompare(String(b.title))||
      String(a.id).localeCompare(String(b.id));
  });
}

export function continueEducationCatalogItems(tests,attempts,checked,ownerId,limit=3){
  if(!Number.isSafeInteger(limit)||limit<1||limit>10)
    throw new Error("Invalid learner focus limit.");
  return prioritizeEducationCatalog(tests,attempts,checked,ownerId)
    .filter(test=>action(test,attempts,checked,ownerId).status==="in_progress")
    .slice(0,limit).map(test=>Object.freeze({
      id:test.id,title:test.title,duration_minutes:test.duration_minutes,
      path:action(test,attempts,checked,ownerId).path,
    }));
}
