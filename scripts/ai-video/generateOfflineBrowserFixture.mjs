/**
 * Make genuine local phone footage, produce the actual browser-downloadable ZIP,
 * extract it, and run the same one-launch Python finisher used by real operators.
 * Never uploads private footage or calls an AI API.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {resolve,join} from "node:path";
import {spawnSync} from "node:child_process";
import {buildPortablePhoneMovie} from "../../src/lib/ai/portablePhoneIntake.mjs";

const repo=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const target=resolve(process.argv[2]||"");
assert.ok(process.argv[2],"Pass an explicit new temporary output directory");
assert.ok(!existsSync(target),"The temporary fixture directory must be new");
mkdirSync(target,{recursive:true});
const run=(program,args,opts={})=>{
  const output=spawnSync(program,args,{encoding:"utf8",timeout:240000,
    maxBuffer:8*1024*1024,...opts});
  assert.equal(output.status,0,program+" failed: "+output.stderr+"\n"+output.stdout);
  return output.stdout;
};
const original=join(target,"original.mov");
run("ffmpeg",[
  "-nostdin","-hide_banner","-v","error","-y",
  "-f","lavfi","-i","testsrc2=size=320x180:rate=24:duration=2",
  "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",original,
],{timeout:60000});
const media=readFileSync(original);
const source=Object.assign(new Blob([media]),{name:"original.mov"});
const names=["prepare_video_sources.py","render_video_timeline.py",
  "assemble_video_storyboard.py","audit_video_render.py",
  "launch_phone_intake.py","finish_phone_movie.py"];
const pythonSources=Object.fromEntries(names.map(name=>[
  name,readFileSync(join(repo,"gpu-worker",name),"utf8"),
]));
const archive=await buildPortablePhoneMovie({
  files:[source],start:0,seconds:2,pythonSources,
  moviePlan:{
    profile:"landscape",quality:"cinematic",delivery:"all",framing:"cover",
    shots:[{
      source_filename:"original.mov",frames:32,
      caption:"Real browser playback of operator-recorded footage",
      rights_ref:"Synthetic FFmpeg fixture owned by this repository",
    }],
  },
});
assert.equal(archive.sourceCount,1);
const zip=join(target,archive.filename);
writeFileSync(zip,Buffer.from(await archive.blob.arrayBuffer()));
const output=join(target,"extracted");
mkdirSync(output);
run("python3",["-c",[
  "import sys,zipfile,pathlib",
  "with zipfile.ZipFile(sys.argv[1]) as z:",
  " assert z.testzip() is None",
  " names = z.namelist()",
  " assert len(names) == len(set(names))",
  " assert all(not n.startswith('/') and '..' not in n.split('/') for n in names)",
  " z.extractall(sys.argv[2])",
].join("\n"),zip,output]);
run("python3",["finish_phone_movie.py","--run"],{
  cwd:output,timeout:240000,
});
const finished=join(output,"phone-movie-output");
const receipt=JSON.parse(readFileSync(join(finished,"manifest.json"),"utf8"));
assert.equal(receipt.video.frame_count,48);
assert.equal(receipt.video.fps,"24/1");
assert.equal(receipt.video.width,1280);
assert.equal(receipt.video.height,720);
assert.equal(receipt.fps,24);
for(const name of ["video.mp4","video-subtitled.mp4","video.webm",
  "poster.png","captions.srt","captions.vtt","watch.html"]){
  const bytes=readFileSync(join(finished,name));
  assert.ok(bytes.byteLength>0,"Missing: "+name);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    receipt.deliverables[name].sha256,
    "SHA mismatch: "+name,
  );
}
console.log("Ready: one-launch actual 24 FPS / 1280x720 browser playback fixture, all exports verified");
