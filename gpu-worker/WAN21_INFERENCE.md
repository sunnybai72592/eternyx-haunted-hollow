# ETERNYX first real open-weight video inference executable — Wan 2.1 1.3B

**This adds a real Diffusers-based text-to-video inference implementation to the
private GPU worker. It is NOT deployed and has NOT generated an actual AI video
in this PR.** No model download, GPU rental, customer charges or subscription
changes happen here.

## Starting model
- Model: [Wan-AI/Wan2.1-T2V-1.3B-Diffusers](https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B-Diffusers), currently listed Apache-2.0.
- Framework API: [Hugging Face Diffusers Wan documentation](https://huggingface.co/docs/diffusers/v0.33.1/en/api/pipelines/wan).
- Only **text-to-video, 16:9 and 1–5 seconds** are accepted by this first
  experimental executable. Other features fail closed. The upstream API supports
  more, but longer videos require a separately verified cost and hardware budget.
- Output is 16 fps, with `16 * durationSeconds + 1` frames, following the
  Wan requirement `(num_frames - 1) % 4 == 0`.
- This does not create synchronized audio or guarantee Veo-class fidelity.

## Manual provisioning (future staging only; NO auto-spend)
1. Obtain GPU access **only with explicit owner cost approval**. The operator
   must verify the selected provider GPU, quota, runtime, pricing and limits.
2. Review the exact model and its redistribution/commercial rights, pin a
   specific model repository commit and audit model files. Place the trusted
   Diffusers-format snapshot in a **local, read-only absolute directory**.
   This source code intentionally does NOT auto-download weights.
3. In an isolated Python environment, install operator-reviewed and pinned
   compatible versions of `torch`, `diffusers`, `transformers`,
   `accelerate`, `ftfy`, `imageio` and `imageio-ffmpeg`, including an
   appropriate CUDA build. Pin exact wheels/hashes in a future GPU image build;
   none are added to CI by this PR.
4. Create an absolute private media directory with permissions `0700`, on a
   controlled persistent volume. Restrict access to the dedicated worker
   account and define retention/quota cleanup.
5. Only in approved staging, set:
   ```sh
   export ETERNYX_WAN21_MODEL_DIR=/absolute/trusted/wan21-diffusers-snapshot
   export ETERNYX_PRIVATE_VIDEO_DIR=/absolute/private/eternyx-video-assets
   # The checked-out file needs operator-controlled executable permission:
   chmod 700 gpu-worker/wan21_infer.py
   export ETERNYX_APPROVED_INFERENCE_EXECUTABLE=/absolute/repo/gpu-worker/wan21_infer.py
   ```
   The private Python worker still requires its separate server secret, persistent
   DB path, queue cap, and private TLS ingress as described in `gpu-worker/README.md`.
6. The executable reads one server-validated JSON request from stdin and performs
   **actual WanPipeline.from_pretrained(local_snapshot)** inference on CUDA.
   It exports real frames to MP4, checks the MP4 header and file size, and
   persists the file with a 0600 private permission and a random opaque handle.
   Only that handle appears in stdout as `{"outputReference":"asset_..."}`.

## End-to-end functionality still missing
- The current opaque handle resolves ONLY to a local private MP4 file; it is
  not yet integrated with Supabase private buckets, ownership metadata, signed
  URLs, browser download, or the central AI credit settlement flow.
- Model checkpoint provenance integrity (pinned hashes), safe model-weight
  loading, approved CUDA container, user-specific storage ownership, prompt
  moderation, provider lease reconciliation and hard GPU cost ceilings need
  implementation and staging tests before any production use.
- Local files are not an API available to remote users. NEVER treat a generated
  output reference as authorized without binding it to the original user/job
  and verifying the media in the trusted backend.
- Actual image-to-video, editing and audio remain disabled.

## Free local offline tests
```sh
python3 -m unittest discover -s gpu-worker/tests -p 'test_*.py' -v
```
These tests use synthetic MP4-shaped **fixtures**, clearly distinguished from
AI-generated media, and do not invoke CUDA, download model weights or spend money.
A real GPU end-to-end acceptance test is the next separate milestone.

## Compare two staging runs

For an approved staging canary, use the same `--seed` for the baseline and candidate (default 0, range 0–4294967295). Each render initializes a fresh CPU random generator, and the success report includes the seed and pinned model revision. Keep the prompt, duration, hardware and software versions fixed when comparing the clips. A shared seed controls starting noise; it does not guarantee identical frames across hardware or library versions.

The direct offline executable also accepts an optional integer `seed` in its input JSON. Omitting the field preserves its previous sampling behavior. This comparison setting applies to the staging executable; the public queue contract is unchanged.

## Compare a trained adapter with the base model

Use a newly written `train_video_adapter.py` checkpoint. Copy its `adapter.json` and
`adapter.safetensors` together to an operator-owned read-only directory. The metadata
records the adapter checksum, rank and the hashes of the transformer files used in training.
Older checkpoints without this metadata still support training resume. Continue training
to a new checkpoint to export the pair.

For the baseline render, leave `ETERNYX_WAN_ADAPTER_DIR` unset. For the candidate,
set it to the absolute bundle directory in the inference process environment and repeat
with the same prompt, seed and snapshot. Install the compatible PEFT dependency from
`adapter-smoke-requirements.txt` in the candidate runtime. Record the adapter SHA-256
from the metadata with the comparison. A failed integrity check stops the render.
