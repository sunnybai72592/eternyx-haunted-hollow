/** Browser-only v2 storyboard preparation for the offline Python/FFmpeg renderer.
 * Never sends media, filenames, hashes or captions to a server.
 */
export const LOCAL_VIDEO_LIMITS = Object.freeze({
  maxClips: 8, maxFrames: 480, maxSourceBytes: 64 * 1024 * 1024,
  maxAudioBytes: 16 * 1024 * 1024, fps: 16,
});
export const LOCAL_VIDEO_PROFILES = Object.freeze(["landscape", "portrait", "square"]);
export const LOCAL_VIDEO_QUALITIES = Object.freeze(["standard", "high", "cinematic"]);
export function localVideoFps(quality="standard"){
  if(!LOCAL_VIDEO_QUALITIES.includes(quality))
    throw new Error("Unsupported local CPU video quality.");
  return quality==="cinematic"?24:16;
}
export const localVideoMaxFrames=(fps=16)=>fps*30;
export const localVideoMaxSourceFrames=(fps=16)=>fps*60;
const SHA256 = /^[0-9a-f]{64}$/;
const VIDEO = /^[^\/\\:\x00-\x1f\x7f]{1,180}\.mp4$/i;
const AUDIO = /^[^\/\\:\x00-\x1f\x7f]{1,180}\.(wav|mp3|m4a)$/i;

function integer(value, min, max, what) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(what + " must be an integer from " + min + " to " + max + ".");
  }
  return value;
}

function label(value, what) {
  if (typeof value !== "string" || !value.trim() || value.length > 180 ||
      /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(what + " must be printable text (1–180 characters).");
  }
  return value;
}

export function checkLocalMediaName(name, kind = "video") {
  const rule = kind === "video" ? VIDEO : kind === "audio" ? AUDIO : null;
  if (!rule || typeof name !== "string" || !rule.test(name) || name.startsWith("~")) {
    throw new Error("Select a local " + (kind === "video" ? "MP4" : "WAV, MP3 or M4A") + " with a safe filename (no folder separators).");
  }
  return name;
}

function mediaRecord(file, kind) {
  if (!file || typeof file !== "object") throw new Error("Choose a local media file.");
  const name = checkLocalMediaName(file.name, kind);
  integer(file.size, 1, kind === "video" ? LOCAL_VIDEO_LIMITS.maxSourceBytes : LOCAL_VIDEO_LIMITS.maxAudioBytes, "Media size in bytes");
  if (typeof file.sha256 !== "string" || !SHA256.test(file.sha256)) {
    throw new Error("SHA-256 for " + name + " is missing or invalid.");
  }
  return { name, sha256: file.sha256 };
}

function validateUniqueClips(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > LOCAL_VIDEO_LIMITS.maxClips) {
    throw new Error("Select between 1 and 8 local MP4 files.");
  }
  const seen = new Set();
  const mapped = new Map();
  for (const file of files) {
    const record = mediaRecord(file, "video");
    const key = record.name.toLowerCase();
    if (seen.has(key)) throw new Error("Use unique MP4 filenames, including letter case.");
    seen.add(key);
    mapped.set(record.name, record);
  }
  return mapped;
}

/** Produce exact v2 JSON accepted by gpu-worker/render_video_timeline.py. */
export function buildLocalVideoBoard({ sources, shots, soundtrack = null, quality = "standard" }) {
  const fps=localVideoFps(quality),maxFrames=localVideoMaxFrames(fps),maxSource=localVideoMaxSourceFrames(fps);
  const clips = validateUniqueClips(sources);
  if (!Array.isArray(shots) || shots.length === 0 || shots.length > LOCAL_VIDEO_LIMITS.maxClips) {
    throw new Error("Choose between 1 and 8 real video shots.");
  }
  let totalFrames = 0;
  const normalized = shots.map((shot, index) => {
    if (!shot || typeof shot !== "object") throw new Error("Invalid shot " + (index + 1) + ".");
    const source = clips.get(shot.sourceName);
    if (!source) throw new Error("Shot " + (index + 1) + " must select one verified MP4.");
    const start = integer(shot.startFrame, 0, maxSource, "Start frame");
    const frames = integer(shot.frames, 1, maxFrames, "Shot frames");
    if (start + frames > maxSource) throw new Error("The cut exceeds the source ceiling of "+maxSource+" frames.");
    totalFrames += frames;
    if (totalFrames > maxFrames) {
      throw new Error("The entire video must be 30 seconds / "+maxFrames+" frames or less.");
    }
    const fadeIn = integer(shot.fadeInFrames ?? 0, 0, Math.min(16, Math.floor(frames / 2)), "Fade-in frames");
    const fadeOut = integer(shot.fadeOutFrames ?? 0, 0, Math.min(16, Math.floor(frames / 2)), "Fade-out frames");
    return {
      file: source.name, source_sha256: source.sha256, start_frame: start, frames,
      caption: label(shot.caption, "Shot caption"),
      rights_ref: label(shot.rightsRef, "Video rights reference"),
      fade_in_frames: fadeIn, fade_out_frames: fadeOut,
    };
  });
  const board = { version: 2, shots: normalized, ...(fps===24?{fps:24}:{}) };
  if (soundtrack) {
    const audio = mediaRecord(soundtrack, "audio");
    board.soundtrack = {
      file: audio.name,
      source_sha256: audio.sha256,
      rights_ref: label(soundtrack.rightsRef, "Soundtrack rights reference"),
      volume_percent: integer(soundtrack.volumePercent, 0, 100, "Soundtrack volume"),
    };
  }
  const json = JSON.stringify(board, null, 2);
  if (new TextEncoder().encode(json).length > 32 * 1024) {
    throw new Error("Storyboard exceeds the offline editor's 32 KiB manifest limit.");
  }
  return { board, totalFrames, fps, seconds: totalFrames / fps, json: json + "\n" };
}

/** Paths are static; the operator puts original files in the local media folder. */
export function localVideoCommand(profile = "landscape", quality = "standard") {
  if (!LOCAL_VIDEO_PROFILES.includes(profile) || !LOCAL_VIDEO_QUALITIES.includes(quality)) {
    throw new Error("Choose one supported profile and quality preset.");
  }
  return "python gpu-worker/render_video_timeline.py --storyboard ./eternyx-video-v2.json --media ./local-video-media --output ./eternyx-video-output --profile " + profile + " --quality " + quality;
}

export function localVideoSrt(board) {
  if (!board || board.version !== 2 || !Array.isArray(board.shots) ||
      (board.fps !== undefined && board.fps !== 24)) {
    throw new Error("Build a valid v2 video storyboard first.");
  }
  const fps=board.fps===24?24:16;
  const stamp = frame => {
    // Python renderer uses round-half-to-even; Math.round differs on odd half-ms frames.
    const ticks = frame * 1000;
    const whole = Math.floor(ticks / fps);
    const remainder = ticks % fps;
    const midpoint = fps / 2;
    const ms = whole + (remainder > midpoint || (remainder === midpoint && whole % 2 === 1) ? 1 : 0);
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor(ms / 60000) % 60;
    const seconds = Math.floor(ms / 1000) % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2,"0")).join(":") + "," + String(ms % 1000).padStart(3,"0");
  };
  let frame = 0;
  return board.shots.map((shot, i) => {
    const start = frame;
    frame += shot.frames;
    return String(i + 1) + "\n" + stamp(start) + " --> " + stamp(frame) + "\n" + shot.caption + "\n";
  }).join("\n") + "\n";
}
