import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helperSource = await read("src/lib/ai/audio-local-tools.ts");
const page = await read("src/pages/AIAudioStudio.tsx");
const app = await read("src/App.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const local = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("Audio Studio has an authenticated lazy route and the AI Arsenal link", () => {
  assert.ok(app.includes('const AIAudioStudio = lazy(() => import("./pages/AIAudioStudio"));'));
  assert.ok(app.includes('path="/ai-arsenal/audio" element={<RequireAuth><AIAudioStudio /></RequireAuth>}'));
  assert.ok(hub.includes('"/ai-arsenal/audio"'));
  assert.ok(hub.includes("Local workspace ready · AI disabled"));
});

test("local audio validator accepts supported media formats within a browser-only boundary", () => {
  for (const type of ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4"]) {
    assert.deepEqual(local.validateLocalAudioFile({ name: "audio", size: 128, type }), { name: "audio", size: 128, type });
  }
  const valid = { name: "audio.mp3", size: local.MAX_LOCAL_AUDIO_SIZE, type: "audio/mpeg" };
  assert.equal(local.validateLocalAudioFile(valid).size, 20 * 1024 * 1024);
});

test("invalid and empty audio file metadata fails closed", () => {
  for (const file of [
    { name: "", size: 42, type: "audio/mpeg" },
    { name: "clip", size: 0, type: "audio/mpeg" },
    { name: "clip", size: -1, type: "audio/mpeg" },
    { name: "clip", size: 20 * 1024 * 1024 + 1, type: "audio/mpeg" },
    { name: "clip", size: 1.5, type: "audio/mpeg" },
    { name: "clip", size: 30, type: "application/octet-stream" },
  ]) assert.throws(() => local.validateLocalAudioFile(file), { code: "invalid_file" });
});

test("duration and local audio size display handle invalid metadata without guessing", () => {
  assert.equal(local.formatAudioDuration(125.9), "2:05");
  assert.equal(local.formatAudioDuration(0), "0:00");
  assert.equal(local.formatAudioDuration(Number.POSITIVE_INFINITY), "Not available");
  assert.equal(local.formatAudioDuration(-1), "Not available");
  assert.equal(local.formatAudioSize(1048576), "1.00 MiB");
  assert.equal(local.formatAudioSize(-1), "Not available");
});

test("transcription notes describe media only, never claim recognition or a transcript", () => {
  const note = local.buildLocalTranscriptionNote({ name: "test.mp3", type: "audio/mpeg", size: 1048576 }, 61);
  assert.equal(note.featureKey, "ai.audio.transcribe");
  assert.equal(note.status, "local_preparation_only");
  assert.equal(note.durationSeconds, 61);
  const summary = local.formatTranscriptionNote(note);
  assert.match(summary, /Duration: 1:01/);
  assert.match(summary, /No transcription was generated/);
  assert.equal(local.buildLocalTranscriptionNote({ name: "test.mp3", type: "audio/mpeg", size: 1 }, Infinity).durationSeconds, null);
});

test("browser speech preview script validates text, language, and playback speed", () => {
  const voice = local.buildLocalSpeechDraft("  Hello  ", "en-US", 1.25);
  assert.deepEqual(voice, {
    featureKey: "ai.audio.speech", status: "browser_preview_only",
    text: "Hello", language: "en-US", rate: 1.25,
  });
  assert.throws(() => local.buildLocalSpeechDraft(" ", "en-US", 1), { code: "invalid_script" });
  assert.throws(() => local.buildLocalSpeechDraft("x".repeat(4001), "en-US", 1), { code: "invalid_script" });
  assert.throws(() => local.buildLocalSpeechDraft("hello", "invalid", 1), { code: "invalid_language" });
  assert.throws(() => local.buildLocalSpeechDraft("hello", "en-US", 10), { code: "invalid_rate" });
});

test("browser audio preview revokes object URLs and invalidates metadata on file changes", () => {
  for (const required of [
    "URL.createObjectURL(audioFile)",
    "URL.revokeObjectURL(url)",
    "setAudioNote(null);",
    "setDuration(null);",
    'preload="metadata"',
    "normalizeAudioDuration(e.currentTarget.duration)",
  ]) assert.ok(page.includes(required), "Missing local audio lifecycle behavior: " + required);
});

test("speech preview uses only browser device synthesis and cancels old speech on edits and unmount", () => {
  for (const required of [
    "new SpeechSynthesisUtterance(speechDraft.text)",
    "window.speechSynthesis.speak(utterance)",
    "window.speechSynthesis.cancel()",
    "utteranceRef.current === utterance",
    "setSpeechDraft(null);",
    "setSpeechLanguage(e.target.value as LocalSpeechLanguage); invalidateSpeech();",
  ]) assert.ok(page.includes(required), "Missing safe speech lifecycle behavior: " + required);
});

test("copy success is based on clipboard receipt, with accessible failure states", () => {
  assert.ok(page.includes("await navigator.clipboard.writeText(speechDraft.text)"));
  assert.ok(page.includes("await navigator.clipboard.writeText(formatTranscriptionNote(audioNote))"));
  assert.ok(page.includes("setSpeechNotice("));
  assert.ok(page.includes('role="alert"'));
  assert.ok(page.includes('aria-live="polite"'));
});

test("Audio Studio does not submit to providers, reserve credits, or present artificial AI results", () => {
  assert.doesNotMatch(page + helperSource, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(/);
  assert.match(page, /AI transcription and provider speech generation are not configured or enabled/);
  assert.match(page, /Browser preview only · no AI audio generated/);
  assert.match(page, /Planned · not enabled/);
});
