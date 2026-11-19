/**
 * Browser-only AI Audio Studio inspection and request preparation.
 * No uploads, backend calls, paid providers, credit reservations or AI output.
 */
export const MAX_LOCAL_AUDIO_SIZE = 20 * 1024 * 1024;
export const MAX_LOCAL_SPEECH_CHARACTERS = 4000;
export const LOCAL_AUDIO_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
  "audio/ogg", "audio/webm", "audio/mp4", "audio/x-m4a",
] as const;
export const LOCAL_SPEECH_LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "ar-SA", label: "Arabic" },
  { code: "ur-PK", label: "Urdu" },
] as const;
export const LOCAL_SPEECH_RATES = [0.75, 1, 1.25, 1.5] as const;

export type LocalSpeechLanguage = (typeof LOCAL_SPEECH_LANGUAGES)[number]["code"];
export type LocalSpeechRate = (typeof LOCAL_SPEECH_RATES)[number];
export interface LocalAudioFileInfo {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}
export type LocalAudioInput = Pick<File, "name" | "type" | "size">;
export interface LocalTranscriptionNote {
  readonly featureKey: "ai.audio.transcribe";
  readonly status: "local_preparation_only";
  readonly file: LocalAudioFileInfo;
  readonly durationSeconds: number | null;
}
export interface LocalSpeechDraft {
  readonly featureKey: "ai.audio.speech";
  readonly status: "browser_preview_only";
  readonly text: string;
  readonly language: LocalSpeechLanguage;
  readonly rate: LocalSpeechRate;
}
export class LocalAudioToolError extends Error {
  readonly code: "invalid_file" | "invalid_script" | "invalid_language" | "invalid_rate";
  constructor(code: LocalAudioToolError["code"]) {
    super(code);
    this.name = "LocalAudioToolError";
    this.code = code;
  }
}

export function validateLocalAudioFile(file: LocalAudioInput): LocalAudioFileInfo {
  if (!file || typeof file.name !== "string" ||
      !file.name.trim() || file.name.length > 255 ||
      !(LOCAL_AUDIO_TYPES as readonly string[]).includes(file.type) ||
      !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_LOCAL_AUDIO_SIZE) {
    throw new LocalAudioToolError("invalid_file");
  }
  return { name: file.name, type: file.type, size: file.size };
}

export function normalizeAudioDuration(seconds: number | null): number | null {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
    ? seconds : null;
}

export function formatAudioDuration(seconds: number | null): string {
  const valid = normalizeAudioDuration(seconds);
  if (valid === null) return "Not available";
  const total = Math.floor(valid);
  const minutes = Math.floor(total / 60);
  return minutes + ":" + String(total % 60).padStart(2, "0");
}

export function formatAudioSize(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return "Not available";
  return (bytes / (1024 * 1024)).toFixed(2) + " MiB";
}

export function buildLocalTranscriptionNote(file: LocalAudioInput, duration: number | null): LocalTranscriptionNote {
  return {
    featureKey: "ai.audio.transcribe",
    status: "local_preparation_only",
    file: validateLocalAudioFile(file),
    durationSeconds: normalizeAudioDuration(duration),
  };
}

export function formatTranscriptionNote(note: LocalTranscriptionNote): string {
  return [
    "Audio transcription preparation (not submitted)",
    "File: " + note.file.name,
    "Reported format: " + note.file.type,
    "File size: " + formatAudioSize(note.file.size),
    "Duration: " + formatAudioDuration(note.durationSeconds),
    "No transcription was generated; the audio file stays in this browser.",
  ].join("\n");
}

export function buildLocalSpeechDraft(text: string, language: LocalSpeechLanguage, rate: LocalSpeechRate): LocalSpeechDraft {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_LOCAL_SPEECH_CHARACTERS) {
    throw new LocalAudioToolError("invalid_script");
  }
  if (!LOCAL_SPEECH_LANGUAGES.some(item => item.code === language)) {
    throw new LocalAudioToolError("invalid_language");
  }
  if (!(LOCAL_SPEECH_RATES as readonly number[]).includes(rate)) {
    throw new LocalAudioToolError("invalid_rate");
  }
  return { featureKey: "ai.audio.speech", status: "browser_preview_only", text: text.trim(), language, rate };
}
