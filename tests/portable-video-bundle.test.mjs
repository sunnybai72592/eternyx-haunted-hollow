import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {execFileSync,spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  buildPortableVideoBundle,PORTABLE_BUNDLE_LIMITS,
} from "../src/lib/ai/portableVideoBundle.mjs";
const root=resolve(new URL("../",import.meta.url).pathname);
const pythonFiles=["render_video_timeline.py","assemble_video_storyboard.py",
  "audit_video_render.py","launch_portable_video.py"];
const rendererSources=Object.fromEntries(pythonFiles.map(
  name=>[name,readFileSync(join(root,"gpu-worker",name),"utf8")]));
const digest=value=>createHash("sha256").update(value).digest("hex");
const media=(name,buffer,extras={})=>({
  name,size:buffer.length,sha256:digest(buffer),file:new Blob([buffer]),...extras,
});
const shot=(source,overrides={})=>({
  sourceName:source.name,startFrame:0,frames:16,
  caption:"A genuine original video clip",
  rightsRef:"owned-recorded-footage",
  fadeInFrames:0,fadeOutFrames:0,...overrides,
});
function settings(sources,shots,extra={}){
  return {sources,shots,rendererSources,profile:"landscape",
    quality:"standard",...extra};
}
function fixtureDir(){
  const dir=mkdtempSync(join(tmpdir(),"eternyx-portable-real-"));
  return dir;
}
function toolsReady(){
  return ["python3","ffmpeg","ffprobe"].every(cmd=>
    spawnSync(cmd,[cmd==="python3"?"--version":"-version"],{encoding:"utf8",timeout:12000}).status===0);
}
function extractedZip(zipPath,dest){
  const script=[
    "import zipfile,sys,json",
    "with zipfile.ZipFile(sys.argv[1]) as f:",
    " assert f.testzip() is None",
    " assert len(f.namelist())==len(set(f.namelist()))",
    " assert all(not x.startswith('/') and '..' not in x.split('/') for x in f.namelist())",
    " f.extractall(sys.argv[2])",
    " print(json.dumps(f.namelist()))",
  ].join("\n");
  const result=spawnSync("python3",["-c",script,zipPath,dest],
    {encoding:"utf8",timeout:120000});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

test("produces the exact runnable project and real original media inside bounded ZIP",async()=>{
  const source=media("demo.mp4",Buffer.from("real original bytes"));
  const timeline=shot(source,{frames:8});
  const updates=[];
  const result=await buildPortableVideoBundle(settings([source],[timeline],{
    onProgress:e=>updates.push(e),
  }));
  assert.equal(result.filename,"eternyx-offline-video-project.zip");
  assert.equal(result.entryCount,13);
  assert.equal(result.manifest.format,"eternyx-portable-cpu-video");
  assert.equal(result.manifest.version,1);
  assert.equal(result.manifest.frames,8);
  assert.deepEqual(result.manifest.sources,[{
    path:"media/demo.mp4",sha256:source.sha256,bytes:source.size,kind:"video",
  }]);
  assert.ok(result.blob instanceof Blob);
  assert.equal(result.blob.type,"application/zip");
  assert.ok(updates.some(e=>e.phase==="verify"));
  assert.ok(updates.some(e=>e.phase==="pack"));
  assert.equal(updates.at(-1).done,result.entryCount);
  assert.ok(result.bytes>source.size);
  assert.ok(result.bytes<PORTABLE_BUNDLE_LIMITS.maxZipBytes);
  if(!toolsReady())return;
  const directory=fixtureDir(),zipPath=join(directory,"test.zip");
  writeFileSync(zipPath,Buffer.from(await result.blob.arrayBuffer()));
  const unpack=join(directory,"unpacked");mkdirSync(unpack);
  const names=extractedZip(zipPath,unpack);
  for(const name of [
    "media/demo.mp4","eternyx-video-v2.json","captions-preview.srt",
    "render_video_timeline.py","assemble_video_storyboard.py",
    "audit_video_render.py","launch_portable_video.py",
    "launch-video-windows.cmd","launch-video-macos-linux.sh","render-windows.cmd",
    "render-macos-linux.sh","README.txt","bundle-manifest.json",
  ])assert.ok(names.includes(name),name+" missing");
  assert.equal(readFileSync(join(unpack,"media","demo.mp4")).toString(),"real original bytes");
  assert.deepEqual(JSON.parse(readFileSync(join(unpack,"eternyx-video-v2.json"),"utf8")).shots[0].file,
                   "demo.mp4");
  assert.match(readFileSync(join(unpack,"README.txt"),"utf8"),/No Python packages, GPU/);
  assert.match(readFileSync(join(unpack,"render-windows.cmd"),"utf8"),/py -3 render_video_timeline\.py/);
  assert.match(readFileSync(join(unpack,"render-macos-linux.sh"),"utf8"),/python3 render_video_timeline\.py/);
  assert.match(readFileSync(join(unpack,"launch-video-windows.cmd"),"utf8"),
    /py -3 launch_portable_video\.py --gui/);
  assert.match(readFileSync(join(unpack,"launch-video-macos-linux.sh"),"utf8"),
    /python3 launch_portable_video\.py --gui/);
});

test("never bundles unused private source clips after shot deletion",async()=>{
  const used=media("shown.mp4",Buffer.from("shown")),
        unused=media("secret.mp4",Buffer.from("never leak me"));
  const result=await buildPortableVideoBundle(settings([used,unused],[shot(used)]));
  assert.deepEqual(result.manifest.sources.map(x=>x.path),["media/shown.mp4"]);
  assert.equal(result.entryCount,13);
  if(!toolsReady())return;
  const dir=fixtureDir(),zip=join(dir,"out.zip"),unpacked=join(dir,"extracted");
  mkdirSync(unpacked);
  writeFileSync(zip,Buffer.from(await result.blob.arrayBuffer()));
  const names=extractedZip(zip,unpacked);
  assert.ok(!names.includes("media/secret.mp4"));
  assert.ok(!readFileSync(zip).includes(Buffer.from("never leak me")));
});

test("bundled soundtrack and captions preserve actual rights/bytes, not reconstructed proxies",async()=>{
  const video=media("sample.mp4",Buffer.from("fake sample mp4 content")),
        audio=media("music.wav",Buffer.from("local soundtrack bytes"),{
          rightsRef:"owner music license",volumePercent:35});
  const result=await buildPortableVideoBundle(settings([video],
    [shot(video,{caption:"<hello> مرحبا & local",fadeInFrames:2})],{soundtrack:audio}));
  assert.equal(result.entryCount,14);
  assert.deepEqual(result.manifest.sources.map(x=>x.kind),["video","audio"]);
  assert.equal(result.manifest.sources[1].sha256,audio.sha256);
  if(!toolsReady())return;
  const dir=fixtureDir(),zip=join(dir,"bundle.zip"),unpacked=join(dir,"unpacked");
  mkdirSync(unpacked);writeFileSync(zip,Buffer.from(await result.blob.arrayBuffer()));
  extractedZip(zip,unpacked);
  assert.equal(readFileSync(join(unpacked,"media","music.wav"),"utf8"),
               "local soundtrack bytes");
  const board=JSON.parse(readFileSync(join(unpacked,"eternyx-video-v2.json"),"utf8"));
  assert.equal(board.soundtrack.source_sha256,audio.sha256);
  assert.equal(board.soundtrack.rights_ref,"owner music license");
  assert.equal(board.soundtrack.volume_percent,35);
  assert.match(readFileSync(join(unpacked,"captions-preview.srt"),"utf8"),/<hello> مرحبا & local/);
});

test("rejects source tampering, missing rights, bad content, and unsafe ZIP entries",async()=>{
  const source=media("clip.mp4",Buffer.from("actual footage"));
  const invalid=[
    settings([source],[shot(source)],{
      sources:[{...source,file:new Blob([Buffer.from("changed footage")])}]}),
    settings([source],[shot(source)],{
      sources:[{...source,file:new Blob([Buffer.from("short")])}]}),
    settings([source],[shot(source,{rightsRef:""})]),
    settings([source],[shot(source,{caption:""})]),
    settings([source],[shot(source,{frames:481})]),
    settings([source],[shot(source)],{profile:"mp4;touch /tmp/unsafe"}),
    settings([source],[shot(source)],{quality:"gpu"}),
    settings([source],[shot(source)],{rendererSources:{}}),
    settings([source],[shot(source)],{rendererSources:{
      ...rendererSources,"render_video_timeline.py":"# fake",
    }}),
  ];
  for(const input of invalid){
    await assert.rejects(buildPortableVideoBundle(input));
  }
  assert.equal(PORTABLE_BUNDLE_LIMITS.maxFiles,21);
});

test("real extracted ZIP renders a verified H264 MP4, preview, SRT and output manifest",{
  skip:!toolsReady(),
},async()=>{
  const dir=fixtureDir();
  const videoPath=join(dir,"real-original.mp4"),
        audioPath=join(dir,"real-song.wav");
  const sourceRender=spawnSync("ffmpeg",[
    "-nostdin","-hide_banner","-v","error","-y",
    "-f","lavfi","-i","testsrc2=size=96x56:rate=16:duration=2",
    "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",videoPath,
  ],{timeout:45000,encoding:"utf8"});
  assert.equal(sourceRender.status,0,sourceRender.stderr);
  const soundRender=spawnSync("ffmpeg",[
    "-nostdin","-hide_banner","-v","error","-y",
    "-f","lavfi","-i","sine=frequency=440:sample_rate=44100:duration=2",
    "-c:a","pcm_s16le",audioPath,
  ],{timeout:45000,encoding:"utf8"});
  assert.equal(soundRender.status,0,soundRender.stderr);
  const source=media("real-original.mp4",readFileSync(videoPath)),
        audio=media("real-song.wav",readFileSync(audioPath),{
          rightsRef:"test waveform ownership",volumePercent:80,sourceStartMs:200,
          timelineStartMs:300,durationMs:1200,fadeInMs:200,fadeOutMs:200,loop:false,
        });
  const project=await buildPortableVideoBundle(settings([source],[
    shot(source,{frames:16,caption:"Real approved clip",fadeInFrames:3}),
    shot(source,{startFrame:16,frames:16,caption:"Real second cut",fadeOutFrames:3}),
  ],{soundtrack:audio,delivery:"all"}));
  const zip=join(dir,"eternyx-project.zip"),unpacked=join(dir,"unpacked");
  mkdirSync(unpacked);
  writeFileSync(zip,Buffer.from(await project.blob.arrayBuffer()));
  const members=extractedZip(zip,unpacked);
  assert.ok(members.includes("media/real-original.mp4"));
  assert.ok(members.includes("media/real-song.wav"));
  // The new local executable checks prerequisites, confirms media SHA-256,
  // creates isolated temp output and publishes a fully verified MP4.
  const check=spawnSync("python3",["launch_portable_video.py","--check"],{
    cwd:unpacked,encoding:"utf8",timeout:60000,
  });
  assert.equal(check.status,0,check.stderr+"\n"+check.stdout);
  const preflight=JSON.parse(check.stdout);
  assert.equal(preflight.result,"ready");
  assert.equal(preflight.frames,32);
  assert.equal(preflight.source_count,2);
  assert.equal(preflight.local_only,true);
  const runner=spawnSync("python3",["launch_portable_video.py","--run"],{
    cwd:unpacked,encoding:"utf8",timeout:180000,
  });
  assert.equal(runner.status,0,runner.stderr+"\n"+runner.stdout);
  const out=join(unpacked,"eternyx-video-output");
  assert.ok(existsSync(join(out,"video.mp4")));
  assert.ok(existsSync(join(out,"preview.html")));
  assert.ok(existsSync(join(out,"captions.srt")));
  const summary=JSON.parse(readFileSync(join(out,"manifest.json"),"utf8"));
  assert.equal(summary.total_frames,32);
  assert.equal(summary.shots.length,2);
  assert.equal(summary.model_generation,false);
  assert.equal(summary.video.sha256,digest(readFileSync(join(out,"video.mp4"))));
  assert.equal(summary.delivery,"all");
  for(const name of ["video.mp4","video-subtitled.mp4","video.webm","poster.png","captions.srt","captions.vtt","preview.html","watch.html"]){
    const bytes=readFileSync(join(out,name));
    assert.equal(summary.deliverables[name].sha256,digest(bytes),name);
    assert.equal(summary.deliverables[name].file_bytes,bytes.length,name);
  }
  assert.equal(summary.deliverables["video-subtitled.mp4"].audio_codec,"aac");
  assert.equal(summary.deliverables["video-subtitled.mp4"].selectable_subtitles,true);
  assert.equal(summary.deliverables["video.webm"].audio_codec,"opus");
  assert.equal(summary.deliverables["video.webm"].frame_count,32);
  assert.equal(summary.soundtrack.source_start_ms,200);
  assert.equal(summary.soundtrack.timeline_start_ms,300);
  assert.equal(summary.soundtrack.duration_ms,1200);
  assert.equal(summary.soundtrack.loop,false);
  // Decode actual audio in every delivery; check silence, audible center and fade envelope.
  for(const name of ["video.mp4","video-subtitled.mp4","video.webm"]){
    const decoded=spawnSync("ffmpeg",["-v","error","-i",join(out,name),"-map","0:a:0",
      "-ac","1","-ar","48000","-f","s16le","pipe:1"],{timeout:30000,maxBuffer:1024*1024});
    assert.equal(decoded.status,0,decoded.stderr?.toString());
    const pcm=decoded.stdout;
    // AAC/Opus may add a small final codec frame, never a missing movie tail.
    const duration=pcm.length/(2*48000);
    assert.ok(duration>=1.98&&duration<=2.05,name+" decoded duration "+duration);
    const rms=(a,b)=>{
      let sum=0,n=0;
      for(let i=Math.round(a*48000)*2;i<Math.min(pcm.length,Math.round(b*48000)*2);i+=2){
        sum+=(pcm.readInt16LE(i)/32768)**2;n++;
      }
      assert.equal(n,Math.round(b*48000)-Math.round(a*48000),name+" incomplete PCM window");
      return Math.sqrt(sum/n);
    };
    const mid=rms(.65,1.15);
    assert.ok(mid>.02,name+" missing audible soundtrack");
    assert.ok(rms(.05,.2)<mid*.08,name+" entrance delay");
    assert.ok(rms(.32,.37)<mid*.6,name+" fade in");
    assert.ok(rms(1.43,1.48)<mid*.65,name+" fade out");
    assert.ok(rms(1.65,1.85)<mid*.08,name+" trailing silence");
  }
  assert.match(readFileSync(join(out,"watch.html"),"utf8"),/Licensed soundtrack/);
  assert.match(readFileSync(join(out,"watch.html"),"utf8"),/video.webm/);
  assert.match(readFileSync(join(out,"captions.vtt"),"utf8"),/00:00:01\.000 --> 00:00:02\.000/);
  const frames=spawnSync("ffprobe",[
    "-v","error","-count_frames","-show_entries",
    "stream=codec_type,width,height,nb_read_frames",
    "-of","json",join(out,"video.mp4"),
  ],{encoding:"utf8",timeout:20000});
  assert.equal(frames.status,0,frames.stderr);
  const streams=JSON.parse(frames.stdout).streams;
  const actual=streams.find(x=>x.codec_type==="video");
  assert.equal(actual.width,256);
  assert.equal(actual.height,144);
  assert.equal(Number(actual.nb_read_frames),32);
  assert.ok(streams.some(x=>x.codec_type==="audio"));
  const staged=readFileSync(join(unpacked,"media","real-original.mp4"));
  assert.equal(digest(staged),source.sha256);
  assert.deepEqual(JSON.parse(runner.stdout).result,"completed");
  assert.equal(JSON.parse(runner.stdout).video_sha256,summary.video.sha256);
  const second=spawnSync("python3",["launch_portable_video.py","--run"],{
    cwd:unpacked,encoding:"utf8",timeout:30000,
  });
  assert.notEqual(second.status,0,"The CPU renderer must refuse overwriting previous output");
});


test("REAL 24 FPS native cinematic portable ZIP renders verified 1280x720 video with actual 48 decoded frames",{
  skip:!toolsReady(),
},async()=>{
  const dir=fixtureDir(),original=join(dir,"original-24.mp4");
  const ff=spawnSync("ffmpeg",["-nostdin","-hide_banner","-v","error","-y",
    "-f","lavfi","-i","testsrc2=size=320x180:rate=24:duration=2",
    "-threads","1","-c:v","libx264","-preset","ultrafast",
    "-pix_fmt","yuv420p",original],
    {encoding:"utf8",timeout:60000});
  assert.equal(ff.status,0,ff.stderr);
  const clip=media("original-24.mp4",readFileSync(original));
  const project=await buildPortableVideoBundle(settings([clip],[shot(clip,{
    frames:48,startFrame:0,fadeInFrames:6,fadeOutFrames:6,
    caption:"Real original native 24fps footage",
  })],{quality:"cinematic",profile:"landscape",delivery:"all",grade:"monochrome",framing:"cover"}));
  assert.equal(project.manifest.fps,24);
  assert.equal(project.manifest.frames,48);
  const zip=join(dir,"movie.zip"),extracted=join(dir,"extracted");
  mkdirSync(extracted);
  writeFileSync(zip,Buffer.from(await project.blob.arrayBuffer()));
  extractedZip(zip,extracted);
  const board=JSON.parse(readFileSync(join(extracted,"eternyx-video-v2.json"),"utf8"));
  assert.equal(board.fps,24);
  assert.equal(board.shots[0].frames,48);
  assert.equal(board.shots[0].fade_in_frames,6);
  assert.equal(JSON.parse(readFileSync(join(extracted,"bundle-manifest.json"),"utf8")).fps,24);
  assert.match(readFileSync(join(extracted,"README.txt"),"utf8"),/2\.00 seconds at 24 FPS/);
  assert.match(readFileSync(join(extracted,"README.txt"),"utf8"),/24 FPS/);
  assert.match(readFileSync(join(extracted,"captions-preview.srt"),"utf8"),
    /00:00:00,000 --> 00:00:02,000/);
  const check=spawnSync("python3",["launch_portable_video.py","--check"],{
    cwd:extracted,encoding:"utf8",timeout:60000,
  });
  assert.equal(check.status,0,check.stderr+"\n"+check.stdout);
  assert.equal(JSON.parse(check.stdout).fps,24);
  assert.equal(JSON.parse(check.stdout).seconds,2);
  const run=spawnSync("python3",["launch_portable_video.py","--run"],{
    cwd:extracted,encoding:"utf8",timeout:240000,
  });
  assert.equal(run.status,0,run.stderr+"\n"+run.stdout);
  const output=join(extracted,"eternyx-video-output");
  const receipt=JSON.parse(readFileSync(join(output,"manifest.json"),"utf8"));
  assert.equal(receipt.fps,24);
  assert.equal(receipt.quality,"cinematic");
  assert.equal(receipt.total_frames,48);
  assert.equal(receipt.video.fps,"24/1");
  assert.equal(receipt.video.width,1280);
  assert.equal(receipt.video.height,720);
  assert.equal(receipt.video.frame_count,48);
  assert.equal(receipt.video.duration_seconds,2);
  assert.equal(receipt.grade,"monochrome");
  assert.equal(receipt.framing,"cover");
  const pixels=spawnSync("ffmpeg",["-v","error","-ss","1","-i",join(output,"video.mp4"),
    "-frames:v","1","-vf","scale=32:18","-pix_fmt","rgb24","-f","rawvideo","pipe:1"],{timeout:30000});
  assert.equal(pixels.status,0,pixels.stderr?.toString());
  assert.equal(pixels.stdout.length,32*18*3);
  let spread=0,lo=255,hi=0;
  for(let i=0;i<pixels.stdout.length;i+=3){
    const rgb=[pixels.stdout[i],pixels.stdout[i+1],pixels.stdout[i+2]];
    spread=Math.max(spread,Math.max(...rgb)-Math.min(...rgb));
    lo=Math.min(lo,...rgb);hi=Math.max(hi,...rgb);
  }
  assert.ok(spread<=4,"Monochrome filter did not remove chroma: "+spread);
  assert.ok(hi-lo>50,"Rendered sample must contain real nonuniform imagery");
  assert.equal(receipt.deliverables["video.webm"].fps,"24/1");
  assert.equal(receipt.deliverables["video.webm"].frame_count,48);
  assert.equal(receipt.deliverables["video.webm"].audio,false);
  assert.equal(receipt.deliverables["video-subtitled.mp4"].selectable_subtitles,true);
  const poster=readFileSync(join(output,"poster.png"));
  assert.equal(poster.readUInt32BE(16),1280);
  assert.equal(poster.readUInt32BE(20),720);
  assert.match(readFileSync(join(output,"watch.html"),"utf8"),/1280 × 720 · 24 FPS/);
  assert.match(readFileSync(join(output,"captions.vtt"),"utf8"),/00:00:00\.000 --> 00:00:02\.000/);
  assert.equal(receipt.video.sha256,digest(readFileSync(join(output,"video.mp4"))));
  const decoded=spawnSync("ffprobe",["-v","error","-count_frames","-show_entries",
    "stream=codec_type,nb_read_frames,width,height,avg_frame_rate",
    "-of","json",join(output,"video.mp4")],{encoding:"utf8",timeout:30000});
  assert.equal(decoded.status,0,decoded.stderr);
  const real=JSON.parse(decoded.stdout).streams.find(s=>s.codec_type==="video");
  assert.equal(real.avg_frame_rate,"24/1");
  assert.equal(Number(real.nb_read_frames),48);
  assert.deepEqual([real.width,real.height],[1280,720]);
  assert.match(readFileSync(join(output,"captions.srt"),"utf8"),
    /00:00:00,000 --> 00:00:02,000/);
  assert.equal(digest(readFileSync(join(extracted,"media","original-24.mp4"))),
    clip.sha256);
});

test("REAL native cinematic portrait ZIP preserves exact 720x1280 24 FPS frames",{
  skip:!toolsReady(),
},async()=>{
  const dir=fixtureDir(),original=join(dir,"portrait-24.mp4");
  const ff=spawnSync("ffmpeg",["-nostdin","-hide_banner","-v","error","-y",
    "-f","lavfi","-i","testsrc2=size=180x320:rate=24:duration=1",
    "-threads","1","-c:v","libx264","-preset","ultrafast",
    "-pix_fmt","yuv420p",original],{encoding:"utf8",timeout:60000});
  assert.equal(ff.status,0,ff.stderr);
  const source=media("portrait-24.mp4",readFileSync(original));
  const pack=await buildPortableVideoBundle(settings([source],[shot(source,{
    frames:24,fadeInFrames:4,fadeOutFrames:4,caption:"Real portrait footage",
  })],{quality:"cinematic",profile:"portrait"}));
  const zip=join(dir,"portrait.zip"),folder=join(dir,"extracted");
  mkdirSync(folder);writeFileSync(zip,Buffer.from(await pack.blob.arrayBuffer()));
  extractedZip(zip,folder);
  const rendered=spawnSync("python3",["launch_portable_video.py","--run"],{
    cwd:folder,encoding:"utf8",timeout:240000,
  });
  assert.equal(rendered.status,0,rendered.stderr+"\n"+rendered.stdout);
  const receipt=JSON.parse(readFileSync(join(folder,"eternyx-video-output/manifest.json"),"utf8"));
  assert.equal(receipt.fps,24);
  assert.equal(receipt.video.frame_count,24);
  assert.deepEqual([receipt.video.width,receipt.video.height],[720,1280]);
  assert.equal(receipt.video.sha256,digest(readFileSync(join(folder,"eternyx-video-output/video.mp4"))));
});

test("portable delivery rejects unsupported values and preserves legacy default manifest",async()=>{
  const source=media("local.mp4",Buffer.from("local test source"));
  for(const delivery of [null,"external",{},["all"]])
    await assert.rejects(()=>buildPortableVideoBundle(settings([source],[shot(source)],{delivery})),/Unsupported portable movie delivery/);
  const legacy=await buildPortableVideoBundle(settings([source],[shot(source)]));
  assert.equal(Object.hasOwn(legacy.manifest,"delivery"),false);
  for(const delivery of ["mp4","mp4_with_subtitles","mp4_webm","all"]){
    const bundle=await buildPortableVideoBundle(settings([source],[shot(source)],{delivery}));
    assert.equal(bundle.manifest.delivery,delivery);
  }
});

test("portable grade and framing allowlist rejects command/filter injection",async()=>{
  const source=media("local.mp4",Buffer.from("local test source"));
  for(const look of [{grade:"hue=s=0"},{grade:null},{grade:"warm;touch x"},{framing:"crop=1"},{framing:[]}])
    await assert.rejects(()=>buildPortableVideoBundle(settings([source],[shot(source)],look)),/color grade or framing/);
});

test("soundtrack timing rejects out-of-range, invalid and overlapping fade settings",async()=>{
  const video=media("local.mp4",Buffer.from("video"));
  const audio=media("tone.wav",Buffer.from("audio"),{rightsRef:"owned",volumePercent:50});
  for(const bad of [{timelineStartMs:1000},{durationMs:1001},{fadeInMs:800,fadeOutMs:300},{loop:"false"},{sourceStartMs:-1},{durationMs:1.5}])
    await assert.rejects(()=>buildPortableVideoBundle(settings([video],[shot(video)],{soundtrack:{...audio,...bad}})),/Soundtrack/);
});
