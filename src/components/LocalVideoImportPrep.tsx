import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, FileVideo2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkPreparedVideoSelection, phonePreparationCommand,
  readPhonePreparationReport, MAX_PREP_REPORT_BYTES,
} from "@/lib/ai/localVideoPrep.mjs";

type SelectedClip = {name: string; sha256: string; size: number};
type Report = ReturnType<typeof readPhonePreparationReport>;

export default function LocalVideoImportPrep({sources}: {sources: SelectedClip[]}) {
  const [start, setStart] = useState(0);
  const [seconds, setSeconds] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = useRef(0);
  useEffect(() => () => { active.current++; }, []);

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
