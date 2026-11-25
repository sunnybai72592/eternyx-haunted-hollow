# ETERNYX: generative video research, distinct from editing

## First independent joint clip denoiser

The previous 48x28 two-frame neural predictor and tag adapters are genuine small learned models, but autoregressive texture prediction is not open-domain natural-language video generation. This separate prototype trains a randomly initialized 24-hidden-unit neural x0 denoiser on entire 16-frame, 16x12 RGB clips corrupted at 12 noise levels. It conditions on two explicit trained tags and uses a deterministic DDIM reverse process starting with seeded Gaussian noise. No original video or first frame is required at inference. This is a tiny experimental diffusion-style baseline, not a pretrained model, a latent video transformer, text-to-video, or evidence of realistic quality.

The CLI requires local NumPy and FFmpeg. On a CPU-only local environment use:

    python -m pip install numpy==2.2.6

Prepare a JSON array with 4–12 flat local MP4 records, each containing file, sha256, tag, split (train or holdout), rights_ref. At least one distinct train and holdout file per each of two tags. Native input 16 FPS, at least 16 frames. Use licensed or self-created recordings only. Exact SHA-256 duplicates and exact decoded window duplicates are rejected; near-duplicate and same-event leakage still need human review. Never upload private footage.

    python gpu-worker/train_joint_video_diffusion.py train --input ./approved-media --manifest ./dataset.json --output ./model-v1 --updates 120
    python gpu-worker/train_joint_video_diffusion.py generate --model ./model-v1/model.json --tag red --seed 42 --output ./generated-v1

The generation tag must be one of the two labels actually trained. Outputs are one-second 16 FPS movies; the native generated tensor is 16x12, enlarged to 256x192 for playback. No invented resolution improvement. Bounded JSON weights, no pickle, no checkpoint overwrite. Training and generated media stay local. The test trains on four synthetic moving fixtures, evaluates disjoint source windows, verifies updated weights, tag influence and deterministic generation after deleting the source folder. Denoising MSE before/after is reported against noisy inputs; no assertion of held-out improvement or perceptual quality.

## Quality gates before calling it a video generation universe

1. Improve dataset diversity, deduplication, rights provenance, fixed train/validation/test splits and reproducible checkpoints.
2. Replace the tiny fully connected denoiser with spatial-temporal convolutional or latent architectures; compare against the baseline on untouched sources.
3. Learn compositional prompt conditioning beyond closed tags, with independent text/video agreement and motion evaluations.
4. Increase true native resolution and duration only when CPU memory/runtime and holdout quality evidence justify it.
5. Connect verified model training and inference to a local-only browser workflow and real generation receipts, with model identity and quality limits explicit.
6. Treat cinematic editing and export as a separate finishing stage. Upscaling, interpolation and effects are not gains in underlying model resolution or generative capability.

Training a competitive Veo-class foundation model from scratch is not a credible CPU-only near-term target. Larger high-quality models require extensive licensed data, compute and engineering; no claim or time estimate of parity is made here. This prototype is an independently trainable first step, not a release-ready general-purpose video generator.
