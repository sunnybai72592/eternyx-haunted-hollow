import {useEffect,useRef,useState} from "react";
import {BrainCircuit,CheckCircle2,Copy,Film,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  SPATIAL_MOTION_LIMITS,spatialMotionTrainCommand,
  spatialMotionGenerateCommand,spatialMotionCompareCommand,
  spatialMotionPaths,readSpatialMotionTraining,matchSpatialMotionModel,
  readSpatialMotionComparison,matchSpatialMotionVideo,
} from "@/lib/ai/spatialMotionVideo.mjs";

type Training=ReturnType<typeof readSpatialMotionTraining>;
type Comparison=ReturnType<typeof readSpatialMotionComparison>;
type Video={kind:string;url:string};
async function digest(file:File){
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("Secure local browser required for SHA-256 verification.");
  const hash=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,"0")).join("");
}
const LABELS:Record<string,string>={
  global:"Original learned tag · global motion",
  spatial:"Spatially learned tag motion · 4×3 regions",
  comparison:"Real MP4 comparison · global left / spatial right",
};

export default function SpatialNeuralMotionStudio(){
  const [tag,setTag]=useState("warm");
  const [epochs,setEpochs]=useState(2);
  const [seed,setSeed]=useState(42);
  const [seconds,setSeconds]=useState(1);
  const [strength,setStrength]=useState(85);
  const [stability,setStability]=useState(45);
  const [variation,setVariation]=useState(6);
  const [training,setTraining]=useState<Training|null>(null);
  const [comparison,setComparison]=useState<Comparison|null>(null);
  const [modelVerified,setModelVerified]=useState(false);
  const [videos,setVideos]=useState<Video[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const revision=useRef(0);
  const objectUrls=useRef<string[]>([]);
  const reset=()=>{
    revision.current++;
    objectUrls.current.forEach(url=>URL.revokeObjectURL(url));
    objectUrls.current=[];
    setVideos([]);setModelVerified(false);setBusy(false);
  };
  useEffect(()=>()=>{revision.current++;objectUrls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  const paths=spatialMotionPaths();
  let trainingCommand="",sampleCommand="",comparisonCommand="",validation="";
  try{
    trainingCommand=spatialMotionTrainCommand({epochs,seed});
    sampleCommand=spatialMotionGenerateCommand({tag,seconds,seed,strength,stability,variation});
    comparisonCommand=spatialMotionCompareCommand({tag,seconds,seed,strength});
  }catch(cause){
    validation=cause instanceof Error?cause.message:"Invalid local motion controls.";
  }
  const copy=async(value:string)=>{
    try{
      if(!navigator.clipboard?.writeText)throw new Error();
      await navigator.clipboard.writeText(value);
      setNotice("Local CPU motion command copied.");setError("");
    }catch{setError("Clipboard unavailable; select and copy the displayed command.");}
  };
  const importTraining=async(files:FileList|null)=>{
    reset();setError("");setNotice("");setTraining(null);
    const token=revision.current;
    try{
      const selected=Array.from(files??[]);
      const model=selected.find(x=>x.name==="motion-model.json");
      const receipt=selected.find(x=>x.name==="training-report.json");
      if(selected.length!==2||!model||!receipt||
         model.size<1||model.size>SPATIAL_MOTION_LIMITS.modelBytes||
         receipt.size<1||receipt.size>SPATIAL_MOTION_LIMITS.reportBytes)
        throw new Error("Choose actual motion-model.json and training-report.json together.");
      setBusy(true);
      const parsed=readSpatialMotionTraining(await receipt.text());
      matchSpatialMotionModel(parsed,{name:model.name,
        size:model.size,sha256:await digest(model)});
      if(token!==revision.current)return;
      setTraining(parsed);setModelVerified(true);
      setNotice("Real motion model SHA-256 matches the local training receipt.");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Could not verify motion model.");
    }finally{if(token===revision.current)setBusy(false);}
  };
  const importComparison=async(file:File|undefined)=>{
    reset();setComparison(null);setError("");setNotice("");
    const token=revision.current;
    try{
      if(!file||file.name!=="comparison-report.json"||
         file.size<1||file.size>SPATIAL_MOTION_LIMITS.reportBytes)
        throw new Error("Choose actual comparison-report.json (up to 64 KiB).");
      const parsed=readSpatialMotionComparison(await file.text());
      if(token!==revision.current)return;
      setComparison(parsed);
      setNotice("Measured model identity and real generated-video receipt loaded.");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Invalid motion comparison receipt.");
    }
  };
  const importVideos=async(files:FileList|null)=>{
    reset();setError("");setNotice("");
    const token=revision.current;
    const created:string[]=[];
    try{
      if(!comparison)throw new Error("First import the generated comparison-report.json.");
      const selected=Array.from(files??[]);
      if(selected.length<1||selected.length>3)
        throw new Error("Choose 1–3 actual locally generated MP4 files.");
      setBusy(true);
      const seen=new Set<string>();
      const found:Video[]=[];
      for(const file of selected){
        if(!["video.mp4","comparison.mp4"].includes(file.name)||
           file.size<1||file.size>SPATIAL_MOTION_LIMITS.videoBytes)
          throw new Error("Choose actual bounded video.mp4 and/or comparison.mp4 files.");
        const verified=matchSpatialMotionVideo(comparison,{
          name:file.name,size:file.size,sha256:await digest(file)});
        if(seen.has(verified.kind))throw new Error("Duplicate MP4 sample selected.");
        seen.add(verified.kind);
        const url=URL.createObjectURL(file);
        created.push(url);
        found.push({kind:verified.kind,url});
      }
      if(token!==revision.current)return;
      objectUrls.current=created.splice(0);
      found.sort((a,b)=>["global","spatial","comparison"].indexOf(a.kind)-
                         ["global","spatial","comparison"].indexOf(b.kind));
      setVideos(found);
      setNotice("Actual local MP4 hash verified for "+found.length+" candidate(s).");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Could not match actual video bytes.");
    }finally{
      created.forEach(url=>URL.revokeObjectURL(url));
      if(token===revision.current)setBusy(false);
    }
  };
  return(
    <details className="rounded-lg border border-emerald-400/25 bg-slate-950/60 p-4 sm:p-5"
      aria-labelledby="spatial-motion-title">
      <summary id="spatial-motion-title" className="flex cursor-pointer items-center gap-2 font-semibold text-emerald-200">
        <BrainCircuit className="h-5 w-5"/>Neural v2 · Learned local motion for trained tags (CPU)
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-slate-300">
          Learn coarse motion from <strong>actual frame-to-frame displacements</strong>
          in 4×3 areas of your own approved clips. A small trainable nine-class
          neural softmax classifier predicts local movement from preceding-frame
          color and edge features. This extends the existing learned style tags,
          without changing the original v2 neural model or the tag adapter.
          <strong> It does not learn scene semantics or photorealistic motion.</strong>
        </p>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium text-slate-100">1. Learn local motion from your verified original clips</h4>
          <p className="text-sm text-slate-300">
            Use the original <code>eternyx-neural-v2-model/model.json</code> and
            <code className="mx-1">eternyx-neural-style-tags/tag-model.json</code>,
            with their unchanged source MP4s in <code>./local-video-media</code>.
            Training verifies the matching source SHA-256 and rights-reviewed
            temporal splits. The final 25% is held out from gradients.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">CPU motion training epochs (1–4)
              <Input type="number" min={1} max={4} step={1} value={epochs}
                onChange={e=>setEpochs(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Training and sampling seed
              <Input type="number" min={0} max={2147483647} step={1} value={seed}
                onChange={e=>setSeed(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
          </div>
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-emerald-200">
            {trainingCommand||"Correct local training settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!trainingCommand}
            onClick={()=>{void copy(trainingCommand);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy local spatial motion training command
          </Button>
          <p className="text-xs text-slate-400">
            Produces <code>{paths.model}</code> and <code>{paths.training}</code>.
            This is trained on real 4×3 video tile shifts—not a hard-coded pan.
          </p>
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="font-medium text-slate-100">2. Generate regional movement or compare against global motion</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Previously trained local style tag
              <Input value={tag} onChange={e=>setTag(e.target.value)}
                aria-label="Actual trained tag to animate"
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Duration (1–2 seconds)
              <Input type="number" min={1} max={2} step={1} value={seconds}
                onChange={e=>setSeconds(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Spatial motion strength (0–100%)
              <Input type="number" min={0} max={100} step={1} value={strength}
                onChange={e=>setStrength(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Temporal stability (0–85%)
              <Input type="number" min={0} max={85} step={1} value={stability}
                onChange={e=>setStability(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Seeded frame variation (0–20%)
              <Input type="number" min={0} max={20} step={1} value={variation}
                onChange={e=>setVariation(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
          </div>
          {validation&&<p role="alert" className="text-xs text-amber-200">{validation}</p>}
          <p className="text-xs text-slate-400">Generate a trained regional-motion MP4:</p>
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-emerald-200">
            {sampleCommand||"Correct sampling settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!sampleCommand}
            onClick={()=>{void copy(sampleCommand);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy local spatial motion generation command
          </Button>
          <p className="text-xs text-slate-400">Compare existing global movement with trained regional movement (same tag and seed):</p>
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-emerald-200">
            {comparisonCommand||"Correct comparison settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!comparisonCommand}
            onClick={()=>{void copy(comparisonCommand);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy actual same-seed motion comparison command
          </Button>
        </section>
        <section className="space-y-3 rounded border border-slate-700 bg-slate-900/40 p-3">
          <h4 className="flex items-center gap-2 font-medium text-slate-100">
            <Film className="h-4 w-4"/>3. Inspect learned motion evidence and real H.264 videos
          </h4>
          <label className="block space-y-1 text-sm">Choose motion-model.json and training-report.json together
            <Input type="file" multiple accept=".json,application/json" disabled={busy}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importTraining(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {training&&modelVerified&&<div role="status" className="space-y-2 text-xs text-emerald-200">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>
              Actual locally trained 4×3 motion-model SHA-256 verified.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr><th className="p-2">Tag</th><th className="p-2">Holdout neural accuracy</th>
                  <th className="p-2">Static baseline</th><th className="p-2">Global majority baseline</th></tr></thead>
                <tbody>{training.labels.map(t=><tr key={t} className="border-t border-slate-700">
                  <th className="p-2">{t}</th>
                  <td className="p-2">{(training.metrics[t].heldout.classifier_accuracy*100).toFixed(1)}%</td>
                  <td className="p-2">{(training.metrics[t].heldout.stationary_baseline_accuracy*100).toFixed(1)}%</td>
                  <td className="p-2">{(training.metrics[t].heldout.training_majority_baseline_accuracy*100).toFixed(1)}%</td>
                </tr>)}</tbody>
              </table>
            </div>
            <p className="text-slate-300">Heldout accuracy is a coarse block-match proxy; a high score does not prove superior perceived motion.</p>
          </div>}
          <label className="block space-y-1 text-sm">Choose real comparison-report.json
            <Input type="file" accept=".json,application/json" disabled={busy}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importComparison(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
          </label>
          {comparison&&<p className="text-xs text-emerald-200">
            Verified receipt: trained tag {comparison.tag}, {comparison.seconds*16} reported frames,
            original global motion compared with regional neural motion.
          </p>}
          <label className="block space-y-1 text-sm">Choose up to three actual video.mp4 and comparison.mp4 files
            <Input type="file" multiple accept=".mp4,video/mp4" disabled={!comparison||busy}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importVideos(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {busy&&<p role="status" className="text-sm text-emerald-200">Hashing local motion files…</p>}
          {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
          {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
          {videos.length>0&&<div className="grid gap-3 lg:grid-cols-3">
            {videos.map(v=><div key={v.kind} className="space-y-2 rounded border border-slate-700 bg-slate-950 p-3">
              <p className="text-sm font-medium text-emerald-200">{LABELS[v.kind]}</p>
              <video src={v.url} controls playsInline preload="metadata"
                aria-label={"Verified "+LABELS[v.kind]}
                className="w-full rounded border border-slate-700 bg-black"/>
              <p className="text-xs text-slate-400">Actual local MP4 SHA-256 and byte size match the self-reported receipt.</p>
            </div>)}
          </div>}
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          Learned regional shifts are a low-resolution approximation, not pixel-accurate
          optical flow, realistic video semantics or a diffusion model. Local file hashes
          provide integrity checks, not digital signatures. No paid GPU,
          external AI API or media upload.
        </p>
      </div>
    </details>
  );
}
