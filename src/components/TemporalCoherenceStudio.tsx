import {useEffect,useRef,useState} from "react";
import {BrainCircuit,Copy,FileCheck2,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  COHERENCE_LIMITS,temporalCoherenceCommand,temporalCoherencePaths,
  readTemporalCoherenceReport,matchTemporalCoherenceFile,
} from "@/lib/ai/temporalCoherenceVideo.mjs";

type Receipt=ReturnType<typeof readTemporalCoherenceReport>;
type Match=ReturnType<typeof matchTemporalCoherenceFile>;
type Preview={kind:string;url:string};
async function sha(file:File){
  if(!globalThis.crypto?.subtle?.digest)
    throw new Error("Local SHA-256 requires a secure browser connection.");
  const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
export default function TemporalCoherenceStudio(){
  const [tag,setTag]=useState("warm");
  const [seconds,setSeconds]=useState(1);
  const [seed,setSeed]=useState(42);
  const [strength,setStrength]=useState(75);
  const [stability,setStability]=useState(45);
  const [variation,setVariation]=useState(6);
  const [report,setReport]=useState<Receipt|null>(null);
  const [videos,setVideos]=useState<Preview[]>([]);
  const [profileVerified,setProfileVerified]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [working,setWorking]=useState(false);
  const revision=useRef(0);
  const urls=useRef<string[]>([]);
  const clear=()=>{
    revision.current++;
    urls.current.forEach(url=>URL.revokeObjectURL(url));
    urls.current=[];setVideos([]);setProfileVerified(false);setWorking(false);
  };
  useEffect(()=>()=>{revision.current++;urls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  const paths=temporalCoherencePaths();
  let command="",validation="";
  try{command=temporalCoherenceCommand({tag,seconds,seed,strength,stability,variation});}
  catch(cause){validation=cause instanceof Error?cause.message:"Check coherence controls.";}
  const copy=async()=>{
    try{
      if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(command);setError("");setNotice("Offline command copied.");
    }catch{setError("Clipboard unavailable. Select the command and copy it manually.");}
  };
  const importReceipt=async(file:File|undefined)=>{
    clear();setReport(null);setError("");setNotice("");
    const token=revision.current;
    try{
      if(!file||file.name!=="selection-report.json"||file.size<1||
         file.size>COHERENCE_LIMITS.maxReportBytes)
        throw new Error("Choose the actual local selection-report.json (≤64 KiB).");
      const parsed=readTemporalCoherenceReport(await file.text());
      if(token!==revision.current)return;
      setReport(parsed);
      setNotice("Validated inner-only motion selection and independent final holdout audit.");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Invalid real coherence report.");
    }
  };
  const inspectFiles=async(files:FileList|null)=>{
    clear();setNotice("");setError("");
    const token=revision.current;
    const created:string[]=[];
    try{
      if(!report)throw new Error("Import selection-report.json before choosing local files.");
      const selected=Array.from(files??[]);
      if(!selected.length||selected.length>4)
        throw new Error("Choose 1–4 actual profile/MP4 files.");
      setWorking(true);
      const found:Preview[]=[];
      const kinds=new Set<string>();
      let matchedProfile=false;
      for(const file of selected){
        const max=file.name==="selection-profile.json"?
          COHERENCE_LIMITS.maxProfileBytes:COHERENCE_LIMITS.maxVideoBytes;
        if(!["selection-profile.json","video.mp4","comparison.mp4"].includes(file.name)||
           file.size<1||file.size>max)
          throw new Error("Choose generated selection-profile.json, video.mp4 or comparison.mp4.");
        const matched:Match=matchTemporalCoherenceFile(report,{
          name:file.name,size:file.size,sha256:await sha(file)});
        if(kinds.has(matched.kind))
          throw new Error("One generated candidate was chosen twice.");
        kinds.add(matched.kind);
        if(matched.kind==="profile"){matchedProfile=true;continue;}
        const url=URL.createObjectURL(file);
        created.push(url);
        found.push({kind:matched.kind,url});
      }
      if(token!==revision.current)return;
      urls.current=created.splice(0);
      found.sort((a,b)=>["baseline","coherent","comparison"].indexOf(a.kind)-
                          ["baseline","coherent","comparison"].indexOf(b.kind));
      setVideos(found);setProfileVerified(matchedProfile);
      setNotice("Checked "+kinds.size+" actual file SHA-256 hash(es) locally.");
    }catch(cause){
      if(token===revision.current)setError(cause instanceof Error?cause.message:"Unable to verify local files.");
    }finally{
      created.forEach(url=>URL.revokeObjectURL(url));
      if(token===revision.current)setWorking(false);
    }
  };
  return(
    <details className="rounded-lg border border-teal-400/25 bg-slate-950/60 p-4 sm:p-5"
      aria-labelledby="neural-coherence-title">
      <summary id="neural-coherence-title"
        className="flex cursor-pointer items-center gap-2 font-semibold text-teal-200">
        <BrainCircuit className="h-5 w-5"/>Neural v2 · Measured temporal motion coherence (CPU)
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-slate-300">
          Test whether your trained per-region motion predictions become more
          consistent by blending <strong>prior temporal motion</strong> and
          <strong> neighboring regions</strong>. Four strategies, including the unchanged
          classifier, are compared on <strong>inner training-only validation frames</strong>.
          The final original held-out quarter is measured only after choosing a strategy.
          Smoother or lower-error motion is <strong>not guaranteed to look better</strong>.
        </p>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="font-medium text-slate-100">1. Select motion continuity settings using original owned footage</h4>
          <p className="text-sm text-slate-300">
            Complete the earlier neural v2, trained style-tag and spatial-motion training
            workflows first. This CPU script requires their exact local model files
            and the same unchanged verified MP4s in <code>local-video-media</code>.
            No neural weights or training sources are overwritten.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Existing trained style label
              <Input value={tag} onChange={e=>setTag(e.target.value)}
                aria-label="Temporal coherence trained style label"
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Seed for both videos
              <Input type="number" min={0} max={2147483647} step={1}
                value={seed} onChange={e=>setSeed(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Sample duration (1–3 seconds)
              <Input type="number" min={1} max={3} step={1}
                value={seconds} onChange={e=>setSeconds(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Spatial motion strength (0–100%)
              <Input type="number" min={0} max={100} step={1}
                value={strength} onChange={e=>setStrength(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Neural temporal stability (0–85%)
              <Input type="number" min={0} max={85} step={1}
                value={stability} onChange={e=>setStability(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
            <label className="space-y-1 text-sm">Seeded color variation (0–20%)
              <Input type="number" min={0} max={20} step={1}
                value={variation} onChange={e=>setVariation(Number(e.target.value))}
                className="border-slate-700 bg-slate-950"/>
            </label>
          </div>
          {validation&&<p role="alert" className="text-sm text-amber-200">{validation}</p>}
          <code className="block select-all overflow-x-auto rounded bg-slate-950 p-3 text-xs leading-6 text-teal-200">
            {command||"Correct coherence settings."}
          </code>
          <Button size="sm" variant="outline" disabled={!command}
            onClick={()=>{void copy();}}>
            <Copy className="mr-2 h-4 w-4"/>Copy offline temporal-coherence audition command
          </Button>
          <p className="text-xs text-slate-400">
            Creates <code>{paths.report}</code>, a chosen profile,
            two true generated MP4s, and a playable side-by-side H.264.
            The selector can retain the unchanged motion classifier.
          </p>
        </section>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="font-medium text-slate-100">2. Inspect inner selection and genuine unseen 1-, 4-, 8-step results</h4>
          <label className="block space-y-1 text-sm">Choose actual selection-report.json
            <Input type="file" accept=".json,application/json"
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void importReceipt(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
          </label>
          {report&&<div className="space-y-3 text-sm">
            <p className="text-emerald-200">
              Selected {report.selection.selected_temporal_percent}% temporal memory
              {" · "}{report.selection.selected_neighbor_percent}% neighbor regularization
              {" · "}{report.source_sha256.length} verified source(s)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-slate-700">
                  <th className="p-2">Candidate</th>
                  <th className="p-2">Inner warp MAE</th>
                  <th className="p-2">Inner jitter</th>
                  <th className="p-2">Inner disagreement</th>
                </tr></thead>
                <tbody>{report.selection.candidates.map((c,i)=><tr key={i}
                  className="border-b border-slate-800">
                  <th className="p-2">{c.temporal_percent}% / {c.neighbor_percent}%
                    {i===0?" (unchanged)":""}</th>
                  <td className="p-2 tabular-nums">{c.inner.predicted_warp_mae.toFixed(5)}</td>
                  <td className="p-2 tabular-nums">{c.inner.temporal_jitter.toFixed(5)}</td>
                  <td className="p-2 tabular-nums">{c.inner.spatial_disagreement.toFixed(5)}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-slate-700">
                  <th className="p-2">Outer horizon</th>
                  <th className="p-2">Unchanged MAE</th>
                  <th className="p-2">Chosen MAE</th>
                  <th className="p-2">Zero-motion MAE</th>
                  <th className="p-2">Unchanged → chosen jitter</th>
                </tr></thead>
                <tbody>{[1,4,8].map(n=>{
                  const a=report.final_outer_audit.baseline[String(n)];
                  const b=report.final_outer_audit.selected[String(n)];
                  return <tr key={n} className="border-b border-slate-800">
                    <th className="p-2">{n} step{n===1?"":"s"}</th>
                    <td className="p-2 tabular-nums">{a.predicted_warp_mae.toFixed(5)}</td>
                    <td className="p-2 tabular-nums">{b.predicted_warp_mae.toFixed(5)}</td>
                    <td className="p-2 tabular-nums">{b.zero_shift_mae.toFixed(5)}</td>
                    <td className="p-2 tabular-nums">{a.temporal_jitter.toFixed(3)} → {b.temporal_jitter.toFixed(3)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">
              A lower objective can reward nearly static video. We prohibit inner
              warp MAE regressions beyond rounding tolerance, but an unseen
              regression is still possible. Outer frames were not used for selection.
            </p>
          </div>}
        </section>
        <section className="space-y-3 rounded border border-slate-700 p-3">
          <h4 className="flex items-center gap-2 font-medium text-slate-100">
            <FileCheck2 className="h-4 w-4"/>3. Verify actual selected profile and preview generated MP4s
          </h4>
          <p className="text-sm text-slate-300">
            Select <code>selection-profile.json</code> and/or the two
            <code className="mx-1">video.mp4</code> files and
            <code>comparison.mp4</code>. Browser checks local SHA-256 and byte
            sizes against the imported report before playing them.
          </p>
          <label className="block space-y-1 text-sm">Choose local profile and/or finished MP4 files
            <Input type="file" multiple accept=".mp4,.json,video/mp4,application/json"
              disabled={!report||working}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void inspectFiles(e.currentTarget.files);e.currentTarget.value="";}}/>
          </label>
          {working&&<p role="status" className="text-sm text-teal-200">Hashing local files…</p>}
          {profileVerified&&<p role="status" className="text-sm text-emerald-200">
            Chosen coherence profile matches actual local SHA-256.
          </p>}
          {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
          {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
          {videos.length>0&&<div className="grid gap-3 lg:grid-cols-3">
            {videos.map(video=><div key={video.kind}
              className="space-y-2 rounded border border-slate-700 bg-slate-950 p-3">
              <p className="text-sm text-emerald-200">
                {video.kind==="baseline"?"Original neural motion":
                 video.kind==="coherent"?"Inner-selected smoother motion":
                 "Actual before/after side-by-side"}
              </p>
              <video src={video.url} controls playsInline preload="metadata"
                aria-label={"Verified local "+video.kind+" H264 MP4"}
                className="w-full rounded border border-slate-700 bg-black"/>
              <p className="text-xs text-slate-400">Verified actual local MP4 bytes.</p>
            </div>)}
          </div>}
        </section>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          CPU-only local research: these are learned low-resolution neural textures,
          not semantic or photorealistic text-to-video, dense optical flow or natural
          scene understanding. No paid GPU, external inference API or media upload.
          Local hash matches are self-attested, not cryptographic ownership proof.
        </p>
      </div>
    </details>
  );
}
