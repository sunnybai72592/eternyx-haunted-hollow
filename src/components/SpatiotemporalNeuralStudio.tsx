import {useEffect,useRef,useState} from "react";
import {BrainCircuit,CheckCircle2,Copy,FileVideo2,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  spatiotemporalTrainCommand,spatiotemporalGenerateCommand,
  spatiotemporalOutputPaths,readSpatiotemporalTrainingReport,
  matchSpatiotemporalCheckpoint,readSpatiotemporalGenerationReport,
  matchSpatiotemporalVideo,V2_LIMITS,
} from "@/lib/ai/spatiotemporalNeuralVideo.mjs";

type Train=ReturnType<typeof readSpatiotemporalTrainingReport>;
type Generated=ReturnType<typeof readSpatiotemporalGenerationReport>;
type Verified=ReturnType<typeof matchSpatiotemporalCheckpoint>;
type Matched=ReturnType<typeof matchSpatiotemporalVideo>;
type Preview={verified:Matched;url:string};

async function digest(file:File){
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("Secure browser context required for local SHA-256.");
  const bytes=await file.arrayBuffer();
  const raw=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(raw),n=>n.toString(16).padStart(2,"0")).join("");
}
export default function SpatiotemporalNeuralStudio(){
  const [rights,setRights]=useState("owner-reviewed-video");
  const [trainSeed,setTrainSeed]=useState(42);
  const [epochs,setEpochs]=useState(2);
  const [seconds,setSeconds]=useState(2);
  const [seed,setSeed]=useState(42);
  const [stability,setStability]=useState(45);
  const [variation,setVariation]=useState(6);
  const [profile,setProfile]=useState("landscape");
  const [quality,setQuality]=useState("standard");
  const [trainReport,setTrainReport]=useState<Train|null>(null);
  const [trainEvidence,setTrainEvidence]=useState<Verified|null>(null);
  const [sampleReport,setSampleReport]=useState<Generated|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const version=useRef(0);
  const objectUrl=useRef<string|null>(null);
  useEffect(()=>()=>{version.current++;if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
  const invalidate=()=>{
    version.current++;
    if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
    objectUrl.current=null;
    setPreview(null);setBusy(false);
  };
  let training="",generation="",validation="";
  try{
    training=spatiotemporalTrainCommand({rightsRef:rights,seed:trainSeed,epochs});
    generation=spatiotemporalGenerateCommand({seconds,seed,stability,variation,profile,quality});
  }catch(cause){validation=cause instanceof Error?cause.message:"Choose valid CPU model settings.";}
  const paths=spatiotemporalOutputPaths();
  const copy=async(command:string)=>{
    try{
      if(!navigator.clipboard?.writeText)throw new Error();
      await navigator.clipboard.writeText(command);
      setNotice("CPU command copied.");setError("");
    }catch{setError("Clipboard unavailable. Select and copy the command directly.");}
  };
  const inspectTraining=async(files:FileList|null)=>{
    const token=++version.current;
    setBusy(true);setError("");setNotice("");
    setTrainReport(null);setTrainEvidence(null);
    try{
      const chosen=Array.from(files??[]);
      const model=chosen.find(f=>f.name==="model.json");
      const report=chosen.find(f=>f.name==="training-report.json");
      if(chosen.length!==2||!model||!report||
         model.size<1||model.size>V2_LIMITS.maxModelBytes||
         report.size<1||report.size>V2_LIMITS.maxReportBytes)
        throw new Error("Choose actual bounded model.json and training-report.json together.");
      const parsed=readSpatiotemporalTrainingReport(await report.text());
      const verified=matchSpatiotemporalCheckpoint(parsed,{
        name:model.name,size:model.size,sha256:await digest(model),
      });
      if(token!==version.current)return;
      setTrainReport(parsed);setTrainEvidence(verified);
      setNotice("Actual checkpoint SHA-256 matches the local training report.");
    }catch(cause){
      if(token===version.current)setError(cause instanceof Error?cause.message:"Cannot verify training files.");
    }finally{if(token===version.current)setBusy(false);}
  };
  const inspectSample=async(files:FileList|null)=>{
    invalidate();
    const token=version.current;
    setBusy(true);setError("");setNotice("");
    setSampleReport(null);
    try{
      const selected=Array.from(files??[]);
      const mp4=selected.find(f=>f.name==="video.mp4");
      const receipt=selected.find(f=>f.name==="generation-report.json");
      if(selected.length!==2||!mp4||!receipt||
         mp4.size<1||mp4.size>V2_LIMITS.maxVideoBytes||
         receipt.size<1||receipt.size>V2_LIMITS.maxReportBytes)
        throw new Error("Choose generation-report.json and its finished video.mp4 together.");
      const parsed=readSpatiotemporalGenerationReport(await receipt.text());
      const verified=matchSpatiotemporalVideo(parsed,{
        name:mp4.name,size:mp4.size,sha256:await digest(mp4),
      });
      if(token!==version.current)return;
      const url=URL.createObjectURL(mp4);
      objectUrl.current=url;
      setSampleReport(parsed);setPreview({verified,url});
      setNotice("Actual finished MP4 SHA-256 matches the local neural v2 receipt.");
    }catch(cause){
      if(token===version.current)setError(cause instanceof Error?cause.message:"Cannot verify video files.");
    }finally{if(token===version.current)setBusy(false);}
  };
  return(
    <details className="rounded-lg border border-teal-400/25 bg-slate-950/60 p-4 sm:p-5"
      aria-labelledby="neural-v2-title">
      <summary id="neural-v2-title" className="flex cursor-pointer items-center gap-2 font-semibold text-teal-200">
        <BrainCircuit className="h-5 w-5"/>Neural v2 · Two-frame motion and richer 48×28 detail (CPU)
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-slate-300">
          Train a genuine small 24-input, 16-hidden-unit, three-output neural next-frame
          predictor on <strong>two successive real frames plus spatial neighbors</strong>.
          The trained input resolution is 48×28, versus 32×18 for neural v1.
          Real one-step and four-step causal rollout errors are recorded; this does not
          guarantee a better-looking result. No text conditioning, diffusion model or paid GPU.
        </p>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium">1. Train from reviewed local 16 FPS videos</h4>
          <p className="text-xs leading-5 text-slate-300">
            Prepare 1–8 approved MP4s (each up to 64 MiB) in
            <code className="mx-1">./local-video-media</code> of your local checkout.
            Up to 64 actual frames per source are decoded; the later 25% are held out
            for independent predictive evaluation.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 text-sm">Footage rights reference
              <Input value={rights} maxLength={80} aria-label="Neural v2 rights reference"
                className="border-slate-700 bg-slate-950"
                onChange={e=>setRights(e.target.value)}/>
            </label>
            <label className="block space-y-1 text-sm">Training seed
              <Input type="number" value={trainSeed} min={0} max={2147483647} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setTrainSeed(Number(e.target.value))}/>
            </label>
            <label className="block space-y-1 text-sm">CPU epochs (1–4)
              <Input type="number" value={epochs} min={1} max={4} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setEpochs(Number(e.target.value))}/>
            </label>
          </div>
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-teal-200">
            {training||"Correct training settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!training} onClick={()=>{void copy(training);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy neural v2 training command
          </Button>
          <p className="text-xs text-slate-400">
            Saves a create-only <code>{paths.checkpoint}</code> and
            <code className="ml-1">{paths.trainingReport}</code>. The v1 model stays unchanged.
          </p>
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium">2. Generate newly predicted frames and a finished H.264 video</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">Duration (1–8 seconds)
              <Input value={seconds} type="number" min={1} max={8} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setSeconds(Number(e.target.value))}/>
            </label>
            <label className="block space-y-1 text-sm">Sample seed
              <Input value={seed} type="number" min={0} max={2147483647} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setSeed(Number(e.target.value))}/>
            </label>
            <label className="block space-y-1 text-sm">Temporal stability (0–85%)
              <Input value={stability} type="number" min={0} max={85} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setStability(Number(e.target.value))}/>
            </label>
            <label className="block space-y-1 text-sm">Innovation (0–20%)
              <Input value={variation} type="number" min={0} max={20} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setVariation(Number(e.target.value))}/>
            </label>
            <label className="block space-y-1 text-sm">Output aspect ratio
              <select value={profile} onChange={e=>setProfile(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {["landscape","portrait","square"].map(value=><option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm">Output scale
              <select value={quality} onChange={e=>setQuality(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {["standard","high"].map(value=><option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          {validation&&<p role="alert" className="text-xs text-amber-200">{validation}</p>}
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-teal-200">
            {generation||"Correct sampling settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!generation} onClick={()=>{void copy(generation);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy neural v2 generation command
          </Button>
          <p className="text-xs leading-5 text-slate-400">
            Runs offline via local Python/FFmpeg and produces actual H.264 footage at
            <code className="mx-1">{paths.sourceClip}</code>,
            a finished <code>{paths.finishedMp4}</code> and separate renderer and
            neural-origin receipts. Choose a new output directory for each run.
          </p>
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="flex items-center gap-2 font-medium">
            <FileVideo2 className="h-4 w-4"/>3. Inspect real model evidence and generated video
          </h4>
          <p className="text-sm text-slate-300">
            All checks use actual files selected on your device. We hash the local model and
            finished MP4 against their self-reported SHA-256 receipts, without uploading them.
          </p>
          <label className="block space-y-1 text-sm">Select model.json and training-report.json together
            <Input type="file" multiple accept=".json,application/json" disabled={busy}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void inspectTraining(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {trainEvidence&&trainReport&&<div role="status" className="space-y-1 text-sm text-emerald-200">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>
              Trained 48×28 checkpoint SHA-256 matches the selected report.
            </p>
            <p>Sources: {trainEvidence.sources} · Train MSE: {trainEvidence.before} → {trainEvidence.after}</p>
            <p>One-step MSE: model {trainEvidence.oneStep} · previous-frame baseline {trainEvidence.oneStepBaseline}</p>
            <p>Four-step causal rollout MSE: model {trainEvidence.rollout} · fixed-frame baseline {trainEvidence.rolloutBaseline}</p>
            <p className="text-xs text-slate-300">
              These measure prediction on real held-out frames; they are not realism ratings.
              A larger model can still predict worse than a simple baseline.
            </p>
          </div>}
          <label className="block space-y-1 text-sm">
            Select finished video.mp4 and generation-report.json together
            <Input type="file" multiple accept=".mp4,.json,video/mp4,application/json"
              disabled={busy} className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void inspectSample(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {preview&&sampleReport&&<div role="status" className="space-y-2 text-sm text-emerald-200">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>
              Actual neural v2 MP4 hash matches the sample receipt · {preview.verified.frames} frames
            </p>
            <video controls playsInline preload="metadata" src={preview.url}
              aria-label="Verified offline neural v2 generated MP4"
              className="w-full max-w-xl rounded border border-slate-700 bg-black"/>
            <p className="text-xs">
              Measured raw adjacent-frame RGB delta: {preview.verified.meanAdjacentRgbDelta}
              {" · "}Model input resolution: {sampleReport.width}×{sampleReport.height}
            </p>
          </div>}
          {busy&&<p role="status" className="text-sm text-teal-200">Checking selected local file hashes…</p>}
          {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
          {notice&&<p role="status" className="text-sm text-teal-200">{notice}</p>}
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          This is a low-detail, experimental CPU neural research model, not a trained
          photorealistic text-to-video system. Neural checkpoints may reveal source color
          statistics; keep files private. No paid GPU, cloud upload or external AI API.
        </p>
      </div>
    </details>
  );
}
