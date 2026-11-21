import { useRef, useState } from "react";
import { Clapperboard, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { saveCopy } from "@/lib/workspaceNotes.mjs";
import { Button } from "@/components/ui/button";
import { buildStoryboard, readStoryboard, frameFormats, shotDurations, timecode } from "@/lib/ai/storyboard.mjs";

function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function VideoStoryboard() {
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(5);
  const [format, setFormat] = useState("16:9");
  const [selection, setSelection] = useState(0);
  const [pending, setPending] = useState<ReturnType<typeof readStoryboard> | null>(null);
  const [importError, setImportError] = useState("");
  const version = useRef(0);
  async function previewFile(file?: File) {
    const attempt = ++version.current;
    setPending(null);
    setImportError("");
    if (!file) return;
    try {
      if (file.size > 128 * 1024) throw new Error("Choose a storyboard under 128 KiB.");
      const imported = readStoryboard(await file.text());
      if (version.current === attempt) setPending(imported);
    } catch (cause) {
      if (version.current === attempt) setImportError(cause instanceof Error ? cause.message : "The storyboard could not be read.");
    }
  }

  function applyImport() {
    if (!pending) return;
    setText(pending.text);
    setSeconds(pending.seconds);
    setFormat(pending.format);
    setSelection(0);
    setPending(null);
  }

  let board: ReturnType<typeof buildStoryboard> | undefined;
  let error = "";
  try { board = buildStoryboard(text, seconds, format); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Check the shot list."; }
  const shots = board?.shots ?? [];
  const active = shots[Math.min(selection, shots.length - 1)];

  const [savedShot, setSavedShot] = useState<{ key: string; id: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const shotKey = JSON.stringify([active?.number, active?.description, seconds, format]);
  const request = active && {
    version: 1, featureKey: "ai.video.text_to_video", prompt: active.description,
    durationSeconds: seconds, aspectRatio: format,
  };
  let constraint = "";
  if (format !== "16:9" || seconds > 5) constraint = "For Wan, choose 16:9 and a shot of five seconds or less.";
  else if (request && Array.from(request.prompt).length > 4000) constraint = "Shorten this shot to 4,000 characters for Wan.";
  else if (request && new TextEncoder().encode(JSON.stringify(request, null, 2)).length > 12000) constraint = "Shorten the shot to fit the model’s 12,000-byte request limit.";

  function saveShot() {
    if (!active) return;
    try {
      const id = crypto.randomUUID();
      const title = "Storyboard · Shot " + active.number;
      saveCopy(localStorage, id, title, [title, seconds + " seconds · " + format, active.description].join("\n"), Date.now());
      setSavedShot({ key: shotKey, id });
      setSaveError("");
    } catch { setSaveError("Couldn’t save this shot in this browser. You can still download the shot list."); }
  }

  return <section aria-labelledby="storyboard-title" className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
    <h2 id="storyboard-title" className="flex items-center gap-2 text-2xl font-semibold"><Clapperboard aria-hidden="true" className="size-5 text-violet-300" />Storyboard planner</h2>
    <p className="text-sm text-slate-300">Write one shot per line to plan a sequence locally. Download your plan before leaving.</p>
    <div className="space-y-2 rounded-lg border border-slate-800 p-3">
      <label htmlFor="storyboard-file" className="block text-sm font-medium">Open exported storyboard (.json)</label>
      <input type="file" id="storyboard-file" accept=".json,application/json" className="block w-full text-sm file:mr-2 file:min-h-11" onChange={event => {
        void previewFile(event.target.files?.[0]);
        event.currentTarget.value = "";
      }} />
      {importError && <p role="alert" className="text-sm text-amber-200">{importError}</p>}
      {pending && <div className="space-y-2">
        <p role="status" className="text-sm">{pending.count} shots · {pending.format} · {timecode(pending.count * pending.seconds)} total</p>
        <div className="flex flex-wrap gap-2"><Button onClick={applyImport}>{text.trim() ? "Replace current plan" : "Open plan"}</Button>
          <Button variant="outline" onClick={() => setPending(null)}>Dismiss import</Button></div>
      </div>}
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <label htmlFor="shot-list">Shot descriptions</label>
        <textarea id="shot-list" rows={7} maxLength={12000} value={text} onChange={e => setText(e.target.value)}
          placeholder="Wide shot of the workshop at dawn" className="w-full rounded-md border border-slate-700 bg-slate-950 p-3" />
        <div className="flex flex-wrap gap-4">
          <div><label htmlFor="shot-duration" className="block text-sm">Seconds per shot</label>
            <select id="shot-duration" className="min-h-11 rounded border border-slate-700 bg-slate-950 px-2" value={seconds} onChange={e => setSeconds(Number(e.target.value))}>
              {shotDurations.map(n => <option key={n}>{n}</option>)}
            </select></div>
          <div><label htmlFor="shot-format" className="block text-sm">Frame format</label>
            <select id="shot-format" className="min-h-11 rounded border border-slate-700 bg-slate-950 px-2" value={format} onChange={e => setFormat(e.target.value)}>
              {frameFormats.map(ratio => <option key={ratio}>{ratio}</option>)}
            </select></div>
        </div>
        {error && <p role="alert" className="text-amber-200">{error}</p>}
      </div>
      <div className="min-w-0">
        <h3 className="mb-2 text-sm font-semibold">Frame preview</h3>
        <div className="grid min-h-48 place-items-center rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div style={{ aspectRatio: format.replace(":", " / "), width: format === "9:16" ? "min(100%, 9rem)" : "min(100%, 20rem)" }}
            className="grid place-items-center overflow-auto rounded border border-violet-300/40 bg-violet-950/30 p-3">
            <p className="max-h-full max-w-full overflow-auto break-words text-sm">{active?.description ?? "Your selected shot appears here."}</p>
          </div>
        </div>
      </div>
    </div>
    {board && shots.length > 0 && <div className="space-y-3">
      <h3 className="font-semibold">Shot sequence · {shots.length} · {timecode(board.totalSeconds)} total</h3>
      <ol className="max-h-64 overflow-y-auto divide-y divide-slate-800">
        {shots.map((shot, i) => <li key={shot.number}><button type="button" aria-pressed={active?.number === shot.number} onClick={() => setSelection(i)}
          className="flex min-h-11 w-full items-baseline gap-3 rounded px-2 py-2 text-left hover:bg-slate-800 aria-pressed:bg-violet-950/50">
          <span className="shrink-0 font-mono text-xs text-violet-200">{timecode(shot.startSeconds)}–{timecode(shot.endSeconds)}</span>
          <span className="min-w-0 break-words">{shot.description}</span>
        </button></li>)}
      </ol>
      <Button onClick={() => downloadJson(board, "eternyx-storyboard.json")}><Download aria-hidden="true" className="mr-2 size-4" />Download shot list (.json)</Button>
      <div className="space-y-3 border-t border-slate-700 pt-4">
        <h3 className="font-semibold">Selected shot {active.number}</h3>
        <p className="text-sm text-slate-300">Export a text-to-video request for Wan 2.1, or save the shot as a scratchpad copy shared in this browser.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={Boolean(constraint)} aria-describedby={constraint ? "wan-shot-limit" : undefined}
            onClick={() => request && !constraint && downloadJson(request, "eternyx-wan-shot-" + active.number + ".json")}>Export Wan request</Button>
          {savedShot?.key === shotKey ? <Button asChild variant="outline"><Link to="/workspace" state={{resumeNote: {kind: "copy", id: savedShot.id}}}>Open saved shot in Workspace</Link></Button>
            : <Button variant="outline" onClick={saveShot}>Save shot to Workspace</Button>}
        </div>
        {constraint && <p id="wan-shot-limit" className="text-sm text-amber-200">{constraint}</p>}
        {saveError && <p role="alert">{saveError}</p>}
      </div>
    </div>}
  </section>;
}
