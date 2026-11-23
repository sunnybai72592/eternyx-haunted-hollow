import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, FileVideo2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {buildPortablePhoneIntake,buildPortablePhoneMovie} from "@/lib/ai/portablePhoneIntake.mjs";
import phonePython from "../../gpu-worker/prepare_video_sources.py?raw";
import renderPython from "../../gpu-worker/render_video_timeline.py?raw";
import assemblePython from "../../gpu-worker/assemble_video_storyboard.py?raw";
import auditPython from "../../gpu-worker/audit_video_render.py?raw";
import launchPython from "../../gpu-worker/launch_phone_intake.py?raw";
import moviePython from "../../gpu-worker/finish_phone_movie.py?raw";
import { Input } from "@/components/ui/input";
import {
  checkPreparedVideoSelection, phonePreparationCommand,
  readPhonePreparationReport, MAX_PREP_REPORT_BYTES,
} from "@/lib/ai/localVideoPrep.mjs";

type SelectedClip = {name: string; sha256: string; size: number};
type Report = ReturnType<typeof readPhonePreparationReport>;

export default function LocalVideoImportPrep({sources}: {sources: SelectedClip[]}) {
  const [start, setStart] = useState(0);
  const [originals,setOriginals]=useState<File[]>([]);
  const [movieCaptions,setMovieCaptions]=useState<string[]>([]);
  const [movieRights,setMovieRights]=useState<string[]>([]);
  const [movieCutSeconds,setMovieCutSeconds]=useState(1);
  const [movieProfile,setMovieProfile]=useState<"landscape"|"portrait"|"square">("landscape");
  const [movieQuality,setMovieQuality]=useState<"standard"|"high"|"cinematic">("standard");
  const [movieDelivery,setMovieDelivery]=useState<"mp4"|"mp4_with_subtitles"|"mp4_webm"|"all">("mp4");
  const [movieFraming,setMovieFraming]=useState<"contain"|"cover">("contain");
  const [bundling,setBundling]=useState(false);
  const [bundleStatus,setBundleStatus]=useState("");
  const bundleRequest=useRef(0);
  const [seconds, setSeconds] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = useRef(0);
  useEffect(() => () => { active.current++;bundleRequest.current++; }, []);

  let command = "";
  let commandError = "";
  try { command = phonePreparationCommand(start, seconds); }
  catch (cause) { commandError = cause instanceof Error ? cause.message : "Choose valid trim settings."; }
  let checked: ReturnType<typeof checkPreparedVideoSelection> | null = null;
  let checkError = "";
  if (report && sources.length) {
    try { checked = checkPreparedVideoSelection(report, sources); }
    catch (cause) { checkError = cause instanceof Error ? cause.message : "Could not check normalized clips."; }
  }

  const importReport = async (file?: File) => {
    const request = ++active.current;
    setError("");
    setMessage("");
    if (!file) return;
    try {
      if (file.name !== "preparation-report.json" || !file.size || file.size > MAX_PREP_REPORT_BYTES) {
        throw new Error("Choose the local preparation-report.json (up to 32 KiB).");
      }
      const parsed = readPhonePreparationReport(await file.text());
      if (request !== active.current) return;
      setReport(parsed);
      setMessage("Local import report opened. Its clip hashes can now be checked against your selected MP4 files.");
    } catch (cause) {
      if (request === active.current) setError(cause instanceof Error ? cause.message : "Could not read the import report.");
    }
  };

  const downloadPortablePhoneIntake=async(directMovie=false)=>{
    if(bundling)return;
    const token=++bundleRequest.current;
    setBundling(true);setBundleStatus("Hashing private original phone files locally...");
    setError("");setMessage("");
    try{
      const moviePlan=directMovie?{
        profile:movieProfile,quality:movieQuality,delivery:movieDelivery,
        framing:movieFraming,
        shots:originals.map((file,index)=>({
          source_filename:file.name,frames:movieCutSeconds*16,
          caption:movieCaptions[index]??"",
          rights_ref:movieRights[index]??"",
        })),
      }:null;
      const result=await (directMovie?buildPortablePhoneMovie:buildPortablePhoneIntake)({
        files:originals,start,seconds,moviePlan,
        pythonSources:{
          "prepare_video_sources.py":phonePython,
          "render_video_timeline.py":renderPython,
          "assemble_video_storyboard.py":assemblePython,
          "audit_video_render.py":auditPython,
          "launch_phone_intake.py":launchPython,
          "finish_phone_movie.py":moviePython,
        },
        onProgress:(p:{phase:string;done:number;total:number})=>{
          if(token===bundleRequest.current)
            setBundleStatus((p.phase==="hash"?"Verifying original clip ":"Packaging private ZIP entry ")+
              p.done+"/"+p.total);
        },
      });
      if(token!==bundleRequest.current)return;
      const url=URL.createObjectURL(result.blob);
      const link=document.createElement("a");
      link.href=url;link.download=result.filename;
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);
      setMessage((directMovie?"Downloaded a complete offline phone MOVIE project (":"Downloaded a complete private phone conversion project (")+
        (result.bytes/1048576).toFixed(2)+" MiB). Extract and launch it locally; "+
        (directMovie?
          "the runner creates H264 video.mp4, SRT/VTT captions, a real poster, playable local preview, receipts and editable source clips.":
          "the output includes verified 16 FPS MP4s AND a reusable editable project draft."));
    }catch(cause){
      if(token===bundleRequest.current)
        setError(cause instanceof Error?cause.message:"Could not export genuine private source conversion ZIP.");
    }finally{
      if(token===bundleRequest.current){setBundling(false);setBundleStatus("");}
    }
  };

  const copy = async () => {
    if (!command) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(command);
      setMessage("Offline conversion command copied.");
      setError("");
    } catch {
      setError("Clipboard access unavailable. Select and copy the command shown below.");
    }
  };

  return (
    <details className="rounded-lg border border-sky-400/25 bg-slate-950/50 p-4">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-sky-200">
        <FileVideo2 className="h-5 w-5"/>Import ordinary phone footage (24/30/60 FPS)
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-slate-300">
          Have camera clips that are not fixed 16 FPS? Prepare them first using our
          local CPU converter, then choose the resulting clip-01.mp4 and other MP4 files
          in the Studio editor below. This handles MP4, MOV and M4V sources, keeps their
          aspect ratios, strips embedded audio, and makes new 16 FPS H.264 MP4 files.
          Your originals remain unchanged. No cloud uploads or paid GPU.
        </p>
        <section className="space-y-3 rounded-lg border border-emerald-400/30 bg-emerald-950/10 p-3">
          <h4 className="font-semibold text-emerald-200">
            One private ZIP → verified phone clips + editable starter project
          </h4>
          <p className="text-sm text-slate-300">
            Select your original phone footage here. Download a standalone CPU conversion
            project containing these unchanged source files and the real Python/FFmpeg
            converter. No repository clone, cloud upload, paid GPU, or subscription.
          </p>
          <label className="block space-y-1 text-sm">
            Select 1–8 original MP4, MOV or M4V recordings (up to 64 MiB each)
            <Input type="file" multiple accept=".mp4,.mov,.m4v,video/mp4,video/quicktime"
              disabled={bundling}
              className="mt-1 min-h-11 border-slate-700 bg-slate-950"
              onChange={event=>{
                ++bundleRequest.current;
                const picked=Array.from(event.currentTarget.files??[]);
                setOriginals(picked);
                setMovieCaptions(picked.map(()=>""));
                setMovieRights(picked.map(()=>""));
                setError("");setMessage("");
                event.currentTarget.value="";
              }}/>
          </label>
          {originals.length>0&&<p className="text-xs text-emerald-200">
            {originals.length} original file(s) ·
            {" "}{(originals.reduce((sum,file)=>sum+file.size,0)/1048576).toFixed(2)} MiB,
            included privately in the ZIP.
          </p>}
          {originals.length>0&&<div className="space-y-3 rounded border border-sky-500/30 bg-slate-950/65 p-3">
            <h5 className="font-semibold text-sky-200">
              Direct finished movie — no draft reopen required
            </h5>
            <p className="text-xs leading-5 text-slate-300">
              Enter one genuine caption and recording/usage permission reference
              per original clip. Each is displayed as a sequential shot in the
              completed video. Nothing is invented or sent to a server.
            </p>
            {originals.map((file,index)=><div key={index+"-"+file.name}
              className="space-y-2 rounded border border-slate-700 p-3">
              <p className="break-all text-sm font-semibold text-sky-200">
                Shot {index+1}: {file.name}
              </p>
              <label className="block space-y-1 text-xs">
                Human-written caption (required for final render)
                <Input value={movieCaptions[index]??""} maxLength={180}
                  disabled={bundling} placeholder="Describe what the actual footage shows"
                  className="border-slate-700 bg-slate-900"
                  onChange={event=>setMovieCaptions(old=>
                    old.map((x,i)=>i===index?event.target.value:x))}/>
              </label>
              <label className="block space-y-1 text-xs">
                Recording or usage-rights reference (required)
                <Input value={movieRights[index]??""} maxLength={180}
                  disabled={bundling} placeholder="Your actual filming or license reference"
                  className="border-slate-700 bg-slate-900"
                  onChange={event=>setMovieRights(old=>
                    old.map((x,i)=>i===index?event.target.value:x))}/>
              </label>
            </div>)}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1 text-xs">
                Seconds per original shot (1–3)
                <Input type="number" min={1} max={3} step={1}
                  value={movieCutSeconds} disabled={bundling}
                  onChange={event=>setMovieCutSeconds(Number(event.target.value))}
                  className="border-slate-700 bg-slate-900"/>
              </label>
              <label className="block space-y-1 text-xs">
                Finished movie shape
                <select value={movieProfile} disabled={bundling}
                  onChange={event=>setMovieProfile(event.target.value as "landscape"|"portrait"|"square")}
                  className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-slate-100">
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                  <option value="square">Square</option>
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                Render quality
                <select value={movieQuality} disabled={bundling}
                  onChange={event=>setMovieQuality(event.target.value as "standard"|"high"|"cinematic")}
                  className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-slate-100">
                  <option value="standard">Standard · 16 FPS / fast</option>
                  <option value="high">High · 16 FPS / 512p-class</option>
                  <option value="cinematic">Cinematic · 24 FPS / up to 720p</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1 text-xs">
              How each shot fills the frame
              <select value={movieFraming} disabled={bundling}
                onChange={event=>setMovieFraming(event.target.value as "contain"|"cover")}
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-slate-100">
                <option value="contain">Keep whole shot (letterbox)</option>
                <option value="cover">Fill frame (center crop edges)</option>
              </select>
              <span className="text-slate-400">Fill crops real footage; it cannot create lost detail.</span>
            </label>
            <label className="block space-y-1 text-xs">
              Finished video files (created automatically by the same local launch)
              <select value={movieDelivery} disabled={bundling}
                onChange={event=>setMovieDelivery(event.target.value as "mp4"|"mp4_with_subtitles"|"mp4_webm"|"all")}
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-slate-100">
                <option value="mp4">H.264 MP4 + editable SRT (fastest)</option>
                <option value="mp4_with_subtitles">MP4 + additional selectable-caption MP4</option>
                <option value="mp4_webm">MP4 + VP9 WebM</option>
                <option value="all">MP4 + selectable-caption MP4 + VP9 WebM</option>
              </select>
            </label>
            <p className="text-xs text-slate-400">
              High quality uses a larger 512px-class canvas, slower H.264 encoder,
              CRF 19 and Lanczos scaling; source detail cannot be recovered by upscaling.
              Optional VP9 WebM requires local FFmpeg with libvpx-vp9; subtitle MP4
              requires mov_text. No additional manual export command.
            </p>
            <p className="text-xs text-slate-400">
              Maximum {originals.length*movieCutSeconds} seconds for this selection.
              All original recordings must contain enough frames after the chosen start offset.
              Editable SRT is always included; optional MP4 subtitle tracks are selectable, not burned into pixels.
            </p>
            <Button size="sm"
              disabled={bundling||!!commandError||movieCutSeconds<1||movieCutSeconds>3}
              onClick={()=>{void downloadPortablePhoneIntake(true);}}>
              <Download className="mr-2 h-4 w-4"/>
              {bundling?"Packaging local media...":"Download direct-to-finished-MP4 project ZIP"}
            </Button>
            <p className="text-xs text-amber-100">
              Extract your private ZIP, then launch finish-phone-movie-windows.cmd
              or sh finish-phone-movie-macos-linux.sh. Local Python 3.11+ and
              FFmpeg/FFprobe/libx264 are required. The launcher converts genuine
              footage and renders phone-movie-output/video.mp4 automatically.
              A normalized editing draft is retained for later refinement.
            </p>
          </div>}
          <Button size="sm" disabled={bundling||!originals.length||!!commandError}
            onClick={()=>{void downloadPortablePhoneIntake(false);}}>
            <Download className="mr-2 h-4 w-4"/>
            {bundling?"Verifying and packaging...":"Download runnable phone intake ZIP"}
          </Button>
          {bundleStatus&&<p role="status" className="text-xs text-emerald-200">{bundleStatus}</p>}
          <p className="text-xs leading-5 text-amber-100">
            Extract the ZIP into a new local folder. On Windows run
            <code className="mx-1">prepare-phone-windows.cmd</code>;
            on macOS/Linux run <code className="mx-1">sh prepare-phone-macos-linux.sh</code>.
            Python 3.11+, FFmpeg, FFprobe and libx264 must already be installed.
            This produces local-video-media/clip-XX.mp4 and
            <code className="mx-1">eternyx-video-edit-draft.json</code>.
            Reopen that draft in the editor, select the converted clips, add your real
            captions and source-rights references, then export the finished CPU project.
            Original media never leaves your machine through the app.
          </p>
          <p className="text-xs text-amber-200">
            Private ZIP contains complete original recordings; do not share it casually.
            This is offline video normalization, not AI-generated video.
          </p>
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="phone-prepare-start" className="block space-y-1 text-sm">
            Start at (whole seconds, 0–299)
            <Input id="phone-prepare-start" type="number" min={0} max={299} step={1}
              value={start} onChange={event => setStart(Number(event.target.value))}
              className="border-slate-700 bg-slate-900" />
          </label>
          <label htmlFor="phone-prepare-seconds" className="block space-y-1 text-sm">
            Max seconds per prepared clip (1–60)
            <Input id="phone-prepare-seconds" type="number" min={1} max={60} step={1}
              value={seconds} onChange={event => setSeconds(Number(event.target.value))}
              className="border-slate-700 bg-slate-900" />
          </label>
        </div>
        {commandError && <p role="alert" className="text-sm text-amber-200">{commandError}</p>}
        <p className="text-sm text-slate-300">
          Create a <code className="text-sky-200">phone-clips</code> folder in a local copy of the ETERNYX repository,
          put 1–8 source files there (each up to 64 MiB and 300 seconds), then run the command below
          on your computer with Python 3.11+, FFmpeg, FFprobe and libx264 installed.
          Use a new output folder name if <code className="text-sky-200">local-video-media</code> already exists.
        </p>
        <code className="block select-all overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-6 text-sky-200">
          {command || "Set a valid start offset and output duration."}
        </code>
        <Button size="sm" variant="outline" onClick={() => { void copy(); }} disabled={!command}>
          <Copy className="mr-2 h-4 w-4"/>Copy CPU preparation command
        </Button>
        <p className="text-xs leading-5 text-slate-400">
          The converter processes up to eight sources in filename order.
          It creates <code>clip-01.mp4</code>, <code>clip-02.mp4</code>, etc.,
          plus <code>preparation-report.json</code> containing source/output SHA-256 hashes.
          It never performs AI image generation or browser-side FFmpeg execution.
        </p>
        <div className="space-y-2 border-t border-slate-700 pt-3">
          <label htmlFor="phone-prepare-report" className="block text-sm font-medium">
            Optional: compare the converter report with your locally selected prepared MP4s
          </label>
          <Input id="phone-prepare-report" type="file" accept=".json,application/json"
            className="min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
            onChange={event => { void importReport(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
          {report && <p className="text-xs text-slate-300">
            Report lists {report.source_count} converted clips. Select its
            <code className="ml-1 text-sky-200">clip-XX.mp4</code> files in the editor below to compare file hashes.
          </p>}
          {checked && <p role="status" className="flex gap-2 text-sm text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>
            Selected clips match the local report: {checked.verifiedSelectedClips} of {checked.receiptClips}.
            {checked.complete ? " Complete set." : " Partial set only."}
          </p>}
          {checkError && <p role="alert" className="text-sm text-amber-200">{checkError}</p>}
          {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
          {message && <p role="status" className="text-sm text-sky-200">{message}</p>}
        </div>
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
          This verifies only that locally selected file bytes match a local self-reported manifest;
          it is not a digital signature or proof of ownership. Your original rights references
          must still be entered for the actual video shots.
        </p>
      </div>
    </details>
  );
}
