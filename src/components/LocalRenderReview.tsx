import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Film, ShieldCheck, Upload, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildLocalVideoBoard } from "@/lib/ai/localVideoEditor.mjs";
import {
  checkRenderedSubtitles, exportLocalVideoReview, readLocalRenderReceipt,
  verifyLocalRenderReceipt, MAX_RECEIPT_BYTES, MAX_RENDER_BYTES, MAX_SUBTITLES_BYTES,
} from "@/lib/ai/localRenderReview.mjs";

type LocalProject = ReturnType<typeof buildLocalVideoBoard> | null;
type Props = {
  project: LocalProject;
  profile: string;
  quality: string;
  original?: {name: string; url: string};
};

function downloadReview(body: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2) + "\n"], {type: "application/json"}));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "eternyx-local-video-human-review.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function localHash(file: File) {
  if (!globalThis.crypto?.subtle) throw new Error("Local SHA-256 requires a secure browser context.");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

export default function LocalRenderReview({project, profile, quality, original}: Props) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [metadataWarning, setMetadataWarning] = useState("");
  const [verified, setVerified] = useState<ReturnType<typeof verifyLocalRenderReceipt> | null>(null);
  const [srtCount, setSrtCount] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [verdict, setVerdict] = useState("undecided");
  const [notes, setNotes] = useState("");
  const version = useRef(0);
  const ownedPreviewUrl = useRef<string | null>(null);

  const clearVerified = () => {
    version.current++;
    if (ownedPreviewUrl.current) URL.revokeObjectURL(ownedPreviewUrl.current);
    ownedPreviewUrl.current = null;
    setPreviewUrl("");
    setVerified(null);
    setSrtCount(null);
    setMetadataWarning("");
    setError("");
    setProcessing(false);
    setVerdict("undecided");
    setNotes("");
  };

  useEffect(() => {
    // A changed project must never inherit an earlier confirmed source/receipt match.
    clearVerified();
  }, [project?.json, profile, quality]);

  useEffect(() => () => {
    version.current++;
    if (ownedPreviewUrl.current) URL.revokeObjectURL(ownedPreviewUrl.current);
  }, []);

  const verify = async () => {
    if (processing) return;
    clearVerified();
    // clearVerified increments version; capture the live request identity afterward.
    const token = version.current;
    setProcessing(true);
    let nextUrl: string | null = null;
    try {
      if (!videoFile || !receiptFile) throw new Error("Select both video.mp4 and manifest.json first.");
      if (videoFile.name !== "video.mp4" || !videoFile.size || videoFile.size > MAX_RENDER_BYTES) {
        throw new Error("Select the CPU-rendered video.mp4 (1 byte–64 MiB).");
      }
      if (receiptFile.name !== "manifest.json" || !receiptFile.size || receiptFile.size > MAX_RECEIPT_BYTES) {
        throw new Error("Select the renderer's manifest.json (1 byte–64 KiB).");
      }
      if (subtitleFile && (subtitleFile.name !== "captions.srt" || !subtitleFile.size ||
          subtitleFile.size > MAX_SUBTITLES_BYTES)) {
        throw new Error("Optional subtitles must be captions.srt (up to 32 KiB).");
      }
      const receipt = readLocalRenderReceipt(await receiptFile.text());
      const fileDigest = await localHash(videoFile);
      let context = null;
      if (project) {
        context = {
          storyboardSha256: await (async () => {
            const bytes = new TextEncoder().encode(project.json);
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            return Array.from(new Uint8Array(digest), part => part.toString(16).padStart(2, "0")).join("");
          })(),
          board: project.board, profile, quality,
        };
      }
      const result = verifyLocalRenderReceipt(receipt, {
        name: videoFile.name, size: videoFile.size, sha256: fileDigest,
      }, context);
      const subtitles = subtitleFile ? checkRenderedSubtitles(await subtitleFile.text(), receipt) : null;
      if (token !== version.current) return;
      nextUrl = URL.createObjectURL(videoFile);
      ownedPreviewUrl.current = nextUrl;
      setPreviewUrl(nextUrl);
      nextUrl = null;
      setVerified(result);
      setSrtCount(subtitles?.cues ?? null);
      setMetadataWarning("");
    } catch (cause) {
      if (token === version.current) {
        setError(cause instanceof Error ? cause.message : "Could not verify local renderer output.");
      }
    } finally {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      if (token === version.current) setProcessing(false);
    }
  };

  const recordVerdict = () => {
    if (!verified) return;
    try {
      downloadReview(exportLocalVideoReview(verified, verdict, notes, new Date().toISOString()));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export the review.");
    }
  };

  return (
    <Card className="border-violet-400/25 bg-slate-950/70 text-slate-100" aria-labelledby="local-render-review-title">
      <CardHeader>
        <CardTitle id="local-render-review-title" className="flex items-center gap-2 text-lg">
          <Film className="h-5 w-5 text-violet-300"/>Inspect your actual rendered MP4
        </CardTitle>
        <CardDescription className="leading-6 text-slate-300">
          After you run the local Python/FFmpeg command, return here with video.mp4 and manifest.json from that output folder.
          Verify their file hashes and inspect the real result without uploading anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-violet-400/30 bg-violet-950/20 text-slate-200">
          <ShieldCheck className="h-4 w-4"/>
          <AlertDescription>
            These are local integrity and self-consistency checks, not digitally signed provenance,
            authenticity certification or AI quality scoring. A maliciously altered MP4 and manifest can carry matching hashes.
            The site does not execute the renderer or send these files to a server.
          </AlertDescription>
        </Alert>
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="local-render-mp4" className="space-y-1 text-sm">
            <span className="block font-medium">Rendered video.mp4 (up to 64 MiB)</span>
            <Input id="local-render-mp4" type="file" accept=".mp4,video/mp4"
              className="min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={event => {clearVerified(); setVideoFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = "";}} />
            {videoFile && <span className="block break-all text-xs text-slate-400">{videoFile.name} · {(videoFile.size / 1048576).toFixed(2)} MiB</span>}
          </label>
          <label htmlFor="local-render-manifest" className="space-y-1 text-sm">
            <span className="block font-medium">Renderer manifest.json</span>
            <Input id="local-render-manifest" type="file" accept=".json,application/json"
              className="min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
              onChange={event => {clearVerified(); setReceiptFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = "";}} />
            {receiptFile && <span className="block break-all text-xs text-slate-400">{receiptFile.name}</span>}
          </label>
        </div>
        <label htmlFor="local-render-captions" className="block space-y-1 text-sm">
          <span className="block font-medium">Optional exact captions.srt from the renderer</span>
          <Input id="local-render-captions" type="file" accept=".srt,text/plain"
            className="min-h-11 border-slate-700 bg-slate-950 file:text-foreground"
            onChange={event => {clearVerified(); setSubtitleFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = "";}} />
          <span className="block text-xs text-slate-400">
            Optional strict comparison against renderer-generated caption text and timecodes.
            Edited subtitles may fail this check without implying the MP4 itself is invalid.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={processing || !videoFile || !receiptFile} onClick={() => { void verify(); }}>
            <Upload className="mr-2 h-4 w-4"/>{processing ? "Verifying local bytes…" : "Verify and preview render"}
          </Button>
          {project ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
            Compare against current Studio project
          </Badge> : <Badge variant="outline" className="border-amber-500/40 text-amber-200">
            Independent receipt check only
          </Badge>}
        </div>
        {error && <p role="alert" className="flex items-start gap-2 text-sm text-rose-200">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}
        </p>}
        {verified && previewUrl && (
          <section className="space-y-4 rounded-lg border border-slate-700 bg-slate-900/70 p-4"
                   aria-labelledby="local-verified-output">
            <h4 id="local-verified-output" className="flex items-center gap-2 font-semibold text-emerald-200">
              <CheckCircle2 className="h-5 w-5"/>Local MP4 and receipt hashes match
            </h4>
            <p className="text-xs text-slate-300">
              {verified.frameCount} frames · {verified.fps} FPS (from receipt) · {verified.durationSeconds.toFixed(2)} seconds
              · {verified.width} × {verified.height} · {verified.withAudio ? "soundtrack recorded" : "silent output"}
              {verified.projectMatch ? " · Current project inputs and settings matched" : " · No current Studio project match checked"}
              {srtCount !== null ? " · " + srtCount + " subtitle cues matched" : " · Subtitles not checked"}
            </p>
            <video controls playsInline preload="metadata" src={previewUrl} aria-label="Locally rendered verified MP4"
              className="max-h-[28rem] w-full rounded-lg border border-slate-700 bg-black"
              onLoadedMetadata={event => {
                const media = event.currentTarget;
                const wrongResolution = media.videoWidth !== verified.width || media.videoHeight !== verified.height;
                const wrongDuration = !Number.isFinite(media.duration) || Math.abs(media.duration - verified.durationSeconds) > 0.25;
                setMetadataWarning(wrongResolution || wrongDuration
                  ? "Browser playback metadata differs from the local renderer receipt. Treat this output as needing further review."
                  : "");
              }}
              onError={() => setMetadataWarning("This browser cannot decode the selected MP4. Review it in a supported local player.")} />
            {metadataWarning && <p role="alert" className="text-sm text-amber-200">{metadataWarning}</p>}
            {original?.url && <div className="space-y-2">
              <p className="text-sm font-semibold">Compare with an original source clip</p>
              <video controls playsInline preload="metadata" src={original.url}
                aria-label={"Original source clip " + original.name}
                className="max-h-64 w-full rounded-lg border border-slate-700 bg-black" />
              <p className="text-xs text-slate-400">Original source: {original.name}. Two independent players; start and timing are not synchronized.</p>
            </div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="local-render-verdict" className="space-y-1 text-sm">Human review outcome
                <select id="local-render-verdict" value={verdict} onChange={e => setVerdict(e.target.value)}
                  className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                  <option value="undecided">Not yet decided</option>
                  <option value="approved_for_local_use">Approved for local use</option>
                  <option value="needs_revision">Needs revision</option>
                </select>
              </label>
              <label htmlFor="local-render-review-notes" className="space-y-1 text-sm">Review notes (up to 1,000 characters)
                <textarea id="local-render-review-notes" rows={3} maxLength={1000} value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Write observed issues with cuts, motion, audio, or captions."
                  className="w-full rounded border border-slate-700 bg-slate-950 p-2"/>
              </label>
            </div>
            <Button variant="outline" onClick={recordVerdict}>
              <Download className="mr-2 h-4 w-4"/>Download human-review JSON
            </Button>
            <p className="text-xs text-slate-400">
              The review is an explicit human decision. It is exported privately as JSON, not submitted to an AI model,
              public feed or backend. Audio, captions and visual quality must still be assessed by you.
            </p>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
