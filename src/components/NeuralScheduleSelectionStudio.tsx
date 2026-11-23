import {useEffect,useRef,useState} from "react";
import {BrainCircuit,CheckCircle2,Copy,FileCheck2,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  SCHEDULE_LIMITS,neuralScheduleCommand,neuralSchedulePaths,
  readNeuralScheduleReport,matchNeuralScheduleFile,
} from "@/lib/ai/neuralScheduleSelection.mjs";

type Receipt=ReturnType<typeof readNeuralScheduleReport>;
type Matched=ReturnType<typeof matchNeuralScheduleFile>;
type Preview={matched:Matched;url:string};
const LABELS:Record<string,string>={
  base:"Unchanged neural v2",selected:"Inner-validated schedule",
  comparison:"Base (left) · selected (right)",
};
async function hashFile(file:File){
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("Local SHA-256 requires a secure browser context.");
  const raw=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(raw),n=>n.toString(16).padStart(2,"0")).join("");
}

export default function NeuralScheduleSelectionStudio(){
  const [mixText,setMixText]=useState("0, 50, 100");
  const [seed,setSeed]=useState(42);
  const [epochs,setEpochs]=useState(1);
  const [seconds,setSeconds]=useState(1);
  const [stability,setStability]=useState(45);
  const [variation,setVariation]=useState(6);
  const [report,setReport]=useState<Receipt|null>(null);
  const [previews,setPreviews]=useState<Preview[]>([]);
  const [modelVerified,setModelVerified]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const revision=useRef(0);
  const objectUrls=useRef<string[]>([]);
  const clear=()=>{
    revision.current++;
    objectUrls.current.forEach(url=>URL.revokeObjectURL(url));
    objectUrls.current=[];
    setPreviews([]);setModelVerified(false);setProcessing(false);
  };
  useEffect(()=>()=>{revision.current++;objectUrls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  const paths=neuralSchedulePaths();
  let command="",validation="";
  try{
    const chunks=mixText.split(",").map(v=>v.trim());
    if(chunks.some(v=>!/^\d+$/.test(v)))
      throw new Error("Choose 1–3 comma-separated replay percentages.");
    command=neuralScheduleCommand({
      mixes:chunks.map(Number),seed,epochs,seconds,stability,variation,
    });
  }catch(cause){validation=cause instanceof Error?cause.message:"Choose valid schedule settings.";}
  const copy=async()=>{
    try{
      if(!navigator.clipboard?.writeText)throw new Error();
      await navigator.clipboard.writeText(command);
      setNotice("CPU neural schedule command copied.");setError("");
    }catch{setError("Clipboard unavailable. Select and copy the command below.");}
  };
  const importReport=async(file:File|undefined)=>{
    clear();setReport(null);setError("");setNotice("");
    const token=revision.current;
    try{
      if(!file||file.name!=="schedule-report.json"||file.size<1||
         file.size>SCHEDULE_LIMITS.maxReportBytes)
        throw new Error("Select your actual local schedule-report.json (up to 64 KiB).");
      const receipt=readNeuralScheduleReport(await file.text());
      if(token!==revision.current)return;
      setReport(receipt);
      setNotice("Inner-only candidate selection report loaded. You can verify its actual checkpoint and MP4 files.");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Invalid schedule report.");
    }
  };
  const importFiles=async(files:FileList|null)=>{
    clear();setError("");setNotice("");
    const token=revision.current;
    const created:string[]=[];
    try{
      if(!report)throw new Error("Import schedule-report.json before checking local media files.");
      const chosen=Array.from(files??[]);
      if(!chosen.length||chosen.length>4)
        throw new Error("Select 1–4 local model/MP4 files for SHA-256 verification.");
      setProcessing(true);
      const found:Preview[]=[];
      const names=new Set<string>();
      let hasModel=false;
      for(const file of chosen){
        const max=file.name==="model.json"?SCHEDULE_LIMITS.maxModelBytes:
          SCHEDULE_LIMITS.maxVideoBytes;
        if(!["model.json","video.mp4","comparison.mp4"].includes(file.name)||
           file.size<1||file.size>max)
          throw new Error("Choose bounded generated model.json, video.mp4 or comparison.mp4 files.");
        const sha256=await hashFile(file);
        const matched=matchNeuralScheduleFile(report,{
          name:file.name,size:file.size,sha256,
        });
        if(names.has(matched.kind))
          throw new Error("Selected files include duplicate copies of a model or video.");
        names.add(matched.kind);
        if(matched.kind==="model"){hasModel=true;continue;}
        const url=URL.createObjectURL(file);
        created.push(url);
        found.push({matched,url});
      }
      if(token!==revision.current)return;
      objectUrls.current=created.splice(0);
      found.sort((a,b)=>["base","selected","comparison"].indexOf(a.matched.kind)-
                         ["base","selected","comparison"].indexOf(b.matched.kind));
      setPreviews(found);setModelVerified(hasModel);
      setNotice("Verified "+names.size+" actual locally selected SHA-256 file hash(es).");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Could not verify local model/video files.");
    }finally{
      created.forEach(url=>URL.revokeObjectURL(url));
      if(token===revision.current)setProcessing(false);
    }
  };
  return (
    <details className="rounded-lg border border-sky-400/25 bg-slate-950/60 p-4 sm:p-5"
      aria-labelledby="neural-schedule-title">
      <summary id="neural-schedule-title"
        className="flex cursor-pointer items-center gap-2 font-semibold text-sky-200">
        <BrainCircuit className="h-5 w-5"/>Neural v2 · Leak-free replay schedule selection on CPU
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-slate-300">
          Try 1–3 causal training replay schedules on your existing neural v2 checkpoint.
          Candidate schedules are chosen by a <strong>separate inner validation window
          inside the original training prefix</strong>. The original final 25% held-out
          footage is used <strong>only after selection</strong>, to measure genuine
          one-, four-, and eight-step prediction errors. The unchanged model remains
          an option when every candidate fails to improve inner validation.
        </p>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium text-slate-100">1. Compare teacher replay schedules without outer-holdout leakage</h4>
          <p className="text-sm text-slate-300">
            Use <code>eternyx-neural-v2-model/model.json</code> with its original
            unchanged owner-reviewed 16 FPS source MP4s in <code>./local-video-media</code>.
            The local CPU tool verifies source SHA-256 and requires at least
            32 frames per clip. It never overwrites the original checkpoint.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Distinct teacher replay percentages (max 3)
              <Input value={mixText} className="border-slate-700 bg-slate-950"
                aria-label="Neural schedule teacher replay options"
                onChange={e=>setMixText(e.target.value)}
                placeholder="0, 50, 100"/>
            </label>
            <label className="space-y-1 text-sm">Training and sampling seed
              <Input type="number" min={0} max={2147483647} step={1} value={seed}
                onChange={e=>setSeed(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">CPU epochs per candidate (1–2)
              <Input type="number" min={1} max={2} step={1} value={epochs}
                onChange={e=>setEpochs(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">MP4 preview duration (1–2 seconds)
              <Input type="number" min={1} max={2} step={1} value={seconds}
                onChange={e=>setSeconds(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Temporal stability (0–85%)
              <Input type="number" min={0} max={85} step={1} value={stability}
                onChange={e=>setStability(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Seeded variation (0–20%)
              <Input type="number" min={0} max={20} step={1} value={variation}
                onChange={e=>setVariation(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
          </div>
          {validation&&<p role="alert" className="text-sm text-amber-200">{validation}</p>}
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-sky-200">
            {command||"Correct the schedule settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!command} onClick={()=>{void copy();}}>
            <Copy className="mr-2 h-4 w-4"/>Copy CPU replay schedule command
          </Button>
          <p className="text-xs text-slate-400">
            Runs 1–3 actual neural adaptation experiments plus an unchanged baseline,
            selects only on four INNER-prefix frames, then refits the selected mix on
            the complete original training prefix. Creates
            <code className="mx-1">{paths.report}</code> and verified local videos.
          </p>
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium text-slate-100">2. Inspect measured inner selection and independent outer audit</h4>
          <label className="block space-y-1 text-sm">Choose local schedule-report.json
            <Input type="file" accept=".json,application/json"
              aria-label="CPU neural schedule selection report"
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importReport(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
          </label>
          {report&&<div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 text-emerald-200">
              <CheckCircle2 className="h-4 w-4"/>
              Inner-prefix-only schedule decision · {report.sources.length} verified source clip(s)
            </p>
            <p className="text-sm text-slate-200">
              Chosen strategy: <strong>{report.strategy.selected_mix_percent===null?
                "unchanged base model":report.strategy.selected_mix_percent+"% replay + causal training"}</strong>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-slate-700 text-slate-300">
                  <th className="p-2">Schedule</th>
                  <th className="p-2">Inner 4-step MSE</th>
                  <th className="p-2">Example count</th>
                </tr></thead>
                <tbody>{report.strategy.candidates.map(row=><tr key={row.name}
                  className="border-b border-slate-800">
                  <th className="p-2">{row.mix_percent===null?"Original model":row.mix_percent+"% replay"}</th>
                  <td className="p-2 tabular-nums">{row.inner_four_step_mse.toFixed(6)}</td>
                  <td className="p-2 tabular-nums">{row.optimizer_examples}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">
              Selection uses only original training-prefix frames. The final outer
              holdout was NOT used to decide or retrain the selected schedule.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-slate-700 text-slate-300">
                  <th className="p-2">Outer held-out horizon</th>
                  <th className="p-2">Original MSE</th>
                  <th className="p-2">Selected MSE</th>
                  <th className="p-2">Static MSE</th>
                </tr></thead>
                <tbody>{[1,4,8].map(step=>{
                  const before=report.final_outer_audit.before[String(step)];
                  const after=report.final_outer_audit.after[String(step)];
                  return <tr key={step} className="border-b border-slate-800">
                    <th className="p-2">{step} step{step===1?"":"s"}</th>
                    <td className="p-2 tabular-nums">{before.model_mse.toFixed(6)}</td>
                    <td className="p-2 tabular-nums">{after.model_mse.toFixed(6)}</td>
                    <td className="p-2 tabular-nums">{after.static_baseline_mse.toFixed(6)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">
              An inner-validation gain does not guarantee a gain on unseen outer data.
              Pixel MSE can reward static/blurred frames; it is not a photorealism or
              cinematic-quality score. Human review remains essential.
            </p>
          </div>}
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="flex items-center gap-2 font-medium text-slate-100">
            <FileCheck2 className="h-4 w-4"/>3. Verify real selected checkpoint and compare rendered H.264 videos
          </h4>
          <p className="text-sm text-slate-300">
            After loading <code>{paths.report}</code>, select the generated
            <code className="mx-1">model.json</code>, individual <code>video.mp4</code>
            files and/or <code>comparison.mp4</code>. Real file bytes are checked
            against local SHA-256 receipts; previews stay on your device.
          </p>
          <label className="block space-y-1 text-sm">Select model.json, video.mp4 and/or comparison.mp4 files
            <Input type="file" multiple accept=".mp4,.json,video/mp4,application/json"
              aria-label="CPU neural schedule selected model and video evidence"
              disabled={!report||processing}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importFiles(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {processing&&<p role="status" className="text-sm text-sky-200">Verifying actual local video and model bytes…</p>}
          {modelVerified&&<p role="status" className="text-sm text-emerald-200">
            Selected trained model SHA-256 matches its local schedule receipt.
          </p>}
          {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
          {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
          {previews.length>0&&<div className="grid gap-3 lg:grid-cols-3">
            {previews.map(p=><div key={p.matched.kind}
              className="space-y-2 rounded border border-slate-700 bg-slate-950 p-3">
              <p className="text-sm font-medium text-emerald-200">{LABELS[p.matched.kind]}</p>
              <video src={p.url} controls playsInline preload="metadata"
                aria-label={"Verified "+LABELS[p.matched.kind]}
                className="w-full rounded border border-slate-700 bg-black"/>
              <p className="text-xs text-slate-400">Local MP4 SHA-256 matches report ·
                {" "}{report?.sampling.seconds*16} reported output frames
              </p>
            </div>)}
          </div>}
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          All training and FFmpeg video output happen on CPU locally.
          No external AI API, paid GPU, cloud video upload or new subscription.
          Matching hashes prove only local receipt consistency, not signed ownership.
          This is a tiny experimental neural texture model, not realistic text-to-video.
        </p>
      </div>
    </details>
  );
}
