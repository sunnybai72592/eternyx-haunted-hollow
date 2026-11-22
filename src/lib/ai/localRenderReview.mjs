/** Offline verifier for the real CPU video timeline renderer's v2 output.
 * These are integrity checks against supplied files, NOT digital signatures,
 * authenticity proofs, visual-quality ratings, or server verification.
 */
import { checkLocalMediaName, localVideoSrt, LOCAL_VIDEO_LIMITS } from "./localVideoEditor.mjs";

export const MAX_RENDER_BYTES = 64 * 1024 * 1024;
export const MAX_RECEIPT_BYTES = 64 * 1024;
export const MAX_SUBTITLES_BYTES = 32 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const PROFILES = {
  landscape: [256, 144], portrait: [144, 256], square: [256, 256],
};
const QUALITIES = ["standard", "high"];
const TEXT = value => typeof value === "string" && value.trim().length > 0 &&
  value.length <= 180 && !/[\x00-\x1f\x7f]/.test(value);

function fail(message) { throw new Error(message); }
function hash(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) fail("Invalid " + name + " SHA-256.");
}
function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail("Invalid " + name + " (expected " + min + "–" + max + ").");
  }
}
function verifyShot(row, index, position) {
  if (!row || typeof row !== "object" || Array.isArray(row) ||
      row.index !== index || row.timeline_start_frame !== position) fail("Incorrect source timeline position.");
  checkLocalMediaName(row.file, "video");
  hash(row.source_sha256, "source");
  integer(row.start_frame, 0, 960, "start frame");
  integer(row.frames, 1, LOCAL_VIDEO_LIMITS.maxFrames, "shot frames");
  if (row.start_frame + row.frames > 960) fail("Source window exceeds the 960-frame limit.");
  integer(row.fade_in_frames, 0, Math.min(16, Math.floor(row.frames / 2)), "fade in");
  integer(row.fade_out_frames, 0, Math.min(16, Math.floor(row.frames / 2)), "fade out");
  if (!TEXT(row.caption) || !TEXT(row.rights_ref)) fail("Missing or malformed source caption/rights.");
}
function verifyAudio(row) {
  if (row === null) return false;
  if (!row || typeof row !== "object" || Array.isArray(row)) fail("Invalid soundtrack receipt.");
  checkLocalMediaName(row.file, "audio");
  hash(row.source_sha256, "soundtrack");
  if (!TEXT(row.rights_ref)) fail("Missing soundtrack rights reference.");
  integer(row.volume_percent, 0, 100, "soundtrack volume");
  return true;
}
function sameJSON(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/** Read and validate saved Python manifest.json before enabling a local review. */
export function readLocalRenderReceipt(raw) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_RECEIPT_BYTES) {
    fail("The render receipt must be JSON no larger than 64 KiB.");
  }
  let receipt;
  try { receipt = JSON.parse(raw); } catch { fail("Choose a valid renderer manifest.json."); }
  if (!receipt || Array.isArray(receipt) || receipt.version !== 2 ||
      receipt.type !== "local CPU video editing" || receipt.model_generation !== false) {
    fail("Only genuine-format CPU v2 editing receipts are supported (not AI generation results).");
  }
  hash(receipt.storyboard_sha256, "storyboard");
  const video = receipt.video;
  if (!video || typeof video !== "object" || Array.isArray(video)) fail("Missing video output details.");
  hash(video.sha256, "rendered video");
  integer(video.file_bytes, 1, MAX_RENDER_BYTES, "rendered video bytes");
  integer(video.frame_count, 1, LOCAL_VIDEO_LIMITS.maxFrames, "rendered frames");
  if (video.fps !== "16/1") fail("Only verified 16 FPS renderer receipts are supported.");
  if (typeof video.audio !== "boolean") fail("Unverifiable audio stream state.");
  if (typeof video.duration_seconds !== "number" ||
      video.duration_seconds !== video.frame_count / LOCAL_VIDEO_LIMITS.fps) {
    fail("Video duration disagrees with the frame count.");
  }
  if (!Object.hasOwn(PROFILES, receipt.profile) || !QUALITIES.includes(receipt.quality)) {
    fail("Unsupported render profile or quality.");
  }
  const factor = receipt.quality === "high" ? 2 : 1;
  const [width, height] = PROFILES[receipt.profile].map(n => n * factor);
  if (video.width !== width || video.height !== height) {
    fail("Render dimensions disagree with the selected profile and quality.");
  }
  integer(receipt.total_frames, 1, LOCAL_VIDEO_LIMITS.maxFrames, "total frames");
  if (receipt.total_frames !== video.frame_count) fail("Render frame count disagrees with storyboard.");
  if (receipt.captions !== "captions.srt") fail("The expected subtitle sidecar was not recorded.");
  if (!Array.isArray(receipt.shots) || !receipt.shots.length || receipt.shots.length > 8) {
    fail("Render receipt must contain 1–8 timeline shots.");
  }
  let cursor = 0;
  receipt.shots.forEach((row, index) => {
    verifyShot(row, index, cursor);
    cursor += row.frames;
  });
  if (cursor !== receipt.total_frames) fail("Shot lengths do not match the rendered timeline.");
  const hasAudio = verifyAudio(receipt.soundtrack);
  if (video.audio !== hasAudio) fail("Soundtrack and output audio states disagree.");
  return receipt;
}

