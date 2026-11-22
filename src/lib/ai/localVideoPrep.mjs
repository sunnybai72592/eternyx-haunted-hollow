/** Local-only phone footage normalizer UI handoff and provenance checks.
 * Report rows are self-attested outputs of local FFmpeg, NOT signed receipts.
 */
const SHA = /^[a-f0-9]{64}$/;
const INPUT = /^[^\/\\:\x00-\x1f\x7f]{1,180}\.(mp4|mov|m4v)$/i;
const OUTPUT = /^clip-(0[1-8])\.mp4$/;
export const MAX_PREP_REPORT_BYTES = 32 * 1024;

export function phonePreparationCommand(start = 0, seconds = 30) {
  if (!Number.isSafeInteger(start) || start < 0 || start > 299 ||
      !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 60) {
    throw new Error("Choose a whole-number start from 0–299 and duration from 1–60 seconds.");
  }
  return "python gpu-worker/prepare_video_sources.py --input ./phone-clips --output ./local-video-media --start-seconds " +
    start + " --seconds " + seconds;
}
function count(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error("Invalid " + label + " in preparation report.");
  }
  return value;
}
function sha(value, label) {
  if (typeof value !== "string" || !SHA.test(value)) {
    throw new Error("Invalid " + label + " in preparation report.");
  }
}
function verifyRow(row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Malformed preparation report entry.");
  }
  if (typeof row.source_filename !== "string" || !INPUT.test(row.source_filename) ||
      row.source_filename.startsWith(".") || row.source_filename.startsWith("~")) {
    throw new Error("Invalid original source filename in preparation report.");
  }
  if (row.prepared_filename !== "clip-" + String(index + 1).padStart(2,"0") + ".mp4") {
    throw new Error("Prepared clip filenames must match deterministic sequence.");
  }
  sha(row.source_sha256, "source SHA-256");
  sha(row.prepared_sha256, "converted SHA-256");
  count(row.prepared_bytes, 1, 64 * 1024 * 1024, "prepared bytes");
  count(row.prepared_width, 16, 512, "width");
  count(row.prepared_height, 16, 512, "height");
  if (row.prepared_width % 2 || row.prepared_height % 2 ||
      row.prepared_width * row.prepared_height > 512 * 512) {
    throw new Error("Prepared output has invalid H264 dimensions.");
  }
  if (row.prepared_fps !== "16/1") throw new Error("Prepared output must be 16 FPS.");
  count(row.prepared_frames, 1, 960, "prepared frames");
  count(row.start_seconds, 0, 299, "start offset");
  count(row.seconds_limit, 1, 60, "output duration limit");
  if (row.prepared_frames > row.seconds_limit * 16 ||
      row.prepared_duration_seconds !== row.prepared_frames / 16) {
    throw new Error("Prepared frames do not match exact duration.");
  }
  if (typeof row.reported_fps !== "string" || !/^[1-9][0-9]*\/[1-9][0-9]*$/.test(row.reported_fps)) {
    throw new Error("Invalid original frame rate.");
  }
  if (typeof row.reported_duration_seconds !== "number" ||
      !Number.isFinite(row.reported_duration_seconds) ||
      row.reported_duration_seconds <= 0 || row.reported_duration_seconds > 300) {
    throw new Error("Invalid original duration.");
  }
}
export function readPhonePreparationReport(raw) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_PREP_REPORT_BYTES) {
    throw new Error("Preparation report must be UTF-8 JSON under 32 KiB.");
  }
  let report;
  try { report = JSON.parse(raw); } catch {
    throw new Error("Choose a valid preparation-report.json file.");
  }
  if (!report || typeof report !== "object" || Array.isArray(report) ||
      report.kind !== "local_cpu_video_import" || report.version !== 1 ||
      report.model_generation !== false ||
      !Array.isArray(report.clips) || !report.clips.length || report.clips.length > 8 ||
      report.source_count !== report.clips.length) {
    throw new Error("Unsupported CPU local-video preparation report.");
  }
  const names = new Set();
  report.clips.forEach((row, index) => {
    verifyRow(row, index);
    const name = row.source_filename.toLowerCase();
    if (names.has(name)) throw new Error("Duplicate original source filenames.");
    names.add(name);
  });
  return report;
}

/** Match actual SHA-256 hashes calculated by the Studio from selected local MP4 files. */
export function checkPreparedVideoSelection(report, selected) {
  if (!report || !Array.isArray(report.clips)) throw new Error("Choose a preparation report.");
  if (!Array.isArray(selected) || !selected.length) throw new Error("Select converted MP4s first.");
  const byName = new Map(report.clips.map(row => [row.prepared_filename, row]));
  for (const file of selected) {
    const row = byName.get(file.name);
    if (!row) throw new Error("Selected MP4 is not listed in the local preparation report.");
    if (file.sha256 !== row.prepared_sha256 || file.size !== row.prepared_bytes) {
      throw new Error("Selected MP4 bytes do not match preparation-report.json.");
    }
  }
  return { verifiedSelectedClips: selected.length,
           receiptClips: report.clips.length,
           complete: selected.length === report.clips.length,
           interpretation: "Byte hashes match this local self-reported transcode manifest; not signed provenance." };
}
