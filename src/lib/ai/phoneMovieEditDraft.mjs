/** Private metadata-only re-edit drafts for genuine 16/24 FPS phone movies.
 * A saved draft NEVER contains original media; reattaching verifies every
 * original file's exact filename, bytes and SHA-256 before any edit is restored.
 */
export const PHONE_MOVIE_EDIT_DRAFT_NAME="phone-movie-edit-draft.json";
export const PHONE_MOVIE_EDIT_DRAFT_MAX_BYTES=32768;
const FORMAT="eternyx-private-phone-movie-edit-draft";
const SHA=/^[a-f0-9]{64}$/;
const INPUT=/^[^/\\:\x00-\x1f\x7f]{1,180}\.(mp4|mov|m4v)$/i;
const PROFILES=["landscape","portrait","square"];
const QUALITIES=["standard","high","cinematic"];
const DELIVERIES=["mp4","mp4_with_subtitles","mp4_webm","all"];
const FRAMINGS=["contain","cover"];
const ROOT=["format","version","contains_private_media","fps","start_seconds","seconds","originals","movie_plan"];
const ORIGINAL=["filename","bytes","sha256"];
const PLAN=["profile","quality","delivery","framing","shots"];
const SHOT=["source_filename","frames","caption","rights_ref","start_seconds","fade_in_frames","fade_out_frames"];
const encoder=new TextEncoder();

function object(value,allowed,required,label){
  if(!value||typeof value!=="object"||Array.isArray(value)||
      Object.keys(value).some(key=>!allowed.includes(key))||
      required.some(key=>!Object.hasOwn(value,key)))
    throw new Error("Invalid "+label+" fields in private phone movie edit draft.");
  return value;
}
function integer(value,min,max,label){
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw new Error(label+" must be an integer "+min+"–"+max+".");
  return value;
}
function originalName(name){
  if(typeof name!=="string"||!INPUT.test(name)||name.startsWith(".")||name.startsWith("~"))
    throw new Error("Draft original must have a safe flat MP4/MOV/M4V filename.");
  return name;
}
function printable(value,label){
  if(typeof value!=="string"||value.length>180||/[\x00-\x1f\x7f]/.test(value))
    throw new Error(label+" must be at most 180 printable characters.");
  return value;
}
const stamp=bytes=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");

