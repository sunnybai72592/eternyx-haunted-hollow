/** Manual, untrusted, offline practice session tools. No network or storage. */
import {PRACTICE_CASES,PRACTICE_TRACKS} from "./eternyxLabsPractice.mjs";
const IDs=new Set(PRACTICE_CASES.map(c=>c.id));
const TRACKS=new Set(PRACTICE_TRACKS.map(t=>t.id));
const KIND="eternyx-labs-local-practice";
export const MAX_PRACTICE_IMPORT_BYTES=16384;
function knownIds(input,label){
  if(!Array.isArray(input)&&!(input instanceof Set))throw Error(label+" must be a list.");
  if(input.length>PRACTICE_CASES.length||input.size>PRACTICE_CASES.length)throw Error(label+" is too large.");
  const result=new Set();
  for(const id of input){
    if(typeof id!=="string"||!IDs.has(id)||result.has(id))throw Error(label+" contains an invalid or duplicate ID.");
    result.add(id);
  }
  return result;
}
function optionsFor(options){
  if(!options||typeof options!=="object"||Array.isArray(options))throw Error("Invalid filters.");
  const {query="",status="all",bookmarksOnly=false,passedIds=[],bookmarkedIds=[]}=options;
  if(typeof query!=="string"||query.length>80)throw Error("Search exceeds 80 characters.");
  if(!["all","todo","done"].includes(status)||typeof bookmarksOnly!=="boolean")throw Error("Invalid filter.");
  return {q:query.trim().toLocaleLowerCase(),status,bookmarksOnly,
    passed:knownIds(passedIds,"Checked cases"),bookmarks:knownIds(bookmarkedIds,"Bookmarks")};
}
function matches(c,t,f){
  const done=f.passed.has(c.id);
  if(f.status==="todo"&&done||f.status==="done"&&!done||f.bookmarksOnly&&!f.bookmarks.has(c.id))return false;
  return !f.q||[c.title,c.prompt,t.title,t.description].some(s=>s.toLocaleLowerCase().includes(f.q));
}
export function filterPracticeCases(trackId,options={}){
  if(!TRACKS.has(trackId))throw Error("Unknown track.");
  const f=optionsFor(options),t=PRACTICE_TRACKS.find(t=>t.id===trackId);
  return PRACTICE_CASES.filter(c=>c.track===trackId&&matches(c,t,f));
}
export function filterPracticeTracks(options={}){
  const f=optionsFor(options);
  return PRACTICE_TRACKS.filter(t=>PRACTICE_CASES.some(c=>c.track===t.id&&matches(c,t,f)));
}
export function nextUnfinishedPracticeCase(currentId,passedIds=[]){
  if(!IDs.has(currentId))throw Error("Unknown current case.");
  const passed=knownIds(passedIds,"Checked cases");
  const current=PRACTICE_CASES.findIndex(c=>c.id===currentId);
  for(let step=1;step<=PRACTICE_CASES.length;step++){
    const candidate=PRACTICE_CASES[(current+step)%PRACTICE_CASES.length];
    if(!passed.has(candidate.id))return candidate.id;
  }
  return null;
}
export function summarizePracticeReview(passedIds=[],bookmarkedIds=[]){
  const passed=knownIds(passedIds,"Checked cases"),bookmarks=knownIds(bookmarkedIds,"Bookmarks");
  return Object.freeze({unfinished:PRACTICE_CASES.length-passed.size,bookmarked:bookmarks.size,
    bookmarkedUnfinished:[...bookmarks].filter(id=>!passed.has(id)).length,trusted:false});
}
export function exportPracticeSession(passedIds=[],bookmarkedIds=[]){
  const passed=knownIds(passedIds,"Checked cases"),bookmarks=knownIds(bookmarkedIds,"Bookmarks");
  const text=JSON.stringify({kind:KIND,version:1,
    passed:PRACTICE_CASES.filter(c=>passed.has(c.id)).map(c=>c.id),
    bookmarks:PRACTICE_CASES.filter(c=>bookmarks.has(c.id)).map(c=>c.id)},null,2);
  if(new TextEncoder().encode(text).length>MAX_PRACTICE_IMPORT_BYTES)throw Error("Session exceeds 16 KiB.");
  return text;
}
export function importPracticeSession(text){
  if(typeof text!=="string"||new TextEncoder().encode(text).length>MAX_PRACTICE_IMPORT_BYTES)
    throw Error("Select a JSON session file no larger than 16 KiB.");
  let value;
  try{value=JSON.parse(text);}catch{throw Error("Invalid session JSON.");}
  if(!value||typeof value!=="object"||Array.isArray(value)||
    Object.keys(value).sort().join(",")!=="bookmarks,kind,passed,version"||
    value.kind!==KIND||value.version!==1||!Array.isArray(value.passed)||!Array.isArray(value.bookmarks))
    throw Error("Unsupported local practice session version or schema.");
  return Object.freeze({passed:knownIds(value.passed,"Checked cases"),
    bookmarks:knownIds(value.bookmarks,"Bookmarks"),trusted:false,serverVerified:false});
}
