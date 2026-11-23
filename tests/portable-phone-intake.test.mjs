import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {buildPortablePhoneIntake,PHONE_INTAKE_LIMITS} from "../src/lib/ai/portablePhoneIntake.mjs";
import {readLocalVideoDraft,verifyLocalVideoDraftMedia} from "../src/lib/ai/localVideoDraft.mjs";
import {readPhonePreparationReport,checkPreparedVideoSelection} from "../src/lib/ai/localVideoPrep.mjs";

const root=resolve(new URL("../",import.meta.url).pathname);
const scripts=["prepare_video_sources.py","render_video_timeline.py",
  "assemble_video_storyboard.py","audit_video_render.py","launch_phone_intake.py"];
const pythonSources=Object.fromEntries(scripts.map(n=>[
  n,readFileSync(join(root,"gpu-worker",n),"utf8"),
]));
const hash=buf=>createHash("sha256").update(buf).digest("hex");
const local=(name,content)=>Object.assign(new Blob([content]),{name});
const hasTools=()=>["python3","ffmpeg","ffprobe"].every(cmd=>
  spawnSync(cmd,[cmd==="python3"?"--version":"-version"],{
    encoding:"utf8",timeout:10000,
  }).status===0);
function run(executable,args,opts={}){
  const result=spawnSync(executable,args,{encoding:"utf8",timeout:180000,...opts});
  assert.equal(result.status,0,result.stderr+"\n"+result.stdout);
  return result.stdout;
}
function extract(bytes,dir){
  const zip=join(dir,"private.zip"),dest=join(dir,"extracted");
  writeFileSync(zip,Buffer.from(bytes));mkdirSync(dest);
  const result=run("python3",[
    "-c","import zipfile,sys,json\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n assert len(z.namelist())==len(set(z.namelist()))\n z.extractall(sys.argv[2])\n print(json.dumps(z.namelist()))",
    zip,dest,
  ]);
  return {path:dest,entries:JSON.parse(result)};
}