function normalizePlan(plan,originals,seconds,start){
  object(plan,PLAN,["profile","quality","shots"],"movie plan");
  if(!PROFILES.includes(plan.profile)||!QUALITIES.includes(plan.quality)||
     !DELIVERIES.includes(plan.delivery??"mp4")||
     !FRAMINGS.includes(plan.framing??"contain")||
     !Array.isArray(plan.shots)||plan.shots.length!==originals.length)
    throw new Error("Invalid phone movie edit quality, shape, delivery or shot inventory.");
  let framesTotal=0;
  const shots=plan.shots.map((shot,index)=>{
    object(shot,SHOT,["source_filename","frames","caption","rights_ref"],"shot");
    if(shot.source_filename!==originals[index].filename)
      throw new Error("Draft shot does not match verified original file order.");
    const frames=integer(shot.frames,16,48,"Shot frames");
    if(frames%16)throw new Error("Draft cut must have whole-second 16-FPS authored units.");
    const offset=integer(shot.start_seconds??0,0,299,"Shot trim offset");
    const fadeIn=integer(shot.fade_in_frames??0,0,Math.min(8,frames/2),"Fade in");
    const fadeOut=integer(shot.fade_out_frames??0,0,Math.min(8,frames/2),"Fade out");
    if(offset+frames/16>seconds||start+offset+frames/16>300)
      throw new Error("Draft cut extends past selected original phone source window.");
    framesTotal+=frames;
    if(framesTotal>480)throw new Error("Draft movie cannot exceed 30 seconds.");
    return {source_filename:shot.source_filename,frames,
      caption:printable(shot.caption,"Caption"),
      rights_ref:printable(shot.rights_ref,"Rights reference"),
      start_seconds:offset,fade_in_frames:fadeIn,fade_out_frames:fadeOut};
  });
  return {profile:plan.profile,quality:plan.quality,
    delivery:plan.delivery??"mp4",framing:plan.framing??"contain",shots};
}
function normalize(draft){
  object(draft,ROOT,ROOT,"draft root");
  if(draft.format!==FORMAT||draft.version!==1||draft.contains_private_media!==false)
    throw new Error("Invalid or media-containing phone movie re-edit draft.");
  const start=integer(draft.start_seconds,0,299,"Source start");
  const seconds=integer(draft.seconds,1,60,"Selected source window");
  if(!Array.isArray(draft.originals)||draft.originals.length<1||draft.originals.length>8)
    throw new Error("Draft needs 1–8 original phone clips.");
  let total=0;
  const seen=new Set();
  const originals=draft.originals.map(entry=>{
    object(entry,ORIGINAL,ORIGINAL,"original source");
    const filename=originalName(entry.filename);
    if(seen.has(filename.toLowerCase()))throw new Error("Duplicate or case-colliding draft source.");
    seen.add(filename.toLowerCase());
    const bytes=integer(entry.bytes,1,64*1024*1024,"Original media bytes");
    total+=bytes;
    if(total>512*1024*1024)throw new Error("Draft originals exceed the private batch size.");
    if(typeof entry.sha256!=="string"||!SHA.test(entry.sha256))
      throw new Error("Original footage SHA-256 must be exact lowercase hexadecimal.");
    return {filename,bytes,sha256:entry.sha256};
  });
  const movie_plan=normalizePlan(draft.movie_plan,originals,seconds,start);
  const fps=movie_plan.quality==="cinematic"?24:16;
  if(draft.fps!==fps)throw new Error("Saved FPS does not match verified cinematic mode.");
  return {format:FORMAT,version:1,contains_private_media:false,
    fps,start_seconds:start,seconds,originals,movie_plan};
}
function serialized(value){
  const draft=normalize(value);
  const json=JSON.stringify(draft,null,2)+"\n";
  if(encoder.encode(json).byteLength>PHONE_MOVIE_EDIT_DRAFT_MAX_BYTES)
    throw new Error("Metadata-only phone movie draft exceeds 32 KiB.");
  return {draft,json,filename:PHONE_MOVIE_EDIT_DRAFT_NAME,
    fps:draft.fps,sourceCount:draft.originals.length};
}
/** Build the ZIP's auto-included metadata re-edit draft from already verified hashes. */
export function serializePhoneMovieEditDraft({originals,start,seconds,moviePlan}){
  return serialized({format:FORMAT,version:1,contains_private_media:false,
    fps:moviePlan?.quality==="cinematic"?24:16,start_seconds:start,
    seconds,originals,movie_plan:moviePlan});
}
/** Save unfinished edits too; no fabricated captions or rights are inserted. */
export async function createPhoneMovieEditDraft({files,start,seconds,moviePlan}){
  if(!Array.isArray(files)||files.length<1||files.length>8)
    throw new Error("Choose 1–8 original phone files before saving a draft.");
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("Secure WebCrypto is required for local original-file verification.");
  const originals=[];
  for(const file of files){
    if(!file||typeof file.name!=="string"||typeof file.arrayBuffer!=="function"||
       !Number.isSafeInteger(file.size)||file.size<1||file.size>64*1024*1024)
      throw new Error("Cannot create a draft without a real bounded original phone file.");
    originalName(file.name);
    originals.push({filename:file.name,bytes:file.size,
      sha256:stamp(await globalThis.crypto.subtle.digest("SHA-256",await file.arrayBuffer()))});
  }
  return serializePhoneMovieEditDraft({originals,start,seconds,moviePlan});
}
export function readPhoneMovieEditDraft(raw){
  if(typeof raw!=="string"||encoder.encode(raw).byteLength>PHONE_MOVIE_EDIT_DRAFT_MAX_BYTES)
    throw new Error("Choose a metadata-only phone edit draft under 32 KiB.");
  let parsed;
  try{parsed=JSON.parse(raw);}
  catch{throw new Error("Invalid phone movie draft JSON.");}
  return normalize(parsed);
}
/** Returns all edits only AFTER verifying every original, independent of order. */
export async function verifyPhoneMovieEditDraftMedia(draft,files,onProgress=()=>{}){
  const safe=normalize(draft);
  if(!Array.isArray(files)||files.length!==safe.originals.length)
    throw new Error("Reattach exactly all original clips; no files can be omitted or added.");
  if(typeof onProgress!=="function"||!globalThis.crypto?.subtle?.digest)
    throw new Error("Secure original media verification is unavailable.");
  const lookup=new Map(safe.originals.map(record=>[record.filename.toLowerCase(),record]));
  const seen=new Map();
  for(const file of files){
    if(!file||typeof file.name!=="string"||typeof file.arrayBuffer!=="function")
      throw new Error("Reattachment requires real local phone files.");
    const record=lookup.get(file.name.toLowerCase());
    if(!record||record.filename!==file.name||seen.has(file.name.toLowerCase())||
       file.size!==record.bytes)
      throw new Error("Original phone filename or byte count differs from saved draft.");
    const sha=stamp(await globalThis.crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
    if(sha!==record.sha256)throw new Error("Original phone SHA-256 does not match saved draft.");
    seen.set(file.name.toLowerCase(),file);
    onProgress({checked:seen.size,total:files.length,name:file.name});
  }
  return {files:safe.originals.map(record=>seen.get(record.filename.toLowerCase())),
    moviePlan:safe.movie_plan,start:safe.start_seconds,seconds:safe.seconds,
    fps:safe.fps,verifiedCount:seen.size,privateMediaUploaded:false};
}
