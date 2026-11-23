import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helperSource = await read("src/lib/ai/browser-dictation.ts");
const page = await read("src/pages/AIAudioStudio.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const requestSource = await read("src/lib/ai/studio-chat-request.ts");

async function loadTs(source) {
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const local = await loadTs(helperSource);
const chat = await loadTs(requestSource);

const result = (text, isFinal) => ({ 0: { transcript: text }, isFinal });

test("browser constructor is explicitly discovered, not faked", () => {
  class NativeRecognizer {}
  assert.equal(local.getBrowserRecognizerConstructor({}), null);
  assert.equal(local.getBrowserRecognizerConstructor({ webkitSpeechRecognition: NativeRecognizer }), NativeRecognizer);
  assert.equal(local.getBrowserRecognizerConstructor({ SpeechRecognition: NativeRecognizer }), NativeRecognizer);
});

test("browser recognition snapshot separates final and interim speech without duplicate appended segments", () => {
  const chunks = [result("Hello", true), result("world", true), result("thinking", false)];
  const a = local.readDictationSnapshot(chunks);
  const b = local.readDictationSnapshot(chunks);
  assert.deepEqual(a, { finalText: "Hello world", interimText: "thinking", exceededLimit: false });
  assert.deepEqual(b, a);
  assert.deepEqual(local.readDictationSnapshot([result("", true)]),
    { finalText: "", interimText: "", exceededLimit: false });
});

test("transcript caps are strict and never silently truncate recognizer output", () => {
  assert.equal(local.MAX_DICTATION_CHARACTERS, 12000);
  assert.equal(local.MAX_CHAT_TRANSCRIPT_CHARACTERS, 3500);
  const tooLong = local.readDictationSnapshot([result("x".repeat(12001), true)]);
  assert.deepEqual(tooLong, { finalText: "", interimText: "", exceededLimit: true });
  assert.equal(local.readDictationSnapshot({ length: 1001 }).exceededLimit, true);
  assert.throws(() => local.prepareAudioTranscriptSummary(" "), /Transcript must not be empty/);
  assert.throws(() => local.prepareAudioTranscriptSummary("x".repeat(3501)), /budget/);
  assert.throws(() => local.textTranscriptForDownload(" "), /No usable transcript/);
});

test("approved audio summary fits the existing authenticated chat request budget", () => {
  const content = "Audio check ";
  const prompt = local.prepareAudioTranscriptSummary(content);
  const request = chat.prepareStudioChatMessage("ai.audio.summarize", prompt);
  assert.ok(request.length <= chat.STUDIO_CHAT_MAX_MESSAGE_LENGTH);
  assert.match(request, /BEGIN USER DICTATION/);
  assert.match(request, /untrusted data/);
  assert.ok(request.includes(content.trim()));
  assert.doesNotMatch(request, /api[_-]?key/i);
  assert.ok(chat.STUDIO_CHAT_FEATURES.includes("ai.audio.summarize"));
});

test("audio transcription text export labels accuracy without inventing recording metadata", () => {
  const output = local.textTranscriptForDownload("  Real recognized phrase.  ", "ur-PK");
  assert.match(output, /Browser dictation/i);
  assert.match(output, /ur-PK/);
  assert.match(output, /Recognition accuracy is unverified/);
  assert.match(output, /Real recognized phrase/);
});

test("mic start requires informed consent and cleanup aborts recognition on unmount", () => {
  assert.match(page, /getBrowserRecognizerConstructor\(window\)/);
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /recognition\.interimResults = true/);
  assert.match(page, /recognition\.continuous = true/);
  assert.match(page, /recognition\.start\(\)/);
  assert.match(page, /recognition\.stop\(\)/);
  assert.match(page, /recognition\.abort\(\)/);
  assert.match(page, /recognition\.onresult = null/);
  assert.match(page, /recognition\.onend = null/);
  assert.match(page, /recognitionRef\.current !== recognition/);
  assert.match(page, /Microphone or speech-service permission was denied/);
});

test("transcript UX has copy, download, review, read aloud and separate opt-in AI action", () => {
  assert.match(page, /await navigator\.clipboard\.writeText\(transcript\)/);
  assert.match(page, /eternyx-dictation\.txt/);
  assert.match(page, /URL\.revokeObjectURL\(url\)/);
  assert.match(page, /setSpeechText\(transcript\)/);
  assert.match(page, /aiSummary\.run\("ai\.audio\.summarize", prompt\)/);
  assert.match(page, /aiSummary\.invalidate\(\)/);
  assert.match(page, /aiSummary\.result/);
  assert.match(page, /aiSummary\.error/);
  assert.match(page, /chat credits/);
  assert.match(page, /Transcript text and speech recognition are not guaranteed to be offline|may transmit captured speech/);
  assert.match(hub, /real opt-in microphone dictation/);
  assert.doesNotMatch(page, /supabase\.functions\.invoke\(/);
});
