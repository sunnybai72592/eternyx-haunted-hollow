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
