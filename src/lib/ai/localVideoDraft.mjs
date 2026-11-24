/** Fully offline ETERNYX video-editing draft, with NO original media bytes.
 * A draft saves editable WIP state, including unfinished captions and rights.
 * Reopening is transactional: all original MP4/audio SHA256 bytes must match
 * before any timeline, soundtrack or profile is restored to the live editor.
 */
import {
  checkLocalMediaName,LOCAL_VIDEO_LIMITS,checkLocalVideoLook,checkSoundtrackEdit,SOUNDTRACK_EDIT_FIELDS,
  LOCAL_VIDEO_PROFILES,LOCAL_VIDEO_QUALITIES,localVideoFps,localVideoMaxFrames,localVideoMaxSourceFrames,
} from "./localVideoEditor.mjs";

export const VIDEO_DRAFT_LIMITS=Object.freeze({
  maxBytes:32768,maxTitleLength:80,maxCaptionLength:180,
  maxMedia:9,maxClips:LOCAL_VIDEO_LIMITS.maxClips,
  maxFrames:LOCAL_VIDEO_LIMITS.maxFrames,
});
const HASH=/^[a-f0-9]{64}$/;
const ROOT=["format","version","name","contains_private_media","sources",
  "soundtrack","shots","profile","quality"];
const MEDIA=["name","size","sha256"];
const AUDIO=[...MEDIA,"rightsRef","volumePercent"];
const SHOT=["sourceName","startFrame","frames","caption","rightsRef",
  "fadeInFrames","fadeOutFrames"];
