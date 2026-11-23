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
export async function buildPortablePhoneIntake({
  files,start=0,seconds=30,pythonSources,onProgress=()=>{},
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
  ];
  const archive=await packPortableArchive([...meta,...members],onProgress);
  return {
    blob:archive,filename:"eternyx-private-phone-intake.zip",
    manifest,entryCount:meta.length+members.length,
    bytes:archive.size,sourceCount:originals.length,
    message:"Private original footage is inside this ZIP. Conversion executes only on your own computer after extraction.",
  };
}
