import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AudioLines, ClipboardCopy, FileAudio, FileCheck2, RotateCcw, ShieldCheck, Square, Volume2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeaturesForStudio } from "@/lib/ai/registry";
import {
  LOCAL_AUDIO_TYPES,
  LOCAL_SPEECH_LANGUAGES,
  LOCAL_SPEECH_RATES,
  LocalAudioToolError,
  buildLocalSpeechDraft,
  buildLocalTranscriptionNote,
  formatAudioDuration,
  formatAudioSize,
  formatTranscriptionNote,
  normalizeAudioDuration,
  validateLocalAudioFile,
  type LocalSpeechDraft,
  type LocalSpeechLanguage,
  type LocalSpeechRate,
  type LocalTranscriptionNote,
} from "@/lib/ai/audio-local-tools";

const features = getFeaturesForStudio("audio");

const AIAudioStudio = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioNote, setAudioNote] = useState<LocalTranscriptionNote | null>(null);
  const [speechText, setSpeechText] = useState("");
  const [speechLanguage, setSpeechLanguage] = useState<LocalSpeechLanguage>("en-US");
  const [speechRate, setSpeechRate] = useState<LocalSpeechRate>(1);
  const [speechDraft, setSpeechDraft] = useState<LocalSpeechDraft | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  useEffect(() => () => {
    if (utteranceRef.current && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const resetAudio = () => {
    setAudioFile(null);
    setAudioUrl(null);
    setDuration(null);
    setAudioNote(null);
    setAudioError(null);
  };

  const chooseAudio = (file: File | null) => {
    resetAudio();
    if (!file) return;
    try {
      validateLocalAudioFile(file);
      setAudioFile(file);
    } catch (e) {
      setAudioError(e instanceof LocalAudioToolError
        ? "Choose a supported MP3, WAV, OGG, WebM or M4A file between 1 byte and 20 MiB."
        : "The audio file could not be inspected.");
    }
  };

  const haltSpeech = () => {
    if (utteranceRef.current && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setSpeaking(false);
  };

  const invalidateSpeech = () => {
    haltSpeech();
    setSpeechDraft(null);
    setSpeechError(null);
    setSpeechNotice(null);
  };

  const prepareSpeech = () => {
    invalidateSpeech();
    try {
      setSpeechDraft(buildLocalSpeechDraft(speechText, speechLanguage, speechRate));
    } catch (e) {
      setSpeechError(e instanceof LocalAudioToolError
        ? "Enter 1–4,000 characters and choose a supported language and playback rate."
        : "The local speech preview could not be prepared.");
    }
  };

  const playSpeech = () => {
    if (!speechDraft) return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setSpeechError("Browser speech preview is not supported on this device.");
      return;
    }
    haltSpeech();
    const utterance = new SpeechSynthesisUtterance(speechDraft.text);
    utterance.lang = speechDraft.language;
    utterance.rate = speechDraft.rate;
    utterance.onstart = () => { if (utteranceRef.current === utterance) setSpeaking(true); };
    utterance.onend = () => { if (utteranceRef.current === utterance) { utteranceRef.current = null; setSpeaking(false); } };
    utterance.onerror = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setSpeaking(false);
        setSpeechError("Browser speech preview failed. Check your installed voices or device settings.");
      }
    };
    utteranceRef.current = utterance;
    setSpeechError(null);
    setSpeechNotice(null);
    window.speechSynthesis.speak(utterance);
  };

  const copySpeech = async () => {
    if (!speechDraft) return;
    try {
      await navigator.clipboard.writeText(speechDraft.text);
      setSpeechNotice("Speech script copied. No AI generation request was sent.");
      setSpeechError(null);
    } catch {
      setSpeechError("Clipboard access is unavailable. Select the script text and copy it manually.");
      setSpeechNotice(null);
    }
  };

  const copyAudioNote = async () => {
    if (!audioNote) return;
    try {
      await navigator.clipboard.writeText(formatTranscriptionNote(audioNote));
      setAudioError(null);
    } catch {
      setAudioError("Clipboard access is unavailable. Select and copy the preparation note below.");
    }
  };

  const resetSpeech = () => {
    invalidateSpeech();
    setSpeechText("");
    setSpeechLanguage("en-US");
    setSpeechRate(1);
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4" />AI Arsenal</Link>
        </Button>
        <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-slate-950 to-violet-950/30 p-7 sm:p-10">
          <div className="flex items-center gap-3 text-cyan-200"><AudioLines className="h-7 w-7" />LOCAL AUDIO WORKSPACE</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">AI Audio Studio</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Inspect and play local audio, prepare transcription notes and try browser-based speech playback.
          </p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">
            Local tools ready · paid AI disabled
          </Badge>
        </section>
        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            AI transcription and provider speech generation are not configured or enabled. Audio inspection and playback stay in your browser.
            Speech preview uses your browser/device's speech service (voice availability varies). ETERNYX does not upload your file or call a paid AI provider here.
          </AlertDescription>
        </Alert>
        <section className="grid gap-4 md:grid-cols-2">
          {features.map(feature => (
            <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader>
                <CardTitle className="text-white">{feature.title}</CardTitle>
                <CardDescription className="text-slate-400">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent><Badge variant="outline">Planned · not enabled</Badge></CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Local audio inspection</CardTitle>
            <CardDescription className="text-slate-400">
              Preview an audio file privately. The 20 MiB limit is for this browser workspace, not an AI provider allowance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="audio-local-file" className="block text-sm text-slate-300">Choose a local audio file</label>
            <input
              id="audio-local-file"
              type="file"
              accept={LOCAL_AUDIO_TYPES.join(",")}
              onChange={e => {
                chooseAudio(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
              className="block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-3 file:py-1 file:text-white"
            />
            <p className="text-xs text-slate-500">MP3, WAV, OGG, WebM or M4A. Reported file format is not server-verified.</p>
            {audioFile && (
              <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex items-center gap-2 text-cyan-200"><FileAudio className="h-5 w-5" />File selected locally</div>
                <p className="break-all text-sm text-slate-300">Name: {audioFile.name}</p>
                <p className="text-sm text-slate-300">Reported format: {audioFile.type}</p>
                <p className="text-sm text-slate-300">Size: {formatAudioSize(audioFile.size)}</p>
                <p className="text-sm text-slate-300">Duration: {formatAudioDuration(duration)}</p>
                {audioUrl && (
                  <audio
                    key={audioUrl}
                    controls
                    preload="metadata"
                    src={audioUrl}
                    className="w-full"
                    onLoadedMetadata={e => {
                      const seconds = normalizeAudioDuration(e.currentTarget.duration);
                      setDuration(seconds);
                      setAudioNote(null);
                    }}
                    onError={() => setAudioError("This browser cannot decode the selected audio file. Try another supported format.")}
                  >
                    Your browser does not support audio playback.
                  </audio>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setAudioNote(buildLocalTranscriptionNote(audioFile, duration))}>
                    <FileCheck2 className="mr-2 h-4 w-4" />Prepare transcription note
                  </Button>
                  <Button type="button" variant="ghost" onClick={resetAudio}>
                    <RotateCcw className="mr-2 h-4 w-4" />Clear file
                  </Button>
                </div>
                {audioNote && (
                  <div className="space-y-2">
                    <Badge variant="outline">Local only · no transcript</Badge>
                    <pre className="whitespace-pre-wrap break-words rounded-md border border-slate-800 p-3 text-xs text-slate-300">{formatTranscriptionNote(audioNote)}</pre>
                    <Button type="button" variant="outline" onClick={copyAudioNote}>
                      <ClipboardCopy className="mr-2 h-4 w-4" />Copy preparation note
                    </Button>
                  </div>
                )}
              </div>
            )}
            {audioError && <Alert role="alert" variant="destructive">
              <XCircle className="h-4 w-4" /><AlertDescription>{audioError}</AlertDescription>
            </Alert>}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Browser speech preview</CardTitle>
            <CardDescription className="text-slate-400">
              Read text aloud using available browser/device voices. This does not create a downloadable or AI-generated audio file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="audio-speech-script" className="block space-y-2 text-sm text-slate-300">
              <span>Speech script · maximum 4,000 characters</span>
              <textarea
                id="audio-speech-script"
                value={speechText}
                onChange={e => { setSpeechText(e.target.value); invalidateSpeech(); }}
                maxLength={4000}
                rows={6}
                placeholder="Type text to hear it read aloud…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <span className="block text-xs text-slate-500">{speechText.length}/4000 characters</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label htmlFor="audio-language" className="block space-y-2 text-sm text-slate-300">
                <span>Voice language</span>
                <select id="audio-language" value={speechLanguage} onChange={e => {
                  setSpeechLanguage(e.target.value as LocalSpeechLanguage); invalidateSpeech();
                }} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                  {LOCAL_SPEECH_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
                </select>
              </label>
              <label htmlFor="audio-rate" className="block space-y-2 text-sm text-slate-300">
                <span>Playback speed</span>
                <select id="audio-rate" value={speechRate} onChange={e => {
                  setSpeechRate(Number(e.target.value) as LocalSpeechRate); invalidateSpeech();
                }} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                  {LOCAL_SPEECH_RATES.map(rate => <option key={rate} value={rate}>{rate}×</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!speechText.trim()} onClick={prepareSpeech}>
                <FileCheck2 className="mr-2 h-4 w-4" />Prepare speech preview
              </Button>
              <Button type="button" variant="outline" disabled={!speechDraft} onClick={playSpeech}>
                <Volume2 className="mr-2 h-4 w-4" />Read aloud
              </Button>
              <Button type="button" variant="outline" disabled={!speaking} onClick={haltSpeech}>
                <Square className="mr-2 h-4 w-4" />Stop speech
              </Button>
              <Button type="button" variant="ghost" onClick={resetSpeech}>
                <RotateCcw className="mr-2 h-4 w-4" />Clear script
              </Button>
            </div>
            {speechDraft && <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
              <Badge variant="outline">Browser preview only · no AI audio generated</Badge>
              <p className="text-xs text-slate-400">Language: {speechDraft.language} · Rate: {speechDraft.rate}×</p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{speechDraft.text}</p>
              <Button type="button" variant="outline" onClick={copySpeech}>
                <ClipboardCopy className="mr-2 h-4 w-4" />Copy script
              </Button>
            </div>}
            {speechError && <Alert role="alert" variant="destructive">
              <XCircle className="h-4 w-4" /><AlertDescription>{speechError}</AlertDescription>
            </Alert>}
            {speechNotice && <Alert role="status" aria-live="polite">
              <ShieldCheck className="h-4 w-4" /><AlertDescription>{speechNotice}</AlertDescription>
            </Alert>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default AIAudioStudio;
