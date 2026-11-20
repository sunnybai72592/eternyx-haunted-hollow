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
