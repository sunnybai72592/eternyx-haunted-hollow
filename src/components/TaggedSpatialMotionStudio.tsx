import {useEffect,useRef,useState} from "react";
import {BrainCircuit,CheckCircle2,Copy,Move,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  SPATIAL_MOTION_LIMITS,trainSpatialMotionCommand,
  generateSpatialMotionCommand,compareSpatialMotionCommand,spatialMotionPaths,
  readSpatialMotionTraining,readSpatialMotionGeneration,
  readSpatialMotionComparison,matchSpatialMotionModel,matchSpatialMotionVideo,
} from "@/lib/ai/spatialMotionVideo.mjs";

type Evidence=ReturnType<typeof readSpatialMotionTraining>;
type Generation=ReturnType<typeof readSpatialMotionGeneration>;
type Comparison=ReturnType<typeof readSpatialMotionComparison>;
type Preview={kind:string;url:string};
async function fileHash(file:File){
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("Local SHA-256 needs a secure browser connection.");
  const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
export default function TaggedSpatialMotionStudio(){
  const [first,setFirst]=useState("warm");
  const [second,setSecond]=useState("cool");
  const [epochs,setEpochs]=useState(2);
  const [seed,setSeed]=useState(42);
  const [seconds,setSeconds]=useState(1);
  const [strength,setStrength]=useState(75);
  const [stability,setStability]=useState(45);
  const [variation,setVariation]=useState(6);
  const [seededMotion,setSeededMotion]=useState(false);
  const [profile,setProfile]=useState("landscape");
  const [quality,setQuality]=useState("standard");
  const [training,setTraining]=useState<Evidence|null>(null);
  const [modelVerified,setModelVerified]=useState(false);
  const [mediaReport,setMediaReport]=useState<Generation|Comparison|null>(null);
  const [videos,setVideos]=useState<Preview[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const revision=useRef(0);
  const urls=useRef<string[]>([]);
  const clean=()=>{
    revision.current++;
    urls.current.forEach(url=>URL.revokeObjectURL(url));
    urls.current=[];
    setVideos([]);setBusy(false);
  };
  useEffect(()=>()=>{revision.current++;urls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  let trainCommand="",generateCommand="",compareCommand="",validation="";
  try{
    trainCommand=trainSpatialMotionCommand({epochs,seed});
    generateCommand=generateSpatialMotionCommand({tag:first,seconds,seed,
      strength,stability,variation,seededMotion,profile,quality});
    compareCommand=compareSpatialMotionCommand({
      first,second,seconds,seed,strength});
  }catch(cause){validation=cause instanceof Error?cause.message:"Invalid CPU spatial-motion settings.";}
  const paths=spatialMotionPaths();
  const copy=async(text:string)=>{
    try{
      if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setError("");setNotice("Local CPU command copied.");
    }catch{setError("Clipboard blocked. Select and copy the command shown.");}
  };
  const importTraining=async(files:FileList|null)=>{
    const token=++revision.current;
    setTraining(null);setModelVerified(false);setNotice("");setError("");
    try{
      const list=Array.from(files??[]);
      const model=list.find(f=>f.name==="motion-model.json");
      const report=list.find(f=>f.name==="training-report.json");
      if(list.length!==2||!model||!report||
         model.size<1||model.size>SPATIAL_MOTION_LIMITS.modelBytes||
         report.size<1||report.size>SPATIAL_MOTION_LIMITS.reportBytes)
        throw new Error("Choose actual motion-model.json and training-report.json together.");
      setBusy(true);
      const parsed=readSpatialMotionTraining(await report.text());
      matchSpatialMotionModel(parsed,{
        name:model.name,size:model.size,sha256:await fileHash(model)});
      if(token!==revision.current)return;
      setTraining(parsed);setModelVerified(true);
      setNotice("Real trained spatial model bytes match the local training receipt.");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Invalid local motion evidence.");
    }finally{if(token===revision.current)setBusy(false);}
  };
  const importMediaReport=async(file:File|undefined)=>{
    clean();setError("");setNotice("");setMediaReport(null);
    const token=revision.current;
    try{
      if(!file||!["comparison-report.json","generation-report.json"].includes(file.name)||
         file.size<1||file.size>SPATIAL_MOTION_LIMITS.reportBytes)
        throw new Error("Choose a real local comparison-report.json or generation-report.json.");
      const parsed=file.name==="comparison-report.json"?
        readSpatialMotionComparison(await file.text()):
        readSpatialMotionGeneration(await file.text());
      if(token!==revision.current)return;
      setMediaReport(parsed);
      setNotice("Actual video report loaded. Select matching local MP4s to preview.");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Invalid video report.");
    }
  };
  const importVideoFiles=async(files:FileList|null)=>{
    clean();setNotice("");setError("");
    const token=revision.current;
    const created:string[]=[];
    try{
      if(!mediaReport)throw new Error("Import the real video report first.");
      const selected=Array.from(files??[]);
      if(!selected.length||selected.length>3)
        throw new Error("Select 1–3 actual generated MP4 files.");
      setBusy(true);
      const next:Preview[]=[];
      const kinds=new Set<string>();
      for(const file of selected){
        if(!["video.mp4","comparison.mp4"].includes(file.name)||
           file.size<1||file.size>SPATIAL_MOTION_LIMITS.videoBytes)
          throw new Error("Select only bounded local generated MP4 files.");
        const matched=matchSpatialMotionVideo(mediaReport,{
          name:file.name,size:file.size,sha256:await fileHash(file)});
        if(kinds.has(matched.kind))throw new Error("Duplicate trained tag video selected.");
        kinds.add(matched.kind);
        const url=URL.createObjectURL(file);
        created.push(url);
        next.push({kind:matched.kind,url});
      }
      if(token!==revision.current)return;
      urls.current=created.splice(0);
      setVideos(next);
      setNotice("SHA-256 and byte-size verified for "+next.length+" actual local H264 file(s).");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Could not verify selected videos.");
    }finally{
      created.forEach(url=>URL.revokeObjectURL(url));
      if(token===revision.current)setBusy(false);
    }
  };
  return (
    <details className="rounded-lg border border-lime-400/25 bg-slate-950/60 p-4 sm:p-5"
      aria-labelledby="spatial-neural-title">
      <summary id="spatial-neural-title"
        className="flex cursor-pointer items-center gap-2 font-semibold text-lime-200">
        <Move className="h-5 w-5"/>Neural v2 · Real learned spatial motion per trained style
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-slate-300">
          Teach each existing neural style label how <strong>different frame regions
          move</strong>. A genuine CPU-trained 4×3 grid of small motion classifiers
          predicts one-pixel shifts from the previous generated motion.
          Its neighboring motions blend smoothly before the learned video decoder
          predicts the next frame. This is an experimental texture motion model,
          <strong> not dense optical flow or realistic text-to-video</strong>.
        </p>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="font-medium">1. Train spatial motion from the same verified source MP4s</h4>
          <p className="text-sm text-slate-300">
            First complete the neural v2 and trained-tag steps. Keep the
            <code className="mx-1">eternyx-neural-v2-model/model.json</code>,
            <code>eternyx-neural-style-tags/tag-model.json</code>, and their
            original, unchanged 16 FPS reviewed MP4s in <code>./local-video-media</code>.
            SHA-256 and original source/training splits must agree.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">Spatial motion training epochs (1–4)
              <Input type="number" min={1} max={4} step={1} value={epochs}
                onChange={e=>setEpochs(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">Reproducible training and sampling seed
              <Input type="number" min={0} max={2147483647} step={1} value={seed}
                onChange={e=>setSeed(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
          </div>
          {validation&&<p role="alert" className="text-xs text-amber-200">{validation}</p>}
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-lime-200">
            {trainCommand||"Adjust the training settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!trainCommand}
            onClick={()=>{void copy(trainCommand);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy genuine CPU motion training command
          </Button>
          <p className="text-xs text-slate-400">
            Outputs <code>{paths.model}</code> and <code>{paths.training}</code>,
            with observed training motion and separate unseen-frame evaluation.
          </p>
        </section>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="font-medium">2. Generate spatially moving neural video or compare trained tags</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">First trained label
              <Input value={first} onChange={e=>setFirst(e.target.value)}
                aria-label="First spatial motion trained tag" className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">Second trained label
              <Input value={second} onChange={e=>setSecond(e.target.value)}
                aria-label="Second spatial motion trained tag" className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">Duration (1–3 seconds)
              <Input type="number" min={1} max={3} step={1} value={seconds}
                onChange={e=>setSeconds(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">Learned spatial motion strength (0–100%)
              <Input type="number" min={0} max={100} step={1} value={strength}
                onChange={e=>setStrength(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">Color/temporal stability (0–85%)
              <Input type="number" min={0} max={85} step={1} value={stability}
                onChange={e=>setStability(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">Seeded color variation (0–20%)
              <Input type="number" min={0} max={20} step={1} value={variation}
                onChange={e=>setVariation(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="block space-y-1 text-sm">Finished MP4 profile
              <select value={profile} onChange={e=>setProfile(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {["landscape","portrait","square"].map(x=><option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm">Video output scale
              <select value={quality} onChange={e=>setQuality(e.target.value)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {["standard","high"].map(x=><option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={seededMotion}
              onChange={e=>setSeededMotion(e.target.checked)}
              className="h-4 w-4 accent-lime-500"/>
            Sample tile motion with seeded probabilities (instead of repeatable highest-probability shifts)
          </label>
          <p className="text-xs text-slate-400">Generate from a trained label:</p>
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-lime-200">
            {generateCommand||"Choose valid generation settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!generateCommand}
            onClick={()=>{void copy(generateCommand);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy spatial neural MP4 generation command
          </Button>
          <p className="text-xs text-slate-400">Generate two trained tags with the same seed and motion strength:</p>
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-lime-200">
            {compareCommand||"Choose two distinct actual trained labels."}
          </code>
          <Button size="sm" variant="outline" disabled={!compareCommand}
            onClick={()=>{void copy(compareCommand);}}>
            <Copy className="mr-2 h-4 w-4"/>Copy spatial motion comparison command
          </Button>
        </section>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="flex items-center gap-2 font-medium"><BrainCircuit className="h-4 w-4"/>
            3. Inspect learned motion and actual unseen-frame measurements</h4>
          <label className="block space-y-1 text-sm">Select motion-model.json and training-report.json together
            <Input type="file" multiple accept=".json,application/json" disabled={busy}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importTraining(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {modelVerified&&training&&<div role="status" className="space-y-2 text-xs text-emerald-200">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>
              Actual local motion model SHA-256 matches its training evidence.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-slate-700">
                  <th className="p-2">Trained label</th>
                  <th className="p-2">Training CE before → after</th>
                  <th className="p-2">Unseen predicted-warp MAE</th>
                  <th className="p-2">Unseen zero-shift MAE</th>
                </tr></thead>
                <tbody>{training.tags.map(tag=>{
                  const m=training.metrics[tag];
                  return <tr key={tag} className="border-b border-slate-800">
                    <th className="p-2">{tag}</th>
                    <td className="p-2 tabular-nums">{m.training_ce_before.toFixed(4)} → {m.training_ce_after.toFixed(4)}</td>
                    <td className="p-2 tabular-nums">{m.heldout.predicted_warp_frame_mae.toFixed(4)}</td>
                    <td className="p-2 tabular-nums">{m.heldout.zero_shift_frame_mae.toFixed(4)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <p className="text-slate-400">These are real block-matching diagnostics; lower errors
              do not prove realistic optical flow or beautiful motion.</p>
          </div>}
        </section>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="font-medium">4. Verify and preview actual local H264 videos</h4>
          <p className="text-sm text-slate-300">
            Select <code>{paths.comparisonReport}</code> or
            <code className="ml-1">{paths.generation}</code>, then matching local
            <code className="mx-1">video.mp4</code> files or <code>comparison.mp4</code>.
            Their exact bytes are checked with WebCrypto SHA-256; no media is uploaded.
          </p>
          <label className="block space-y-1 text-sm">Select local generation-report.json or comparison-report.json
            <Input type="file" accept=".json,application/json"
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importMediaReport(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
          </label>
          <label className="block space-y-1 text-sm">Select matching real MP4 files
            <Input type="file" multiple accept=".mp4,video/mp4" disabled={!mediaReport||busy}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importVideoFiles(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {busy&&<p role="status" className="text-sm text-lime-200">Hashing local model/video files…</p>}
          {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
          {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
          {videos.length>0&&<div className="grid gap-3 lg:grid-cols-3">
            {videos.map(p=><div key={p.kind} className="space-y-2 rounded border border-slate-700 bg-slate-950 p-3">
              <p className="text-sm font-medium text-emerald-200">
                {p.kind==="comparison"?"Side-by-side learned motions":p.kind+" · learned spatial motion"}
              </p>
              <video src={p.url} controls playsInline preload="metadata"
                aria-label={"Verified spatial motion "+p.kind+" MP4"}
                className="w-full rounded border border-slate-700 bg-black"/>
              <p className="text-xs text-slate-400">Actual MP4 SHA-256 and size matched local receipt.</p>
            </div>)}
          </div>}
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          Real tiny learned tile motion and trained color/texture conditioning are
          still not realistic video generation, semantic text understanding or dense
          optical flow. No GPU cost, external inference API or media upload.
          Keep source-derived models private. Receipt hashes are self-attested,
          not digitally signed ownership certificates.
        </p>
      </div>
    </details>
  );
}
