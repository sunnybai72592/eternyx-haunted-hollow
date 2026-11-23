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
function getFixture(dir,name,fps,seconds=2){
  const target=join(dir,name);
  run("ffmpeg",["-nostdin","-hide_banner","-v","error","-y",
    "-f","lavfi","-i",
    "testsrc2=size=80x48:rate="+fps+":duration="+seconds,
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
  assert.equal(bundle.entryCount,14);
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
      "phone-clips/owned.mov","phone-movie-plan.json",
      "finish_phone_movie.py","finish-phone-movie-windows.cmd",
      "finish-phone-movie-macos-linux.sh","launch_phone_intake.py",
      "prepare_video_sources.py","render_video_timeline.py",
    ])assert.ok(extracted.names.includes(expected),expected);
    const movie=JSON.parse(readFileSync(join(extracted.folder,"phone-movie-plan.json"),"utf8"));
    assert.equal(movie.kind,"eternyx_offline_phone_movie");
    assert.deepEqual(movie.shots,requested.shots);
    assert.equal(movie.quality,"high");
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
    assert.deepEqual(Object.keys(receipt.deliverables).sort(),[
      "captions.srt","captions.vtt","poster.png","video-subtitled.mp4",
      "video.mp4","video.webm","watch.html",
    ]);
    for(const [name,record] of Object.entries(receipt.deliverables)){
      assert.equal(record.sha256,hash(readFileSync(join(out,name))));
      assert.ok(record.file_bytes>0);
      if(name!=="captions.srt"){
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
  assert.match(renderSource,/"medium" if quality == "high" else "veryfast"/);
  assert.match(renderSource,/"19" if quality == "high" else "23"/);
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
