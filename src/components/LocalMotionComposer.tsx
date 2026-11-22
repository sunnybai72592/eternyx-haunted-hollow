import { useState } from "react";
import { Copy, Download, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMotionProject, motionGeneratorCommand, motionOutputPaths,
  CPU_MOTION_STYLES, CPU_MOTION_PALETTES, CPU_MOTION_PROFILES,
  CPU_MOTION_QUALITIES } from "@/lib/ai/cpuMotionComposer.mjs";

type Scene = {style:string;palette:string;seconds:number;seed:number;caption:string};
const COLORS: Record<string,string[]> = {
  ocean:["#04182f","#168bac","#9ae1ef"], sunset:["#300f3d","#d84b5f","#ffc570"],
  forest:["#05221e","#369467","#c2e48c"], violet:["#180e3b","#754ad1","#ea9af8"],
  mono:["#09101a","#677c97","#e6f0f9"],
};
function sample(style="aurora",seed=42):Scene {
  return {style,palette:"ocean",seconds:2,seed,caption:"Original "+style+" procedural motion"};
}
function save(json:string) {
  const url=URL.createObjectURL(new Blob([json],{type:"application/json"}));
  const a=document.createElement("a");
  a.href=url;a.download="eternyx-motion-scenes.json";
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export default function LocalMotionComposer() {
  const [scenes,setScenes]=useState<Scene[]>([sample()]);
  const [profile,setProfile]=useState("landscape");
  const [quality,setQuality]=useState("standard");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  let project:ReturnType<typeof createMotionProject>|null=null;
  let validation="";
  try {project=createMotionProject({profile,quality,scenes});}
  catch (err) {validation=err instanceof Error?err.message:"Please correct the scene settings.";}
  const change=(index:number,patch:Partial<Scene>)=>{
    setScenes(old=>old.map((s,i)=>i===index?{...s,...patch}:s));
    setNotice("");setError("");
  };
  const copy=async()=>{
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Unavailable");
      await navigator.clipboard.writeText(motionGeneratorCommand());
      setNotice("Local CPU command copied.");setError("");
    } catch {setError("Clipboard unavailable. Select and copy the command below.");}
  };
  const outputs=motionOutputPaths();
  return (
    <section aria-labelledby="motion-composer-title" className="space-y-5 rounded-lg border border-fuchsia-400/25 bg-slate-950/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="motion-composer-title" className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <Sparkles className="h-5 w-5 text-fuchsia-300"/>Create original motion clips on CPU
        </h3>
        <span className="rounded-full border border-fuchsia-400/30 px-3 py-1 text-xs text-fuchsia-200">
          Free · Original graphics · Offline
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-300">
        No camera footage? Make original looping-style animated graphics for video intros, backgrounds and transitions.
        This project generates <strong>actual playable H.264 files on your computer</strong> from mathematical
        animation with local Python and FFmpeg. It is procedural graphics, <strong>not trained text-to-video AI</strong>.
        The browser only exports the project; it does not run FFmpeg.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">Frame shape
          <select className="min-h-11 w-full rounded border border-slate-700 bg-slate-900 px-2"
            value={profile} onChange={e=>{setProfile(e.target.value);setNotice("");}}>
            {CPU_MOTION_PROFILES.map(name=><option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">Output quality and CPU budget
          <select className="min-h-11 w-full rounded border border-slate-700 bg-slate-900 px-2"
            value={quality} onChange={e=>{setQuality(e.target.value);setNotice("");}}>
            {CPU_MOTION_QUALITIES.map(name=><option key={name} value={name}>
              {name==="standard"?"Standard · up to 30s":"High · up to 10s"}
            </option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-200">
          {scenes.length}/8 scenes · {scenes.reduce((sum,s)=>sum+(Number.isFinite(s.seconds)?s.seconds:0),0)} seconds
        </p>
        <Button size="sm" variant="outline" disabled={scenes.length>=8}
          onClick={()=>{setScenes(old=>[...old,sample("orbit",42+17*old.length)]);setNotice("");}}>
          <Plus className="mr-1 h-4 w-4"/>Add scene
        </Button>
      </div>
      <div className="space-y-3">
        {scenes.map((scene,index)=>(
          <div key={index} className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium text-slate-100">Scene {index+1}</h4>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={index===0} onClick={()=>{
                  setScenes(old=>{const next=[...old];[next[index-1],next[index]]=[next[index],next[index-1]];return next;});
                }}>Up</Button>
                <Button size="sm" variant="outline" disabled={index===scenes.length-1} onClick={()=>{
                  setScenes(old=>{const next=[...old];[next[index+1],next[index]]=[next[index],next[index+1]];return next;});
                }}>Down</Button>
                <Button size="sm" variant="ghost" disabled={scenes.length===1}
                  aria-label={"Remove procedural scene "+(index+1)}
                  onClick={()=>{setScenes(old=>old.filter((_,i)=>i!==index));setNotice("");}}>
                  <Trash2 className="h-4 w-4"/>
                </Button>
              </div>
            </div>
            <div role="img" aria-label={"Static "+scene.palette+" color palette swatch, not a generated video preview"}
              className="h-12 rounded border border-slate-600"
              style={{background:"linear-gradient(115deg, "+(COLORS[scene.palette]??COLORS.ocean).join(", ")+")"}} />
            <p className="text-xs text-slate-400">Color swatch only — actual moving frames are rendered locally.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">Animation style
                <select className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2"
                  value={scene.style} onChange={e=>change(index,{style:e.target.value})}>
                  {CPU_MOTION_STYLES.map(name=><option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm">Colors
                <select className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2"
                  value={scene.palette} onChange={e=>change(index,{palette:e.target.value})}>
                  {CPU_MOTION_PALETTES.map(name=><option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm">Length in seconds (1–8)
                <Input className="border-slate-700 bg-slate-950" type="number" min={1} max={8} step={1}
                  value={scene.seconds} onChange={e=>change(index,{seconds:Number(e.target.value)})}/>
              </label>
              <label className="block space-y-1 text-sm">Reproducibility seed (0–2147483647)
                <Input className="border-slate-700 bg-slate-950" type="number" min={0} max={2147483647} step={1}
                  value={scene.seed} onChange={e=>change(index,{seed:Number(e.target.value)})}/>
              </label>
            </div>
            <label className="block space-y-1 text-sm">Editable subtitle caption
              <Input className="border-slate-700 bg-slate-950" maxLength={180}
                value={scene.caption} onChange={e=>change(index,{caption:e.target.value})}
                placeholder="Describe the original animated visual"/>
            </label>
          </div>
        ))}
      </div>
      {validation&&<p role="alert" className="text-sm text-amber-200">{validation}</p>}
      {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
      {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
      {project&&<p className="text-sm text-emerald-200">
        Scene project ready · {project.sceneCount} scenes · {project.totalFrames} frames at 16 FPS.
      </p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!project} onClick={()=>project&&save(project.json)}>
          <Download className="mr-2 h-4 w-4"/>Download motion scene JSON
        </Button>
        <Button variant="outline" onClick={()=>{void copy();}}>
          <Copy className="mr-2 h-4 w-4"/>Copy CPU command
        </Button>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
        <p className="text-sm font-medium">Run locally with Python 3.11+ and FFmpeg/FFprobe/libx264</p>
        <p className="text-sm text-slate-300">
          Download the scene JSON into your local ETERNYX repository checkout.
          From the repository root, run this command. Choose a new output directory for each attempt.
        </p>
        <code className="block select-all overflow-x-auto text-xs leading-6 text-fuchsia-200">
          {motionGeneratorCommand()}
        </code>
        <p className="text-xs leading-5 text-slate-300">
          Finished video: <code className="text-cyan-200">{outputs.video}</code>.
          Renderer receipt: <code>{outputs.rendererManifest}</code>. Original-scene report:
          <code> {outputs.sceneReceipt}</code>. It also exports editable captions and a v2 shot storyboard.
          Bring the finished MP4 and manifest to the verification section below.
        </p>
      </div>
      <p className="text-xs leading-5 text-slate-400">
        Procedural art only: no natural-language prompt understanding, neural model inference,
        paid GPU, external API, copyrighted footage input or cloud media upload.
      </p>
    </section>
  );
}
