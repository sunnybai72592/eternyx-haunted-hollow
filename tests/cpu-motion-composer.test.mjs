import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createMotionProject, motionGeneratorCommand, motionOutputPaths,
  CPU_MOTION_STYLES, CPU_MOTION_PALETTES, CPU_MOTION_PROFILES,
  CPU_MOTION_QUALITIES, CPU_MOTION_LIMITS,
} from "../src/lib/ai/cpuMotionComposer.mjs";

const original = {
  style:"aurora",palette:"ocean",seconds:2,seed:42,
  caption:"Original aurora motion",
};
const second = {
  style:"particles",palette:"sunset",seconds:3,seed:21,
  caption:"Original moving particles",
};
const make = patch => createMotionProject({profile:"landscape",
  quality:"standard",scenes:[original,second],...patch});

test("export exactly the CPU generator's v1 JSON schema with original scene metadata", () => {
  const result = make();
  assert.equal(result.config.version,1);
  assert.deepEqual(Object.keys(result.config),["version","profile","quality","scenes"]);
  assert.deepEqual(Object.keys(result.config.scenes[0]),["style","palette","seconds","seed","caption"]);
  assert.deepEqual(result.config.scenes[0],original);
  assert.equal(result.seconds,5);
  assert.equal(result.totalFrames,80);
  assert.equal(result.sceneCount,2);
  assert.equal(result.highQuality,false);
  assert.deepEqual(JSON.parse(result.json),result.config);
  assert.ok(result.json.endsWith("\n"));
});

test("all six original visual styles, five palettes, shapes and qualities have supported presets", () => {
  assert.deepEqual(CPU_MOTION_STYLES,
    ["aurora","orbit","ripple","particles","scanlines","sunrise"]);
  assert.equal(CPU_MOTION_PALETTES.length,5);
  for (const profile of CPU_MOTION_PROFILES) {
    for (const style of CPU_MOTION_STYLES) {
      for (const palette of CPU_MOTION_PALETTES) {
        const result=createMotionProject({profile,quality:"standard",
          scenes:[{...original,style,palette}]});
        assert.equal(result.config.profile,profile);
        assert.equal(result.config.scenes[0].style,style);
        assert.equal(result.config.scenes[0].palette,palette);
      }
    }
  }
  assert.deepEqual(CPU_MOTION_QUALITIES,["standard","high"]);
});

test("standard supports thirty seconds, while high enforces a ten-second CPU boundary", () => {
  const scenes=[{...original,seconds:8},{...original,seconds:8},
    {...original,seconds:8},{...original,seconds:6}];
  assert.equal(createMotionProject({scenes}).totalFrames,480);
  assert.throws(()=>createMotionProject({scenes:[...scenes,{...original,seconds:1}]}),
                /30 seconds/);
  assert.throws(()=>createMotionProject({scenes:[{...original,seconds:8},
    {...original,seconds:3}],quality:"high"}),/10 seconds/);
  const ok=createMotionProject({scenes:[{...original,seconds:8},
    {...original,seconds:2}],quality:"high"});
  assert.equal(ok.highQuality,true);
  assert.equal(ok.totalFrames,160);
  assert.equal(CPU_MOTION_LIMITS.maxHighSeconds,10);
});

test("invalid scene counts, duration, unsafe captions, unapproved styles and seed are rejected", () => {
  const variants = [
    {...original,style:"AI model"},
    {...original,palette:"chrome"},
    {...original,seconds:0},
    {...original,seconds:9},
    {...original,seconds:1.5},
    {...original,seconds:true},
    {...original,seed:-1},
    {...original,seed:2147483648},
    {...original,seed:true},
    {...original,caption:""},
    {...original,caption:"unsafe\nline"},
    {...original,caption:"x".repeat(181)},
  ];
  for(const scene of variants) {
    assert.throws(()=>make({scenes:[scene]}));
  }
  for(const scenes of [[],Array.from({length:9},()=>original),"not-an-array"]) {
    assert.throws(()=>make({scenes}),/1 and 8/);
  }
  for(const profile of ["4k","portrait;curl",null]) {
    assert.throws(()=>make({profile}),/Unsupported/);
  }
  for(const quality of ["ultra","high;echo unsafe",null]) {
    assert.throws(()=>make({quality}),/Unsupported/);
  }
});

test("deterministic seed values are preserved and escaped captions remain JSON-only", () => {
  const scenes=[{...original,seed:0,caption:'"Aurora" <b> & مرحبًا'},
    {...second,seed:2147483647}];
  const first=createMotionProject({scenes});
  const repeated=createMotionProject({scenes});
  assert.equal(first.json,repeated.json);
  assert.match(first.json,/\\"Aurora\\"/);
  assert.match(first.json,/مرحبًا/);
  assert.equal(JSON.parse(first.json).scenes[0].caption,scenes[0].caption);
});

test("local FFmpeg command never interpolates untrusted captions, seeds or paths", () => {
  const command=motionGeneratorCommand();
  assert.equal(command,
    "python gpu-worker/generate_motion_clips.py --scenes ./eternyx-motion-scenes.json --output ./eternyx-motion-output");
  assert.doesNotMatch(command,/http:|https:|apikey|curl|wget|supabase/);
  assert.deepEqual(motionOutputPaths(),{
    video:"eternyx-motion-output/render/video.mp4",
    rendererManifest:"eternyx-motion-output/render/manifest.json",
    sceneReceipt:"eternyx-motion-output/generation-report.json",
    board:"eternyx-motion-output/eternyx-video-v2.json",
    captions:"eternyx-motion-output/render/captions.srt",
  });
});

test("AI Video Studio mounts functional CPU motion project maker with honest no-AI labels", () => {
  const page=readFileSync(new URL("../src/components/LocalVideoEditor.tsx",import.meta.url),"utf8");
  const component=readFileSync(new URL("../src/components/LocalMotionComposer.tsx",import.meta.url),"utf8");
  assert.match(page,/<LocalMotionComposer \/>/);
  assert.match(component,/createMotionProject/);
  assert.match(component,/Download motion scene JSON/);
  assert.match(component,/Copy CPU command/);
  assert.match(component,/no natural-language prompt understanding/);
  assert.match(component,/not trained text-to-video AI/);
  assert.match(component,/render\/video.mp4|outputs\.video/);
  assert.doesNotMatch(component,/fetch\(|supabase\.functions\.invoke|enqueueAIJob|requestAIJobEnqueue/);
});
