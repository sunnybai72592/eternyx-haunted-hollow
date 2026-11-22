import { useEffect, useRef, useState } from "react";
import LocalRenderReview from "@/components/LocalRenderReview";
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
type RenderQuality = "standard" | "high";

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

function newShot(name: string): LocalShot {
  return { sourceName: name, startFrame: 0, frames: 16, caption: "",
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
  const [shots, setShots] = useState<LocalShot[]>([]);
  const [soundtrack, setSoundtrack] = useState<LocalSound | null>(null);
  const [profile, setProfile] = useState<RenderProfile>("landscape");
  const [quality, setQuality] = useState<RenderQuality>("standard");
  const [selectedSource, setSelectedSource] = useState("");
  const [working, setWorking] = useState(false);
  const [audioWorking, setAudioWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const videoVersion = useRef(0);
  const audioVersion = useRef(0);
  const urls = useRef<string[]>([]);
  const audioUrl = useRef<string | null>(null);

  useEffect(() => () => {
    videoVersion.current++;
    audioVersion.current++;
    urls.current.forEach(url => URL.revokeObjectURL(url));
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, []);

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
      setShots(prepared.map(file => newShot(file.name)));
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
      ready = buildLocalVideoBoard({ sources, shots, soundtrack });
    } catch (error) {
      validation = error instanceof Error ? error.message : "Check the selected timeline.";
    }
  }
  const command = localVideoCommand(profile, quality);
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
            The local Python renderer must still verify exact 16 FPS, frame counts, source hashes and available codecs.
          </AlertDescription>
        </Alert>

        <div className="space-y-3 rounded-lg border border-slate-700 p-4">
          <label htmlFor="local-video-clips" className="flex items-center gap-2 text-sm font-semibold"><Upload className="h-4 w-4"/>Select 1–8 local MP4 clips (up to 64 MiB each)</label>
          <Input id="local-video-clips" type="file" multiple accept=".mp4,video/mp4" disabled={working}
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
              <p className="text-xs text-amber-100">This player previews the selected <strong>original</strong> MP4, not the edited output. Browsers cannot guarantee the source is constant-frame-rate 16 FPS.</p>
            </div>
          )}
        </div>

        {sources.length > 0 && (
          <section className="space-y-4" aria-labelledby="local-shot-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="local-shot-title" className="font-semibold">Real shot cuts · {shots.length} / 8 · {(total / 16).toFixed(2)} / 30 seconds</h3>
              <Button variant="outline" size="sm" disabled={shots.length >= 8} onClick={() => {
                setShots(old => [...old, newShot(selectedSource || sources[0].name)]); setNotice("");
              }}><Plus className="mr-1 h-4 w-4"/>Add another cut</Button>
            </div>
            {shots.map((shot, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
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
                    ["Start frame (16 FPS)", "startFrame", 0, 960],
                    ["Frames (up to 480)", "frames", 1, 480],
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
            <p className="text-xs text-slate-400">Offsets and lengths are frame counts at 16 FPS; 16 frames = 1 second. The Python renderer rejects cuts beyond the actual decoded source length.</p>
          </section>
        )}

        <section className="space-y-3 rounded-lg border border-slate-700 p-4" aria-labelledby="local-audio-heading">
          <h3 id="local-audio-heading" className="flex items-center gap-2 font-semibold"><Music2 className="h-4 w-4"/>Optional licensed background audio</h3>
          <label htmlFor="local-audio-file" className="block text-sm">Select WAV, MP3 or M4A (up to 16 MiB)</label>
          <Input id="local-audio-file" type="file" accept=".wav,.mp3,.m4a,audio/*" disabled={audioWorking}
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
              <select value={quality} onChange={e => setQuality(e.target.value as RenderQuality)}
                className="min-h-11 w-full rounded border border-slate-700 bg-slate-950 px-2">
                {LOCAL_VIDEO_QUALITIES.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
          {validation && <p role="alert" className="text-sm text-amber-200">{validation}</p>}
          {message && <p role="alert" className="text-sm text-rose-200">{message}</p>}
          {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}
          {ready && <p className="text-sm text-emerald-200">Storyboard valid for export: {ready.board.shots.length} cuts · {ready.seconds.toFixed(2)} s. Python will verify each source on render.</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!ready || working || audioWorking}
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
