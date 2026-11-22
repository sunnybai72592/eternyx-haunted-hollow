import { useEffect, useRef, useState } from "react";
import { BrainCircuit, CheckCircle2, Copy, FileCheck2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cpuModelTrainCommand, cpuModelGenerateCommand, cpuLearnedOutputPaths,
  readCpuTrainingReport, checkCpuTrainedModel, LEARNED_CPU_LIMITS,
  LEARNED_CPU_PROFILES, LEARNED_CPU_QUALITIES,
} from "@/lib/ai/cpuLearnedVideo.mjs";

type Report = ReturnType<typeof readCpuTrainingReport>;
type Verification = ReturnType<typeof checkCpuTrainedModel>;

export default function LocalLearnedVideoStudio() {
  const [rightsRef,setRightsRef] = useState("operator-reviewed-original-footage");
  const [seconds,setSeconds] = useState(3);
  const [seed,setSeed] = useState(42);
  const [profile,setProfile] = useState("landscape");
  const [quality,setQuality] = useState("standard");
  const [report,setReport] = useState<Report|null>(null);
  const [verification,setVerification] = useState<Verification|null>(null);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [working,setWorking] = useState(false);
  const version=useRef(0);

  useEffect(()=>()=>{version.current++;},[]);
  let trainCommand="", generateCommand="",validation="";
  try {
    trainCommand=cpuModelTrainCommand(rightsRef);
    generateCommand=cpuModelGenerateCommand({seconds,seed,profile,quality});
  } catch (cause) {
    validation=cause instanceof Error?cause.message:"Check the learning and sample settings.";
  }
  const paths=cpuLearnedOutputPaths();

  const openArtifacts=async (files:FileList|null)=>{
    const token=++version.current;
    setWorking(true);setError("");setMessage("");setVerification(null);setReport(null);
    try {
      const items=Array.from(files??[]);
      if (items.length!==2) throw new Error("Select both model.json and training-report.json.");
      const model=items.find(f=>f.name==="model.json");
      const reportFile=items.find(f=>f.name==="training-report.json");
      if (!model || !reportFile || !model.size || !reportFile.size ||
          model.size>LEARNED_CPU_LIMITS.maxModelBytes ||
          reportFile.size>LEARNED_CPU_LIMITS.maxTrainingReportBytes) {
        throw new Error("Choose the bounded model.json and training-report.json from the local training folder.");
      }
      if (!globalThis.crypto?.subtle?.digest) throw new Error("Browser must support secure local SHA-256.");
      const parsed=readCpuTrainingReport(await reportFile.text());
      const bytes=await model.arrayBuffer();
      const digest=await crypto.subtle.digest("SHA-256",bytes);
      const sha=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
      const checked=checkCpuTrainedModel(parsed,{name:model.name,size:model.size,sha256:sha});
      if (token!==version.current) return;
      setReport(parsed);setVerification(checked);
      setMessage("Local trained-model bytes match the training report. The model was not run or uploaded.");
    } catch (cause) {
      if (token===version.current) {
        setError(cause instanceof Error?cause.message:"Cannot verify these local trained-model files.");
      }
    } finally {
      if (token===version.current) setWorking(false);
    }
  };

  const copy=async (command:string)=>{
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(command);
      setMessage("Local command copied.");setError("");
    } catch {setError("Clipboard access unavailable. Select and copy the command below.");}
  };

  return (
    <section className="space-y-5 rounded-lg border border-amber-400/25 bg-slate-950/60 p-4 sm:p-5"
      aria-labelledby="cpu-learned-model-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="cpu-learned-model-title" className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <BrainCircuit className="h-5 w-5 text-amber-300"/>Train a small video texture model on CPU
        </h3>
        <span className="rounded-full border border-amber-400/30 px-3 py-1 text-xs text-amber-200">
          Learned motion · No paid GPU
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-300">
        This experimental model really <strong>learns pixel color transitions and coarse motion</strong>
        from your locally reviewed footage and then samples new low-resolution moving textures.
        It is a simple first-order Markov statistical video model, <strong>not a neural diffusion model</strong>.
        It cannot follow arbitrary text prompts or create photorealistic scenes.
      </p>
      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        <h4 className="text-sm font-semibold text-slate-100">Step 1 · Train on your own approved MP4s</h4>
        <p className="text-sm leading-6 text-slate-300">
          Put 1–8 prepared 16 FPS MP4 files in <code className="text-amber-200">local-video-media</code>
          in a local ETERNYX checkout. Only the first 15 seconds of each source are sampled.
          The first 75% of decoded frames train the model; the last 25% are held out for a real
          prediction comparison. No original RGB frames or video files are bundled with the exported model.
        </p>
        <label htmlFor="cpu-learn-rights" className="block space-y-1 text-sm">Training footage rights reference (shell-safe)
          <Input id="cpu-learn-rights" className="border-slate-700 bg-slate-950"
            maxLength={80} value={rightsRef} onChange={e=>setRightsRef(e.target.value)}
            placeholder="owner-original-footage"/>
        </label>
        <code className="block select-all overflow-x-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-6 text-amber-200">
          {trainCommand||"Enter a valid rights reference."}
        </code>
        <Button size="sm" variant="outline" disabled={!trainCommand}
          onClick={()=>{void copy(trainCommand);}}>
          <Copy className="mr-2 h-4 w-4"/>Copy CPU training command
        </Button>
        <p className="text-xs text-slate-400">
          Training produces <code>{paths.model}</code> and <code>{paths.trainingReport}</code>.
          The report shows real held-out categorical prediction error versus an unconditional color baseline.
          Lower negative log likelihood is better predictive fit only—not an aesthetic or realism score.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        <h4 className="text-sm font-semibold text-slate-100">Step 2 · Generate new frames from learned probabilities</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Sample duration (1–8 seconds)
            <Input type="number" min={1} max={8} step={1} value={seconds}
              className="border-slate-700 bg-slate-950" onChange={e=>setSeconds(Number(e.target.value))}/>
          </label>
          <label className="space-y-1 text-sm">Reproducible sampling seed
            <Input type="number" min={0} max={2147483647} step={1} value={seed}
              className="border-slate-700 bg-slate-950" onChange={e=>setSeed(Number(e.target.value))}/>
          </label>
          <label className="space-y-1 text-sm">Output shape
            <select value={profile} onChange={e=>setProfile(e.target.value)}
              className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
              {LEARNED_CPU_PROFILES.map(value=><option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">Output size
            <select value={quality} onChange={e=>setQuality(e.target.value)}
              className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
              {LEARNED_CPU_QUALITIES.map(value=><option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        {validation&&<p role="alert" className="text-sm text-amber-200">{validation}</p>}
        <code className="block select-all overflow-x-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-6 text-amber-200">
          {generateCommand||"Choose valid seed, duration and output settings."}
        </code>
        <Button size="sm" variant="outline" disabled={!generateCommand}
          onClick={()=>{void copy(generateCommand);}}>
          <Copy className="mr-2 h-4 w-4"/>Copy learned sample command
        </Button>
        <p className="text-sm text-slate-300">
          After local CPU generation, open <code className="text-cyan-200">{paths.finished}</code>.
          Its <code>{paths.renderManifest}</code> can be imported in the real MP4 review section below.
          The separate sample report flags these new pixels as learned non-neural texture generation.
          Choose a fresh output folder for each render—existing files are never overwritten.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <FileCheck2 className="h-4 w-4"/>Step 3 · Inspect local training evidence
        </h4>
        <p className="text-sm text-slate-300">
          Optionally select both the actual <code>model.json</code> and <code>training-report.json</code>
          together. This browser hashes the model file and verifies its match to the report, without uploading
          or evaluating neural quality.
        </p>
        <label htmlFor="cpu-learn-artifacts" className="block text-sm">Choose both local training files
          <Input id="cpu-learn-artifacts" type="file" multiple accept=".json,application/json"
            disabled={working} className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
            onChange={event=>{void openArtifacts(event.currentTarget.files);event.currentTarget.value="";}}/>
        </label>
        {working&&<p role="status" className="text-sm text-amber-200">Hashing and validating local model evidence…</p>}
        {verification&&report&&<div role="status" className="space-y-2 text-sm text-emerald-200">
          <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>
            Model file and training-report SHA-256 match.
          </p>
          <p>{verification.trainingSources} training clips · {report.metrics.training_pairs} training pixel transitions
            · {report.metrics.holdout_pairs} held-out transitions.</p>
          <p>Held-out model NLL: {verification.holdoutTransitionNll}
            {" · "}Unconditional baseline NLL: {verification.holdoutBaselineNll}</p>
          <p className="text-xs text-slate-300">These describe categorical prediction on the held-out data.
            Neither measure proves visual quality, rights ownership, or a high-capability AI model.</p>
        </div>}
        {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
        {message&&<p role="status" className="text-sm text-sky-200">{message}</p>}
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
        This is an initial, low-resolution statistical generative baseline, not the eventual flagship AI Video model.
        Local training artifacts may reveal information about source appearance: keep them private.
        No external AI API, remote model download, subscription or paid accelerator is activated.
      </p>
    </section>
  );
}
