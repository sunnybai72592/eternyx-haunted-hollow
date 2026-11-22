export const frameFormats = ["16:9", "9:16", "1:1"];
export const shotDurations = [3, 5, 10, 15];

export function buildStoryboard(text, seconds, format) {
  if (!shotDurations.includes(seconds) || !frameFormats.includes(format)) throw new Error("Choose a listed duration and frame format.");
  if (text.length > 12000) throw new Error("Use up to 12,000 characters.");
  const lines = text.split(/\r\n|[\r\n]/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 60) throw new Error("Use up to 60 shots per storyboard.");
  return {
    format, totalSeconds: seconds * lines.length,
    shots: lines.map((description, i) => ({
      number: i + 1, startSeconds: i * seconds, endSeconds: (i + 1) * seconds, description,
    })),
  };
}

export function timecode(seconds) {
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}

export function readStoryboard(json) {
  let input;
  try { input = JSON.parse(json); }
  catch { throw new Error("Choose a valid JSON storyboard."); }
  if (!Array.isArray(input?.shots) || !input.shots.length || input.shots.length > 60) {
    throw new Error("The file must contain between 1 and 60 shots.");
  }
  const seconds = input.shots[0]?.endSeconds;
  const text = input.shots.map((shot, i) => {
    if (typeof shot?.description !== "string" || !shot.description.trim() || /[\r\n]/.test(shot.description)) {
      throw new Error("Each shot needs a single-line description.");
    }
    if (shot.number !== i + 1 || shot.startSeconds !== i * seconds || shot.endSeconds !== (i + 1) * seconds) {
      throw new Error("Shot numbers and time ranges must form one evenly timed sequence.");
    }
    return shot.description;
  }).join("\n");
  const board = buildStoryboard(text, seconds, input.format);
  if (input.totalSeconds !== board.totalSeconds) throw new Error("The total duration does not match the shot timings.");
  return { text, seconds, format: board.format, count: board.shots.length };
}

/** Escape CSV text (including formula-like values) for spreadsheet applications. */
function csvCell(value) {
  const text = String(value);
  const safe = /^\s*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/**
 * Export a plain CSV shot timeline that editors can inspect in spreadsheet tools.
 * This does not render video, call an API, or imply AI generation.
 */
export function storyboardCsv(board) {
  if (!board || !Array.isArray(board.shots)) throw new Error("Choose a valid storyboard.");
  const header = ["Shot", "Start (seconds)", "End (seconds)", "Duration (seconds)", "Frame format", "Description"];
  const lines = board.shots.map(shot => [
    shot.number, shot.startSeconds, shot.endSeconds, shot.endSeconds - shot.startSeconds, board.format, shot.description
  ].map(csvCell).join(","));
  return [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}

/** Format a timeline position in valid SRT hh:mm:ss,mmm notation. */
export function storyboardSrtTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isInteger(seconds)) {
    throw new Error("Shot timestamps must be nonnegative whole seconds.");
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remaining = seconds % 60;
  return [hours, minutes, remaining].map(n => String(n).padStart(2, "0")).join(":") + ",000";
}

/**
 * These captions describe storyboard shots; they are NOT transcripts of
 * generated speech or audio and are not synced to an actual AI video.
 */
export function storyboardShotCaptionsSrt(board) {
  if (!board || !Array.isArray(board.shots)) throw new Error("Choose a valid storyboard.");
  return board.shots.map(shot => [
    shot.number,
    storyboardSrtTimestamp(shot.startSeconds) + " --> " + storyboardSrtTimestamp(shot.endSeconds),
    String(shot.description).replace(/[\r\n]+/g, " ").trim()
  ].join("\n")).join("\n\n") + (board.shots.length ? "\n" : "");
}