test("one private ZIP contains unchanged phone bytes, all real Python dependencies and portable launchers",async()=>{
  const original=local("source.mov",Buffer.from("original video input bytes"));
  const progress=[];
  const result=await buildPortablePhoneIntake({
    files:[original],start:5,seconds:12,pythonSources,
    onProgress:p=>progress.push(p),
  });
  assert.equal(result.filename,"eternyx-private-phone-intake.zip");
  assert.equal(result.sourceCount,1);
  assert.equal(result.entryCount,10);
  assert.deepEqual(result.manifest.originals,[{
    filename:"source.mov",bytes:original.size,sha256:hash(Buffer.from(await original.arrayBuffer())),
  }]);
  assert.equal(result.manifest.kind,"eternyx_offline_phone_intake");
  assert.equal(result.manifest.start_seconds,5);
  assert.equal(result.manifest.seconds,12);
  assert.equal(result.manifest.private_media,true);
  assert.ok(progress.some(p=>p.phase==="hash"));
  assert.ok(progress.some(p=>p.phase==="pack"));
  assert.equal(progress.at(-1).done,10);
  assert.equal(PHONE_INTAKE_LIMITS.maxClips,8);
  if(!hasTools())return;
  const temp=mkdtempSync(join(tmpdir(),"eternyx-phone-archive-"));
  try{
    const extracted=extract(await result.blob.arrayBuffer(),temp);
    assert.ok(extracted.entries.includes("phone-clips/source.mov"));
    assert.ok(extracted.entries.includes("launch_phone_intake.py"));
    assert.ok(extracted.entries.includes("prepare_video_sources.py"));
    assert.ok(extracted.entries.includes("prepare-phone-windows.cmd"));
    assert.ok(extracted.entries.includes("prepare-phone-macos-linux.sh"));
    assert.deepEqual(readFileSync(join(extracted.path,"phone-clips/source.mov")),
                     Buffer.from(await original.arrayBuffer()));
    const readme=readFileSync(join(extracted.path,"README.txt"),"utf8");
    assert.match(readme,/No pip installation, GPU, cloud API/);
    assert.match(readme,/eternyx-video-edit-draft\.json/);
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test("private ZIP rejects path injection, fake sources, oversized media and unsafe start settings",async()=>{
  const base=()=>({files:[local("good.MOV",Buffer.from("original bytes"))],
    pythonSources,start:0,seconds:1});
  for(const changes of [
    {files:[]},
    {files:[local("../bad.mov",Buffer.from("x"))]},
    {files:[local("http:bad.mp4",Buffer.from("x"))]},
    {files:[local("~temp.mov",Buffer.from("x"))]},
    {files:[local(".hidden.mp4",Buffer.from("x"))]},
    {files:[local("bad.avi",Buffer.from("x"))]},
    {files:[local("a.mp4",Buffer.from("x")),local("A.MP4",Buffer.from("x"))]},
    {files:Array.from({length:9},(_,n)=>local("clip"+n+".mov",Buffer.from("x")))},
    {files:[local("bad.mov",Buffer.alloc(0))]},
    {start:-1},{start:300},{start:true},{start:1.5},
    {seconds:0},{seconds:61},{seconds:true},
    {pythonSources:{}},{pythonSources:{...pythonSources,"launch_phone_intake.py":""}},
  ]){
    await assert.rejects(buildPortablePhoneIntake({...base(),...changes}));
  }
});

test("ZIP source originals remain private and no AI API, remote URL or fake user rights are added",async()=>{
  const original=local("owned.MP4",Buffer.from("private-original-capture"));
  const result=await buildPortablePhoneIntake({
    files:[original],pythonSources,
  });
  assert.equal(result.manifest.originals[0].filename,"owned.MP4");
  assert.equal(result.manifest.originals[0].sha256,
               hash(Buffer.from("private-original-capture")));
  const data=JSON.stringify(result.manifest);
  assert.doesNotMatch(data,/api_key|https?:\/\/|caption|rightsRef|mock|fake score/);
  assert.equal(result.blob.type,"application/zip");
  assert.ok(result.blob.size>original.size);
});

test("real standalone ZIP converts 30FPS MOV and 24FPS MP4, creates exact editable draft and no repo dependency",{
  skip:!hasTools(),
},async()=>{
  const tmp=mkdtempSync(join(tmpdir(),"eternyx-real-phone-bundle-"));
  try{
    const originals=[
      {name:"original.mov",rate:30,size:"80x48"},
      {name:"portrait.mp4",rate:24,size:"48x80"},
    ];
    const files=[];
    for(const src of originals){
      const filePath=join(tmp,src.name);
      run("ffmpeg",["-nostdin","-hide_banner","-v","error","-y",
        "-f","lavfi","-i",
        "testsrc2=size="+src.size+":rate="+src.rate+":duration=2",
        "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",filePath]);
      files.push(local(src.name,readFileSync(filePath)));
    }
    const project=await buildPortablePhoneIntake({
      files,start:0,seconds:1,pythonSources,
    });
    assert.equal(project.entryCount,11);
    const output=extract(await project.blob.arrayBuffer(),tmp);
    const cwd=output.path;
    assert.ok(output.entries.includes("phone-clips/original.mov"));
    assert.ok(output.entries.includes("phone-clips/portrait.mp4"));
    const preflight=JSON.parse(run("python3",["launch_phone_intake.py","--check"],{cwd}));
    assert.equal(preflight.result,"ready");
    assert.equal(preflight.source_count,2);
    assert.equal(preflight.originals[0].reported_fps,"30/1");
    assert.equal(preflight.originals[1].reported_fps,"24/1");
    assert.equal(preflight.private_media_uploaded,false);
    const executed=run("sh",["prepare-phone-macos-linux.sh"],{cwd});
    const finalLine=executed.trim().split("\n").at(-1);
    const actual=JSON.parse(finalLine);
    assert.equal(actual.result,"completed");
    assert.deepEqual(actual.prepared_clips,["clip-01.mp4","clip-02.mp4"]);
    const dir=join(cwd,"local-video-media");
    assert.ok(existsSync(join(dir,"clip-01.mp4")));
    assert.ok(existsSync(join(dir,"clip-02.mp4")));
    const report=readPhonePreparationReport(
      readFileSync(join(dir,"preparation-report.json"),"utf8"));
    assert.equal(report.source_count,2);
    assert.equal(report.clips[0].prepared_frames,16);
    assert.equal(report.clips[1].prepared_frames,16);
    assert.equal(report.clips[0].prepared_fps,"16/1");
    assert.equal(report.clips[1].prepared_fps,"16/1");
    assert.equal(report.clips[1].prepared_width,48);
    assert.equal(report.clips[1].prepared_height,80);
    for(const [i,row] of report.clips.entries()){
      assert.equal(row.source_sha256,hash(readFileSync(join(cwd,"phone-clips",originals[i].name))));
      assert.equal(row.prepared_sha256,hash(readFileSync(join(dir,row.prepared_filename))));
    }
    const draft=readLocalVideoDraft(
      readFileSync(join(dir,"eternyx-video-edit-draft.json"),"utf8"));
    assert.equal(draft.name,"My prepared phone footage");
    assert.equal(draft.contains_private_media,false);
    assert.deepEqual(draft.shots.map(s=>s.frames),[16,16]);
    assert.ok(draft.shots.every(s=>s.caption===""&&s.rightsRef===""));
    const select=report.clips.map(row=>({
      name:row.prepared_filename,sha256:row.prepared_sha256,size:row.prepared_bytes,
    }));
    assert.equal(checkPreparedVideoSelection(report,select).complete,true);
    const reattached=select.map(row=>local(row.name,readFileSync(join(dir,row.name))));
    const restored=await verifyLocalVideoDraftMedia(draft,reattached);
    assert.equal(restored.verifiedCount,2);
    assert.equal(restored.shots.length,2);
    assert.equal(restored.privateMediaUploaded,false);
    const second=spawnSync("python3",["launch_phone_intake.py","--run"],{
      cwd,encoding:"utf8",timeout:25000,
    });
    assert.notEqual(second.status,0,"Refuse overwrite of real clips and draft");
    assert.match(second.stderr,/Existing converted output/);
    assert.deepEqual(readFileSync(join(cwd,"phone-clips/original.mov")),
                     readFileSync(join(tmp,"original.mov")));
  }finally{rmSync(tmp,{recursive:true,force:true});}
});

test("preflight refuses changed input hash or byte size and never exposes half-converted output",{
  skip:!hasTools(),
},async()=>{
  const tmp=mkdtempSync(join(tmpdir(),"eternyx-phone-fail-"));
  try{
    const path=join(tmp,"demo.mov");
    run("ffmpeg",["-nostdin","-hide_banner","-v","error","-y",
      "-f","lavfi","-i","testsrc2=size=64x36:rate=30:duration=1",
      "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",path]);
    const project=await buildPortablePhoneIntake({
      files:[local("demo.mov",readFileSync(path))],seconds:1,pythonSources,
    });
    const dest=extract(await project.blob.arrayBuffer(),tmp).path;
    const original=join(dest,"phone-clips/demo.mov");
    const bytes=readFileSync(original);bytes[bytes.length-1]^=1;
    writeFileSync(original,bytes);
    const bad=spawnSync("python3",["launch_phone_intake.py","--run"],{
      cwd:dest,encoding:"utf8",timeout:20000,
    });
    assert.notEqual(bad.status,0);
    assert.match(bad.stderr,/SHA-256/);
    assert.ok(!existsSync(join(dest,"local-video-media")));
  }finally{rmSync(tmp,{recursive:true,force:true});}
});

test("AI Video Studio exposes real portable phone conversion handoff without cloud or repo clone",()=>{
  const component=readFileSync(
    new URL("../src/components/LocalVideoImportPrep.tsx",import.meta.url),"utf8");
  const parent=readFileSync(
    new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  assert.match(parent,/<LocalVideoImportPrep sources=\{sources\}/);
  assert.match(component,/buildPortablePhoneIntake/);
  assert.match(component,/launch_phone_intake\.py\?raw/);
  assert.match(component,/Download runnable phone intake ZIP/);
  assert.match(component,/eternyx-video-edit-draft\.json/);
  assert.match(component,/No repository clone/);
  assert.doesNotMatch(component,/fetch\(|supabase\.functions\.invoke|enqueueAIJob/);
});
