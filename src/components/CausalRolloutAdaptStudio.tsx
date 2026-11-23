import {useEffect,useRef,useState} from "react";
import {BrainCircuit,Copy,FileCheck2,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  ROLLOUT_LIMITS,rolloutAdaptCommand,rolloutAdaptPaths,
  readRolloutAdaptReport,matchRolloutAdaptFile,
} from "@/lib/ai/causalRolloutAdapt.mjs";

type Receipt=ReturnType<typeof readRolloutAdaptReport>;
type Matched=ReturnType<typeof matchRolloutAdaptFile>;
type Preview={matched:Matched;url:string};
const names:Record<string,string>={
  baseline:"Original neural v2",
  adapted:"Adapted neural v2",
  comparison:"Before (left) / after (right)",
};
async function hashFile(file:File){
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("Local SHA-256 requires a secure browser.");
  const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
}

export default function CausalRolloutAdaptStudio(){
  const [epochs,setEpochs]=useState(1);
  const [mixPercent,setMixPercent]=useState(50);
  const [seed,setSeed]=useState(42);
  const [seconds,setSeconds]=useState(1);
  const [stability,setStability]=useState(45);
  const [variation,setVariation]=useState(6);
  const [report,setReport]=useState<Receipt|null>(null);
  const [previews,setPreviews]=useState<Preview[]>([]);
  const [modelVerified,setModelVerified]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const sequence=useRef(0);
  const urls=useRef<string[]>([]);
  const clear=()=>{
    sequence.current++;
    urls.current.forEach(URL.revokeObjectURL);
    urls.current=[];
    setPreviews([]);setModelVerified(false);setBusy(false);
  };
  useEffect(()=>()=>{sequence.current++;urls.current.forEach(URL.revokeObjectURL);},[]);
  let command="",validation="";
  try{command=rolloutAdaptCommand({epochs,mixPercent,seed,seconds,stability,variation});}
  catch(cause){validation=cause instanceof Error?cause.message:"Choose valid CPU training parameters.";}
  const paths=rolloutAdaptPaths();
  const copy=async()=>{
    try{
      if(!navigator.clipboard?.writeText)throw new Error();
      await navigator.clipboard.writeText(command);
      setNotice("Offline causal rollout command copied.");setError("");
    }catch{setError("Clipboard unavailable. Select and copy the command shown.");}
  };
  const loadReport=async(file:File|undefined)=>{
    clear();setReport(null);setError("");setNotice("");
    const token=sequence.current;
    try{
      if(!file||file.name!=="adaptation-report.json"||file.size<1||
         file.size>ROLLOUT_LIMITS.maxReportBytes)
        throw new Error("Choose the actual local adaptation-report.json (≤64 KiB).");
      const parsed=readRolloutAdaptReport(await file.text());
      if(token!==sequence.current)return;
      setReport(parsed);
      setNotice("Causal prefix evidence loaded. Inspect exact generated local model or video bytes next.");
    }catch(cause){
      if(token===sequence.current)setError(cause instanceof Error?cause.message:"Invalid local adaptation report.");
    }
  };
  const inspectFiles=async(files:FileList|null)=>{
    clear();setError("");setNotice("");
    const token=sequence.current;
    const created:string[]=[];
    try{
      if(!report)throw new Error("Import the adaptation-report.json before verifying files.");
      const chosen=Array.from(files??[]);
      if(!chosen.length||chosen.length>4)
        throw new Error("Select up to three generated MP4s and optionally the adapted model.json.");
      setBusy(true);
      const previewsFound:Preview[]=[];
      const seen=new Set<string>();
      let verifiedModel=false;
      for(const file of chosen){
        if(file.size<1||
           file.size>(file.name==="model.json"?ROLLOUT_LIMITS.maxModelBytes:
                      ROLLOUT_LIMITS.maxVideoBytes)||
           !["video.mp4","comparison.mp4","model.json"].includes(file.name))
          throw new Error("Choose an actual bounded model.json, video.mp4 or comparison.mp4.");
        const matched=matchRolloutAdaptFile(report,{
          name:file.name,size:file.size,sha256:await hashFile(file),
        });
        if(seen.has(matched.kind))throw new Error("The same adaptation candidate was selected twice.");
        seen.add(matched.kind);
        if(matched.kind==="model"){verifiedModel=true;continue;}
        const url=URL.createObjectURL(file);
        created.push(url);
        previewsFound.push({matched,url});
      }
      if(token!==sequence.current)return;
      urls.current=created.splice(0);
      previewsFound.sort((a,b)=>["baseline","adapted","comparison"].indexOf(a.matched.kind)-
                             ["baseline","adapted","comparison"].indexOf(b.matched.kind));
      setPreviews(previewsFound);
      setModelVerified(verifiedModel);
      setNotice("Matched "+seen.size+" actual file(s) to the local self-reported SHA-256 evidence.");
    }catch(cause){
      if(token===sequence.current)setError(cause instanceof Error?cause.message:"Could not verify the selected files.");
    }finally{
      created.forEach(url=>URL.revokeObjectURL(url));
      if(token===sequence.current)setBusy(false);
    }
  };
  return (
    <details className="rounded-lg border border-violet-400/25 bg-slate-950/60 p-4 sm:p-5"
      aria-labelledby="causal-neural-title">
      <summary id="causal-neural-title" className="flex cursor-pointer items-center gap-2 font-semibold text-violet-200">
        <BrainCircuit className="h-5 w-5"/>Neural v2 · Causal rollout adaptation and 8-step drift review
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-slate-300">
          Adapt an already trained 48×28 two-frame neural checkpoint using its
          <strong> own predicted training-prefix frames</strong>, with optional
          replay of original supervised training frames. Then compare actual
          held-out 1-, 4- and 8-step errors before and after adaptation.
          No held-out frames enter training; <strong>results may get worse</strong>.
        </p>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium text-slate-100">1. Adapt your existing neural v2 checkpoint locally</h4>
          <p className="text-sm text-slate-300">
            Use your existing <code>eternyx-neural-v2-model/model.json</code>.
            Recreate its original <code>local-video-media</code> folder with the same
            reviewed MP4 bytes. SHA-256 source hashes and training boundaries must match.
            The adapter creates a new checkpoint; it never overwrites the original.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Adaptation epochs (1–3)
              <Input type="number" value={epochs} min={1} max={3} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setEpochs(Number(e.target.value))}/>
            </label>
            <label className="space-y-1 text-sm">Teacher replay (0–100%)
              <Input type="number" value={mixPercent} min={0} max={100} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setMixPercent(Number(e.target.value))}/>
            </label>
            <label className="space-y-1 text-sm">Sampling and adaptation seed
              <Input type="number" value={seed} min={0} max={2147483647} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setSeed(Number(e.target.value))}/>
            </label>
            <label className="space-y-1 text-sm">Comparison video duration (1–2 seconds)
              <Input type="number" value={seconds} min={1} max={2} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setSeconds(Number(e.target.value))}/>
            </label>
            <label className="space-y-1 text-sm">Temporal stability (0–85%)
              <Input type="number" value={stability} min={0} max={85} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setStability(Number(e.target.value))}/>
            </label>
            <label className="space-y-1 text-sm">Seeded variation (0–20%)
              <Input type="number" value={variation} min={0} max={20} step={1}
                className="border-slate-700 bg-slate-950"
                onChange={e=>setVariation(Number(e.target.value))}/>
            </label>
          </div>
          {validation&&<p role="alert" className="text-sm text-amber-200">{validation}</p>}
          <code className="block select-all overflow-x-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-6 text-violet-200">
            {command||"Correct the adaptation settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!command} onClick={()=>{void copy();}}>
            <Copy className="mr-2 h-4 w-4"/>Copy offline rollout adaptation command
          </Button>
          <p className="text-xs leading-5 text-slate-400">
            Produces <code>{paths.adaptedModel}</code> and two actual MP4s at
            <code className="mx-1">{paths.baseline}</code> and <code>{paths.adapted}</code>,
            plus <code className="mx-1">{paths.comparison}</code>. Training is bounded
            to 1–3 original clips, three-step causal training windows and 1–3 CPU epochs.
          </p>
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium text-slate-100">2. Inspect real unseen-frame before/after prediction error</h4>
          <label className="block space-y-1 text-sm">Choose local adaptation-report.json
            <Input type="file" accept=".json,application/json"
              aria-label="Causal adaptation report"
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void loadReport(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
          </label>
          {report&&<div className="space-y-3 text-sm">
            <p className="text-violet-200">
              {report.training_source_count} verified training clip(s) · {report.training.total_examples}
              {" "}prefix-only optimization examples · {report.training.training_seconds.toFixed(3)} s CPU
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-slate-700 text-slate-300">
                  <th className="p-2">Causal held-out horizon</th>
                  <th className="p-2">Before MSE</th>
                  <th className="p-2">After MSE</th>
                  <th className="p-2">Static baseline MSE</th>
                </tr></thead>
                <tbody>{[1,4,8].map(step=>{
                  const before=report.evaluation.baseline[String(step)];
                  const after=report.evaluation.adapted[String(step)];
                  return <tr key={step} className="border-b border-slate-800">
                    <th className="p-2">{step} step{step===1?"":"s"}</th>
                    <td className="p-2 tabular-nums">{before.model_mse.toFixed(6)}</td>
                    <td className="p-2 tabular-nums">{after.model_mse.toFixed(6)}</td>
                    <td className="p-2 tabular-nums">{after.static_baseline_mse.toFixed(6)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <p className="text-xs leading-5 text-slate-400">
              Held-out targets are used only to measure loss, never to update weights.
              This is not a perceptual quality score: lower MSE can mean smoother,
              blurrier or almost static video. Adaptation is not guaranteed to improve errors.
            </p>
          </div>}
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="flex items-center gap-2 font-medium">
            <FileCheck2 className="h-4 w-4"/>3. Verify adapted checkpoint and preview original versus adapted video
          </h4>
          <p className="text-sm text-slate-300">
            First load <code>{paths.report}</code>. Then select any of the actual
            local <code>video.mp4</code> files, <code>comparison.mp4</code>,
            and optionally <code>adapted-model/model.json</code> together.
            The browser verifies local file bytes and displays actual MP4 previews without uploading.
          </p>
          <label className="block space-y-1 text-sm">Choose adapted model and/or comparison MP4 files
            <Input type="file" multiple accept=".mp4,.json,video/mp4,application/json"
              disabled={!report||busy}
              aria-label="Local causal adaptation model and videos"
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void inspectFiles(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {busy&&<p role="status" className="text-sm text-violet-200">Verifying actual local bytes…</p>}
          {modelVerified&&<p role="status" className="text-sm text-emerald-200">
            Adapted model.json SHA-256 matches this locally selected adaptation report.
          </p>}
          {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
          {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
          {previews.length>0&&<div className="grid gap-3 lg:grid-cols-3">
            {previews.map(p=><div key={p.matched.kind}
              className="space-y-2 rounded border border-slate-700 bg-slate-950 p-3">
              <p className="text-sm font-medium text-emerald-200">{names[p.matched.kind]}</p>
              <video src={p.url} controls playsInline preload="metadata"
                aria-label={"Verified "+names[p.matched.kind]}
                className="w-full rounded border border-slate-700 bg-black"/>
              <p className="text-xs text-slate-400">{report?.sampling.seconds*16}
                {" "}decoded frames claimed by local renderer · SHA-256 matched
              </p>
            </div>)}
          </div>}
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          This is a tiny offline neural texture research model, not a pretrained
          diffusion or natural-language text-to-video generator.
          Hash-matched self-reports are not digital signatures or licensing proof.
          Keep model data private. No paid GPU, external AI API, or video uploads.
        </p>
      </div>
    </details>
  );
}
