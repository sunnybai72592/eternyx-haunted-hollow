import { buildStoryboard } from "./storyboard.mjs";

export const storyboardDraftKey = "eternyx.ai-video.storyboard-draft.v1";
const VERSION = 1;

/** Store only local storyboard text and settings, never prompts to an API. */
export function saveStoryboardDraft(storage, input, now = Date.now()) {
  const text = String(input?.text ?? "");
  const seconds = input?.seconds;
  const format = input?.format;
  const board = buildStoryboard(text, seconds, format);
  if (!board.shots.length) {
    storage.removeItem(storyboardDraftKey);
    return null;
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid save time.");
  const draft = { version: VERSION, text, seconds, format, savedAt: now };
  storage.setItem(storyboardDraftKey, JSON.stringify(draft));
  return draft;
}

/** Invalid or outdated local data is ignored, not silently loaded into the editor. */
export function readStoryboardDraft(storage) {
  const raw = storage.getItem(storyboardDraftKey);
  if (!raw || raw.length > 16_384) return null;
  let draft;
  try { draft = JSON.parse(raw); } catch { return null; }
  if (!draft || draft.version !== VERSION || typeof draft.text !== "string" ||
      !Number.isSafeInteger(draft.savedAt) || draft.savedAt < 0 ||
      !Number.isSafeInteger(draft.seconds) || typeof draft.format !== "string") return null;
  try {
    if (!buildStoryboard(draft.text, draft.seconds, draft.format).shots.length) return null;
  } catch { return null; }
  return { text: draft.text, seconds: draft.seconds, format: draft.format, savedAt: draft.savedAt };
}

export function clearStoryboardDraft(storage) {
  storage.removeItem(storyboardDraftKey);
}