/** Verify actual local file bytes and optionally the currently prepared studio project.
 * Expected projectHash must be calculated from the exact downloaded UTF-8 JSON bytes.
 */
export function verifyLocalRenderReceipt(receipt, file, context = null) {
  readLocalRenderReceipt(JSON.stringify(receipt));
  if (!file || typeof file !== "object" || file.name !== "video.mp4") {
    fail("Select the actual video.mp4 created by the local renderer.");
  }
  integer(file.size, 1, MAX_RENDER_BYTES, "imported MP4 bytes");
  hash(file.sha256, "imported MP4");
  if (file.sha256 !== receipt.video.sha256 || file.size !== receipt.video.file_bytes) {
    fail("Rendered MP4 SHA-256 or size does not match manifest.json.");
  }
  let projectMatch = null;
  if (context) {
    hash(context.storyboardSha256, "exported storyboard");
    if (context.storyboardSha256 !== receipt.storyboard_sha256) {
      fail("The renderer's storyboard digest differs from the currently prepared project.");
    }
    if (receipt.profile !== context.profile || receipt.quality !== context.quality) {
      fail("The render uses a different output shape or quality than this project.");
    }
    if (!context.board || context.board.version !== 2) fail("No valid studio v2 project to compare.");
    if (receipt.shots.length !== context.board.shots.length) fail("Renderer changed the number of shots.");
    for (let i = 0; i < receipt.shots.length; i++) {
      const {index, timeline_start_frame, ...raw} = receipt.shots[i];
      if (!sameJSON(raw, context.board.shots[i])) {
        fail("Rendered shot " + (i + 1) + " differs from the locally prepared project.");
      }
    }
    if (!sameJSON(receipt.soundtrack, context.board.soundtrack ?? null)) {
      fail("Renderer soundtrack differs from the locally prepared project.");
    }
    projectMatch = true;
  }
  return {
    videoSha256: file.sha256,
    fileBytes: file.size,
    frameCount: receipt.video.frame_count,
    durationSeconds: receipt.video.duration_seconds,
    width: receipt.video.width,
    height: receipt.video.height,
    withAudio: receipt.video.audio,
    storyboardSha256: receipt.storyboard_sha256,
    projectMatch,
    receipt,
  };
}

/** Check optional exact, unedited SRT created by the Python renderer. */
export function checkRenderedSubtitles(text, receipt) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_SUBTITLES_BYTES) {
    fail("Subtitle file must be UTF-8 text no larger than 32 KiB.");
  }
  const expected = localVideoSrt({version: 2, shots: receipt.shots});
  if (text.replace(/\r\n/g, "\n") !== expected) {
    fail("Subtitle timing or text differs from the exact renderer-generated sidecar.");
  }
  return { cues: receipt.shots.length, matchesRenderer: true };
}

/** Human review; no synthetic motion/quality scores are invented. */
export function exportLocalVideoReview(verified, verdict, notes, reviewedAt) {
  if (!verified || !SHA256.test(verified.videoSha256)) fail("Verify the actual MP4 first.");
  if (!["approved_for_local_use", "needs_revision", "undecided"].includes(verdict)) {
    fail("Choose an explicit human review verdict.");
  }
  if (typeof notes !== "string" || notes.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(notes)) {
    fail("Human review notes must be no longer than 1000 printable characters.");
  }
  if (typeof reviewedAt !== "string" || Number.isNaN(Date.parse(reviewedAt)) ||
      new Date(reviewedAt).toISOString() !== reviewedAt) fail("Invalid review timestamp.");
  return {
    version: 1, kind: "local_video_human_review", review_type: "human_observation",
    verdict, notes, reviewed_at: reviewedAt,
    rendered_video_sha256: verified.videoSha256,
    renderer_storyboard_sha256: verified.storyboardSha256,
    rendered_frames: verified.frameCount,
    editor_project_matched: verified.projectMatch,
    interpretation: "Local file hashes and manual review do not prove authenticity or generative video quality.",
  };
}
