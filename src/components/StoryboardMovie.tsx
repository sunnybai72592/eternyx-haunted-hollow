import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = { shots: {description: string}[]; seconds: number; format: string };

function drawCard(ctx: CanvasRenderingContext2D, description: string, index: number, count: number, progress: number) {
  const {width, height} = ctx.canvas;
  const pad = 36;
  ctx.fillStyle = "#081322";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#8ce6e1";
  ctx.font = "18px monospace";
  ctx.fillText("SHOT " + (index + 1) + " / " + count, pad, pad + 18);
  ctx.font = "28px sans-serif";
  ctx.fillStyle = "#f1f5f9";
  let line = "", y = pad + 84;
  for (const char of description) {
    if (ctx.measureText(line + char).width > width - 2 * pad) {
      if (y + 37 > height - pad) { ctx.fillText(line.slice(0,-1) + "…", pad, y); return; }
      ctx.fillText(line, pad, y);
      y += 37;
      line = "";
    }
    line += char;
  }
  ctx.fillText(line, pad, y);
  ctx.fillStyle = "#38c9c2";
  ctx.fillRect(0, height - 5, width * progress, 5);
}

export default function StoryboardMovie({ shots, seconds, format }: Props) {
  const [busy, setBusy] = useState(false);
  const [movie, setMovie] = useState("");
  const [message, setMessage] = useState("");
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  useEffect(() => () => { if (movie) URL.revokeObjectURL(movie); }, [movie]);
  const mime = typeof MediaRecorder === "undefined" ? undefined :
    ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type));
  const supported = Boolean(mime && HTMLCanvasElement.prototype.captureStream);
  function render() {
    if (!supported || !mime || cancel.current) return;
    let recorder: MediaRecorder | undefined, stream: MediaStream | undefined;
    let timer = 0, discarded = false;
    const cleanup = () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      stream?.getTracks().forEach(track => track.stop());
      cancel.current = null;
    };
    const abort = () => {
      discarded = true;
      if (recorder?.state === "recording") recorder.stop();
      cleanup();
    };
    function visibility() {
      if (document.hidden) { abort(); setBusy(false); setMessage("Preview stopped when the tab was hidden. Start again here."); }
    }
    try {
      setMovie(""); setMessage(""); setBusy(true);
      const canvas = document.createElement("canvas");
      canvas.width = format === "9:16" ? 360 : 640;
      canvas.height = format === "16:9" ? 360 : 640;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      stream = canvas.captureStream(10);
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 600000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (!discarded && event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { if (!discarded) { abort(); setBusy(false); setMessage("Video export failed. Try again or download the shot list."); } };
      recorder.onstop = () => {
        if (discarded) return;
        cleanup(); setBusy(false);
        if (chunks.length) setMovie(URL.createObjectURL(new Blob(chunks, {type: mime})));
        else setMessage("The browser returned an empty video. Try again or download the shot list.");
      };
      recorder.start();
      cancel.current = abort;
      document.addEventListener("visibilitychange", visibility);
      const start = performance.now(), total = shots.length * seconds;
      function frame() {
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed >= total) {
          window.clearInterval(timer);
          recorder?.stop();
          return;
        }
        const index = Math.floor(elapsed / seconds);
        drawCard(ctx!, shots[index].description, index, shots.length, elapsed / total);
      }
      frame();
      timer = window.setInterval(frame, 100);
    } catch {
      abort(); setBusy(false); setMessage("This browser could not export the video. The shot list is still available.");
    }
  }
  return <div className="space-y-3 border-t border-slate-700 pt-4">
    <h3 className="font-semibold">Storyboard movie</h3>
    <p className="text-sm text-slate-300">Turn your shot descriptions into timed, silent title cards on this device. Keep this tab open during export.</p>
    {!supported ? <p>Video export is unavailable in this browser.</p> : busy ?
      <Button variant="outline" onClick={() => { cancel.current?.(); setBusy(false); setMessage("Export canceled."); }}>Cancel video export</Button> :
      <Button variant="outline" onClick={render}>Create storyboard movie</Button>}
    {message && <p role="status">{message}</p>}
    {movie && <div className="space-y-2"><video aria-label="Storyboard movie preview" controls playsInline src={movie} className="max-h-72 w-full rounded-lg bg-black" />
      <a download={"eternyx-storyboard." + (mime?.includes("mp4") ? "mp4" : "webm")} href={movie} className="inline-flex min-h-11 items-center text-cyan-200 underline">Download storyboard movie</a></div>}
  </div>;
}
