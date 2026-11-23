import {useEffect,useRef,useState} from "react";
import {Clapperboard,Copy,FileCheck2,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  neuralComparisonCommand,neuralComparisonOutputPaths,
  readNeuralComparisonReport,matchNeuralComparisonVideo,NEURAL_COMPARISON_LIMITS,
} from "@/lib/ai/cpuNeuralComparison.mjs";

type Receipt=ReturnType<typeof readNeuralComparisonReport>;
type Match=ReturnType<typeof matchNeuralComparisonVideo>;
type Preview={matched:Match;url:string};
const labels:Record<string,string>={
  v1:"Neural v1 · 32×18 learned pixels",
  v2:"Neural v2 · 48×28 learned pixels",
  comparison:"Actual side-by-side · v1 left / v2 right",
};
async function localHash(file:File){
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("Local SHA-256 needs a secure browser context.");
  const raw=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(raw),n=>n.toString(16).padStart(2,"0")).join("");
}
export default function CpuNeuralModelComparison(){
  const [rights,setRights]=useState("owner-reviewed-video");
  const [seed,setSeed]=useState(42);
  const [epochs,setEpochs]=useState(1);
  const [seconds,setSeconds]=useState(1);
  const [report,setReport]=useState<Receipt|null>(null);
  const [previews,setPreviews]=useState<Preview[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const version=useRef(0);
  const objectUrls=useRef<string[]>([]);
  const revoke=()=>{
    objectUrls.current.forEach(u=>URL.revokeObjectURL(u));
    objectUrls.current=[];
  };
  useEffect(()=>()=>{version.current++;objectUrls.current.forEach(u=>URL.revokeObjectURL(u));},[]);
  const clear=()=>{
    version.current++;
    revoke();
    setPreviews([]);setBusy(false);
  };
  const paths=neuralComparisonOutputPaths();
  let command="",validation="";
  try{command=neuralComparisonCommand({rightsRef:rights,seed,epochs,seconds});}
  catch(cause){validation=cause instanceof Error?cause.message:"Check comparison inputs.";}
  const copy=async()=>{
    try{
      if(!navigator.clipboard?.writeText)throw new Error();
      await navigator.clipboard.writeText(command);
      setNotice("Offline comparison command copied.");setError("");
    }catch{
      setError("Clipboard access unavailable. Select and copy the command below.");
    }
  };
  const importReport=async(file:File|undefined)=>{
    clear();
    const current=version.current;
    setReport(null);setNotice("");setError("");
    try{
      if(!file||file.name!=="comparison-report.json"||!file.size||
         file.size>NEURAL_COMPARISON_LIMITS.maxReportBytes)
        throw new Error("Choose actual local comparison-report.json (maximum 64 KiB).");
      const parsed=readNeuralComparisonReport(await file.text());
      if(current!==version.current)return;
      setReport(parsed);
      setNotice("Matched-source and measured eight-step report loaded; now select actual MP4s.");
    }catch(cause){
      if(current===version.current)setError(cause instanceof Error?cause.message:"Invalid local comparison report.");
    }
  };
  const importMp4s=async(files:FileList|null)=>{
    clear();
    const current=version.current;
    setNotice("");setError("");
    const created:string[]=[];
    try{
      if(!report)throw new Error("Import comparison-report.json before selecting videos.");
      const selected=Array.from(files??[]);
      if(!selected.length||selected.length>3)
        throw new Error("Select 1–3 actual comparison MP4s.");
      setBusy(true);
      const results:Preview[]=[];
      const kinds=new Set<string>();
      for(const file of selected){
        if(!["video.mp4","comparison.mp4"].includes(file.name)||
           file.size<1||file.size>NEURAL_COMPARISON_LIMITS.maxVideoBytes)
          throw new Error("Choose the actual generated video.mp4 and comparison.mp4 files (≤64 MiB).");
        const sha256=await localHash(file);
        const matched=matchNeuralComparisonVideo(report,{
          name:file.name,size:file.size,sha256,
        });
        if(kinds.has(matched.kind))throw new Error("One selected MP4 duplicates a comparison video.");
        kinds.add(matched.kind);
        const url=URL.createObjectURL(file);
        created.push(url);
        results.push({matched,url});
      }
      if(current!==version.current)return;
      objectUrls.current=created.splice(0);
      results.sort((a,b)=>["v1","v2","comparison"].indexOf(a.matched.kind)-
                          ["v1","v2","comparison"].indexOf(b.matched.kind));
      setPreviews(results);
      setNotice("Matched "+results.length+" actual local MP4 SHA-256 hash(es) against the comparison report.");
    }catch(cause){
      if(current===version.current)setError(cause instanceof Error?cause.message:"Failed to inspect MP4s.");
    }finally{
      created.forEach(url=>URL.revokeObjectURL(url));
      if(current===version.current)setBusy(false);
    }
  };
  return(
    <details className="rounded-lg border border-cyan-400/25 bg-slate-950/60 p-4 sm:p-5"
      aria-labelledby="neural-comparison-title">
      <summary id="neural-comparison-title" className="flex cursor-pointer items-center gap-2 font-semibold text-cyan-200">
        <Clapperboard className="h-5 w-5"/>Fair neural v1 vs v2 comparison · Same footage · CPU-only
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-slate-300">
          Test both genuinely trained neural models on the <strong>same 16 FPS licensed clips</strong>.
          The local CPU tool enforces an identical temporal training/holdout split,
          checks one-, four-, and eight-step free-running prediction error on the
          <strong> same 48×28 quantized targets</strong>, times the real runs, and creates
          verified v1/v2 H.264 MP4s plus one side-by-side video.
          Lower pixel MSE <strong>does not prove better visual quality</strong>.
        </p>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium text-slate-100">1. Train and benchmark both neural models offline</h4>
          <p className="text-sm text-slate-300">
            Put 1–3 owner-approved constant 16 FPS MP4s (at least 32 decoded frames each)
            in <code>./local-video-media</code> of a local ETERNYX checkout. This
            benchmark trains <strong>new v1 and v2 checkpoints</strong>, and never overwrites
            your previous model training outputs. Use clips you have rights to process.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">Footage rights reference
              <Input value={rights} maxLength={80} onChange={e=>setRights(e.target.value)}
                aria-label="Comparison footage rights reference" className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">Training/sampling seed
              <Input type="number" min={0} max={2147483647} step={1} value={seed}
                onChange={e=>setSeed(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">CPU epochs per model (1–2)
              <Input type="number" min={1} max={2} step={1} value={epochs}
                onChange={e=>setEpochs(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">Sample duration (1–2 seconds)
              <Input type="number" min={1} max={2} step={1} value={seconds}
                onChange={e=>setSeconds(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
          </div>
          {validation&&<p role="alert" className="text-sm text-amber-200">{validation}</p>}
          <code className="block select-all overflow-x-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-6 text-cyan-200">
            {command||"Correct comparison inputs."}
          </code>
          <Button size="sm" variant="outline" disabled={!command}
            onClick={()=>{void copy();}}>
            <Copy className="mr-2 h-4 w-4"/>Copy local CPU comparison command
          </Button>
          <p className="text-xs leading-5 text-slate-400">
            Creates <code>{paths.report}</code>, separate v1/v2 training reports and
            playable videos at <code>{paths.v1}</code>, <code>{paths.v2}</code>,
            and <code>{paths.comparison}</code>. The 512×144 split video
            places v1 on the left and v2 on the right.
          </p>
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium text-slate-100">2. Inspect actual matched-source predictive errors</h4>
          <p className="text-sm text-slate-300">
            Import the locally generated comparison report; values come from measured
            held-out frame predictions and monotonic CPU wall-clock timings—not estimates.
          </p>
          <label className="block space-y-1 text-sm">Select comparison-report.json
            <Input type="file" accept=".json,application/json"
              aria-label="Neural model comparison report"
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importReport(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
          </label>
          {report&&<div className="space-y-3 text-sm">
            <p className="text-emerald-200">
              {report.sources.length} source clip(s) · identical 75/25 temporal split · 8 held-out steps · 48×28 evaluation target
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-slate-700 text-slate-300">
                  <th className="p-2">Causal rollout</th>
                  <th className="p-2">Neural v1 MSE</th>
                  <th className="p-2">Neural v2 MSE</th>
                  <th className="p-2">Static baseline MSE</th>
                </tr></thead>
                <tbody>{[1,4,8].map(n=>{
                  const row=report.evaluation.windows[String(n)];
                  return <tr key={n} className="border-b border-slate-800">
                    <th className="p-2 font-medium">{n} step{n===1?"":"s"}</th>
                    <td className="p-2 tabular-nums">{row.v1_mse.toFixed(6)}</td>
                    <td className="p-2 tabular-nums">{row.v2_mse.toFixed(6)}</td>
                    <td className="p-2 tabular-nums">{row.static_baseline_mse.toFixed(6)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <p className="text-xs text-slate-300">
              V1 predictions are upscaled with nearest-neighbor sampling from 32×18;
              V2 predictions are native 48×28. This is a matched target and shared temporal
              split, not identical model capacity. No assertion that v2 is better.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-300">
              <p>V1 CPU training: {report.cpu_elapsed_seconds.v1_training.toFixed(3)} s</p>
              <p>V2 CPU training: {report.cpu_elapsed_seconds.v2_training.toFixed(3)} s</p>
              <p>V1 encode/render: {report.cpu_elapsed_seconds.v1_sample_and_render.toFixed(3)} s</p>
              <p>V2 encode/render: {report.cpu_elapsed_seconds.v2_sample_and_render.toFixed(3)} s</p>
            </div>
            <p className="text-xs text-slate-400">
              Wall-clock measurements are local, single-run and hardware-dependent;
              they cannot establish a universal performance ranking.
            </p>
          </div>}
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="flex items-center gap-2 font-medium text-slate-100">
            <FileCheck2 className="h-4 w-4"/>3. Verify and play actual locally rendered MP4s
          </h4>
          <p className="text-sm text-slate-300">
            After importing the report, select 1–3 generated MP4s. Both individual
            files are called <code>video.mp4</code>; the combined file is
            <code> comparison.mp4</code>. Your browser hashes the actual selected files
            and matches each against its exact reported SHA-256 and byte length.
          </p>
          <label className="block space-y-1 text-sm">Choose real v1, v2 and/or combined comparison MP4s
            <Input type="file" multiple accept=".mp4,video/mp4" disabled={!report||busy}
              aria-label="Local neural comparison MP4 files"
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importMp4s(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {busy&&<p role="status" className="text-sm text-cyan-200">Checking MP4 bytes locally…</p>}
          {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
          {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
          {previews.length>0&&<div className="grid gap-3 lg:grid-cols-3">
            {previews.map(preview=><div key={preview.matched.kind}
              className="space-y-2 rounded border border-slate-700 bg-slate-950 p-3">
              <p className="text-sm font-medium text-emerald-200">
                {labels[preview.matched.kind]}
              </p>
              <video src={preview.url} controls playsInline preload="metadata"
                aria-label={"Verified "+labels[preview.matched.kind]}
                className="w-full rounded border border-slate-700 bg-black"/>
              <p className="text-xs text-slate-400">{preview.matched.frames} frames · SHA-256 matched to local receipt</p>
            </div>)}
          </div>}
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          Training and H.264 rendering happen offline with CPU FFmpeg. Browser previews
          stay on your device. A matching local report is not a digital signature;
          trained checkpoints may leak source-video appearance statistics. These remain
          abstract neural textures, not photorealistic text-to-video or prompt understanding.
          No paid GPU, remote AI API or video upload.
        </p>
      </div>
    </details>
  );
}
