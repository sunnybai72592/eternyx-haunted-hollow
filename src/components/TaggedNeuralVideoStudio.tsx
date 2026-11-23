import {useEffect,useRef,useState} from "react";
import {BrainCircuit,CheckCircle2,Copy,FileVideo2,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  TAG_VIDEO_LIMITS,trainTaggedVideoCommand,generateTaggedVideoCommand,
  compareTaggedVideoCommand,taggedVideoPaths,readTaggedTrainingReport,
  matchTaggedAdapter,readTaggedComparisonReport,matchTaggedComparisonVideo,
} from "@/lib/ai/taggedNeuralVideo.mjs";

type Training=ReturnType<typeof readTaggedTrainingReport>;
type Comparison=ReturnType<typeof readTaggedComparisonReport>;
type Media={kind:string;url:string};
async function localSha(file:File){
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("A secure browser context is required for local SHA-256.");
  const hash=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}
export default function TaggedNeuralVideoStudio(){
  const [firstFile,setFirstFile]=useState("sunrise.mp4");
  const [secondFile,setSecondFile]=useState("ocean.mp4");
  const [firstTag,setFirstTag]=useState("warm");
  const [secondTag,setSecondTag]=useState("cool");
  const [seed,setSeed]=useState(42);
  const [epochs,setEpochs]=useState(2);
  const [seconds,setSeconds]=useState(1);
  const [stability,setStability]=useState(45);
  const [variation,setVariation]=useState(6);
  const [profile,setProfile]=useState("landscape");
  const [quality,setQuality]=useState("standard");
  const [training,setTraining]=useState<Training|null>(null);
  const [comparison,setComparison]=useState<Comparison|null>(null);
  const [modelVerified,setModelVerified]=useState(false);
  const [previews,setPreviews]=useState<Media[]>([]);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const revision=useRef(0);
  const urls=useRef<string[]>([]);
  const reset=()=>{
    revision.current++;
    urls.current.forEach(url=>URL.revokeObjectURL(url));
    urls.current=[];
    setPreviews([]);setModelVerified(false);setWorking(false);
  };
  useEffect(()=>()=>{revision.current++;urls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  const paths=taggedVideoPaths();
  let trainCommand="",generateCommand="",compareCommand="",validation="";
  try{
    trainCommand=trainTaggedVideoCommand({sources:[
      {file:firstFile,tag:firstTag},{file:secondFile,tag:secondTag}],epochs,seed});
    generateCommand=generateTaggedVideoCommand({
      tag:firstTag,seconds,seed,profile,quality,stability,variation});
    compareCommand=compareTaggedVideoCommand({
      firstTag,secondTag,seconds,seed});
  }catch(cause){validation=cause instanceof Error?cause.message:"Choose valid trained tag settings.";}
  const copy=async(command:string)=>{
    try{
      if(!navigator.clipboard?.writeText)throw new Error();
      await navigator.clipboard.writeText(command);
      setNotice("Local trained-style command copied.");setError("");
    }catch{setError("Clipboard blocked. Select and copy the command directly.");}
  };
  const loadTraining=async(files:FileList|null)=>{
    reset();setError("");setNotice("");setTraining(null);
    const token=revision.current;
    try{
      const chosen=Array.from(files??[]);
      const model=chosen.find(f=>f.name==="tag-model.json");
      const reportFile=chosen.find(f=>f.name==="training-report.json");
      if(chosen.length!==2||!model||!reportFile||model.size<1||
         model.size>TAG_VIDEO_LIMITS.modelBytes||reportFile.size<1||
         reportFile.size>TAG_VIDEO_LIMITS.reportBytes)
        throw new Error("Choose actual tag-model.json and training-report.json together.");
      setWorking(true);
      const report=readTaggedTrainingReport(await reportFile.text());
      const matched=matchTaggedAdapter(report,{
        name:model.name,size:model.size,sha256:await localSha(model)});
      if(token!==revision.current)return;
      setTraining(report);setModelVerified(matched.matched);
      setNotice("Learned adapter bytes match the local source/holdout training report.");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Could not validate adapter.");
    }finally{if(token===revision.current)setWorking(false);}
  };
  const loadComparison=async(file:File|undefined)=>{
    reset();setComparison(null);setError("");setNotice("");
    const token=revision.current;
    try{
      if(!file||file.name!=="comparison-report.json"||file.size<1||
         file.size>TAG_VIDEO_LIMITS.reportBytes)
        throw new Error("Choose the actual local comparison-report.json file.");
      const report=readTaggedComparisonReport(await file.text());
      if(token!==revision.current)return;
      setComparison(report);
      setNotice("Real two-tag comparison loaded; select the actual MP4 files to inspect.");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Invalid tag comparison receipt.");
    }
  };
  const loadVideos=async(files:FileList|null)=>{
    reset();setNotice("");setError("");
    const token=revision.current;
    const created:string[]=[];
    try{
      if(!comparison)throw new Error("Load the local comparison-report.json first.");
      const chosen=Array.from(files??[]);
      if(!chosen.length||chosen.length>3)
        throw new Error("Choose up to three locally generated MP4 files.");
      setWorking(true);
      const found:Media[]=[];
      const labels=new Set();
      for(const file of chosen){
        if(!["video.mp4","comparison.mp4"].includes(file.name)||
           file.size<1||file.size>TAG_VIDEO_LIMITS.videoBytes)
          throw new Error("Choose actual generated video.mp4 / comparison.mp4 (≤64 MiB).");
        const matched=matchTaggedComparisonVideo(comparison,{
          name:file.name,size:file.size,sha256:await localSha(file)});
        if(labels.has(matched.kind))throw new Error("Duplicate tag video selected.");
        labels.add(matched.kind);
        const url=URL.createObjectURL(file);
        created.push(url);
        found.push({kind:matched.kind,url});
      }
      if(token!==revision.current)return;
      urls.current=created.splice(0);
      setPreviews(found);
      setNotice("Verified "+found.length+" actual local MP4 SHA-256 digest(s).");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Could not verify MP4s.");
    }finally{
      created.forEach(url=>URL.revokeObjectURL(url));
      if(token===revision.current)setWorking(false);
    }
  };
  return (
    <details className="rounded-lg border border-amber-400/25 bg-slate-950/60 p-4 sm:p-5"
      aria-labelledby="tagged-neural-title">
      <summary id="tagged-neural-title" className="flex cursor-pointer items-center gap-2 font-semibold text-amber-200">
        <BrainCircuit className="h-5 w-5"/>Neural v2 · Learn real footage style labels on CPU
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-slate-300">
          Train tiny, genuine per-label neural adapters using original licensed footage.
          Each short human-defined label learns color/texture offsets on the frozen neural
          v2 model. Generate abstract videos with different trained tags under the same
          seed. <strong>These are learned style labels, not natural-language prompts
          or photorealistic text-to-video.</strong>
        </p>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="font-medium text-slate-100">1. Train two labels from different verified video sources</h4>
          <p className="text-sm text-slate-300">
            Use your existing <code>eternyx-neural-v2-model/model.json</code>
            with its unchanged original 16 FPS MP4s in <code>./local-video-media</code>.
            The base checkpoint must have been trained on exactly two listed source
            videos for this Studio workflow. Both original clip SHA-256 values and
            rights references are checked. Labels are not inferred from filenames.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">First verified MP4 filename
              <Input value={firstFile} onChange={e=>setFirstFile(e.target.value)}
                aria-label="First local video source" className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">First learned style label
              <Input value={firstTag} onChange={e=>setFirstTag(e.target.value)}
                aria-label="First learned neural style tag" className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Second verified MP4 filename
              <Input value={secondFile} onChange={e=>setSecondFile(e.target.value)}
                aria-label="Second local video source" className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Second learned style label
              <Input value={secondTag} onChange={e=>setSecondTag(e.target.value)}
                aria-label="Second learned neural style tag" className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">CPU training epochs (1–4)
              <Input type="number" value={epochs} min={1} max={4} step={1}
                onChange={e=>setEpochs(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Sampling and training seed
              <Input type="number" value={seed} min={0} max={2147483647} step={1}
                onChange={e=>setSeed(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
          </div>
          {validation&&<p role="alert" className="text-sm text-amber-200">{validation}</p>}
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-amber-200">
            {trainCommand||"Correct the tag training inputs."}
          </code>
          <Button size="sm" variant="outline" disabled={!trainCommand}
            onClick={()=>{void copy(trainCommand);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy local tag training command
          </Button>
          <p className="text-xs text-slate-400">
            Creates <code>{paths.model}</code> and <code>{paths.training}</code>.
            Trains only tiny per-tag neural adapter weights; the original base is frozen.
          </p>
        </section>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="font-medium text-slate-100">2. Generate a trained style or compare two styles</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Video duration (1–3 seconds)
              <Input type="number" value={seconds} min={1} max={3} step={1}
                onChange={e=>setSeconds(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Temporal stability (0–85%)
              <Input type="number" value={stability} min={0} max={85} step={1}
                onChange={e=>setStability(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Seeded variation (0–20%)
              <Input type="number" value={variation} min={0} max={20} step={1}
                onChange={e=>setVariation(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Output profile
              <select value={profile} onChange={e=>setProfile(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {["landscape","portrait","square"].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">Output scale
              <select value={quality} onChange={e=>setQuality(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {["standard","high"].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-400">Single tagged-video command:</p>
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-amber-200">
            {generateCommand||"Choose valid generation settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!generateCommand}
            onClick={()=>{void copy(generateCommand);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy tagged generation command
          </Button>
          <p className="text-xs text-slate-400">Side-by-side same-seed tag comparison command:</p>
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-amber-200">
            {compareCommand||"Choose two distinct trained labels."}
          </code>
          <Button size="sm" variant="outline" disabled={!compareCommand}
            onClick={()=>{void copy(compareCommand);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy same-seed trained-tag comparison command
          </Button>
        </section>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="flex items-center gap-2 font-medium text-slate-100">
            <FileVideo2 className="h-4 w-4"/>3. Verify real learning evidence and local MP4 output
          </h4>
          <label className="block space-y-1 text-sm">Select tag-model.json plus training-report.json
            <Input type="file" multiple accept=".json,application/json" disabled={working}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void loadTraining(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {training&&modelVerified&&<div role="status" className="space-y-1 text-xs text-emerald-200">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>
              Actual trained tag model matches the reported SHA-256.
            </p>
            {training.tags.map(t=><p key={t}>
              {t}: train MSE {training.metrics[t].train_mse_before.toFixed(5)}
              {" → "}{training.metrics[t].train_mse_after.toFixed(5)}
              {" · "}held-out tag MSE {training.metrics[t].holdout_style_mse.toFixed(5)}
              {" · "}frozen base MSE {training.metrics[t].holdout_frozen_base_mse.toFixed(5)}
            </p>)}
          </div>}
          <label className="block space-y-1 text-sm">Select comparison-report.json
            <Input type="file" accept=".json,application/json" disabled={working}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void loadComparison(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
          </label>
          {comparison&&<p className="text-xs text-slate-300">
            Tags: {comparison.tags.join(" versus ")} · same seed {comparison.seed}
            {" · "}{comparison.seconds*16} actual frames reported per output
          </p>}
          <label className="block space-y-1 text-sm">Select actual two video.mp4 files and/or comparison.mp4
            <Input type="file" multiple accept=".mp4,video/mp4" disabled={!comparison||working}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void loadVideos(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {working&&<p role="status" className="text-sm text-amber-200">Verifying actual local file bytes…</p>}
          {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
          {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
          {previews.length>0&&<div className="grid gap-3 lg:grid-cols-3">
            {previews.map(p=><div key={p.kind} className="space-y-2 rounded border border-slate-700 bg-slate-950 p-3">
              <p className="text-sm font-medium text-emerald-200">{p.kind==="comparison"?"Side-by-side tags":p.kind+" neural tag"}</p>
              <video src={p.url} controls playsInline preload="metadata"
                aria-label={"Verified local "+p.kind+" tag video"}
                className="w-full rounded border border-slate-700 bg-black"/>
              <p className="text-xs text-slate-400">Actual MP4 SHA-256 and size verified locally.</p>
            </div>)}
          </div>}
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          Small learned label-controlled color/texture, not semantic language understanding,
          natural-language video generation, realistic people or cinematic output.
          Training and output run on your CPU with local FFmpeg. No paid GPU, external
          AI API or media upload. Keep private source-derived adapters private.
        </p>
      </div>
    </details>
  );
}
