import { useEffect, useRef, useState, type SetStateAction } from "react";
import LocalRenderReview from "@/components/LocalRenderReview";
import { buildPortableVideoBundle, PORTABLE_DELIVERIES } from "@/lib/ai/portableVideoBundle.mjs";
import {
  VIDEO_DRAFT_LIMITS,createLocalVideoDraft,
  readLocalVideoDraft,verifyLocalVideoDraftMedia,
} from "@/lib/ai/localVideoDraft.mjs";
import rendererPython from "../../gpu-worker/render_video_timeline.py?raw";
import storyboardPython from "../../gpu-worker/assemble_video_storyboard.py?raw";
import auditPython from "../../gpu-worker/audit_video_render.py?raw";
import localLauncherPython from "../../gpu-worker/launch_portable_video.py?raw";
import LocalVideoImportPrep from "@/components/LocalVideoImportPrep";
import LocalVideoTimeline from "@/components/LocalVideoTimeline";
import LocalVideoSequenceReview from "@/components/LocalVideoSequenceReview";
import {
  newTimelineHistory,commitTimelineHistory,undoTimelineHistory,
  redoTimelineHistory,resetTimelineHistory,timelineHistoryStatus,
} from "@/lib/ai/localVideoEditHistory.mjs";
import LocalMotionComposer from "@/components/LocalMotionComposer";
import LocalLearnedVideoStudio from "@/components/LocalLearnedVideoStudio";
import TinyNeuralVideoStudio from "@/components/TinyNeuralVideoStudio";
import SpatiotemporalNeuralStudio from "@/components/SpatiotemporalNeuralStudio";
import CpuNeuralModelComparison from "@/components/CpuNeuralModelComparison";
import CausalRolloutAdaptStudio from "@/components/CausalRolloutAdaptStudio";
import NeuralScheduleSelectionStudio from "@/components/NeuralScheduleSelectionStudio";
import TaggedNeuralVideoStudio from "@/components/TaggedNeuralVideoStudio";
import TaggedSpatialMotionStudio from "@/components/TaggedSpatialMotionStudio";
import TemporalCoherenceStudio from "@/components/TemporalCoherenceStudio";
import { Clapperboard, Copy, Download, Film, Music2, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  buildLocalVideoBoard, checkLocalMediaName, localVideoCommand, localVideoSrt,
  LOCAL_VIDEO_LIMITS, LOCAL_VIDEO_PROFILES, LOCAL_VIDEO_QUALITIES,
} from "@/lib/ai/localVideoEditor.mjs";

type LocalFile = { name: string; size: number; sha256: string; file: File; url: string };
type LocalShot = {
  sourceName: string; startFrame: number; frames: number; caption: string;
  rightsRef: string; fadeInFrames: number; fadeOutFrames: number;
};
type LocalSound = LocalFile & { rightsRef: string; volumePercent: number };
type RenderProfile = "landscape" | "portrait" | "square";
type RenderQuality = "standard" | "high" | "cinematic";

