import {useEffect,useMemo,useRef,useState} from "react";
import {Clapperboard,Copy,GitMerge,Scissors,SkipBack,SkipForward,Trash2,Undo2,Redo2,Play,Pause} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  timelineSegments,timelineSeek,timelineTimecode,splitTimelineShot,
  duplicateTimelineShot,moveTimelineShot,removeTimelineShot,
  nudgeTimelineShot,joinTimelineShots,repositionTimelineShot,
} from "@/lib/ai/localVideoTimeline.mjs";

type Shot={
  sourceName:string;startFrame:number;frames:number;caption:string;
  rightsRef:string;fadeInFrames:number;fadeOutFrames:number;
};
type Source={name:string;url:string;sha256:string;size:number};
type Props={
  shots:Shot[];sources:Source[];onChange:(next:Shot[])=>void;
  disabled?:boolean;canUndo?:boolean;canRedo?:boolean;fps?:16|24;
  onUndo?:()=>void;onRedo?:()=>void;
};

export default function LocalVideoTimeline({
  shots,sources,onChange,disabled=false,
  canUndo=false,canRedo=false,onUndo=()=>{},onRedo=()=>{},fps=16,
}:Props){
  const [selected,setSelected]=useState(0);
  const [playhead,setPlayhead]=useState(0);
  const [error,setError]=useState("");
  const [captionPreview,setCaptionPreview]=useState(true);
  const video=useRef<HTMLVideoElement|null>(null);
  const dragging=useRef<number|null>(null);
  const previewPlaying=useRef(false);
  const [previewActive,setPreviewActive]=useState(false);
  const state=useMemo(()=>{
    try{return {timeline:timelineSegments(shots,fps),error:""};}
    catch(err){return {timeline:null,error:err instanceof Error?err.message:"Invalid edited timeline."};}
  },[shots,fps]);
  const timeline=state.timeline;
  const max=timeline?timeline.frames-1:0;
  const safeFrame=Math.max(0,Math.min(playhead,max));
  const current=useMemo(()=>{
    if(!timeline)return null;
    try{return timelineSeek(shots,safeFrame,fps);}
    catch{return null;}
  },[timeline,shots,safeFrame]);
  const active=timeline?.segments[Math.min(selected,shots.length-1)]??null;
  const source=sources.find(s=>s.name===current?.sourceName);
  useEffect(()=>{
    if(!video.current||!current||previewPlaying.current)return;
    const element=video.current;
    if(element.readyState>=1){
      element.pause();
      try{element.currentTime=current.sourceSeconds;}catch{/* Media decoding may be unavailable. */}
    }
  },[source?.url,current?.sourceSeconds]);
  useEffect(()=>{
    setSelected(old=>Math.max(0,Math.min(old,shots.length-1)));
    setPlayhead(old=>Math.max(0,Math.min(old,max)));
  },[shots.length,max]);
  const stopPreview=()=>{
    previewPlaying.current=false;
    setPreviewActive(false);
    video.current?.pause();
  };
  const playSelected=async()=>{
    if(disabled||!active||!video.current)return;
    try{
      if(previewPlaying.current){stopPreview();return;}
      stopPreview();
      const element=video.current;
      const first=timelineSeek(shots,active.startFrame,fps);
      element.currentTime=first.sourceSeconds;
      setPlayhead(active.startFrame);
      previewPlaying.current=true;
      setPreviewActive(true);
      await element.play();
    }catch{
      stopPreview();
      setError("Your browser could not play the original local clip. Try the native video controls.");
    }
  };
  const choose=(index:number)=>{
    if(!timeline)return;
    const s=timeline.segments[index];
    if(!s)return;
    stopPreview();
    setSelected(index);setPlayhead(s.startFrame);
    setError("");
  };
  const apply=(fn:()=>Shot[],nextIndex:number,seekAt?:number)=>{
    if(disabled)return;
    try{
      const updated=fn();
      const next=timelineSegments(updated,fps);
      const index=Math.max(0,Math.min(nextIndex,updated.length-1));
      stopPreview();
      onChange(updated);
      setSelected(index);
      setPlayhead(seekAt===undefined?next.segments[index].startFrame:
        Math.max(0,Math.min(next.frames-1,seekAt)));
      setError("");
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Timeline operation was rejected.");
    }
  };
  const splitOffset=active?Math.max(0,Math.min(active.frames-1,safeFrame-active.startFrame)):0;
  const canSplit=Boolean(active&&shots.length<8&&splitOffset>0&&splitOffset<active.frames);
  const sameSelected=Boolean(current&&active&&current.index===active.index);
  const seek=(frame:number)=>{
    if(!timeline)return;
    try{
      const target=timelineSeek(shots,frame,fps);
      stopPreview();
      setPlayhead(target.globalFrame);
      setSelected(target.index);
      setError("");
    }catch(cause){setError(cause instanceof Error?cause.message:"Invalid timeline position.");}
  };
  const navigate=(from:number,key:string)=>{
    const target=key==="ArrowRight"?Math.min(shots.length-1,from+1):
      key==="ArrowLeft"?Math.max(0,from-1):
      key==="Home"?0:key==="End"?shots.length-1:from;
    if(target!==from||["Home","End"].includes(key))choose(target);
    return target;
  };
  return(
    <section className="space-y-4 rounded-lg border border-cyan-400/30 bg-cyan-950/10 p-4"
      aria-labelledby="local-precision-timeline"
      onKeyDown={event=>{
        const target=event.target as HTMLElement;
        if(disabled||!(event.ctrlKey||event.metaKey)||event.altKey||
           target.closest("input,textarea,select,[contenteditable=true]"))return;
        if(event.key.toLowerCase()==="z"){
          if(event.shiftKey&&canRedo){event.preventDefault();stopPreview();onRedo();}
          else if(!event.shiftKey&&canUndo){event.preventDefault();stopPreview();onUndo();}
        }else if(event.key.toLowerCase()==="y"&&canRedo){
          event.preventDefault();stopPreview();onRedo();
        }
      }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="local-precision-timeline" className="flex items-center gap-2 font-semibold text-cyan-100">
          <Clapperboard className="h-4 w-4"/>Interactive {fps} FPS editing timeline
        </h3>
        <p className="text-xs tabular-nums text-slate-300">
          {timeline?timelineTimecode(timeline.frames,fps):"Invalid timeline"} · {shots.length}/8 cuts
        </p>
      </div>
      <p className="text-sm text-slate-300">
        Select a cut, scrub by individual {fps} FPS frames, and preview its <strong>original
        source</strong>. Split, duplicate, join, reorder, or nudge source in/out
        boundaries while preserving the same editable storyboard.
      </p>
      {state.error?<p role="alert" className="text-sm text-amber-200">{state.error}</p>:null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={disabled||!canUndo}
          onClick={()=>{stopPreview();onUndo();}}>
          <Undo2 className="mr-1 h-4 w-4"/>Undo cut edit
        </Button>
        <Button size="sm" variant="outline" disabled={disabled||!canRedo}
          onClick={()=>{stopPreview();onRedo();}}>
          <Redo2 className="mr-1 h-4 w-4"/>Redo cut edit
        </Button>
        <span className="self-center text-xs text-slate-400">
          Up to 40 steps · Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y when a timeline button is focused.
        </span>
      </div>
      {timeline&&<>
        <div className="overflow-x-auto rounded border border-slate-700 bg-slate-950 p-2"
          aria-label="Editable sequence of original video cuts">
          <div className="flex min-w-full gap-1">
            {timeline.segments.map(s=><button type="button" key={s.index}
              aria-label={"Select shot "+(s.index+1)+", "+s.sourceName+", "+
                timelineTimecode(s.startFrame,fps)+" to "+timelineTimecode(s.endFrame,fps)}
              aria-pressed={selected===s.index}
              disabled={disabled} draggable={!disabled}
              onDragStart={event=>{
                dragging.current=s.index;
                event.dataTransfer.effectAllowed="move";
                event.dataTransfer.setData("text/plain",String(s.index));
              }}
              onDragOver={event=>{
                if(!disabled&&dragging.current!==null){
                  event.preventDefault();event.dataTransfer.dropEffect="move";
                }
              }}
              onDrop={event=>{
                event.preventDefault();
                const from=dragging.current;dragging.current=null;
                if(from!==null&&from!==s.index){
                  apply(()=>repositionTimelineShot(shots,from,s.index,fps),s.index);
                }
              }}
              onDragEnd={()=>{dragging.current=null;}}
              onClick={()=>choose(s.index)}
              onKeyDown={event=>{
                if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){
                  event.preventDefault();
                  const target=navigate(s.index,event.key);
                  const row=event.currentTarget.parentElement;
                  const buttons=row?.querySelectorAll<HTMLButtonElement>("button");
                  buttons?.[target]?.focus();
                }
              }}
              style={{flexGrow:s.frames,flexBasis:0,minWidth:"3.75rem"}}
              className={"min-h-20 space-y-1 rounded border px-2 py-2 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 "+
                (selected===s.index?
                  "border-cyan-300 bg-cyan-800/40 text-cyan-100":
                  "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-400")}>
              <span className="block font-semibold">#{s.index+1} · {s.frames}f</span>
              <span className="block max-w-full truncate" title={s.sourceName}>{s.sourceName}</span>
              <span className="block tabular-nums text-[11px] opacity-80">
                {timelineTimecode(s.startFrame,fps)}–{timelineTimecode(s.endFrame,fps)}
              </span>
            </button>)}
          </div>
          <div className="mt-2 flex justify-between text-[11px] tabular-nums text-slate-400">
            {[0,1,2,3,4].map(n=><span key={n}>
              {timelineTimecode(Math.round(timeline.frames*n/4),fps)}
            </span>)}
          </div>
        </div>
        <label className="block space-y-2 text-sm">
          <span className="flex items-center justify-between gap-2">
            <span className="font-medium">Timeline playhead · scrub to original source frame</span>
            <span className="tabular-nums text-cyan-200">
              {timelineTimecode(safeFrame,fps)} · frame {safeFrame+1}/{timeline.frames}
            </span>
          </span>
          <Input type="range" min={0} max={max} step={1} value={safeFrame}
            disabled={disabled} aria-label="Video timeline frame scrubber"
            onChange={e=>seek(Number(e.target.value))}
            className="min-h-10"/>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={disabled||safeFrame<=0}
            onClick={()=>seek(safeFrame-1)}>
            <SkipBack className="mr-1 h-4 w-4"/>Previous frame
          </Button>
          <Button size="sm" variant="outline" disabled={disabled||safeFrame>=max}
            onClick={()=>seek(safeFrame+1)}>
            <SkipForward className="mr-1 h-4 w-4"/>Next frame
          </Button>
          {current&&<span role="status" className="text-xs tabular-nums text-slate-300">
            Shot {current.index+1} · original source frame {current.sourceFrame} · {current.sourceSeconds.toFixed(3)}s
          </span>}
        </div>
        {current&&source&&<div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <video key={source.url} ref={video} src={source.url} controls playsInline
              preload="metadata" aria-label={"Original source preview "+source.name}
              className="max-h-64 w-full rounded border border-slate-700 bg-black"
              onLoadedMetadata={e=>{
                try{e.currentTarget.currentTime=current.sourceSeconds;}catch{}
              }}
              onTimeUpdate={e=>{
                if(!previewPlaying.current)return;
                const time=e.currentTarget.currentTime;
                if(time>=current.cutEndSeconds-0.005){
                  stopPreview();
                  return;
                }
                // Browser playback is an approximate source preview. The
                // offline renderer checks exact CFR 16FPS input and output.
                const sourceFrame=Math.max(current.sourceFrame,
                  Math.floor(time*16+1e-6));
                const localFrame=sourceFrame-shots[current.index].startFrame;
                const globalFrame=timeline.segments[current.index].startFrame+
                  Math.max(0,Math.min(shots[current.index].frames-1,localFrame));
                setPlayhead(globalFrame);
              }}
              onPause={()=>{
                if(previewPlaying.current){
                  previewPlaying.current=false;setPreviewActive(false);
                }
              }}
              onEnded={()=>stopPreview()}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={disabled||!active||!sameSelected}
                onClick={()=>{void playSelected();}}>
                {previewActive?<Pause className="mr-1 h-4 w-4"/>:
                  <Play className="mr-1 h-4 w-4"/>}
                {previewActive?"Pause cut preview":"Play selected cut"}
              </Button>
              <span className="text-xs text-slate-400">
                Plays original frames within selected in/out points.
              </span>
            </div>
            <p className="text-xs text-amber-200">
              This is the original source clip, NOT the assembled, faded or
              caption-burned final video. Browser seeks are approximate;
              the offline FFmpeg renderer checks actual constant-frame-rate {fps} FPS.
            </p>
          </div>
          <div className="space-y-3 rounded border border-slate-700 bg-slate-950 p-3 text-xs">
            <p className="font-semibold text-cyan-200">Selected cut · {active?active.index+1:"none"}</p>
            {active&&<p className="tabular-nums">
              Timeline {timelineTimecode(active.startFrame,fps)}–{timelineTimecode(active.endFrame,fps)}
              {" · "}{active.frames} frames / {(active.frames/16).toFixed(2)}s
            </p>}
            {active&&<p>
              Original source frames {active.sourceStartFrame}–{active.sourceEndFrame-1}
            </p>}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={captionPreview}
                onChange={e=>setCaptionPreview(e.target.checked)}/>
              Show editable caption preview
            </label>
            {captionPreview&&<p className="min-h-12 whitespace-pre-wrap break-words rounded bg-slate-900 p-3 text-slate-200">
              {active&&shots[active.index]?.caption?.trim()?
                shots[active.index].caption:
                "Caption not entered yet. The final export requires a human caption."}
            </p>}
            {!sameSelected&&<p className="text-amber-200">
              Move the playhead into the selected cut to split at that position.
            </p>}
          </div>
        </div>}
        <div className="flex flex-wrap gap-2 rounded border border-slate-700 p-3">
          <Button size="sm" variant="outline" disabled={disabled||!canSplit||!sameSelected}
            title="Splits at the selected source playhead while retaining original endpoint fade effects"
            onClick={()=>active&&apply(
              ()=>splitTimelineShot(shots,selected,splitOffset,fps),selected+1,safeFrame)}>
            <Scissors className="mr-1 h-4 w-4"/>Split at playhead
          </Button>
          <Button size="sm" variant="outline"
            disabled={disabled||shots.length>=8||!active||timeline.frames+active.frames>fps*30}
            onClick={()=>apply(()=>duplicateTimelineShot(shots,selected,fps),selected+1)}>
            <Copy className="mr-1 h-4 w-4"/>Duplicate cut
          </Button>
          <Button size="sm" variant="outline" disabled={disabled||!active||selected>=shots.length-1}
            title="Join source-contiguous cuts only when captions, rights and internal fades match"
            onClick={()=>apply(()=>joinTimelineShots(shots,selected,fps),selected)}>
            <GitMerge className="mr-1 h-4 w-4"/>Join next (compatible only)
          </Button>
          <Button size="sm" variant="outline" disabled={disabled||selected<=0}
            onClick={()=>apply(()=>moveTimelineShot(shots,selected,-1,fps),selected-1)}>
            Move left
          </Button>
          <Button size="sm" variant="outline" disabled={disabled||selected>=shots.length-1}
            onClick={()=>apply(()=>moveTimelineShot(shots,selected,1,fps),selected+1)}>
            Move right
          </Button>
          <Button size="sm" variant="outline" disabled={disabled||shots.length<=1}
            onClick={()=>apply(()=>removeTimelineShot(shots,selected,fps),Math.min(selected,shots.length-2))}>
            <Trash2 className="mr-1 h-4 w-4"/>Remove cut
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 rounded border border-slate-700 p-3">
          {[
            {label:"Trim 1f from start",edge:"in",amount:1},
            {label:"Extend 1f earlier",edge:"in",amount:-1},
            {label:"Extend 1f at end",edge:"out",amount:1},
            {label:"Trim 1f from end",edge:"out",amount:-1},
          ].map(x=><Button key={x.label} size="sm" variant="outline" disabled={disabled||!active}
            onClick={()=>apply(()=>nudgeTimelineShot(shots,selected,x.edge,x.amount,fps),selected)}>
            {x.label}
          </Button>)}
        </div>
        {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
        <p className="text-xs text-slate-400">
          Keyboard: focus a timeline cut and press ←/→ to navigate, Home/End to jump.
          On desktop, drag a cut block to another position; on touch devices use Move left/right.
          All operations update the same validated source-frame storyboard and are
          included in saved drafts and portable ZIP exports. Actual source duration
          and frame rate are checked again during the local CPU render.
        </p>
      </>}
    </section>
  );
}
