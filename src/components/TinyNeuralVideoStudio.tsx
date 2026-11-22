import { useEffect, useRef, useState } from "react";
import NeuralVideoAudition from "@/components/NeuralVideoAudition";
import { Brain, CheckCircle2, Copy, FileCheck2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  tinyNeuralTrainingCommand,tinyNeuralGenerateCommand,tinyNeuralOutputPaths,
  readTinyNeuralReport,verifyTinyNeuralCheckpoint,
  TINY_NEURAL_PROFILES,TINY_NEURAL_QUALITIES,TINY_NEURAL_LIMITS,
} from "@/lib/ai/tinyNeuralVideo.mjs";

type Receipt=ReturnType<typeof readTinyNeuralReport>;
type Checked=ReturnType<typeof verifyTinyNeuralCheckpoint>;

export default function TinyNeuralVideoStudio(){
  const [rightsRef,setRightsRef]=useState("owner-reviewed-local-video");
  const [trainSeed,setTrainSeed]=useState(42);
  const [epochs,setEpochs]=useState(3);
  const [seconds,setSeconds]=useState(2);
  const [seed,setSeed]=useState(42);
  const [stability,setStability]=useState(45);
  const [variation,setVariation]=useState(6);
  const [profile,setProfile]=useState("landscape");
  const [quality,setQuality]=useState("standard");
  const [receipt,setReceipt]=useState<Receipt|null>(null);
  const [verified,setVerified]=useState<Checked|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [working,setWorking]=useState(false);
  const revision=useRef(0);
  useEffect(()=>()=>{revision.current++;},[]);
  let trainCommand="",generateCommand="",validation="";
  try{
    trainCommand=tinyNeuralTrainingCommand({rightsRef,seed:trainSeed,epochs});
    generateCommand=tinyNeuralGenerateCommand({seconds,seed,profile,quality,stability,variation});
  }catch(cause){validation=cause instanceof Error?cause.message:"Choose valid model parameters.";}
  const paths=tinyNeuralOutputPaths();
  const copy=(value:string)=>{
    if(!navigator.clipboard?.writeText){
      setError("Clipboard unavailable: select and copy the command below.");return;
    }
    void navigator.clipboard.writeText(value).then(
      ()=>{setNotice("Local CPU command copied.");setError("");},
      ()=>setError("Clipboard denied: select and copy the command below.")
    );
  };
  const inspect=async(files:FileList|null)=>{
    const token=++revision.current;
    setWorking(true);setError("");setNotice("");setReceipt(null);setVerified(null);
    try{
      const selected=Array.from(files??[]);
      if(selected.length!==2)throw new Error("Select both model.json and training-report.json.");
      const model=selected.find(file=>file.name==="model.json");
      const reportFile=selected.find(file=>file.name==="training-report.json");
      if(!model||!reportFile||model.size<1||reportFile.size<1||
         model.size>TINY_NEURAL_LIMITS.maxModelBytes||
         reportFile.size>TINY_NEURAL_LIMITS.maxReportBytes)
        throw new Error("Choose genuine bounded model.json and training-report.json from the local training output.");
      if(!globalThis.crypto?.subtle?.digest)
        throw new Error("Local SHA-256 requires a secure browser context.");
      const report=readTinyNeuralReport(await reportFile.text());
      const digest=await crypto.subtle.digest("SHA-256",await model.arrayBuffer());
      const sha=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,"0")).join("");
      const checked=verifyTinyNeuralCheckpoint(report,{name:model.name,size:model.size,sha256:sha});
      if(revision.current!==token)return;
      setReceipt(report);setVerified(checked);
      setNotice("Neural checkpoint SHA-256 matches the locally selected training report.");
    }catch(cause){
      if(revision.current===token)setError(cause instanceof Error?cause.message:"Could not inspect local neural model.");
    }finally{
      if(revision.current===token)setWorking(false);
    }
  };
  return (
    <details className="rounded-lg border border-indigo-400/25 bg-slate-950/50 p-4 sm:p-5" aria-labelledby="tiny-neural-title">
      <summary id="tiny-neural-title" className="flex cursor-pointer items-center gap-2 font-semibold text-indigo-200">
        <Brain className="h-5 w-5"/>Experimental tiny neural video model · CPU-only
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-slate-300">
          <strong>Actual learning:</strong> a 12-input, 12-hidden-neuron, 3-output multilayer perceptron
          trains on next-frame pixels using backpropagation and local video. It can sample new low-resolution,
          moving video textures. This is a tiny neural autoregressive baseline, <strong>not diffusion,
          photorealistic video, or a prompt-to-video model</strong>. Training and rendering run on your
          computer using Python and FFmpeg; the browser only prepares commands and verifies output receipts.
        </p>
        <section className="space-y-3 rounded-lg border border-slate-700 p-3">
          <h4 className="font-medium text-slate-100">1. Train real neural weights from your licensed local MP4 footage</h4>
          <p className="text-sm text-slate-300">
            Put 1–8 constant-16-FPS MP4 clips inside <code className="text-indigo-200">local-video-media</code>
            in your local ETERNYX checkout. Training uses at most the first 64 decoded frames per clip,
            downscaled to 32 × 18. Earlier frames train the network; later frames are held out.
            Confirm you have the right to use your recordings before training.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">Footage rights reference
              <Input value={rightsRef} maxLength={80} onChange={e=>setRightsRef(e.target.value)}
                className="border-slate-700 bg-slate-950" aria-label="Neural footage rights reference"/>
            </label>
            <label className="space-y-1 text-sm">Training seed
              <Input type="number" min={0} max={2147483647} step={1} value={trainSeed}
                onChange={e=>setTrainSeed(Number(e.target.value))}
                className="border-slate-700 bg-slate-950" aria-label="Tiny neural training seed"/>
            </label>
            <label className="space-y-1 text-sm">CPU training epochs (1–4)
              <Input type="number" min={1} max={4} step={1} value={epochs}
                onChange={e=>setEpochs(Number(e.target.value))}
                className="border-slate-700 bg-slate-950" aria-label="Tiny neural training epochs"/>
            </label>
          </div>
          <code className="block select-all overflow-x-auto rounded border border-slate-700 bg-slate-900 p-3 text-xs leading-6 text-indigo-200">
            {trainCommand||"Correct the training settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!trainCommand} onClick={()=>copy(trainCommand)}>
            <Copy className="mr-2 h-4 w-4"/>Copy neural training command
          </Button>
          <p className="text-xs text-slate-400">
            Creates <code>{paths.model}</code> and <code>{paths.training}</code>.
            Training compares actual held-out next-pixel MSE to a simple previous-frame persistence baseline.
            Neither metric is an image-quality rating or proof of realism.
          </p>
        </section>
        <section className="space-y-3 rounded-lg border border-slate-700 p-3">
          <h4 className="font-medium text-slate-100">2. Sample genuinely new neural video frames on CPU</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Duration in seconds (1–8)
              <Input type="number" min={1} max={8} step={1} value={seconds}
                onChange={e=>setSeconds(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Sampling seed
              <Input type="number" min={0} max={2147483647} step={1} value={seed}
                onChange={e=>setSeed(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Aspect ratio
              <select value={profile} onChange={e=>setProfile(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {TINY_NEURAL_PROFILES.map(value=><option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">Output quality
              <select value={quality} onChange={e=>setQuality(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {TINY_NEURAL_QUALITIES.map(value=><option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">Temporal stability (0–85%)
              <Input type="number" min={0} max={85} step={1} value={stability}
                onChange={e=>setStability(Number(e.target.value))}
                className="border-slate-700 bg-slate-950" aria-label="Neural temporal stability"/>
            </label>
            <label className="space-y-1 text-sm">Controlled frame variation (0–20%)
              <Input type="number" min={0} max={20} step={1} value={variation}
                onChange={e=>setVariation(Number(e.target.value))}
                className="border-slate-700 bg-slate-950" aria-label="Neural frame variation"/>
            </label>
          </div>
          {validation&&<p role="alert" className="text-sm text-amber-200">{validation}</p>}
          <code className="block select-all overflow-x-auto rounded border border-slate-700 bg-slate-900 p-3 text-xs leading-6 text-indigo-200">
            {generateCommand||"Correct the sample settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!generateCommand} onClick={()=>copy(generateCommand)}>
            <Copy className="mr-2 h-4 w-4"/>Copy neural video generation command
          </Button>
          <p className="text-xs leading-5 text-slate-400">
            Temporal stability blends motion-compensated previous pixels with each neural
            prediction. Variation adds bounded, time-correlated noise rather than unrelated
            per-frame jitter. Neither control guarantees higher perceived visual quality.
          </p>
          <p className="text-xs leading-5 text-slate-400">
            This command creates actual learned-frame H.264 footage at <code>{paths.sample}</code>,
            and a finished <code>{paths.video}</code>, with independent editing receipt
            <code> {paths.manifest}</code> and neural-origin report <code>{paths.report}</code>.
            Open the MP4 and renderer manifest in the existing local video review workspace.
            Run with a new output folder each time.
          </p>
        </section>
        <NeuralVideoAudition seconds={Math.min(seconds,4)} profile={profile}
          quality={quality} stability={stability} variation={variation} />
        <section className="space-y-3 rounded-lg border border-slate-700 p-3">
          <h4 className="flex items-center gap-2 font-medium text-slate-100">
            <FileCheck2 className="h-4 w-4"/>3. Verify actual neural training evidence locally
          </h4>
          <p className="text-sm text-slate-300">
            Optionally select both trained <code>model.json</code> and
            <code> training-report.json</code>. The browser hashes the real checkpoint bytes
            and shows measured loss and independent held-out error; no upload or remote computation.
          </p>
          <label className="block space-y-1 text-sm">Select both locally generated neural training files
            <Input type="file" multiple accept=".json,application/json" disabled={working}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={event=>{void inspect(event.currentTarget.files);event.currentTarget.value="";}}/>
          </label>
          {working&&<p role="status" className="text-sm text-indigo-200">Hashing the trained model on your device…</p>}
          {verified&&receipt&&<div role="status" className="space-y-1 text-sm text-emerald-200">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>Neural model and training report hashes match.</p>
            <p>Training examples: {receipt.metrics.train_examples} · Held-out: {receipt.metrics.holdout_examples}</p>
            <p>Training pixel MSE: {verified.trainMseBefore} → {verified.trainMseAfter}</p>
            <p>Held-out neural pixel MSE: {verified.holdoutNeuralMse}</p>
            <p>Held-out previous-frame baseline MSE: {verified.holdoutBaselineMse}</p>
            <p className="text-xs text-slate-300">
              These are measured errors, not generated-video quality or authenticity certification.
              A self-reported manifest is not a digital signature.
            </p>
          </div>}
          {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
          {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          A learned model may still reveal statistical appearance information about your source footage;
          keep checkpoints private. No paid GPU, external AI API, pretrained foundation model,
          subscription change or cloud video transfer is involved.
        </p>
      </div>
    </details>
  );
}
