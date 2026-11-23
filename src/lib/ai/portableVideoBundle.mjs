/** Portable REAL CPU FFmpeg video editor handoff, entirely offline and browser-side.
 * ZIP STORE method (no data compression): append original Blob bytes without
 * transcoding, and bundle the exact reviewed Python renderer dependencies.
 * Never upload local files; no fake browser-side video rendering.
 */
import {
  buildLocalVideoBoard,checkLocalMediaName,localVideoSrt,
  LOCAL_VIDEO_LIMITS,LOCAL_VIDEO_PROFILES,LOCAL_VIDEO_QUALITIES,
} from "./localVideoEditor.mjs";

export const PORTABLE_BUNDLE_LIMITS=Object.freeze({
  maxFiles:16,maxEntryBytes:64*1024*1024,maxTotalBytes:8*64*1024*1024+16*1024*1024+512*1024,
  maxRendererBytes:128*1024,maxZipBytes:0xffffffff,
});
const SHA=/^[0-9a-f]{64}$/;
const enc=new TextEncoder();
const crcTable=Array.from({length:256},(_,i)=>{
  let crc=i;
  for(let j=0;j<8;j++)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1;
  return crc>>>0;
});
const crcChunk=(bytes,crc=0xffffffff)=>{
  for(let i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
  return crc>>>0;
};
const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
async function sha256(bytes){
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("A secure browser with WebCrypto SHA-256 is required for portable export.");
  return hex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",bytes)));
}
function u16(view,offset,value){view.setUint16(offset,value,true);}
function u32(view,offset,value){view.setUint32(offset,value>>>0,true);}
function header(name,size,crc){
  const filename=enc.encode(name);
  const bytes=new Uint8Array(30+filename.length);
  const v=new DataView(bytes.buffer);
  u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x0800);u16(v,8,0);
  u16(v,10,0);u16(v,12,0);u32(v,14,crc);
  u32(v,18,size);u32(v,22,size);u16(v,26,filename.length);u16(v,28,0);
  bytes.set(filename,30);
  return bytes;
}
function central(name,size,crc,offset){
  const filename=enc.encode(name);
  const bytes=new Uint8Array(46+filename.length);
  const v=new DataView(bytes.buffer);
  u32(v,0,0x02014b50);u16(v,4,20);u16(v,6,20);
  u16(v,8,0x0800);u16(v,10,0);u16(v,12,0);u16(v,14,0);
  u32(v,16,crc);u32(v,20,size);u32(v,24,size);
  u16(v,28,filename.length);u16(v,30,0);u16(v,32,0);
  u16(v,34,0);u16(v,36,0);u32(v,38,0);u32(v,42,offset);
  bytes.set(filename,46);
  return bytes;
}
function endRecord(entries,length,offset){
  const bytes=new Uint8Array(22),v=new DataView(bytes.buffer);
  u32(v,0,0x06054b50);u16(v,4,0);u16(v,6,0);
  u16(v,8,entries);u16(v,10,entries);
  u32(v,12,length);u32(v,16,offset);u16(v,20,0);
  return bytes;
}
function safeEntry(path){
  if(typeof path!=="string"||!path||path.length>240||
     path.startsWith("/")||path.startsWith(".")||
     path.includes("\\")||path.includes(":")||
     path.split("/").some(x=>!x||x==="."||x==="..")||
     /[\u0000-\u001f\u007f]/.test(path))
    throw new Error("Unsafe portable archive member path.");
  return path;
}
async function storedEntry(name,value){
  name=safeEntry(name);
  if(!(value instanceof Blob)||!Number.isSafeInteger(value.size)||
     value.size<0||value.size>PORTABLE_BUNDLE_LIMITS.maxEntryBytes)
    throw new Error("Portable media or renderer exceeds its bounded file-size limit.");
  let crc=0xffffffff;
  for(let offset=0;offset<value.size;offset+=1024*1024){
    const bytes=new Uint8Array(await value.slice(offset,Math.min(offset+1024*1024,value.size)).arrayBuffer());
    crc=crcChunk(bytes,crc);
  }
  return {name,blob:value,size:value.size,crc:(crc^0xffffffff)>>>0};
}
/** No network: source code comes from the exact current committed Python files. */
function validateRendererSource(name,source){
  if(typeof source!=="string"||source.length<150||
     enc.encode(source).length>PORTABLE_BUNDLE_LIMITS.maxRendererBytes||
     !source.startsWith('"""')&&!source.startsWith("#"))
    throw new Error("Missing actual reviewed CPU renderer source: "+name);
  return new Blob([source],{type:"text/x-python;charset=utf-8"});
}
function shell(profile,quality){
  return [
    "#!/bin/sh",
    "set -eu",
    'cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
    'python3 render_video_timeline.py --storyboard "./eternyx-video-v2.json" --media "./media" --output "./eternyx-video-output" --profile '+profile+" --quality "+quality,
    "",
  ].join("\n");
}
function windows(profile,quality){
  return [
    "@echo off",
    "setlocal",
    'pushd "%~dp0" || exit /b 1',
    "py -3 render_video_timeline.py --storyboard .\\eternyx-video-v2.json --media .\\media --output .\\eternyx-video-output --profile "+profile+" --quality "+quality,
    "set EXITCODE=%ERRORLEVEL%",
    "popd",
    "exit /b %EXITCODE%",
    "",
  ].join("\r\n");
}
function readme(profile,quality,shotCount,seconds){
  return [
    "ETERNYX — PORTABLE OFFLINE CPU VIDEO EDITING PROJECT",
    "",
    "Contains your ORIGINAL private MP4/source audio files (and their rights references).",
    "Treat this ZIP as private; do not upload or share without consent.",
    "",
    "Requirements: Python 3.11+ and local FFmpeg/FFprobe with libx264 on PATH.",
    "No Python packages, GPU, cloud API, model downloads or subscriptions.",
    "",
    "1. Extract the entire ZIP to a NEW local folder, retaining the media/ folder.",
    "2. macOS/Linux: open Terminal in that folder and run: sh render-macos-linux.sh",
    "   Windows: double-click render-windows.cmd, or use Command Prompt:",
    "   render-windows.cmd",
    "3. Finished project appears in the NEW eternyx-video-output/ directory:",
    "   video.mp4, preview.html, captions.srt, manifest.json.",
    "",
    "Do not run an extracted script unless you trust where it came from.",
    "All media and source code are included; no cloning the ETERNYX repository.",
    "This ZIP contains NO completed rendered video until you run the local script.",
    "The renderer checks real input SHA-256, source dimensions, decoded 16 FPS",
    "constant-frame-rate frame counts, rights references, and FFmpeg output.",
    "It refuses to overwrite an existing eternyx-video-output/ directory.",
    "To render again, rename/move the finished output directory first.",
    "",
    "Requested project: "+shotCount+" shots, "+seconds.toFixed(2)+" seconds at 16 FPS.",
    "Output profile: "+profile+". Quality: "+quality+".",
    "Source-video audio is removed; any licensed soundtrack is mixed separately.",
    "Caption text is delivered as captions.srt, not burned into the MP4.",
    "",
    "This is a REAL CPU video editor, not a realistic AI text-to-video generator.",
    "ZIP SHA-256 receipts only prove local consistency, not content ownership.",
    "",
  ].join("\n");
}
export async function buildPortableVideoBundle({
  sources,shots,soundtrack=null,profile="landscape",quality="standard",
  rendererSources,onProgress=()=>{},
}){
  if(!LOCAL_VIDEO_PROFILES.includes(profile)||!LOCAL_VIDEO_QUALITIES.includes(quality))
    throw new Error("Unsupported portable CPU output preset.");
  if(typeof onProgress!=="function")throw new Error("Invalid CPU bundle progress callback.");
  const project=buildLocalVideoBoard({sources,shots,soundtrack});
  const required=["render_video_timeline.py","assemble_video_storyboard.py","audit_video_render.py"];
  if(!rendererSources||typeof rendererSources!=="object"||
     required.some(name=>typeof rendererSources[name]!=="string"))
    throw new Error("The three reviewed offline Python renderer modules must be bundled.");
  const media=[...sources,...(soundtrack?[soundtrack]:[])];
  const expected=new Map([
    ...project.board.shots.map(shot=>[shot.file,shot.source_sha256]),
    ...(soundtrack?[[project.board.soundtrack.file,project.board.soundtrack.source_sha256]]:[]),
  ]);
  const names=new Set();
  const items=[];
  let total=0;
  for(const record of media){
    const kind=soundtrack&&record===soundtrack?"audio":"video";
    const name=checkLocalMediaName(record?.name,kind);
    if(names.has(name.toLowerCase()))
      throw new Error("Duplicate or case-colliding private media names in portable ZIP.");
    names.add(name.toLowerCase());
    if(!(record.file instanceof Blob)||record.file.size!==record.size||
       record.size>(kind==="video"?LOCAL_VIDEO_LIMITS.maxSourceBytes:
                                        LOCAL_VIDEO_LIMITS.maxAudioBytes)||
       !SHA.test(record.sha256)||expected.get(name)!==record.sha256)
      throw new Error("A source file no longer matches the validated editor storyboard.");
    total+=record.size;
    if(total>PORTABLE_BUNDLE_LIMITS.maxTotalBytes)
      throw new Error("Portable private media exceeds the bounded CPU bundle size.");
    // SHA-256 is recomputed on ACTUAL file bytes, not trusted from a filename or
    // earlier browser state, to prevent exporting a broken project.
    const hash=await sha256(await record.file.arrayBuffer());
    if(hash!==record.sha256)
      throw new Error("Selected local file changed after the editor hashed it: "+name);
    items.push({
      path:"media/"+name,blob:record.file,
      sha256:hash,bytes:record.file.size,kind,
    });
    onProgress({done:items.length,total:media.length,phase:"verify"});
  }
  const mitems=items.map(({path,sha256,bytes,kind})=>({path,sha256,bytes,kind}));
  const manifest={
    format:"eternyx-portable-cpu-video",
    version:1,profile,quality,
    fps:LOCAL_VIDEO_LIMITS.fps,shots:project.board.shots.length,
    frames:project.totalFrames,
    private_original_media:true,
    sources:mitems,
  };
  const scripts={
    "render_video_timeline.py":validateRendererSource(required[0],rendererSources[required[0]]),
    "assemble_video_storyboard.py":validateRendererSource(required[1],rendererSources[required[1]]),
    "audit_video_render.py":validateRendererSource(required[2],rendererSources[required[2]]),
  };
  const extras=[
    {path:"eternyx-video-v2.json",blob:new Blob([project.json])},
    {path:"captions-preview.srt",blob:new Blob([localVideoSrt(project.board)])},
    {path:"bundle-manifest.json",blob:new Blob([JSON.stringify(manifest,null,2)+"\n"])},
    {path:"render-macos-linux.sh",blob:new Blob([shell(profile,quality)])},
    {path:"render-windows.cmd",blob:new Blob([windows(profile,quality)])},
    {path:"README.txt",blob:new Blob([readme(profile,quality,project.board.shots.length,project.seconds)])},
    ...Object.entries(scripts).map(([path,blob])=>({path,blob})),
  ];
  const zipMembers=[...extras,...items.map(item=>({path:item.path,blob:item.blob}))];
  if(zipMembers.length>PORTABLE_BUNDLE_LIMITS.maxFiles)
    throw new Error("Too many portable archive entries.");
  const archive=[];
  const indexes=[];
  let offset=0;
  for(let i=0;i<zipMembers.length;i++){
    const item=zipMembers[i];
    const stored=await storedEntry(item.path,item.blob);
    const entryHead=header(stored.name,stored.size,stored.crc);
    indexes.push(central(stored.name,stored.size,stored.crc,offset));
    archive.push(entryHead,stored.blob);
    offset+=entryHead.length+stored.size;
    if(offset>PORTABLE_BUNDLE_LIMITS.maxZipBytes)
      throw new Error("Portable ZIP exceeds classic ZIP 4 GiB archive limits.");
    onProgress({done:i+1,total:zipMembers.length,phase:"pack"});
  }
  const centralBytes=indexes.reduce((sum,x)=>sum+x.length,0);
  if(offset+centralBytes+22>PORTABLE_BUNDLE_LIMITS.maxZipBytes)
    throw new Error("Portable ZIP central directory exceeds format limits.");
  const blob=new Blob([...archive,...indexes,endRecord(zipMembers.length,centralBytes,offset)],
                      {type:"application/zip"});
  if(blob.size!==offset+centralBytes+22)
    throw new Error("Portable ZIP byte accounting failed.");
  return {
    blob,filename:"eternyx-offline-video-project.zip",manifest,
    bytes:blob.size,entryCount:zipMembers.length,
    explanation:"Includes actual unchanged private source clips and the reviewed Python/FFmpeg CPU renderer. Video.mp4 is rendered locally after extraction.",
  };
}
