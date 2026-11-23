/** Self-contained offline phone video conversion ZIP from original owned media.
 * All original bytes stay in the browser until explicitly included in the
 * downloaded PRIVATE ZIP. No media upload, subscription, GPU or API call.
 */
import {packPortableArchive} from "./portableVideoBundle.mjs";

export const PHONE_INTAKE_LIMITS=Object.freeze({
  maxClips:8,maxBytes:64*1024*1024,maxTotalBytes:512*1024*1024,
  maxScriptBytes:128*1024,maxSourceName:180,
});
const input=/^[^\/\\:\x00-\x1f\x7f]{1,180}\.(mp4|mov|m4v)$/i;
const scriptNames=[
  "prepare_video_sources.py","render_video_timeline.py",
  "assemble_video_storyboard.py","audit_video_render.py",
  "launch_phone_intake.py",
];
const encode=new TextEncoder();
function bounded(value,min,max,name){
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw new Error(name+" must be an integer "+min+"–"+max+".");
}
function validName(name){
  if(typeof name!=="string"||!input.test(name)||
     name.startsWith(".")||name.startsWith("~"))
    throw new Error("Choose original MP4, MOV or M4V footage with safe flat filenames.");
}
function digestHex(bytes){
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
}
function script(name,source){
  if(typeof source!=="string"||!source.startsWith('"""')||
     encode.encode(source).length>PHONE_INTAKE_LIMITS.maxScriptBytes||
     source.length<200)
    throw new Error("Missing exact offline Python script: "+name);
  return new Blob([source],{type:"text/x-python;charset=utf-8"});
}
const posix=[
  "#!/bin/sh","set -eu",
  'cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
  "python3 launch_phone_intake.py --run","",
].join("\n");
const windows=[
  "@echo off","setlocal",'pushd "%~dp0" || exit /b 1',
  "py -3 launch_phone_intake.py --run",
  "set EXITCODE=%ERRORLEVEL%","popd","exit /b %EXITCODE%","",
].join("\r\n");
const readme=[
  "ETERNYX — OFFLINE PHONE VIDEO IMPORT (NO REPOSITORY REQUIRED)","",
  "This ZIP contains your exact private original footage. Keep it private.",
  "Only run an extracted script if you trust the ZIP's creator.","",
  "Requirements: Python 3.11+, FFmpeg, FFprobe and libx264 on PATH.",
  "No pip installation, GPU, cloud API, remote upload or model download.","",
  "1. Extract this whole ZIP to a NEW folder; keep phone-clips/ intact.",
  "2. Windows: double-click prepare-phone-windows.cmd",
  "   macOS/Linux: open a terminal and run sh prepare-phone-macos-linux.sh",
  "   Or check first: python3 launch_phone_intake.py --check",
  "   Then run: python3 launch_phone_intake.py --run",
  "3. If all source SHA-256, actual FFmpeg metadata and conversions pass,",
  "   the new local-video-media/ folder contains:",
  "   - clip-01.mp4 and other genuine 16 FPS silent H264 footage",
  "   - preparation-report.json with actual original/prepared file hashes",
  "   - eternyx-video-edit-draft.json with editable first-second cuts",
  "4. In ETERNYX AI Video Studio, reopen that editing draft and reattach",
  "   the normalized clip-XX.mp4 originals from local-video-media/.",
  "   Enter your own captions and actual recording/permission references.",
  "   Then export a complete runnable CPU editor project ZIP as usual.","",
  "No generated captions or false licenses are inserted in the draft.",
  "Your ORIGINAL phone files remain unchanged. No output directory overwritten.",
  "If FFmpeg fails, no completed or partial output is published.","",
].join("\n");
export const PHONE_MOVIE_PROFILES=Object.freeze(["landscape","portrait","square"]);
export const PHONE_MOVIE_QUALITIES=Object.freeze(["standard","high","cinematic"]);
export const PHONE_MOVIE_DELIVERIES=Object.freeze(["mp4","mp4_with_subtitles","mp4_webm","all"]);
export const PHONE_MOVIE_FRAMINGS=Object.freeze(["contain","cover"]);
export function validatePhoneMoviePlan({files,moviePlan,seconds}){
  if(!Array.isArray(files)||!files.length||files.length>8||
     !moviePlan||typeof moviePlan!=="object"||Array.isArray(moviePlan)||
     !["profile,quality,shots","delivery,profile,quality,shots",
       "framing,profile,quality,shots","delivery,framing,profile,quality,shots"]
       .includes(Object.keys(moviePlan).sort().join(","))||
     (moviePlan.framing!==undefined&&!PHONE_MOVIE_FRAMINGS.includes(moviePlan.framing))||
     (moviePlan.delivery!==undefined&&!PHONE_MOVIE_DELIVERIES.includes(moviePlan.delivery))||
     !PHONE_MOVIE_PROFILES.includes(moviePlan.profile)||
     !PHONE_MOVIE_QUALITIES.includes(moviePlan.quality)||
     !Array.isArray(moviePlan.shots)||
     moviePlan.shots.length!==files.length)
    throw new Error("Each original phone source needs one authored movie shot and supported output presets.");
  let total=0;
  const shots=moviePlan.shots.map((shot,index)=>{
    const keys=["caption","frames","rights_ref","source_filename",
      "start_seconds","fade_in_frames","fade_out_frames"];
    if(!shot||typeof shot!=="object"||Array.isArray(shot)||
       !Object.keys(shot).every(key=>keys.includes(key))||
       !["caption","frames","rights_ref","source_filename"]
          .every(key=>Object.hasOwn(shot,key))||
       shot.source_filename!==files[index].name||
       !Number.isSafeInteger(shot.frames)||shot.frames<16||
       shot.frames>48||shot.frames%16||
       !Number.isSafeInteger(seconds)||shot.frames>seconds*16)
      throw new Error("Choose a valid 1–3 second movie cut for every original file, in order.");
    const offset=shot.start_seconds??0;
    if(!Number.isSafeInteger(offset)||offset<0||
       offset+shot.frames/16>seconds)
      throw new Error("Shot start offset plus its duration exceeds the selected source window.");
    for(const field of ["fade_in_frames","fade_out_frames"]){
      if(shot[field]===undefined)continue;
      if(!Number.isSafeInteger(shot[field])||shot[field]<0||
         shot[field]>Math.min(8,shot.frames/2))
        throw new Error("Shot fade must be 0–0.5 seconds and no longer than half the cut.");
    }
    for(const [key,label] of [["caption","Human-written caption"],["rights_ref","Recording/usage rights reference"]]){
      const value=shot[key];
      if(typeof value!=="string"||!value.trim()||value.length>180||
         /[\u0000-\u001f\u007f]/.test(value))
        throw new Error(label+" is required for every original movie shot (1–180 printable characters).");
    }
    total+=shot.frames;
    return {source_filename:shot.source_filename,frames:shot.frames,
            caption:shot.caption,rights_ref:shot.rights_ref,
            ...(shot.start_seconds===undefined?{}:{start_seconds:offset}),
            ...(shot.fade_in_frames===undefined?{}:{fade_in_frames:shot.fade_in_frames}),
            ...(shot.fade_out_frames===undefined?{}:{fade_out_frames:shot.fade_out_frames})};
  });
  if(total>480)throw new Error("Direct movie exceeds 30 seconds / 480 frames.");
  return {kind:"eternyx_offline_phone_movie",version:1,
          profile:moviePlan.profile,quality:moviePlan.quality,
          ...(moviePlan.delivery===undefined?{}:{delivery:moviePlan.delivery}),
          ...(moviePlan.framing===undefined?{}:{framing:moviePlan.framing}),shots};
}
const movieWindows=[
  "@echo off","setlocal",'pushd "%~dp0" || exit /b 1',
  "py -3 finish_phone_movie.py --run",
  "set EXITCODE=%ERRORLEVEL%","popd","exit /b %EXITCODE%","",
].join("\r\n");
const moviePosix=[
  "#!/bin/sh","set -eu",
  'cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
  "python3 finish_phone_movie.py --run","",
].join("\n");
const movieGuide=[
  "ETERNYX — ONE-PROJECT OFFLINE PHONE MOVIE","",
  "This private archive contains your exact original phone recordings.",
  "Keep it private and run extracted scripts only when trusted.","",
  "Requirements: local Python 3.11+ and FFmpeg/FFprobe with libx264.",
  "No pip package, paid GPU, external AI service or source upload.","",
  "Extract this ZIP into a new folder and keep phone-clips/ intact.",
  "Windows: double-click finish-phone-movie-windows.cmd",
  "macOS/Linux: sh finish-phone-movie-macos-linux.sh",
  "Or run python3 finish_phone_movie.py --check, then --run.","",
  "The launcher verifies original SHA256, decoded media, all human-written",
  "captions and real permission/recording references before processing.",
  "Standard/High: genuine 16FPS H264; Cinematic: genuine 24FPS, up to",
  "1280x720 landscape or 720x1280 portrait H264 from real source frames.",
  "Only the requested shot seconds are normalized, not the entire source.",
  "24FPS cinematic footage is not an editable 16FPS legacy draft.",
  "All prepared clips remain available privately for further processing.",
  "The prepared source clips live in",
  "local-video-media/, then renders verified final phone-movie-output/",
  "containing video.mp4, captions.srt, preview.html and manifest.json.",
  "local-video-media/ retains prepared clips and an editable project draft.",
  "No original is overwritten; output folders must be new.",
  "If conversion succeeds but final render fails, prepared clips remain",
  "available for recovery. No partial final movie is published.","",
  "The master video.mp4 and editable captions.srt are always included.",
  "Optional embedded subtitles are a selectable MP4 track, not burned-in text.",
  "If WebM is selected, FFmpeg also needs its local libvpx-vp9 encoder.",
  "Every requested extra is verified before any final output is published.",
  "Includes verified poster.png, editable captions.vtt and offline watch.html.",
  "Some local file:// browsers restrict caption tracks; embedded MP4 is optional.",
  "This is real offline CPU editing, NOT AI-generated text-to-video.","",
].join("\n");
export async function buildPortablePhoneMovie(input){
  if(!input||typeof input!=="object")
    throw new Error("Choose original footage and real shot descriptions.");
  return buildPortablePhoneIntake({...input,moviePlan:input.moviePlan});
}
export async function buildPortablePhoneIntake({
  files,start=0,seconds=30,pythonSources,onProgress=()=>{},moviePlan=null,
}={}){
  bounded(start,0,299,"Start offset");
  bounded(seconds,1,60,"Output duration");
  if(!Array.isArray(files)||files.length<1||files.length>PHONE_INTAKE_LIMITS.maxClips)
    throw new Error("Select 1–8 local phone MP4/MOV/M4V files.");
  if(!pythonSources||typeof pythonSources!=="object"||
     scriptNames.some(name=>!Object.hasOwn(pythonSources,name)))
    throw new Error("The five reviewed CPU Python modules are required.");
  if(typeof onProgress!=="function")throw new Error("Invalid offline ZIP progress listener.");
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("A secure browser is required for private SHA-256 verification.");
  const checkedMovie=moviePlan===null?null:
    validatePhoneMoviePlan({files,moviePlan,seconds});
  if(checkedMovie&&typeof pythonSources["finish_phone_movie.py"]!=="string")
    throw new Error("The reviewed offline final H264 renderer must be included in the direct movie ZIP.");
  const names=new Set(),originals=[],members=[];
  let total=0;
  for(const file of files){
    validName(file?.name);
    const key=file.name.toLowerCase();
    if(names.has(key))throw new Error("Original source filenames collide ignoring case.");
    names.add(key);
    if(!(file instanceof Blob)||
       !Number.isSafeInteger(file.size)||
       file.size<=0||file.size>PHONE_INTAKE_LIMITS.maxBytes)
      throw new Error("Each original source must be at most 64 MiB.");
    total+=file.size;
    if(total>PHONE_INTAKE_LIMITS.maxTotalBytes)
      throw new Error("Private phone video batch exceeds 512 MiB.");
    const digest=await globalThis.crypto.subtle.digest("SHA-256",await file.arrayBuffer());
    originals.push({filename:file.name,bytes:file.size,sha256:digestHex(digest)});
    members.push({path:"phone-clips/"+file.name,blob:file});
    onProgress({phase:"hash",done:originals.length,total:files.length});
  }
  const manifest={
    kind:"eternyx_offline_phone_intake",version:1,
    start_seconds:start,seconds,
    originals,private_media:true,
  };
  const meta=[
    {path:"phone-input-manifest.json",blob:new Blob([JSON.stringify(manifest,null,2)+"\n"])},
    {path:"README.txt",blob:new Blob([readme])},
    {path:"prepare-phone-macos-linux.sh",blob:new Blob([posix])},
    {path:"prepare-phone-windows.cmd",blob:new Blob([windows])},
    ...scriptNames.map(name=>({path:name,blob:script(name,pythonSources[name])})),
    ...(checkedMovie?[
      {path:"phone-movie-plan.json",
       blob:new Blob([JSON.stringify(checkedMovie,null,2)+"\n"])},
      {path:"finish_phone_movie.py",
       blob:script("finish_phone_movie.py",pythonSources["finish_phone_movie.py"])},
      {path:"finish-phone-movie-windows.cmd",blob:new Blob([movieWindows])},
      {path:"finish-phone-movie-macos-linux.sh",blob:new Blob([moviePosix])},
    ]:[]),
  ];
  if(checkedMovie){
    // Distinguish actual direct-to-movie workflow from the previous
    // standalone conversion-only ZIP's README and launcher.
    const i=meta.findIndex(x=>x.path==="README.txt");
    meta[i]={path:"README.txt",blob:new Blob([movieGuide])};
  }
  const archive=await packPortableArchive([...meta,...members],onProgress);
  return {
    blob:archive,filename:checkedMovie?
      "eternyx-private-phone-movie.zip":"eternyx-private-phone-intake.zip",
    manifest,entryCount:meta.length+members.length,
    bytes:archive.size,sourceCount:originals.length,
    message:checkedMovie?
      "Original private footage and real human-written captions/rights are included. Offline launcher converts and renders final H264.":
      "Private original footage is inside this ZIP. Conversion executes only on your own computer after extraction.",
  };
}
