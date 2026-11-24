import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {
  buildPortablePhoneMovie,validatePhoneMoviePlan,
} from "../src/lib/ai/portablePhoneIntake.mjs";
import {readLocalVideoDraft} from "../src/lib/ai/localVideoDraft.mjs";
import {readPhoneMovieEditDraft,verifyPhoneMovieEditDraftMedia} from "../src/lib/ai/phoneMovieEditDraft.mjs";
import {readPhonePreparationReport} from "../src/lib/ai/localVideoPrep.mjs";
const root=resolve(new URL("../",import.meta.url).pathname);
const modules=["prepare_video_sources.py","render_video_timeline.py",
  "assemble_video_storyboard.py","audit_video_render.py",
  "launch_phone_intake.py","finish_phone_movie.py"];
const pythonSources=Object.fromEntries(modules.map(name=>[
  name,readFileSync(join(root,"gpu-worker",name),"utf8"),
]));
const local=(name,data)=>Object.assign(new Blob([data]),{name});
const hash=b=>createHash("sha256").update(b).digest("hex");
const toolsReady=()=>["python3","ffmpeg","ffprobe"].every(cmd=>
  spawnSync(cmd,[cmd==="python3"?"--version":"-version"],{
    encoding:"utf8",timeout:15000,
  }).status===0);
const plan=(files,overrides={})=>({
  profile:"landscape",quality:"standard",
  shots:files.map((f,i)=>({
    source_filename:f.name,frames:16,
    caption:"Original recorded shot "+(i+1),
    rights_ref:"owner filming permission "+(i+1),
  })),
  ...overrides,
});
function run(tool,args,opts={}){
  const r=spawnSync(tool,args,{encoding:"utf8",timeout:180000,...opts});
  assert.equal(r.status,0,r.stderr+"\n"+r.stdout);
  return r.stdout;
}
function extract(result,dir){
  const zip=join(dir,"originals.zip"),folder=join(dir,"opened");
  writeFileSync(zip,Buffer.from(result));
  mkdirSync(folder);
  const stdout=run("python3",["-c",[
    "import sys,zipfile,json",
    "with zipfile.ZipFile(sys.argv[1]) as z:",
    " assert z.testzip() is None",
    " assert len(set(z.namelist()))==len(z.namelist())",
    " assert all(not n.startswith('/') and '..' not in n.split('/') for n in z.namelist())",
    " z.extractall(sys.argv[2])",
    " print(json.dumps(z.namelist()))",
  ].join("\n"),zip,folder]);
  return {folder,names:JSON.parse(stdout)};
}
function getFixture(dir,name,fps,seconds=2,size="80x48"){
  const target=join(dir,name);
  run("ffmpeg",["-nostdin","-hide_banner","-v","error","-y",
    "-f","lavfi","-i",
    "testsrc2=size="+size+":rate="+fps+":duration="+seconds,
    "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",target],
    {timeout:45000});
  return local(name,readFileSync(target));
}

