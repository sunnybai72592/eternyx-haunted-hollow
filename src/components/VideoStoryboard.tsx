import { useState } from "react";
import { Clapperboard, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildStoryboard, frameFormats, shotDurations, timecode } from "@/lib/ai/storyboard.mjs";

export default function VideoStoryboard() {
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(5);
  const [format, setFormat] = useState("16:9");
  const [selection, setSelection] = useState(0);
  let board: ReturnType<typeof buildStoryboard> | undefined;
  let error = "";
  try { board = buildStoryboard(text, seconds, format); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Check the shot list."; }
  const shots = board?.shots ?? [];
  const active = shots[Math.min(selection, shots.length - 1)];

  function download() {
    if (!board?.shots.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(board, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-storyboard.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section aria-labelledby="storyboard-title" className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
    <h2 id="storyboard-title" className="flex items-center gap-2 text-2xl font-semibold"><Clapperboard aria-hidden="true" className="size-5 text-violet-300" />Storyboard planner</h2>
    <p className="text-sm text-slate-300">Write one shot per line to plan a sequence locally. Download your plan before leaving.</p>
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
      <Button onClick={download}><Download aria-hidden="true" className="mr-2 size-4" />Download shot list (.json)</Button>
    </div>}
  </section>;
}