const printable=s=>typeof s==="string"&&!/[\u0000-\u001f\u007f]/.test(s);
const fields=(x,names,label)=>{
  if(x===null||typeof x!=="object"||Array.isArray(x)||
     Object.keys(x).length!==names.length||
     names.some(k=>!Object.hasOwn(x,k)))
    throw new Error("Invalid "+label+" properties in local editing draft.");
};
function int(value,min,max,what){
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw new Error(what+" must be an integer "+min+"–"+max+".");
  return value;
}
function wording(value,max,what,empty=false){
  if(!printable(value)||value.length>max||(!empty&&!value.trim()))
    throw new Error(what+" must be "+(empty?"0":"1")+"–"+max+" printable characters.");
  return value;
}
function mediaRecord(item,kind){
  const keys=kind==="audio"?[...AUDIO,...[...Object.keys(SOUNDTRACK_EDIT_FIELDS),"loop"].filter(k=>item&&Object.hasOwn(item,k))]:MEDIA;
  fields(item,keys,kind+" source");
  checkLocalMediaName(item.name,kind);
  int(item.size,1,kind==="audio"?LOCAL_VIDEO_LIMITS.maxAudioBytes:
    LOCAL_VIDEO_LIMITS.maxSourceBytes,"Local "+kind+" size");
  if(typeof item.sha256!=="string"||!HASH.test(item.sha256))
    throw new Error("Invalid local "+kind+" SHA-256 receipt.");
  const base={name:item.name,size:item.size,sha256:item.sha256};
  if(kind==="audio"){
    base.rightsRef=wording(item.rightsRef,180,"Audio rights reference",true);
    base.volumePercent=int(item.volumePercent,0,100,"Audio volume");
    for(const [key,max] of Object.entries(SOUNDTRACK_EDIT_FIELDS))if(Object.hasOwn(item,key))base[key]=int(item[key],0,max,"Soundtrack "+key);
    if(Object.hasOwn(item,"loop")){
      if(typeof item.loop!=="boolean")throw new Error("Soundtrack loop must be boolean.");
      base.loop=item.loop;
    }
  }
  return base;
}
function normalize(data){
  fields(data,[...ROOT,...["grade","framing"].filter(k=>data&&Object.hasOwn(data,k))],"draft");
  checkLocalVideoLook(Object.hasOwn(data,"grade")?data.grade:"neutral",Object.hasOwn(data,"framing")?data.framing:"contain");
  if(data.format!=="eternyx-local-video-edit-draft"||
     data.version!==1||data.contains_private_media!==false)
    throw new Error("Unsupported local video draft; media bytes are never stored.");
  const name=wording(data.name,VIDEO_DRAFT_LIMITS.maxTitleLength,"Project title");
  if(!Array.isArray(data.sources)||!data.sources.length||
     data.sources.length>VIDEO_DRAFT_LIMITS.maxClips)
    throw new Error("A draft must list one to eight original source MP4s.");
  const sources=data.sources.map(x=>mediaRecord(x,"video"));
  const byName=new Map();
  for(const source of sources){
    const lower=source.name.toLowerCase();
    if(byName.has(lower))throw new Error("Duplicate or case-colliding draft MP4 source.");
    byName.set(lower,source);
  }
  let soundtrack=null;
  if(data.soundtrack!==null){
    soundtrack=mediaRecord(data.soundtrack,"audio");
    if(byName.has(soundtrack.name.toLowerCase()))
      throw new Error("Video and audio source filenames must not collide.");
  }
  if(!LOCAL_VIDEO_PROFILES.includes(data.profile)||
     !LOCAL_VIDEO_QUALITIES.includes(data.quality))
    throw new Error("Unsupported saved local CPU output profile or quality.");
  const fps=localVideoFps(data.quality), maxFrames=localVideoMaxFrames(fps),
        sourceCeiling=localVideoMaxSourceFrames(fps);
  if(!Array.isArray(data.shots)||!data.shots.length||
     data.shots.length>VIDEO_DRAFT_LIMITS.maxClips)
    throw new Error("Draft must contain one to eight editable video cuts.");
  let total=0;
  const shots=data.shots.map((raw,index)=>{
    fields(raw,SHOT,"shot "+(index+1));
    if(typeof raw.sourceName!=="string"||
       !sources.some(src=>src.name===raw.sourceName))
      throw new Error("Draft shot "+(index+1)+" references an unknown original clip.");
    const start=int(raw.startFrame,0,sourceCeiling,"Start frame");
    const frames=int(raw.frames,1,maxFrames,"Shot length");
    if(start+frames>sourceCeiling)throw new Error("Draft shot exceeds source frame safety ceiling.");
    total+=frames;
    if(total>maxFrames)
      throw new Error("Total draft timeline exceeds 30 seconds at "+fps+" FPS.");
    return {
      sourceName:raw.sourceName,startFrame:start,frames,
      caption:wording(raw.caption,180,"Editable caption",true),
      rightsRef:wording(raw.rightsRef,180,"Editable rights reference",true),
      fadeInFrames:int(raw.fadeInFrames,0,Math.min(16,Math.floor(frames/2)),"Fade in"),
      fadeOutFrames:int(raw.fadeOutFrames,0,Math.min(16,Math.floor(frames/2)),"Fade out"),
    };
  });
  if(!LOCAL_VIDEO_PROFILES.includes(data.profile)||
     !LOCAL_VIDEO_QUALITIES.includes(data.quality))
    throw new Error("Unsupported saved local CPU output profile or quality.");
  if(soundtrack)checkSoundtrackEdit(soundtrack,total,fps);
  return {
    format:"eternyx-local-video-edit-draft",version:1,
    name,contains_private_media:false,sources,soundtrack,shots,
    profile:data.profile,quality:data.quality,
    ...(Object.hasOwn(data,"grade")?{grade:data.grade}:{}),
    ...(Object.hasOwn(data,"framing")?{framing:data.framing}:{}),
  };
}
export function createLocalVideoDraft({
  name="My ETERNYX video",sources,shots,soundtrack=null,
  profile="landscape",quality="standard",grade,framing,
}){
  const raw={
    format:"eternyx-local-video-edit-draft",version:1,
    name,contains_private_media:false,
    sources:(sources??[]).map(s=>({
      name:s.name,size:s.size,sha256:s.sha256,
    })),
    soundtrack:soundtrack?{
      name:soundtrack.name,size:soundtrack.size,sha256:soundtrack.sha256,
      rightsRef:soundtrack.rightsRef,volumePercent:soundtrack.volumePercent,
      ...Object.fromEntries([...Object.keys(SOUNDTRACK_EDIT_FIELDS),"loop"].filter(k=>Object.hasOwn(soundtrack,k)).map(k=>[k,soundtrack[k]])),
    }:null,
    shots:(shots??[]).map(s=>({
      sourceName:s.sourceName,startFrame:s.startFrame,frames:s.frames,
      caption:s.caption,rightsRef:s.rightsRef,
      fadeInFrames:s.fadeInFrames,fadeOutFrames:s.fadeOutFrames,
    })),
    profile,quality,...(grade===undefined?{}:{grade}),...(framing===undefined?{}:{framing}),
  };
  const draft=normalize(raw);
  const json=JSON.stringify(draft,null,2)+"\n";
  if(new TextEncoder().encode(json).byteLength>VIDEO_DRAFT_LIMITS.maxBytes)
    throw new Error("Local video edit draft exceeds the 32 KiB limit.");
  return {draft,json,filename:"eternyx-video-edit-draft.json",
    sourceCount:draft.sources.length+(draft.soundtrack?1:0),
    frames:draft.shots.reduce((n,s)=>n+s.frames,0)};
}
export function readLocalVideoDraft(raw){
  if(typeof raw!=="string"||
     new TextEncoder().encode(raw).byteLength>VIDEO_DRAFT_LIMITS.maxBytes)
    throw new Error("Choose a local ETERNYX draft JSON not exceeding 32 KiB.");
  let parsed;
  try{parsed=JSON.parse(raw);}
  catch{throw new Error("Selected video draft is not valid JSON.");}
  return normalize(parsed);
}
export async function verifyLocalVideoDraftMedia(draft,files,onProgress=()=>{}){
  const safe=normalize(draft);
  if(typeof onProgress!=="function")throw new Error("Invalid draft verification progress handler.");
  if(!Array.isArray(files)||
     files.length!==safe.sources.length+(safe.soundtrack?1:0))
    throw new Error("Select every original MP4"+(safe.soundtrack?" and soundtrack":"")+
      " from the draft, with no extra files.");
  const required=new Map([...safe.sources.map(x=>[x.name.toLowerCase(),{
    record:x,kind:"video"}]),
    ...(safe.soundtrack?[[safe.soundtrack.name.toLowerCase(),{
      record:safe.soundtrack,kind:"audio"}]]:[])]);
  const seen=new Set();
  const matched=new Map();
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("Secure browser WebCrypto is required to check original video bytes.");
  for(const file of files){
    if(!file||typeof file.name!=="string"||typeof file.arrayBuffer!=="function")
      throw new Error("Choose genuine local video/audio files to resume.");
    const key=file.name.toLowerCase();
    const entry=required.get(key);
    if(!entry||seen.has(key))
      throw new Error("Unrecognized or duplicated original file: "+file.name);
    seen.add(key);
    // Explicit case-sensitive equality: avoids wrong files on case-insensitive OSes.
    if(file.name!==entry.record.name)
      throw new Error("Original local file spelling differs from saved draft.");
    checkLocalMediaName(file.name,entry.kind);
    if(file.size!==entry.record.size)
      throw new Error("Original local file size differs from saved draft: "+file.name);
    const actual=new Uint8Array(await file.arrayBuffer());
    const digest=await globalThis.crypto.subtle.digest("SHA-256",actual);
    const sha=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
    if(sha!==entry.record.sha256)
      throw new Error("Original local SHA-256 differs from saved draft: "+file.name);
    matched.set(key,{...entry.record,file});
    onProgress({checked:matched.size,total:files.length,name:file.name});
  }
  return {
    sources:safe.sources.map(s=>matched.get(s.name.toLowerCase())),
    soundtrack:safe.soundtrack?matched.get(safe.soundtrack.name.toLowerCase()):null,
    shots:safe.shots.map(s=>({...s})),profile:safe.profile,quality:safe.quality,
    grade:safe.grade??"neutral",framing:safe.framing??"contain",
    name:safe.name,verifiedCount:matched.size,
    privateMediaUploaded:false,
  };
}