test("direct-to-movie ZIP stores explicit human captions/rights, real originals and exact offline scripts",async()=>{
  const files=[local("owned.mov",Buffer.from("original footage source bytes"))];
  const requested=plan(files,{profile:"square",quality:"high"});
  const events=[];
  const bundle=await buildPortablePhoneMovie({
    files,moviePlan:requested,start:0,seconds:2,
    pythonSources,onProgress:p=>events.push(p),
  });
  assert.equal(bundle.filename,"eternyx-private-phone-movie.zip");
  assert.equal(bundle.entryCount,15);
  assert.equal(bundle.manifest.originals[0].sha256,
    hash(Buffer.from(await files[0].arrayBuffer())));
  assert.equal(bundle.manifest.private_media,true);
  assert.equal(bundle.sourceCount,1);
  assert.ok(bundle.blob.size>files[0].size);
  assert.ok(events.some(p=>p.phase==="hash"));
  assert.ok(events.some(p=>p.phase==="pack"));
  if(!toolsReady())return;
  const dir=mkdtempSync(join(tmpdir(),"eternyx-direct-movie-"));
  try{
    const extracted=extract(await bundle.blob.arrayBuffer(),dir);
    for(const expected of [
      "phone-clips/owned.mov","phone-movie-plan.json","phone-movie-edit-draft.json",
      "finish_phone_movie.py","finish-phone-movie-windows.cmd",
      "finish-phone-movie-macos-linux.sh","launch_phone_intake.py",
      "prepare_video_sources.py","render_video_timeline.py",
    ])assert.ok(extracted.names.includes(expected),expected);
    const movie=JSON.parse(readFileSync(join(extracted.folder,"phone-movie-plan.json"),"utf8"));
    assert.equal(movie.kind,"eternyx_offline_phone_movie");
    assert.deepEqual(movie.shots,requested.shots);
    assert.equal(movie.quality,"high");
    const edit=JSON.parse(readFileSync(join(extracted.folder,"phone-movie-edit-draft.json"),"utf8"));
    assert.equal(edit.format,"eternyx-private-phone-movie-edit-draft");
    assert.equal(edit.fps,16);
    assert.equal(edit.originals[0].sha256,bundle.manifest.originals[0].sha256);
    assert.equal(edit.contains_private_media,false);
    assert.equal(edit.movie_plan.shots[0].rights_ref,movie.shots[0].rights_ref);
    assert.deepEqual(readFileSync(join(extracted.folder,"phone-clips/owned.mov")),
      Buffer.from(await files[0].arrayBuffer()));
    assert.match(readFileSync(join(extracted.folder,"README.txt"),"utf8"),
      /ONE-PROJECT OFFLINE PHONE MOVIE/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("movie plan validates all human captions, rights, bounds, original order and real 16FPS cut lengths",()=>{
  const files=[local("a.MOV",Buffer.from("a")),local("b.mp4",Buffer.from("b"))];
  const good=validatePhoneMoviePlan({files,moviePlan:plan(files),seconds:2});
  assert.equal(good.kind,"eternyx_offline_phone_movie");
  assert.equal(good.shots.length,2);
  const mutations=[
    x=>{x.shots[0].caption="";},
    x=>{x.shots[1].rights_ref="";},
    x=>{x.shots[0].caption="bad\ncontrol";},
    x=>{x.shots[0].frames=15;},
    x=>{x.shots[0].frames=49;},
    x=>{x.shots[0].frames=32;},
    x=>{x.shots[0].source_filename="other.mp4";},
    x=>{x.shots.reverse();},
    x=>{x.shots[0].extra="injection";},
    x=>{x.shots.pop();},
    x=>{x.profile="cloud-4k";},
    x=>{x.quality="gpu";},
    x=>{x.created_at="unexpected";},
  ];
  for(const mutate of mutations){
    const m=structuredClone(plan(files));mutate(m);
    // 32 frames cannot be generated if original converter only prepares 1sec.
    assert.throws(()=>validatePhoneMoviePlan({files,moviePlan:m,seconds:1}));
  }
});

test("direct-to-movie ZIP rejects missing permission, blank caption and nonexistent runner script",async()=>{
  const files=[local("original.mov",Buffer.from("source movie"))];
  const bad=plan(files);
  bad.shots[0].rights_ref="";
  await assert.rejects(()=>buildPortablePhoneMovie({
    files,pythonSources,moviePlan:bad,
  }),/Recording\/usage rights reference/);
  const invalid=plan(files);
  invalid.shots[0].caption="";
  await assert.rejects(()=>buildPortablePhoneMovie({
    files,pythonSources,moviePlan:invalid,
  }),/Human-written caption/);
  await assert.rejects(()=>buildPortablePhoneMovie({
    files,pythonSources:{...pythonSources,"finish_phone_movie.py":""},
    moviePlan:plan(files),
  }),/reviewed offline final H264 renderer|Missing exact offline Python script/);
});

test("REAL full private phone movie: 30FPS MOV + 24FPS MP4 -> 16FPS prepared clips -> finished verified H264, SRT and project",{
  skip:!toolsReady(),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-real-direct-"));
  try{
    const originals=[getFixture(dir,"field.mov",30),getFixture(dir,"portrait.mp4",24)];
    const moviePlan=plan(originals,{profile:"portrait",quality:"standard"});
    const bundle=await buildPortablePhoneMovie({
      files:originals,start:0,seconds:2,moviePlan,pythonSources,
    });
    const {folder,names}=extract(await bundle.blob.arrayBuffer(),dir);
    assert.ok(names.includes("finish_phone_movie.py"));
    const before=JSON.parse(run("python3",["finish_phone_movie.py","--check"],{
      cwd:folder,timeout:30000,
    }));
    assert.equal(before.result,"ready");
    assert.equal(before.frames,32);
    assert.equal(before.originals_verified,2);
    assert.equal(before.private_media_uploaded,false);
    const stdout=run("sh",["finish-phone-movie-macos-linux.sh"],{
      cwd:folder,timeout:180000,
    });
    const finished=JSON.parse(stdout.trim().split("\n").at(-1));
    assert.equal(finished.result,"completed");
    assert.equal(finished.frames,32);
    assert.equal(finished.model_generation,false);
    assert.equal(finished.profile,"portrait");
    assert.equal(finished.private_media_uploaded,false);
    const out=join(folder,"phone-movie-output");
    for(const file of ["video.mp4","captions.srt","preview.html","manifest.json"])
      assert.ok(existsSync(join(out,file)),file);
    const receipt=JSON.parse(readFileSync(join(out,"manifest.json"),"utf8"));
    assert.equal(receipt.version,2);
    assert.equal(receipt.total_frames,32);
    assert.equal(receipt.video.frame_count,32);
    assert.equal(receipt.model_generation,false);
    assert.equal(receipt.profile,"portrait");
    assert.equal(receipt.video.sha256,hash(readFileSync(join(out,"video.mp4"))));
    assert.equal(finished.video_sha256,receipt.video.sha256);
    assert.equal(receipt.shots.length,2);
    assert.deepEqual(receipt.shots.map(s=>s.caption),moviePlan.shots.map(s=>s.caption));
    assert.deepEqual(receipt.shots.map(s=>s.rights_ref),moviePlan.shots.map(s=>s.rights_ref));
    const captions=readFileSync(join(out,"captions.srt"),"utf8");
    assert.match(captions,/Original recorded shot 1/);
    assert.match(captions,/Original recorded shot 2/);
    assert.ok(readFileSync(join(out,"preview.html"),"utf8").length>100);
    assert.ok(readFileSync(join(out,"poster.png")).subarray(0,8)
      .equals(Buffer.from([137,80,78,71,13,10,26,10])));
    assert.match(readFileSync(join(out,"captions.vtt"),"utf8"),/^WEBVTT\n/);
    assert.match(readFileSync(join(out,"watch.html"),"utf8"),/<video controls/);
    const inspect=JSON.parse(run("ffprobe",[
      "-v","error","-count_frames","-show_entries",
      "stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames",
      "-of","json",join(out,"video.mp4"),
    ]));
    const stream=inspect.streams.find(x=>x.codec_type==="video");
    assert.equal(stream.codec_name,"h264");
    assert.equal(stream.width,144);
    assert.equal(stream.height,256);
    assert.equal(stream.avg_frame_rate,"16/1");
    assert.equal(Number(stream.nb_read_frames),32);
    const media=join(folder,"local-video-media");
    const prep=readPhonePreparationReport(readFileSync(join(media,"preparation-report.json"),"utf8"));
    assert.equal(prep.source_count,2);
    assert.equal(prep.clips[0].prepared_fps,"16/1");
    assert.equal(prep.clips[1].prepared_fps,"16/1");
    const draft=readLocalVideoDraft(readFileSync(join(media,"eternyx-video-edit-draft.json"),"utf8"));
    assert.equal(draft.shots.length,2);
    assert.ok(draft.shots.every(s=>s.caption===""&&s.rightsRef===""));
    const second=spawnSync("python3",["finish_phone_movie.py","--run"],{
      cwd:folder,encoding:"utf8",timeout:30000,
    });
    assert.notEqual(second.status,0);
    assert.match(second.stderr,/output exists|Existing converted output|already exists|never overwrite/);
    assert.deepEqual(readFileSync(join(folder,"phone-clips/field.mov")),
      Buffer.from(await originals[0].arrayBuffer()));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("corrupted original source fails direct movie preflight and publishes NO final movie",{
  skip:!toolsReady(),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-direct-fail-"));
  try{
    const original=getFixture(dir,"camera.mp4",24,1);
    const moviePlan=plan([original]);
    const bundle=await buildPortablePhoneMovie({
      files:[original],pythonSources,moviePlan,seconds:1,
    });
    const {folder}=extract(await bundle.blob.arrayBuffer(),dir);
    const target=join(folder,"phone-clips/camera.mp4");
    const bytes=readFileSync(target);
    bytes[bytes.length-1]^=1;
    writeFileSync(target,bytes);
    const failed=spawnSync("python3",["finish_phone_movie.py","--run"],{
      cwd:folder,encoding:"utf8",timeout:30000,
    });
    assert.notEqual(failed.status,0);
    assert.match(failed.stderr,/SHA-256/);
    assert.ok(!existsSync(join(folder,"phone-movie-output")));
    assert.ok(!existsSync(join(folder,"local-video-media")));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("real source shorter than selected cut fails safely without publishing a fake final video",{
  skip:!toolsReady(),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-short-movie-"));
  try{
    const source=getFixture(dir,"short.mp4",30,1);
    const moviePlan=plan([source],{shots:[{
      source_filename:"short.mp4",frames:48,caption:"Real short footage",
      rights_ref:"owned camera shot",
    }]});
    const bundle=await buildPortablePhoneMovie({
      files:[source],seconds:3,pythonSources,moviePlan,
    });
    const {folder}=extract(await bundle.blob.arrayBuffer(),dir);
    const response=spawnSync("python3",["finish_phone_movie.py","--run"],{
      cwd:folder,encoding:"utf8",timeout:180000,
    });
    assert.notEqual(response.status,0);
    assert.match(response.stderr,/too short after decoding/);
    assert.ok(!existsSync(join(folder,"phone-movie-output")));
    assert.ok(existsSync(join(folder,"local-video-media/clip-01.mp4")),
      "retain verified prepared footage for manual recovery");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("real browser Studio exposes direct finished movie user-authored fields without uploading media",()=>{
  const ui=readFileSync(new URL("../src/components/LocalVideoImportPrep.tsx",import.meta.url),"utf8");
  assert.match(ui,/buildPortablePhoneMovie/);
  assert.match(ui,/finish_phone_movie\.py\?raw/);
  assert.match(ui,/Direct finished movie/);
  assert.match(ui,/Human-written caption/);
  assert.match(ui,/Recording or usage-rights reference/);
  assert.match(ui,/movieCutSeconds/);
  assert.match(ui,/movieProfile/);
  assert.match(ui,/movieQuality/);
  assert.match(ui,/Download direct-to-finished-MP4 project ZIP/);
  assert.match(ui,/phone-movie-output\/video\.mp4/);
  assert.doesNotMatch(ui,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});

test("delivery selector preserves old MP4 plans and rejects unsupported or injected options",()=>{
  const f=[local("safe.MOV",Buffer.from("real private bytes"))];
  const old=validatePhoneMoviePlan({files:f,moviePlan:plan(f),seconds:2});
  assert.equal(Object.hasOwn(old,"delivery"),false);
  for(const delivery of ["mp4","mp4_with_subtitles","mp4_webm","all"]){
    const selected=validatePhoneMoviePlan({
      files:f,moviePlan:plan(f,{delivery}),seconds:2,
    });
    assert.equal(selected.delivery,delivery);
  }
  assert.throws(()=>validatePhoneMoviePlan({
    files:f,moviePlan:plan(f,{delivery:"mp4;rm -rf private"}),seconds:2,
  }),/supported output presets/);
});

test("real CPU high-quality MP4, embedded mov_text subtitle MP4 and VP9 WebM are verified and published together",{
  skip:!toolsReady()||!spawnSync("ffmpeg",["-hide_banner","-encoders"],{encoding:"utf8"}).stdout.includes("libvpx-vp9"),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-delivery-formats-"));
  try{
    const original=getFixture(dir,"delivery.mov",30,2);
    const bundle=await buildPortablePhoneMovie({
      files:[original],moviePlan:plan([original],{quality:"high",delivery:"all"}),
      start:0,seconds:2,pythonSources,
    });
    const {folder}=extract(await bundle.blob.arrayBuffer(),dir);
    const ready=JSON.parse(run("python3",["finish_phone_movie.py","--check"],{
      cwd:folder,timeout:30000,
    }));
    assert.equal(ready.delivery,"all");
    run("python3",["finish_phone_movie.py","--run"],{cwd:folder,timeout:180000});
    const out=join(folder,"phone-movie-output");
    const receipt=JSON.parse(readFileSync(join(out,"manifest.json"),"utf8"));
    assert.equal(receipt.delivery,"all");
    const player=readFileSync(join(out,"watch.html"),"utf8");
    assert.match(player,/<source src="video-subtitled\.mp4"[^>]*><source src="video\.webm"/);
    for(const file of ["video.mp4","video.webm","video-subtitled.mp4","captions.srt","captions.vtt","poster.png"])
      assert.ok(player.includes('href="'+file+'" download'));

    assert.deepEqual(Object.keys(receipt.deliverables).sort(),[
      "captions.srt","captions.vtt","poster.png","video-subtitled.mp4",
      "video.mp4","video.webm","watch.html",
    ]);
    for(const [name,record] of Object.entries(receipt.deliverables)){
      assert.equal(record.sha256,hash(readFileSync(join(out,name))));
      assert.ok(record.file_bytes>0);
      if(name.endsWith(".mp4")||name.endsWith(".webm")){
        assert.equal(record.frame_count,16);
        assert.equal(record.width,512);
        assert.equal(record.height,288);
      }
    }
    assert.equal(receipt.deliverables["video.webm"].codec,"vp9");
    assert.equal(receipt.deliverables["video-subtitled.mp4"].codec,"h264");
    assert.equal(receipt.deliverables["video-subtitled.mp4"].selectable_subtitles,true);
    const probe=JSON.parse(run("ffprobe",[
      "-v","error","-show_entries","stream=codec_name,codec_type",
      "-of","json",join(out,"video-subtitled.mp4"),
    ]));
    assert.ok(probe.streams.some(s=>s.codec_type==="subtitle"&&s.codec_name==="mov_text"));
    assert.ok(probe.streams.some(s=>s.codec_type==="video"&&s.codec_name==="h264"));
  } finally{rmSync(dir,{recursive:true,force:true});}
});

test("high preset uses actual quality settings; delivery UI exposes all real offline outputs",()=>{
  const renderSource=readFileSync(join(root,"gpu-worker/render_video_timeline.py"),"utf8");
  assert.match(renderSource,/flags=lanczos/);
  assert.match(renderSource,/"medium" if quality in \("high", "cinematic"\) else "veryfast"/);
  assert.match(renderSource,/"19" if quality == "high" else "23"/);
  assert.match(renderSource,/"18" if quality == "cinematic"/);
  const ui=readFileSync(new URL("../src/components/LocalVideoImportPrep.tsx",import.meta.url),"utf8");
  assert.match(ui,/setMovieDelivery/);
  assert.match(ui,/value="mp4_with_subtitles"/);
  assert.match(ui,/value="mp4_webm"/);
  assert.match(ui,/value="all"/);
});

test("real full-frame crop and automatic local video preview are verified on CPU",{
  skip:!toolsReady(),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-final-preview-"));
  try{
    const source=getFixture(dir,"framed.mov",30,2);
    const bundle=await buildPortablePhoneMovie({
      files:[source],moviePlan:plan([source],{profile:"portrait",framing:"cover"}),
      start:0,seconds:2,pythonSources,
    });
    const {folder}=extract(await bundle.blob.arrayBuffer(),dir);
    assert.equal(JSON.parse(run("python3",["finish_phone_movie.py","--check"],{cwd:folder})).framing,"cover");
    run("python3",["finish_phone_movie.py","--run"],{cwd:folder,timeout:180000});
    const out=join(folder,"phone-movie-output");
    const receipt=JSON.parse(readFileSync(join(out,"manifest.json"),"utf8"));
    assert.equal(receipt.framing,"cover");
    assert.equal(receipt.video.width,144);
    assert.equal(receipt.video.height,256);
    assert.equal(receipt.video.frame_count,16);
    const poster=readFileSync(join(out,"poster.png"));
    assert.equal(poster.readUInt32BE(16),144);
    assert.equal(poster.readUInt32BE(20),256);
    const vtt=readFileSync(join(out,"captions.vtt"),"utf8");
    assert.match(vtt,/^WEBVTT\n/);
    assert.match(vtt,/00:00:00\.000 --> 00:00:01\.000/);
    assert.match(vtt,/Original recorded shot 1/);
    const watch=readFileSync(join(out,"watch.html"),"utf8");
    assert.match(watch,/src="video.mp4"/);
    assert.match(watch,/src="captions.vtt"/);
    assert.match(watch,/poster="poster.png"/);
    assert.doesNotMatch(watch,/video-subtitled\.mp4|video\.webm/);

    for(const name of ["poster.png","captions.vtt","watch.html"]){
      assert.equal(receipt.deliverables[name].sha256,hash(readFileSync(join(out,name))));
    }
    const renderer=readFileSync(join(root,"gpu-worker/render_video_timeline.py"),"utf8");
    assert.match(renderer,/force_original_aspect_ratio=increase/);
    assert.match(renderer,/crop=\{width\}:\{height\}/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("old plans retain uncropped defaults and arbitrary framing is refused",()=>{
  const f=[local("old.mov",Buffer.from("bytes"))];
  assert.equal(Object.hasOwn(validatePhoneMoviePlan({
    files:f,moviePlan:plan(f),seconds:1,
  }),"framing"),false);
  const cover=validatePhoneMoviePlan({
    files:f,moviePlan:plan(f,{framing:"cover",delivery:"all"}),seconds:1,
  });
  assert.equal(cover.framing,"cover");
  assert.throws(()=>validatePhoneMoviePlan({
    files:f,moviePlan:plan(f,{framing:"stretch"}),seconds:1,
  }),/supported output presets/);
  const ui=readFileSync(new URL("../src/components/LocalVideoImportPrep.tsx",import.meta.url),"utf8");
  assert.match(ui,/setMovieFraming/);
  assert.match(ui,/value="contain"/);
  assert.match(ui,/value="cover"/);
});

test("REAL cinematic 24FPS keeps 1280x720 native source detail with exact frames, captions and SHA receipts",{
  skip:!toolsReady(),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-native-cinematic-"));
  try{
    const source=getFixture(dir,"cinema.mov",24,1,"1280x720");
    const bundle=await buildPortablePhoneMovie({
      files:[source],start:0,seconds:1,
      moviePlan:plan([source],{quality:"cinematic",delivery:"mp4_with_subtitles",
        shots:[{...plan([source]).shots[0],caption:"Light < dusk & dawn"}]}),
      pythonSources,
    });
    const {folder}=extract(await bundle.blob.arrayBuffer(),dir);
    const ready=JSON.parse(run("python3",["finish_phone_movie.py","--check"],{cwd:folder}));
    assert.equal(ready.fps,24);
    assert.equal(ready.frames,24);
    assert.equal(ready.quality,"cinematic");
    run("python3",["finish_phone_movie.py","--run"],{cwd:folder,timeout:240000});
    const out=join(folder,"phone-movie-output");
    const receipt=JSON.parse(readFileSync(join(out,"manifest.json"),"utf8"));
    assert.equal(receipt.fps,24);
    assert.equal(receipt.quality,"cinematic");
    assert.equal(receipt.video.fps,"24/1");
    assert.equal(receipt.video.frame_count,24);
    assert.equal(receipt.video.width,1280);
    assert.equal(receipt.video.height,720);
    assert.equal(receipt.total_frames,24);
    assert.equal(receipt.video.duration_seconds,1);
    const player=readFileSync(join(out,"watch.html"),"utf8");
    assert.match(player,/1280 × 720 · 24 FPS · 1 s</);
    assert.match(player,/<time>00:00:00\.000<\/time> – <time>00:00:01\.000<\/time><br>Light &lt; dusk &amp; dawn/);

    assert.equal(receipt.video.sha256,hash(readFileSync(join(out,"video.mp4"))));
    const sourceReport=JSON.parse(readFileSync(join(folder,"local-video-media/preparation-report.json"),"utf8"));
    assert.equal(sourceReport.clips[0].prepared_width,1280);
    assert.equal(sourceReport.clips[0].prepared_height,720);
    assert.equal(sourceReport.clips[0].prepared_fps,"24/1");
    assert.equal(sourceReport.clips[0].prepared_frames,24);
    assert.equal(sourceReport.clips[0].seconds_limit,1);
    assert.ok(!existsSync(join(folder,"local-video-media/eternyx-video-edit-draft.json")),
      "do not falsely label 24fps clips as a legacy 16fps editable draft");
    assert.match(readFileSync(join(out,"captions.srt"),"utf8"),/00:00:01,000/);
    assert.match(readFileSync(join(out,"captions.vtt"),"utf8"),/00:00:01\.000/);
    assert.equal(receipt.deliverables["video-subtitled.mp4"].fps,"24/1");
    const poster=readFileSync(join(out,"poster.png"));
    assert.equal(poster.readUInt32BE(16),1280);
    assert.equal(poster.readUInt32BE(20),720);
    for(const name of ["poster.png","captions.vtt","watch.html","video-subtitled.mp4"]){
      assert.equal(receipt.deliverables[name].sha256,hash(readFileSync(join(out,name))));
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("REAL portrait cinematic output preserves 720x1280 pixels and 24 FPS without creating fake frames",{
  skip:!toolsReady(),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-cinematic-portrait-"));
  try{
    const source=getFixture(dir,"portrait.mp4",24,1,"720x1280");
    const bundle=await buildPortablePhoneMovie({
      files:[source],start:0,seconds:1,
      moviePlan:plan([source],{quality:"cinematic",profile:"portrait",framing:"cover"}),
      pythonSources,
    });
    const {folder}=extract(await bundle.blob.arrayBuffer(),dir);
    run("python3",["finish_phone_movie.py","--run"],{cwd:folder,timeout:240000});
    const out=join(folder,"phone-movie-output");
    const receipt=JSON.parse(readFileSync(join(out,"manifest.json"),"utf8"));
    assert.equal(receipt.fps,24);
    assert.equal(receipt.video.frame_count,24);
    assert.equal(receipt.video.width,720);
    assert.equal(receipt.video.height,1280);
    assert.equal(receipt.framing,"cover");
    assert.equal(receipt.video.audio,false);
    assert.equal(receipt.video.sha256,hash(readFileSync(join(out,"video.mp4"))));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("cinematic plan remains strictly bounded, while legacy options are unchanged",()=>{
  const files=[local("source.mov",Buffer.from("original"))];
  const legacy=validatePhoneMoviePlan({files,moviePlan:plan(files),seconds:1});
  assert.equal(legacy.quality,"standard");
  const cinematic=validatePhoneMoviePlan({
    files,moviePlan:plan(files,{quality:"cinematic"}),seconds:1,
  });
  assert.equal(cinematic.quality,"cinematic");
  assert.throws(()=>validatePhoneMoviePlan({
    files,moviePlan:plan(files,{quality:"infinite"}),seconds:1,
  }),/supported output presets/);
  const ui=readFileSync(new URL("../src/components/LocalVideoImportPrep.tsx",import.meta.url),"utf8");
  assert.match(ui,/value="cinematic"/);
  assert.match(ui,/24 FPS/);
  assert.match(ui,/720p/);
});

test("per-shot source timing and fades validate strictly but preserve old plan bytes",()=>{
  const clips=[local("first.mov",Buffer.from("first")),local("second.mp4",Buffer.from("second"))];
  const old=validatePhoneMoviePlan({files:clips,moviePlan:plan(clips),seconds:3});
  assert.equal(Object.hasOwn(old.shots[0],"start_seconds"),false);
  assert.equal(Object.hasOwn(old.shots[0],"fade_in_frames"),false);
  const custom=plan(clips,{shots:[
    {...plan(clips).shots[0],start_seconds:1,frames:32,fade_in_frames:4,fade_out_frames:8},
    {...plan(clips).shots[1],start_seconds:0,frames:16,fade_in_frames:8,fade_out_frames:0},
  ]});
  const accepted=validatePhoneMoviePlan({files:clips,moviePlan:custom,seconds:3});
  assert.equal(accepted.shots[0].start_seconds,1);
  assert.equal(accepted.shots[0].fade_in_frames,4);
  assert.equal(accepted.shots[1].fade_out_frames,0);
  assert.throws(()=>validatePhoneMoviePlan({files:clips,moviePlan:plan(clips,{
    shots:[{...custom.shots[0],start_seconds:2},custom.shots[1]]}),seconds:3}),
    /source window/);
  assert.throws(()=>validatePhoneMoviePlan({files:clips,moviePlan:plan(clips,{
    shots:[{...custom.shots[0],fade_out_frames:9},custom.shots[1]]}),seconds:3}),
    /Shot fade/);
  assert.throws(()=>validatePhoneMoviePlan({files:clips,moviePlan:plan(clips,{
    shots:[{...custom.shots[0],start_seconds:NaN},custom.shots[1]]}),seconds:3}),
    /source window/);
  assert.throws(()=>validatePhoneMoviePlan({files:clips,moviePlan:plan(clips,{
    shots:[{...custom.shots[0],arbitrary_url:"https://bad.example"},custom.shots[1]]}),seconds:3}),
    /movie cut/);
  const ui=readFileSync(new URL("../src/components/LocalVideoImportPrep.tsx",import.meta.url),"utf8");
  for(const label of ["setMovieTrimSeconds","setMovieShotSeconds",
    "setMovieFadeInFrames","setMovieFadeOutFrames","totalMovieSeconds","validShotWindows"]){
    assert.ok(ui.includes(label),label);
  }
});

test("REAL 24FPS two-shot movie uses independent original offsets, cuts, true fades and provenance",{
  skip:!toolsReady(),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-shot-timing-"));
  try{
    const files=[getFixture(dir,"one.mov",30,5,"80x48"),
      getFixture(dir,"two.mp4",24,6,"80x48")];
    const base=plan(files);
    const moviePlan=plan(files,{
      quality:"cinematic",delivery:"mp4",
      shots:[
        {...base.shots[0],frames:32,start_seconds:1,fade_in_frames:4,fade_out_frames:8},
        {...base.shots[1],frames:16,start_seconds:2,fade_in_frames:8,fade_out_frames:4},
      ],
    });
    const bundle=await buildPortablePhoneMovie({files,start:0,seconds:5,moviePlan,pythonSources});
    const {folder}=extract(await bundle.blob.arrayBuffer(),dir);
    const before=JSON.parse(run("python3",["finish_phone_movie.py","--check"],{cwd:folder}));
    assert.equal(before.frames,72);
    assert.equal(before.fps,24);
    run("python3",["finish_phone_movie.py","--run"],{cwd:folder,timeout:240000});
    const out=join(folder,"phone-movie-output");
    const receipt=JSON.parse(readFileSync(join(out,"manifest.json"),"utf8"));
    assert.equal(receipt.video.fps,"24/1");
    assert.equal(receipt.video.frame_count,72);
    assert.equal(receipt.video.duration_seconds,3);
    assert.deepEqual(receipt.source_ranges.map(r=>[r.original_filename,r.source_start_seconds,r.duration_seconds]),[
      ["one.mov",1,2],["two.mp4",2,1],
    ]);
    assert.equal(receipt.shots[0].fade_in_frames,6);
    assert.equal(receipt.shots[0].fade_out_frames,12);
    assert.equal(receipt.shots[1].fade_in_frames,12);
    assert.equal(receipt.shots[1].fade_out_frames,6);
    assert.equal(receipt.shots[1].timeline_start_frame,48);
    const actual=JSON.parse(readFileSync(join(folder,"local-video-media/preparation-report.json"),"utf8"));
    assert.deepEqual(actual.clips.map(r=>[r.start_seconds,r.seconds_limit,r.prepared_frames]),[
      [1,2,48],[2,1,24],
    ]);
    assert.equal(receipt.source_ranges[0].source_sha256,hash(readFileSync(join(folder,"phone-clips/one.mov"))));
    assert.equal(receipt.source_ranges[1].source_sha256,hash(readFileSync(join(folder,"phone-clips/two.mp4"))));
    const srt=readFileSync(join(out,"captions.srt"),"utf8");
    const vtt=readFileSync(join(out,"captions.vtt"),"utf8");
    assert.match(srt,/00:00:02,000 --> 00:00:03,000/);
    assert.match(vtt,/00:00:02\.000 --> 00:00:03\.000/);
    assert.equal(receipt.video.sha256,hash(readFileSync(join(out,"video.mp4"))));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("REAL legacy 16FPS direct movie preserves per-shot cuts and fails closed on short footage",{
  skip:!toolsReady(),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-legacy-edits-"));
  try{
    const clips=[getFixture(dir,"first.mov",30,4),getFixture(dir,"second.mp4",24,2)];
    const original=plan(clips);
    const moviePlan=plan(clips,{shots:[
      {...original.shots[0],start_seconds:1,frames:32,fade_in_frames:4},
      {...original.shots[1],start_seconds:1,frames:32},
    ]});
    const bundle=await buildPortablePhoneMovie({files:clips,moviePlan,start:0,seconds:4,pythonSources});
    const {folder}=extract(await bundle.blob.arrayBuffer(),dir);
    assert.throws(()=>run("python3",["finish_phone_movie.py","--run"],{cwd:folder,timeout:180000}));
    assert.equal(existsSync(join(folder,"phone-movie-output")),false);
    // Real original input is untouched on failed cut; no invented repeated frames.
    assert.equal(hash(readFileSync(join(folder,"phone-clips/second.mp4"))),
      hash(readFileSync(join(dir,"second.mp4"))));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("REAL cinematic re-edit from saved ZIP restores source identity and exports another actual 24FPS movie",{
  skip:!toolsReady(),
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-cinematic-re-edit-"));
  try{
    const source=getFixture(dir,"reedit.mov",24,2,"320x180");
    const firstPlan=plan([source],{quality:"cinematic",
      shots:[{...plan([source]).shots[0],caption:"First authored version"}]});
    const original=await buildPortablePhoneMovie({
      files:[source],start:0,seconds:2,moviePlan:firstPlan,pythonSources,
    });
    const opened=extract(await original.blob.arrayBuffer(),dir);
    const edit=readPhoneMovieEditDraft(readFileSync(
      join(opened.folder,"phone-movie-edit-draft.json"),"utf8"));
    assert.equal(edit.fps,24);
    const reattached=await verifyPhoneMovieEditDraftMedia(edit,[
      local(source.name,readFileSync(join(opened.folder,"phone-clips/reedit.mov"))),
    ]);
    assert.equal(reattached.verifiedCount,1);
    assert.equal(reattached.privateMediaUploaded,false);
    const changed={
      ...reattached.moviePlan,
      shots:[{...reattached.moviePlan.shots[0],frames:32,
        caption:"Second edited cinematic version",fade_in_frames:4}],
    };
    const next=await buildPortablePhoneMovie({
      files:reattached.files,start:reattached.start,
      seconds:reattached.seconds,moviePlan:changed,pythonSources,
    });
    const newRoot=join(dir,"new-version");mkdirSync(newRoot);
    const repack=extract(await next.blob.arrayBuffer(),newRoot);
    run("python3",["finish_phone_movie.py","--run"],{
      cwd:repack.folder,timeout:240000,
    });
    const output=join(repack.folder,"phone-movie-output");
    const receipt=JSON.parse(readFileSync(join(output,"manifest.json"),"utf8"));
    assert.equal(receipt.fps,24);
    assert.equal(receipt.video.frame_count,48);
    assert.equal(receipt.video.fps,"24/1");
    assert.equal(receipt.video.width,1280);
    assert.equal(receipt.video.height,720);
    assert.equal(receipt.shots[0].fade_in_frames,6);
    const captions=readFileSync(join(output,"captions.srt"),"utf8");
    assert.match(captions,/Second edited cinematic version/);
    assert.doesNotMatch(captions,/First authored version/);
    assert.equal(receipt.video.sha256,hash(readFileSync(join(output,"video.mp4"))));
    assert.equal(receipt.source_ranges[0].source_sha256,hash(readFileSync(join(dir,"reedit.mov"))));
    assert.deepEqual(readPhoneMovieEditDraft(readFileSync(
      join(repack.folder,"phone-movie-edit-draft.json"),"utf8")).movie_plan.shots,changed.shots);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