function saveDownload(text: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function newShot(name: string, fps=16): LocalShot {
  return { sourceName: name, startFrame: 0, frames: fps, caption: "",
    rightsRef: "", fadeInFrames: 0, fadeOutFrames: 0 };
}

async function fingerprint(file: File, kind: "video" | "audio"): Promise<LocalFile> {
  checkLocalMediaName(file.name, kind);
  const max = kind === "video" ? LOCAL_VIDEO_LIMITS.maxSourceBytes : LOCAL_VIDEO_LIMITS.maxAudioBytes;
  if (!file.size || file.size > max) throw new Error(kind === "video"
    ? "Each MP4 must be 1 byte–64 MiB." : "Soundtrack must be 1 byte–16 MiB.");
  if (!crypto?.subtle?.digest) throw new Error("This browser needs a secure context for local SHA-256 hashing.");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  return { file, name: file.name, size: file.size, sha256, url: URL.createObjectURL(file) };
}

export default function LocalVideoEditor() {
  const [sources, setSources] = useState<LocalFile[]>([]);
  const [timelineHistory,setTimelineHistory] = useState(()=>newTimelineHistory());
  const shots = timelineHistory.present as LocalShot[];
  // All shot edits (manual form AND visual timeline) participate in the same
  // bounded undo/redo journal. Metadata only, never private File/Blob bytes.
  const setShots = (update:SetStateAction<LocalShot[]>)=>{
    setTimelineHistory(old=>commitTimelineHistory(old,
      typeof update==="function"?update(old.present as LocalShot[]):update));
  };
  const historyStatus=timelineHistoryStatus(timelineHistory);
  const undoShotEdit=()=>setTimelineHistory(old=>undoTimelineHistory(old));
  const redoShotEdit=()=>setTimelineHistory(old=>redoTimelineHistory(old));
  const [soundtrack, setSoundtrack] = useState<LocalSound | null>(null);
  const [profile, setProfile] = useState<RenderProfile>("landscape");
  const [quality, setQuality] = useState<RenderQuality>("standard");
  const [delivery,setDelivery]=useState("mp4");
  const fps:16|24=quality==="cinematic"?24:16;
  const [selectedSource, setSelectedSource] = useState("");
  const [working, setWorking] = useState(false);
  const [audioWorking, setAudioWorking] = useState(false);
  const [bundleWorking, setBundleWorking] = useState(false);
  const [bundleProgress, setBundleProgress] = useState("");
  const [draftName, setDraftName] = useState("My ETERNYX video");
  const [pendingDraft, setPendingDraft] =
    useState<ReturnType<typeof readLocalVideoDraft> | null>(null);
  const [draftWorking, setDraftWorking] = useState(false);
  const [draftProgress, setDraftProgress] = useState("");
  const draftVersion = useRef(0);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const videoVersion = useRef(0);
  const audioVersion = useRef(0);
  const urls = useRef<string[]>([]);
  const audioUrl = useRef<string | null>(null);

  useEffect(() => () => {
    videoVersion.current++;
    audioVersion.current++;
    draftVersion.current++;
    urls.current.forEach(url => URL.revokeObjectURL(url));
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, []);

  const downloadDraft = () => {
    try {
      const saved = createLocalVideoDraft({
        name:draftName,sources,shots,soundtrack,profile,quality,
      });
      saveDownload(saved.json,saved.filename,"application/json");
      setMessage("");
      setNotice("Editable project draft saved without any MP4 or audio bytes. Keep the original files to resume later.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save local editing draft.");
    }
  };

  const loadDraft = async (file?: File) => {
    const current=++draftVersion.current;
    ++videoVersion.current;
    ++audioVersion.current;
    // The pending download is superseded; its async completion is ignored.
    // Reset in-flight indicators because stale requests no longer own them.
    setWorking(false);
    setAudioWorking(false);
    setDraftWorking(false);
    setDraftProgress("");
    setMessage("");
    setNotice("");
    setPendingDraft(null);
    try {
      if (!file || file.name !== "eternyx-video-edit-draft.json" ||
          file.size<1 || file.size>VIDEO_DRAFT_LIMITS.maxBytes)
        throw new Error("Select a valid eternyx-video-edit-draft.json, at most 32 KiB.");
      const draft=readLocalVideoDraft(await file.text());
      if(current!==draftVersion.current)return;
      setPendingDraft(draft);
      setNotice("Draft loaded safely. Reconnect all "+(draft.sources.length+(draft.soundtrack?1:0))+
        " ORIGINAL source files to verify their actual bytes. Your current timeline remains untouched until verification succeeds.");
    } catch (error) {
      if(current===draftVersion.current)
        setMessage(error instanceof Error ? error.message : "This project draft is not valid.");
    }
  };

  const restoreDraft = async (files: File[]) => {
    if (!pendingDraft || draftWorking) return;
    const current=++draftVersion.current;
    setDraftWorking(true);
    setDraftProgress("Checking actual source file bytes locally...");
    setMessage("");
    setNotice("");
    let prepared:LocalFile[]=[];
    let newAudio:LocalSound|null=null;
    let committed=false;
    try {
      const verified=await verifyLocalVideoDraftMedia(pendingDraft,files,
        (step:{checked:number;total:number;name:string})=>{
          if(current===draftVersion.current)
            setDraftProgress("Verified "+step.checked+"/"+step.total+
              " original files · "+step.name);
        });
      if(current!==draftVersion.current)return;
      prepared=verified.sources.map((item:{
        name:string;size:number;sha256:string;file:File;
      })=>({...item,url:URL.createObjectURL(item.file)}));
      if(verified.soundtrack){
        const item=verified.soundtrack as {
          name:string;size:number;sha256:string;file:File;
          rightsRef:string;volumePercent:number;
        };
        newAudio={...item,url:URL.createObjectURL(item.file)};
      }
      if(current!==draftVersion.current)return;
      ++videoVersion.current;
      ++audioVersion.current;
      urls.current.forEach(url=>URL.revokeObjectURL(url));
      if(audioUrl.current)URL.revokeObjectURL(audioUrl.current);
      urls.current=prepared.map(f=>f.url);
      audioUrl.current=newAudio?.url??null;
      setSources(prepared);
      setTimelineHistory(resetTimelineHistory(verified.shots));
      setSoundtrack(newAudio);
      setSelectedSource(prepared[0].name);
      setProfile(verified.profile);
      setQuality(verified.quality);
      setDraftName(verified.name);
      setPendingDraft(null);
      setNotice("Editing project restored: "+verified.verifiedCount+
        " original files passed SHA-256 verification. Cuts, captions, rights, audio and output settings are editable again.");
      committed=true;
    } catch (error) {
      if(current===draftVersion.current)
        setMessage(error instanceof Error ? error.message :
          "Could not verify all original files. Existing timeline was not changed.");
    } finally {
      if(!committed){
        prepared.forEach(f=>URL.revokeObjectURL(f.url));
        if(newAudio)URL.revokeObjectURL(newAudio.url);
      }
      if(current===draftVersion.current){
        setDraftWorking(false);setDraftProgress("");
      }
    }
  };

  // Never reinterpret an existing 16 FPS frame as a 24 FPS frame.
  // Only permit mode switches when every exact time-based value can be
  // converted without rounding source position, duration or fades.
  const switchQuality=(next:RenderQuality)=>{
    const target=next==="cinematic"?24:16;
    if(target===fps){setQuality(next);return;}
    try{
      const mapped=shots.map(shot=>{
        const scaled={...shot};
        for(const key of ["startFrame","frames","fadeInFrames","fadeOutFrames"] as const){
          const exact=shot[key]*target/fps;
          if(!Number.isSafeInteger(exact))
            throw new Error("Switching FPS would round an existing cut or fade. Save this draft first or adjust to whole shared frame boundaries.");
          scaled[key]=exact;
        }
        if(scaled.startFrame+scaled.frames>target*60||
           scaled.frames>target*30||scaled.fadeInFrames>16||scaled.fadeOutFrames>16)
          throw new Error("Selected cuts or fades exceed the destination FPS limits.");
        return scaled;
      });
      if(mapped.reduce((sum,shot)=>sum+shot.frames,0)>target*30)
        throw new Error("Converted timeline exceeds 30 seconds.");
      // Old undo snapshots are in a different frame timebase; do not restore them.
      setTimelineHistory(resetTimelineHistory(mapped));
      setQuality(next);setMessage("");setNotice("Timeline switched to "+target+" FPS without changing cut timings.");
    }catch(cause){
      setMessage(cause instanceof Error?cause.message:"Cannot safely change frame rate.");
    }
  };
  const changeShot = (index: number, changes: Partial<LocalShot>) => {
    setShots(old => old.map((shot, i) => i === index ? { ...shot, ...changes } : shot));
    setMessage("");
    setNotice("");
  };

  const selectVideos = async (files: File[]) => {
    const current = ++videoVersion.current;
    setWorking(true);
    setMessage("");
    setNotice("");
    const prepared: LocalFile[] = [];
    let committed = false;
    try {
      if (!files.length || files.length > LOCAL_VIDEO_LIMITS.maxClips) {
        throw new Error("Choose between 1 and 8 local MP4 files.");
      }
      const filenames = files.map(file => file.name.toLowerCase());
      if (new Set(filenames).size !== filenames.length) {
        throw new Error("Selected MP4 filenames must be unique, ignoring capitalization.");
      }
      for (const file of files) {
        const item = await fingerprint(file, "video");
        prepared.push(item);
        if (current !== videoVersion.current) return;
      }
      if (current !== videoVersion.current) return;
      urls.current.forEach(url => URL.revokeObjectURL(url));
      urls.current = prepared.map(item => item.url);
      committed = true;
      setSources(prepared);
      setTimelineHistory(resetTimelineHistory(prepared.map(file => newShot(file.name,fps))));
      setSelectedSource(prepared[0].name);
      setNotice("Files hashed locally. Add captions and rights references before exporting.");
    } catch (error) {
      if (current === videoVersion.current) {
        setMessage(error instanceof Error ? error.message : "Could not read the selected files.");
      }
    } finally {
      if (!committed) prepared.forEach(item => URL.revokeObjectURL(item.url));
      if (current === videoVersion.current) setWorking(false);
    }
  };

  const selectSoundtrack = async (file?: File) => {
    const current = ++audioVersion.current;
    setAudioWorking(Boolean(file));
    setMessage("");
    setNotice("");
    if (!file) {
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = null;
      setSoundtrack(null);
      return;
    }
    let selected: LocalFile | null = null;
    try {
      selected = await fingerprint(file, "audio");
      if (current !== audioVersion.current) return;
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = selected.url;
      setSoundtrack({ ...selected, rightsRef: "", volumePercent: 35 });
      setNotice("Soundtrack SHA-256 verified locally. Enter its usage rights reference.");
    } catch (error) {
      if (current === audioVersion.current) {
        setMessage(error instanceof Error ? error.message : "Could not hash soundtrack.");
      }
    } finally {
      if (current !== audioVersion.current && selected) URL.revokeObjectURL(selected.url);
      if (current === audioVersion.current) setAudioWorking(false);
    }
  };

  let ready: ReturnType<typeof buildLocalVideoBoard> | null = null;
  let validation = "";
  if (sources.length) {
    try {
      ready = buildLocalVideoBoard({ sources, shots, soundtrack, quality });
    } catch (error) {
      validation = error instanceof Error ? error.message : "Check the selected timeline.";
    }
  }
  const command = localVideoCommand(profile, quality);
  const exportPortableBundle = async () => {
    if (!ready || bundleWorking) return;
    setBundleWorking(true);
    setMessage("");
    setNotice("");
    setBundleProgress("Verifying actual source media...");
    try {
      const output = await buildPortableVideoBundle({
        sources, shots, soundtrack, profile, quality, delivery,
        rendererSources: {
          "render_video_timeline.py": rendererPython,
          "assemble_video_storyboard.py": storyboardPython,
          "audit_video_render.py": auditPython,
          "launch_portable_video.py": localLauncherPython,
        },
        onProgress: (p: { done: number; total: number; phase: string }) =>
          setBundleProgress(
            (p.phase === "verify" ? "Verifying actual file " : "Packaging archive entry ") +
            p.done + "/" + p.total + "..."
          ),
      });
      const url = URL.createObjectURL(output.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = output.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice(
        "Portable CPU project saved (" +
        (output.bytes / 1024 / 1024).toFixed(2) + " MiB). Extract the ZIP and run the " +
        "included local launcher to make video.mp4. Your media was not uploaded."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export portable local project.");
    } finally {
      setBundleWorking(false);
      setBundleProgress("");
    }
  };
  const chosen = sources.find(source => source.name === selectedSource);
  const total = shots.reduce((sum, shot) => sum + (Number.isFinite(shot.frames) ? shot.frames : 0), 0);
  const updateSound = (patch: Partial<LocalSound>) => {
    setSoundtrack(old => old ? { ...old, ...patch } : null);
    setMessage("");
    setNotice("");
  };

  return (
    <Card className="border-emerald-400/25 bg-slate-900/70 text-slate-100" aria-labelledby="local-video-editor-heading">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="local-video-editor-heading" className="flex items-center gap-2 text-xl text-foreground">
            <Clapperboard className="h-5 w-5 text-emerald-300" /> Local CPU video editor handoff
          </CardTitle>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">Offline · No paid GPU</Badge>
        </div>
        <CardDescription className="leading-6 text-slate-300">
          Prepare a real short-video timeline using your own MP4 files, optional soundtrack, and a rights-checked storyboard.
          Export an actual FFmpeg-compatible project. The browser prepares the project; Python/FFmpeg runs the render on your own computer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="border-sky-400/30 bg-sky-950/20 text-sky-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Media is read and SHA-256 hashed in this browser. Nothing is uploaded or submitted to an AI API.
            Your selected files are not saved as a persistent draft. Reloading clears the selection.
            The local Python renderer must verify exact {fps} FPS, frame counts, source hashes and available codecs.
          </AlertDescription>
        </Alert>

        <LocalMotionComposer />
        <LocalLearnedVideoStudio />
        <TinyNeuralVideoStudio />
        <SpatiotemporalNeuralStudio />
        <CpuNeuralModelComparison />
        <CausalRolloutAdaptStudio />
        <NeuralScheduleSelectionStudio />
        <TaggedNeuralVideoStudio />
        <TaggedSpatialMotionStudio />
        <TemporalCoherenceStudio />

        <LocalVideoImportPrep sources={sources} />

        <section className="space-y-3 rounded-lg border border-indigo-400/30 bg-indigo-950/10 p-4"
          aria-labelledby="local-draft-heading">
          <h3 id="local-draft-heading" className="flex items-center gap-2 font-semibold">
            <Film className="h-4 w-4"/>Save or reopen an editable local video project
          </h3>
          <p className="text-sm text-slate-300">
            Save your unfinished cuts, captions, rights references, soundtrack settings,
            output profile and original file SHA-256 fingerprints as a tiny JSON draft.
            The draft stores <strong>no MP4/audio bytes</strong>, uses no cloud storage,
            and can be restored after reselecting the exact original files.
          </p>
          <label className="block space-y-1 text-sm">Project title
            <Input value={draftName} maxLength={VIDEO_DRAFT_LIMITS.maxTitleLength}
              onChange={e=>setDraftName(e.target.value)}
              className="border-slate-700 bg-slate-950" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!sources.length || draftWorking || working || audioWorking}
              onClick={downloadDraft}>
              <Download className="mr-2 h-4 w-4"/>Save editable project draft (.json)
            </Button>
          </div>
          <label className="block space-y-1 text-sm">
            Open a previously saved eternyx-video-edit-draft.json
            <Input type="file" accept=".json,application/json"
              disabled={draftWorking || bundleWorking}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={e=>{void loadDraft(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
          </label>
          {pendingDraft && <div className="space-y-3 rounded border border-indigo-500/40 bg-slate-950/70 p-3">
            <p className="text-sm font-semibold text-indigo-200">
              Draft: {pendingDraft.name} · {pendingDraft.shots.length} cuts
            </p>
            <p className="text-xs text-slate-300">
              Before replacing your current editing timeline, select all exact original files:
            </p>
            <ul className="space-y-1 text-xs text-slate-300">
              {[...pendingDraft.sources,...(pendingDraft.soundtrack?[pendingDraft.soundtrack]:[])]
                .map(source=><li key={source.sha256+source.name} className="break-all">
                  {source.name} · {(source.size/1024/1024).toFixed(2)} MiB · SHA-256 {source.sha256.slice(0,16)}…
                </li>)}
            </ul>
            <label className="block space-y-1 text-sm">
              Reattach all original MP4 files{pendingDraft.soundtrack?" and soundtrack":""}
              <Input type="file" multiple accept=".mp4,.wav,.mp3,.m4a,video/mp4,audio/*"
                disabled={draftWorking}
                className="mt-1 min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
                onChange={e=>{void restoreDraft(Array.from(e.currentTarget.files??[]));e.currentTarget.value="";}}/>
            </label>
            <Button variant="ghost" size="sm" disabled={draftWorking}
              onClick={()=>{++draftVersion.current;setPendingDraft(null);setNotice("Draft restore cancelled; your existing timeline is unchanged.");}}>
              Cancel draft restore
            </Button>
          </div>}
          {draftWorking&&<p role="status" className="text-xs text-indigo-200">
            {draftProgress||"Verifying local project files..."}
          </p>}
          <p className="text-xs text-amber-100">
            Restoring is all-or-nothing: wrong, missing or altered source files
            are rejected; no partial timeline is loaded. Your project JSON is
            not an MP4 renderer and does not include copyrighted media.
          </p>
        </section>

        <div className="space-y-3 rounded-lg border border-slate-700 p-4">
          <label htmlFor="local-video-clips" className="flex items-center gap-2 text-sm font-semibold"><Upload className="h-4 w-4"/>Select 1–8 local MP4 clips (up to 64 MiB each)</label>
          <Input id="local-video-clips" type="file" multiple accept=".mp4,video/mp4" disabled={working || draftWorking || Boolean(pendingDraft)}
            className="min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
            onChange={event => {
              void selectVideos(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }} />
          {working && <p role="status" className="text-sm text-cyan-200">Reading and hashing local video files…</p>}
          {sources.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Loaded locally · filenames and SHA-256 are included in the export, not the video bytes.</p>
              <ul className="space-y-1 text-xs">
                {sources.map(file => <li key={file.sha256 + file.name} className="break-all rounded bg-slate-950 px-3 py-2">
                  <span className="font-semibold">{file.name}</span> · {(file.size / (1024 * 1024)).toFixed(2)} MiB · SHA-256 {file.sha256.slice(0, 16)}…
                </li>)}
              </ul>
              <label htmlFor="local-source-preview" className="block text-sm">Preview an original source clip</label>
              <select id="local-source-preview" className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2"
                value={selectedSource} onChange={e => setSelectedSource(e.target.value)}>
                {sources.map(file => <option key={file.sha256 + file.name} value={file.name}>{file.name}</option>)}
              </select>
              {chosen && <video key={chosen.url} controls playsInline preload="metadata" src={chosen.url}
                aria-label={"Original source clip " + chosen.name}
                className="max-h-72 w-full rounded-lg border border-slate-700 bg-black" />}
              <p className="text-xs text-amber-100">This player previews the selected <strong>original</strong> MP4, not the edited output. Browsers cannot guarantee the source is constant-frame-rate {fps} FPS.</p>
            </div>
          )}
        </div>

        {sources.length > 0 && (
          <LocalVideoTimeline shots={shots} sources={sources} fps={fps}
            disabled={working || audioWorking || bundleWorking || draftWorking || Boolean(pendingDraft)}
            canUndo={historyStatus.undo} canRedo={historyStatus.redo}
            onUndo={undoShotEdit} onRedo={redoShotEdit}
            onChange={next=>{
              setShots(next);
              setMessage("");
              setNotice("");
            }}/>
        )}

        {sources.length > 0 && (
          <LocalVideoSequenceReview
            sources={sources} shots={shots} soundtrack={soundtrack}
            profile={profile} quality={quality}
            disabled={working || audioWorking || bundleWorking || draftWorking || Boolean(pendingDraft)}
            onJumpToShot={index=>{
              document.getElementById("local-video-shot-"+index)
                ?.scrollIntoView({behavior:"smooth",block:"center"});
            }}
          />
        )}

        {sources.length > 0 && (
          <section className="space-y-4" aria-labelledby="local-shot-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="local-shot-title" className="font-semibold">Real shot cuts · {shots.length} / 8 · {(total / fps).toFixed(2)} / 30 seconds</h3>
              <Button variant="outline" size="sm" disabled={shots.length >= 8} onClick={() => {
                setShots(old => [...old, newShot(selectedSource || sources[0].name,fps)]); setNotice("");
              }}><Plus className="mr-1 h-4 w-4"/>Add another cut</Button>
            </div>
            {shots.map((shot, i) => (
              <div key={i} id={"local-video-shot-"+i} className="space-y-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-slate-100">Shot {i + 1}</h4>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" disabled={i === 0} onClick={() => {
                      setShots(old => { const next = [...old]; [next[i-1], next[i]] = [next[i], next[i-1]]; return next; });
                      setNotice("");
                    }}>Move up</Button>
                    <Button variant="outline" size="sm" disabled={i === shots.length - 1} onClick={() => {
                      setShots(old => { const next = [...old]; [next[i+1], next[i]] = [next[i], next[i+1]]; return next; });
                      setNotice("");
                    }}>Move down</Button>
                    <Button variant="ghost" size="sm" disabled={shots.length === 1} aria-label={"Remove shot " + (i+1)}
                      onClick={() => { setShots(old => old.filter((_, index) => index !== i)); setNotice(""); }}><Trash2 className="h-4 w-4"/></Button>
                  </div>
                </div>
                <label className="block space-y-1 text-sm">Source MP4
                  <select className="min-h-11 w-full rounded border border-slate-700 bg-slate-900 px-2"
                    value={shot.sourceName} onChange={e => changeShot(i, { sourceName: e.target.value })}>
                    {sources.map(file => <option key={file.name} value={file.name}>{file.name}</option>)}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {([
                    [`Start frame (${fps} FPS)`, "startFrame", 0, fps*60],
                    [`Frames (up to ${fps*30})`, "frames", 1, fps*30],
                    ["Fade in frames", "fadeInFrames", 0, 16],
                    ["Fade out frames", "fadeOutFrames", 0, 16],
                  ] as const).map(([label, key, min, max]) => (
                    <label key={key} className="space-y-1 text-sm">{label}
                      <Input type="number" min={min} max={max} step="1" value={shot[key]}
                        className="border-slate-700 bg-slate-900"
                        onChange={e => changeShot(i, { [key]: Number(e.target.value) })} />
                    </label>
                  ))}
                </div>
                <label className="block space-y-1 text-sm">Caption (human-authored, for editable SRT)
                  <Input maxLength={180} value={shot.caption} onChange={e => changeShot(i, { caption: e.target.value })}
                    placeholder="Describe what actually happens in the selected footage" className="border-slate-700 bg-slate-900" />
                </label>
                <label className="block space-y-1 text-sm">Source rights reference
                  <Input maxLength={180} value={shot.rightsRef} onChange={e => changeShot(i, { rightsRef: e.target.value })}
                    placeholder="Your original shoot log or permission record" className="border-slate-700 bg-slate-900" />
                </label>
              </div>
            ))}
            <p className="text-xs text-slate-400">Offsets and lengths are frame counts at {fps} FPS; {fps} frames = 1 second. The Python renderer rejects cuts beyond the actual decoded source length.</p>
          </section>
        )}

        <section className="space-y-3 rounded-lg border border-slate-700 p-4" aria-labelledby="local-audio-heading">
          <h3 id="local-audio-heading" className="flex items-center gap-2 font-semibold"><Music2 className="h-4 w-4"/>Optional licensed background audio</h3>
          <label htmlFor="local-audio-file" className="block text-sm">Select WAV, MP3 or M4A (up to 16 MiB)</label>
          <Input id="local-audio-file" type="file" accept=".wav,.mp3,.m4a,audio/*" disabled={audioWorking || draftWorking || Boolean(pendingDraft)}
            className="min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
            onChange={e => { void selectSoundtrack(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
          {audioWorking && <p role="status" className="text-sm text-cyan-200">Hashing audio locally…</p>}
          {soundtrack && <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-all text-xs">{soundtrack.name} · SHA-256 {soundtrack.sha256.slice(0, 16)}…</p>
              <Button size="sm" variant="outline" onClick={() => { void selectSoundtrack(); }}>Remove soundtrack</Button>
            </div>
            <audio controls preload="metadata" src={soundtrack.url} aria-label="Original soundtrack preview" className="w-full" />
            <label className="block space-y-1 text-sm">Soundtrack rights reference
              <Input value={soundtrack.rightsRef} maxLength={180} onChange={e => updateSound({ rightsRef: e.target.value })}
                placeholder="License or your recording log" className="border-slate-700 bg-slate-950" />
            </label>
            <label className="block space-y-1 text-sm">Soundtrack volume · {soundtrack.volumePercent}%
              <Input type="range" min={0} max={100} value={soundtrack.volumePercent}
                onChange={e => updateSound({ volumePercent: Number(e.target.value) })} className="min-h-11" />
            </label>
          </>}
          <p className="text-xs text-slate-400">Audio loops or trims only in the local FFmpeg renderer. Source-video audio is removed. A rights reference records your assertion; it does not verify a license.</p>
        </section>

        <section className="space-y-4 rounded-lg border border-slate-700 p-4" aria-labelledby="local-export-heading">
          <h3 id="local-export-heading" className="flex items-center gap-2 font-semibold"><Film className="h-4 w-4"/>Export a project for your CPU renderer</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">Video shape
              <select value={profile} onChange={e => setProfile(e.target.value as RenderProfile)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {LOCAL_VIDEO_PROFILES.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm">Output resolution
              <select value={quality} onChange={e => switchQuality(e.target.value as RenderQuality)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {LOCAL_VIDEO_QUALITIES.map(name => <option key={name} value={name}>{name==="cinematic"?"Cinematic · native 24 FPS / up to 720p":name}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm">Offline movie delivery formats
            <select value={delivery} disabled={bundleWorking} onChange={e=>setDelivery(e.target.value)}
              className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
              {PORTABLE_DELIVERIES.map(mode=><option key={mode} value={mode}>{({
                mp4:"MP4 + offline player",mp4_with_subtitles:"MP4 + selectable subtitle MP4",
                mp4_webm:"MP4 + WebM",all:"All formats + offline player",
              } as Record<string,string>)[mode]}</option>)}
            </select>
            <span className="block text-xs text-slate-400">The local launcher verifies every requested movie and keeps the licensed soundtrack. Poster, VTT, transcript and watch.html are included. Direct render scripts export the master only.</span>
          </label>
          {validation && <p role="alert" className="text-sm text-amber-200">{validation}</p>}
          {message && <p role="alert" className="text-sm text-rose-200">{message}</p>}
          {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}
          {ready && <p className="text-sm text-emerald-200">Storyboard valid for export: {ready.board.shots.length} cuts · {ready.seconds.toFixed(2)} s. Python will verify each source on render.</p>}
          <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-950/10 p-3">
            <p className="font-semibold text-emerald-100">One ZIP · Real CPU renderer + guided local launch</p>
            <p className="text-sm text-slate-300">
              Download a runnable {fps} FPS project with the edited storyboard, only its referenced
              original MP4s, any licensed soundtrack, SRT preview, three reviewed Python
              renderer modules, and Windows/macOS/Linux launch instructions.
              Includes preflight checks, verified output and a cancel-capable desktop runner.
              No repository checkout, GPU or paid AI API is needed.
            </p>
            <Button disabled={!ready || working || audioWorking || bundleWorking}
              onClick={() => { void exportPortableBundle(); }}>
              <Download className="mr-2 h-4 w-4"/>
              {bundleWorking ? "Preparing verified offline ZIP..." : "Download complete CPU video project (.zip)"}
            </Button>
            {bundleProgress && <p role="status" className="text-xs text-emerald-200">{bundleProgress}</p>}
            <p className="text-xs text-amber-100">
              This private ZIP contains your original video and soundtrack bytes.
              Save it only somewhere you trust. Extract it and launch
              <code className="mx-1">launch-video-windows.cmd</code> on Windows, or
              <code className="mx-1">sh launch-video-macos-linux.sh</code> on macOS/Linux.
              Python 3.11+, FFmpeg/FFprobe and standard Tkinter are needed for the desktop window.
              Without Tkinter, use <code>python3 launch_portable_video.py --check</code>
              and then <code>python3 launch_portable_video.py --run</code>.
              The MP4 is generated locally, never in your hosted browser.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!ready || working || audioWorking || bundleWorking}
              onClick={() => ready && saveDownload(ready.json, "eternyx-video-v2.json", "application/json")}>
              <Download className="mr-2 h-4 w-4"/>Download FFmpeg storyboard
            </Button>
            <Button variant="outline" disabled={!ready || working || audioWorking}
              onClick={() => ready && saveDownload(localVideoSrt(ready.board), "eternyx-video-captions-preview.srt", "text/plain;charset=utf-8")}>
              <Download className="mr-2 h-4 w-4"/>Download SRT preview
            </Button>
            <Button variant="outline" disabled={!ready || working || audioWorking}
              onClick={() => {
                if (!navigator.clipboard?.writeText) {
                  setMessage("Clipboard access is unavailable. Select and copy the command below.");
                  return;
                }
                void navigator.clipboard.writeText(command).then(
                  () => setNotice("Local render command copied."),
                  () => setMessage("Clipboard access denied. Select and copy the command below."),
                );
              }}>
              <Copy className="mr-2 h-4 w-4"/>Copy local render command
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">How to render a real MP4 on your own machine</p>
            <p className="text-sm text-slate-300">
              1. Save the downloaded JSON in your ETERNYX repository folder. 2. Put your unchanged MP4 originals
              {soundtrack ? " and selected soundtrack" : ""} into a folder named <code className="text-cyan-200">local-video-media</code> there.
              3. Install local Python 3.11+, FFmpeg and FFprobe (with libx264). 4. Run the command below from the repository root.
              5. Open <code className="text-cyan-200">eternyx-video-output/video.mp4</code> when the local process completes.
            </p>
            <code className="block select-all overflow-x-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-6 text-cyan-200">{command}</code>
            <p className="text-xs text-amber-100">This browser does not execute Python, render a finished MP4, upload your footage or run a remote worker. It exports a validated local project for the real offline renderer.</p>
          </div>
        </section>
        <LocalRenderReview project={ready} profile={profile} quality={quality}
          original={chosen ? {name: chosen.name, url: chosen.url} : undefined} />
      </CardContent>
    </Card>
  );
}
