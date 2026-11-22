/** ETERNYX original CPU procedural motion clip project builder.
 * Deliberately not a text-to-video AI model. Only exports config for local Python.
 */
export const CPU_MOTION_STYLES = Object.freeze([
  "aurora", "orbit", "ripple", "particles", "scanlines", "sunrise",
]);
export const CPU_MOTION_PALETTES = Object.freeze(["ocean","sunset","forest","violet","mono"]);
export const CPU_MOTION_PROFILES = Object.freeze(["landscape","portrait","square"]);
export const CPU_MOTION_QUALITIES = Object.freeze(["standard","high"]);
export const CPU_MOTION_LIMITS = Object.freeze({maxScenes:8,maxSecondsPerScene:8,
  maxStandardSeconds:30,maxHighSeconds:10,fps:16,maxConfigBytes:32768});
const control = /[\x00-\x1f\x7f]/;

function whole(value, min, max, description) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(description + " must be a whole number between " + min + " and " + max + ".");
  }
  return value;
}
function choice(value, options, description) {
  if (typeof value !== "string" || !options.includes(value)) {
    throw new Error("Unsupported " + description + ".");
  }
  return value;
}
function caption(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 180 || control.test(value)) {
    throw new Error("Each scene needs a printable caption of 1–180 characters.");
  }
  return value;
}

export function createMotionProject({profile = "landscape", quality = "standard", scenes}) {
  choice(profile, CPU_MOTION_PROFILES, "output profile");
  choice(quality, CPU_MOTION_QUALITIES, "output quality");
  if (!Array.isArray(scenes) || scenes.length < 1 || scenes.length > CPU_MOTION_LIMITS.maxScenes) {
    throw new Error("Choose between 1 and 8 original procedural scenes.");
  }
  let seconds = 0;
  const clean = scenes.map(scene => {
    if (!scene || typeof scene !== "object") throw new Error("Invalid scene settings.");
    const result = {
      style: choice(scene.style, CPU_MOTION_STYLES, "scene style"),
      palette: choice(scene.palette, CPU_MOTION_PALETTES, "color palette"),
      seconds: whole(scene.seconds, 1, CPU_MOTION_LIMITS.maxSecondsPerScene, "Scene duration"),
      seed: whole(scene.seed, 0, 2147483647, "Seed"),
      caption: caption(scene.caption),
    };
    seconds += result.seconds;
    return result;
  });
  const maximum = quality === "high" ? CPU_MOTION_LIMITS.maxHighSeconds
    : CPU_MOTION_LIMITS.maxStandardSeconds;
  if (seconds > maximum) throw new Error("Total duration exceeds " + maximum + " seconds for " + quality + " quality.");
  const config = {version:1,profile,quality,scenes:clean};
  const json = JSON.stringify(config, null, 2) + "\n";
  if (new TextEncoder().encode(json).length > CPU_MOTION_LIMITS.maxConfigBytes) {
    throw new Error("Scene configuration exceeds the local 32 KiB limit.");
  }
  return {config,json,seconds,totalFrames:seconds*CPU_MOTION_LIMITS.fps,
          sceneCount:clean.length,highQuality:quality==="high"};
}

export function motionGeneratorCommand() {
  return "python gpu-worker/generate_motion_clips.py --scenes ./eternyx-motion-scenes.json --output ./eternyx-motion-output";
}

export function motionOutputPaths() {
  return Object.freeze({
    video:"eternyx-motion-output/render/video.mp4",
    rendererManifest:"eternyx-motion-output/render/manifest.json",
    sceneReceipt:"eternyx-motion-output/generation-report.json",
    board:"eternyx-motion-output/eternyx-video-v2.json",
    captions:"eternyx-motion-output/render/captions.srt",
  });
}
