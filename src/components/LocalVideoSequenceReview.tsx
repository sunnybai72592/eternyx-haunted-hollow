import {useEffect,useMemo,useRef,useState} from "react";
import {AlertCircle,CheckCircle2,Clapperboard,Pause,Play,SkipBack,SkipForward} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  auditLocalVideoExport,localSequencePlan,sequenceAtTime,sequenceFrame,
} from "@/lib/ai/localVideoSequenceReview.mjs";

type Source={name:string;size:number;sha256:string;url:string};
type Shot={
  sourceName:string;startFrame:number;frames:number;caption:string;
  rightsRef:string;fadeInFrames:number;fadeOutFrames:number;
};
type Props={
  sources:Source[];shots:Shot[];soundtrack:{
    name:string;size:number;sha256:string;rightsRef:string;volumePercent:number;
  }|null;profile:string;quality:string;
  disabled?:boolean;onJumpToShot?:(index:number)=>void;
};
export default function LocalVideoSequenceReview({
  sources,shots,soundtrack,profile,quality,disabled=false,
  onJumpToShot=()=>{},
}:Props){
  const audit=useMemo(()=>{
    try{return {value:auditLocalVideoExport({
      sources,shots,soundtrack,profile,quality}),error:""};}
    catch(cause){return {value:null,error:cause instanceof Error?cause.message:"Cannot audit this project."};}
  },[sources,shots,soundtrack,profile,quality]);
  const scheduled=useMemo(()=>{
    try{return {value:localSequencePlan(shots,sources),error:""};}
    catch(cause){return {value:null,error:cause instanceof Error?cause.message:"Cannot preview original sequence."};}
  },[shots,sources]);
  const plan=scheduled.value;
  const [index,setIndex]=useState(0);
  const [frame,setFrame]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [error,setError]=useState("");
  const video=useRef<HTMLVideoElement|null>(null);
  const requestedFrame=useRef(0);
  const active=plan?.cuts[index]??null;
  const max=plan?plan.totalFrames-1:0;
  const cursor=Math.max(0,Math.min(frame,max));
  useEffect(()=>{
    setPlaying(false);setIndex(0);setFrame(0);
    requestedFrame.current=0;setError("");
    video.current?.pause();
  },[plan]);
  const failPlayback=(cause:unknown)=>{
    setPlaying(false);
    setError(cause instanceof Error?cause.message:
      "Browser playback of this original MP4 could not start.");
  };
  const seek=(target:number)=>{
    if(!plan||disabled)return;
    try{
      const next=sequenceFrame(plan,target);
      setPlaying(false);video.current?.pause();
      requestedFrame.current=target;
      setIndex(next.index);setFrame(target);setError("");
      if(next.index===index&&video.current?.readyState){
        video.current.currentTime=next.sourceSeconds;
      }
    }catch(cause){failPlayback(cause);}
  };
  const play=()=>{
    if(!plan||!active||disabled)return;
    if(playing){setPlaying(false);video.current?.pause();return;}
    const desired=sequenceFrame(plan,cursor);
    requestedFrame.current=cursor;
    setPlaying(true);setError("");
    if(video.current?.readyState>=1&&desired.index===index){
      try{
        video.current.currentTime=desired.sourceSeconds;
        void video.current.play().catch(failPlayback);
      }catch(cause){failPlayback(cause);}
    }
  };
  const changeCut=(nextIndex:number)=>{
    if(!plan||nextIndex<0||nextIndex>=plan.cuts.length)return;
    seek(plan.cuts[nextIndex].startFrame);
  };
  // Playing is intentionally excluded from this effect: frame updates during
  // playback must NOT cause repeated seeks and stalled preview progress.
  useEffect(()=>{
    if(!plan||!active||!video.current)return;
    const element=video.current;
    if(element.readyState>=1){
      try{
        const target=sequenceFrame(plan,requestedFrame.current);
        if(target.index===index)element.currentTime=target.sourceSeconds;
        if(playing)void element.play().catch(failPlayback);
      }catch(cause){failPlayback(cause);}
    }
  },[index,plan,active?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  const advance=()=>{
    if(!plan||!playing)return;
    const next=index+1;
    if(next>=plan.cuts.length){
      setPlaying(false);
      setFrame(plan.totalFrames-1);
      video.current?.pause();
      return;
    }
    const begin=plan.cuts[next].startFrame;
    requestedFrame.current=begin;
    setIndex(next);setFrame(begin);
  };
  const selected=active??null;
  return(
    <section className="space-y-4 rounded-lg border border-sky-400/30 bg-slate-950/70 p-4"
      aria-labelledby="local-sequence-preview-title">
      <h3 id="local-sequence-preview-title" className="flex items-center gap-2 font-semibold text-sky-200">
        <Clapperboard className="h-4 w-4"/>Full sequence source preview & export readiness
      </h3>
      <p className="text-sm leading-6 text-slate-300">
        Preview the <strong>whole edited cut order</strong> from your selected
        original local MP4s, including draft captions and source in/out points.
        The browser does not join media, apply the finished fades, or mix music;
        actual H.264 video is still rendered by the offline FFmpeg launcher.
      </p>
      {audit.error&&<p role="alert" className="text-sm text-rose-200">{audit.error}</p>}
      {audit.value&&<div className="space-y-3 rounded border border-slate-700 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {audit.value.canExport?
            <CheckCircle2 className="h-5 w-5 text-emerald-300"/>:
            <AlertCircle className="h-5 w-5 text-amber-300"/>}
          <p className={"font-semibold "+(audit.value.canExport?"text-emerald-200":"text-amber-200")}>
            {audit.value.canExport?"Storyboard ready for offline source verification":
              "Fix "+audit.value.errors.length+" editing issue(s) before export"}
          </p>
          <span className="ml-auto text-xs tabular-nums text-slate-300">
            {audit.value.frameCount} frames · {audit.value.seconds.toFixed(2)}s
          </span>
        </div>
        <p className="text-xs text-slate-400">
          This readiness status checks the current project metadata.
          It does not establish original source licenses, decode validity,
          constant 16 FPS or a successful finished render.
        </p>
        <div className="space-y-2">
          {audit.value.shots.map(row=><div key={row.index}
            className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-900 p-2 text-xs">
            <div className="min-w-0 space-y-1">
              <span className={row.issues.length?"text-amber-200":"text-emerald-200"}>
                Shot {row.index+1} · {row.sourceName||"missing MP4"}
                {row.issues.length?" · "+row.issues.length+" issue(s)":" · metadata ready"}
              </span>
              {row.issues.map(item=><p key={item.code} className="text-amber-200">
                {item.message}
              </p>)}
            </div>
            <Button size="sm" variant="outline" disabled={disabled}
              onClick={()=>onJumpToShot(row.index)}>
              Edit shot {row.index+1}
            </Button>
          </div>)}
          {audit.value.errors.filter(row=>row.shot===null).map((item,i)=>
            <p key={item.code+"-"+i} role="alert" className="text-xs text-amber-200">
              {item.message}
            </p>)}
          {audit.value.warnings.map((item,i)=><p key={item.code+"-"+i}
            className="text-xs text-slate-400">{item.message}</p>)}
        </div>
      </div>}
      {scheduled.error&&<p role="alert" className="text-sm text-amber-200">
        Cannot build original-source preview: {scheduled.error}
      </p>}
      {plan&&selected&&<div className="space-y-3 rounded border border-slate-700 p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="relative">
              <video key={selected.index+"-"+selected.url}
                ref={video} src={selected.url} muted playsInline
                preload="metadata" controls={false}
                aria-label={"Original preview shot "+(selected.index+1)+" "+selected.file}
                className="max-h-72 w-full rounded border border-slate-700 bg-black"
                onLoadedMetadata={event=>{
                  const media=event.currentTarget;
                  if(!Number.isFinite(media.duration)||
                     media.duration+0.08<selected.sourceEndSeconds){
                    failPlayback(new Error(
                      "Original source appears shorter than this cut; check actual decoded frames with FFmpeg."));
                    return;
                  }
                  const target=sequenceFrame(plan,requestedFrame.current);
                  if(target.index===selected.index)
                    media.currentTime=target.sourceSeconds;
                  if(playing)void media.play().catch(failPlayback);
                }}
                onTimeUpdate={event=>{
                  if(!playing)return;
                  const next=sequenceAtTime(plan,index,event.currentTarget.currentTime);
                  setFrame(next.frame);
                  if(next.nextIndex!==index)advance();
                }}
                onEnded={()=>advance()}
                onError={()=>failPlayback(new Error("Cannot decode this original MP4 in the browser."))}/>
              {selected.caption.trim()&&<div
                className="pointer-events-none absolute inset-x-3 bottom-3 rounded bg-black/75 p-2 text-center text-sm text-white">
                {selected.caption}
              </div>}
            </div>
            <p className="text-xs text-slate-400">
              Original source footage · muted · captions only approximate the
              eventual SRT. No rendered fades, soundtrack or MP4 export in this preview.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-sky-200">
              Shot {index+1}/{plan.cuts.length} · {selected.file}
            </p>
            <p className="text-xs tabular-nums text-slate-300">
              Original frames {selected.sourceStartFrame}–{selected.sourceEndFrame-1}
              {" · "}timeline frame {cursor+1}/{plan.totalFrames}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={disabled||!index}
                onClick={()=>changeCut(index-1)}>
                <SkipBack className="mr-1 h-4 w-4"/>Previous cut
              </Button>
              <Button size="sm" variant="outline" disabled={disabled}
                onClick={play}>
                {playing?<Pause className="mr-1 h-4 w-4"/>:
                  <Play className="mr-1 h-4 w-4"/>}
                {playing?"Pause sequence":"Play sequence"}
              </Button>
              <Button size="sm" variant="outline"
                disabled={disabled||index>=plan.cuts.length-1}
                onClick={()=>changeCut(index+1)}>
                <SkipForward className="mr-1 h-4 w-4"/>Next cut
              </Button>
            </div>
            <label className="block space-y-1 text-xs">
              <span className="tabular-nums">Sequence scrub · {(cursor/16).toFixed(2)}s / {plan.totalSeconds.toFixed(2)}s</span>
              <Input type="range" min={0} max={max} value={cursor} step={1}
                aria-label="Preview whole editing sequence by original frame"
                disabled={disabled}
                onChange={event=>seek(Number(event.target.value))}
                className="min-h-10"/>
            </label>
            <p className="text-xs text-slate-400">
              Playback crosses source cuts locally. Browser seeking may not align
              exactly with decoded frames; offline FFmpeg is authoritative.
            </p>
          </div>
        </div>
        {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
      </div>}
    </section>
  );
}
