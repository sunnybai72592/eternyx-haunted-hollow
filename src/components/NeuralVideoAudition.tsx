import { useEffect, useRef, useState } from "react";
import { Clapperboard, Copy, FileCheck2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  tinyNeuralAuditionCommand, readTinyNeuralAudition, matchTinyNeuralCandidate,
} from "@/lib/ai/tinyNeuralVideo.mjs";

type Props={seconds:number;profile:string;quality:string;stability:number;variation:number};
type Audit=ReturnType<typeof readTinyNeuralAudition>;
type Matched=ReturnType<typeof matchTinyNeuralCandidate>;
type LocalPreview={matched:Matched;url:string};
const maxBytes=64*1024*1024;

export default function NeuralVideoAudition(props:Props){
  const [seedText,setSeedText]=useState("42, 43, 44");
  const [audit,setAudit]=useState<Audit|null>(null);
  const [previews,setPreviews]=useState<LocalPreview[]>([]);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [processing,setProcessing]=useState(false);
  const active=useRef(0);
  const ownedUrls=useRef<string[]>([]);
  const clearPreviews=()=>{
    active.current++;
    ownedUrls.current.forEach(url=>URL.revokeObjectURL(url));
    ownedUrls.current=[];
    setPreviews([]);
    setProcessing(false);
  };
  useEffect(()=>()=>{active.current++;ownedUrls.current.forEach(url=>URL.revokeObjectURL(url));},[]);

  let command="",validation="";
  try{
    const strings=seedText.split(",").map(s=>s.trim());
    if(strings.some(s=>!/^\d+$/.test(s)))throw new Error("Use 1–3 comma-separated integer seeds.");
    const seeds=strings.map(Number);
    command=tinyNeuralAuditionCommand({...props,seeds});
  }catch(cause){validation=cause instanceof Error?cause.message:"Choose valid audition settings.";}
  const copy=async()=>{
    if(!command)return;
    try{
      if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(command);
      setMessage("Offline neural audition command copied.");setError("");
    }catch{
      setError("Clipboard unavailable. Select and copy the command below.");
    }
  };
  const importAudit=async(file:File|undefined)=>{
    const token=++active.current;
    clearPreviews();setAudit(null);setError("");setMessage("");
    if(!file)return;
    try{
      if(file.name!=="audition-report.json"||!file.size||file.size>32768)
        throw new Error("Choose the local audition-report.json (1 byte–32 KiB).");
      const data=readTinyNeuralAudition(await file.text());
      if(token+1!==active.current)return;
      setAudit(data);
      setMessage("Audition report imported. Select the actual candidate MP4s to verify them.");
    }catch(cause){
      if(token+1===active.current)setError(cause instanceof Error?cause.message:"Cannot inspect audition receipt.");
    }
  };
  const importVideos=async(files:FileList|null)=>{
    clearPreviews();setError("");setMessage("");
    const token=active.current;
    const created:string[]=[];
    try{
      if(!audit)throw new Error("Import the audition-report.json before selecting MP4s.");
      const selected=Array.from(files??[]);
      if(!selected.length||selected.length>3)
        throw new Error("Select between 1 and 3 locally generated video.mp4 candidates.");
      setProcessing(true);
      const fresh:LocalPreview[]=[];
      const names=new Set<string>();
      for(const file of selected){
        if(file.name!=="video.mp4"||file.size<1||file.size>maxBytes)
          throw new Error("Each candidate must be a video.mp4 up to 64 MiB.");
        if(!crypto?.subtle?.digest)
          throw new Error("Local WebCrypto SHA-256 is needed to inspect MP4 bytes.");
        const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
        const sha=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
        const matched=matchTinyNeuralCandidate(audit,{name:file.name,size:file.size,sha256:sha});
        if(names.has(matched.candidate))throw new Error("The same audition candidate was selected twice.");
        names.add(matched.candidate);
        const url=URL.createObjectURL(file);
        created.push(url);
        fresh.push({matched,url});
      }
      if(token!==active.current)return;
      ownedUrls.current=created.splice(0);
      fresh.sort((a,b)=>a.matched.candidate.localeCompare(b.matched.candidate));
      setPreviews(fresh);
      setMessage("Matching local SHA-256 digests and sizes verified for "+fresh.length+" actual MP4 files.");
    }catch(cause){
      if(token===active.current)setError(cause instanceof Error?cause.message:"Failed local MP4 verification.");
    }finally{
      created.forEach(url=>URL.revokeObjectURL(url));
      if(token===active.current)setProcessing(false);
    }
  };
  const changeSeeds=(value:string)=>{setSeedText(value);setMessage("");};
  return(
    <section className="space-y-4 rounded-lg border border-slate-700 bg-slate-900/40 p-3" aria-labelledby="tiny-neural-audition">
      <h4 id="tiny-neural-audition" className="flex items-center gap-2 font-medium text-slate-100">
        <Clapperboard className="h-4 w-4"/>Audition three actual neural videos side by side
      </h4>
      <p className="text-sm leading-6 text-slate-300">
        Generate up to three independent real MP4 samples using different seeds and the current stability settings.
        The CPU tool records decoded frames, exact file hashes and raw frame-to-frame pixel change.
        It does not invent a photorealism score or rank candidates.
      </p>
      <label className="block space-y-1 text-sm">Distinct sampling seeds (comma separated, max 3)
        <Input value={seedText} className="border-slate-700 bg-slate-950"
          onChange={event=>changeSeeds(event.target.value)}
          placeholder="42, 43, 44" aria-label="Neural audition candidate seeds"/>
      </label>
      {validation&&<p role="alert" className="text-sm text-amber-200">{validation}</p>}
      <code className="block select-all overflow-x-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-6 text-indigo-200">
        {command||"Correct the audition settings."}
      </code>
      <Button size="sm" variant="outline" disabled={!command} onClick={()=>{void copy();}}>
        <Copy className="mr-2 h-4 w-4"/>Copy three-seed CPU audition command
      </Button>
      <p className="text-xs text-slate-400">
        Run from your local repository root. The output must be a new
        <code className="mx-1">eternyx-tiny-neural-audition</code>folder.
        Each candidate gets its own video.mp4, rendering receipt and a shared audition-report.json.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">1. Import audition-report.json
          <Input type="file" accept=".json,application/json" aria-label="Neural audition report"
            className="min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
            onChange={event=>{void importAudit(event.currentTarget.files?.[0]);event.currentTarget.value="";}}/>
        </label>
        <label className="block space-y-1 text-sm">2. Select actual candidate video.mp4 files (up to 3)
          <Input type="file" multiple accept=".mp4,video/mp4" disabled={!audit||processing}
            aria-label="Neural candidate videos"
            className="min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
            onChange={event=>{void importVideos(event.currentTarget.files);event.currentTarget.value="";}}/>
        </label>
      </div>
      {audit&&<p className="text-xs text-slate-300">
        Imported self-attested audition: {audit.candidate_count} candidates,
        {audit.seconds} seconds each, {audit.stability_percent}% temporal blend,
        {audit.variation_percent}% innovation.
      </p>}
      {processing&&<p role="status" className="text-sm text-indigo-200">Hashing local candidate videos…</p>}
      {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
      {message&&<p role="status" className="text-sm text-emerald-200">{message}</p>}
      {previews.length>0&&<div className="grid gap-3 lg:grid-cols-3">
        {previews.map(({matched,url})=>(
          <div key={matched.candidate} className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-200">
              <FileCheck2 className="h-4 w-4"/>{matched.candidate} · seed {matched.seed}
            </p>
            <video controls playsInline preload="metadata" src={url}
              aria-label={"Verified local neural audition "+matched.candidate}
              className="w-full rounded border border-slate-700 bg-black"/>
            <p className="text-xs text-slate-300">{matched.frameCount} frames according to renderer receipt</p>
            <p className="text-xs text-slate-300">
              Mean raw RGB frame delta: {matched.temporalMetrics.mean_temporal_absolute_delta.toFixed(5)}
            </p>
            <p className="text-xs text-slate-300">
              Adjacent identical frame pairs: {matched.temporalMetrics.identical_adjacent_frame_pairs}
            </p>
          </div>
        ))}
      </div>}
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
        These are actual local file hash matches against a self-reported JSON receipt; not digital signatures.
        Lower frame delta may mean smoother video or merely static/collapsed output. Visually review
        each candidate before using it. Nothing is uploaded, scored by a remote model, or stored in the cloud.
      </p>
    </section>
  );
}
