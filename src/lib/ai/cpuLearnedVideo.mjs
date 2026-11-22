/** Safe browser handoff to actual locally trained CPU Markov video texture model.
 * It never trains/runs the model in the browser and never uploads footage.
 */
export const LEARNED_CPU_LIMITS = Object.freeze({
  maxSources:8, maxSeconds:8, maxSeed:2147483647,
  maxTrainingReportBytes:65536, maxModelBytes:1048576,
});
export const LEARNED_CPU_PROFILES = Object.freeze(["landscape","portrait","square"]);
export const LEARNED_CPU_QUALITIES = Object.freeze(["standard","high"]);
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const POSITIVE = value => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function cpuModelTrainCommand(rightsRef = "operator-reviewed-original-footage") {
  if (typeof rightsRef !== "string" || !SAFE_REFERENCE.test(rightsRef)) {
    throw new Error("Use 1–80 letters, digits, hyphens or underscores for the local rights reference.");
  }
  return "python gpu-worker/learn_cpu_video_texture.py train --input ./local-video-media --output ./eternyx-learned-cpu-model --rights-ref " + rightsRef;
}

export function cpuModelGenerateCommand({seconds = 3, seed = 42,
    profile = "landscape", quality = "standard"} = {}) {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > LEARNED_CPU_LIMITS.maxSeconds) {
    throw new Error("Generate 1–8 seconds per sample.");
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > LEARNED_CPU_LIMITS.maxSeed) {
    throw new Error("Sample seed must be a 31-bit unsigned integer.");
  }
  if (!LEARNED_CPU_PROFILES.includes(profile) || !LEARNED_CPU_QUALITIES.includes(quality)) {
    throw new Error("Choose a supported render preset.");
  }
  return "python gpu-worker/learn_cpu_video_texture.py generate --model ./eternyx-learned-cpu-model/model.json --output ./eternyx-learned-cpu-video --seconds " +
    seconds + " --seed " + seed + " --profile " + profile + " --quality " + quality;
}

export function cpuLearnedOutputPaths() {
  return Object.freeze({
    model:"eternyx-learned-cpu-model/model.json",
    trainingReport:"eternyx-learned-cpu-model/training-report.json",
    sample:"eternyx-learned-cpu-video/clip-01.mp4",
    finished:"eternyx-learned-cpu-video/render/video.mp4",
    sampleReport:"eternyx-learned-cpu-video/generation-report.json",
    renderManifest:"eternyx-learned-cpu-video/render/manifest.json",
  });
}

export function readCpuTrainingReport(raw) {
  if (typeof raw !== "string" ||
      new TextEncoder().encode(raw).length > LEARNED_CPU_LIMITS.maxTrainingReportBytes) {
    throw new Error("CPU training report must be JSON no larger than 64 KiB.");
  }
  let result;
  try { result = JSON.parse(raw); } catch {
    throw new Error("Choose a valid local training-report.json.");
  }
  if (!result || typeof result !== "object" || Array.isArray(result) ||
      result.kind !== "cpu_learned_motion_training" || result.version !== 1 ||
      result.neural_network !== false || !SHA256.test(result.model_sha256) ||
      !Array.isArray(result.training_sources) ||
      result.training_source_count !== result.training_sources.length ||
      !result.training_source_count ||
      result.training_source_count > LEARNED_CPU_LIMITS.maxSources) {
    throw new Error("Not a supported real offline CPU video texture training report.");
  }
  for (const row of result.training_sources) {
    if (!row || typeof row !== "object" || !SHA256.test(row.sha256) ||
        typeof row.file !== "string" || row.file.length > 180 ||
        row.file.startsWith(".") || row.file.startsWith("~") ||
        !/^[^\/\\:\x00-\x1f\x7f]{1,180}\.mp4$/i.test(row.file) ||
        typeof row.rights_ref !== "string" || !row.rights_ref.trim() ||
        row.rights_ref.length > 180 ||
        !Number.isSafeInteger(row.train_frames) || row.train_frames < 4 ||
        !Number.isSafeInteger(row.holdout_frames) || row.holdout_frames < 1 ||
        !Number.isSafeInteger(row.decoded_frames) || row.decoded_frames < row.train_frames ||
        !Number.isSafeInteger(row.used_frames) ||
        row.train_frames + row.holdout_frames !== row.used_frames ||
        row.used_frames > 240) {
      throw new Error("Invalid training source provenance or train/holdout split.");
    }
  }
  const m = result.metrics;
  if (!m || typeof m !== "object" ||
      !Number.isSafeInteger(m.training_pairs) || m.training_pairs <= 0 ||
      !Number.isSafeInteger(m.holdout_pairs) || m.holdout_pairs <= 0 ||
      !POSITIVE(m.holdout_transition_nll) || !POSITIVE(m.holdout_color_baseline_nll)) {
    throw new Error("Model report is missing real holdout metrics.");
  }
  return result;
}

export function checkCpuTrainedModel(report, file) {
  if (!report || !file || file.name !== "model.json" ||
      !Number.isSafeInteger(file.size) || file.size <= 0 ||
      file.size > LEARNED_CPU_LIMITS.maxModelBytes ||
      typeof file.sha256 !== "string" || !SHA256.test(file.sha256) ||
      file.sha256 !== report.model_sha256) {
    throw new Error("Model bytes do not match the local training report SHA-256.");
  }
  return {
    matched:true, modelSha256:file.sha256,
    trainingSources:report.training_source_count,
    holdoutTransitionNll:report.metrics.holdout_transition_nll,
    holdoutBaselineNll:report.metrics.holdout_color_baseline_nll,
    interpretation:"Local checksum and held-out categorical prediction results, not a photo-realism score or digital signature.",
  };
}
