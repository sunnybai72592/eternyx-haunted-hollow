# Wan runtime API compatibility — no-render diagnostic

The previous GPU manifest and staging preparations are merged. This milestone
checks whether an **already provisioned** GPU host exposes the API primitives
needed by the concrete `wan21_infer.py` runner.

It does **not** install Python dependencies, fetch weights, start GPU rentals,
run Wan inference, render MP4s, connect Supabase, or activate payments.

## Use on an existing approved GPU host only

```sh
python3 gpu-worker/runtime_api_probe.py \
  --operator-confirmed-existing-gpu \
  --model-dir /absolute/reviewed/wan21-diffusers-snapshot
```

Before executing, the owner should independently ensure no provider billing
starts as a consequence of activating the host. A running instance may incur
charges regardless of whether inference happens.

The diagnostic imports installed `torch`, `diffusers` and
`diffusers.utils`. It checks `WanPipeline`, `AutoencoderKLWan`,
`export_to_video`, torch CUDA availability and GPU BF16 capability,
and validates the local `model_index.json` identifies a WanPipeline with
transformer and VAE components. It does **not** call `from_pretrained`
or load model weights. GPU presence/BF16 support is not a guarantee of
sufficient VRAM or speed.

It emits sanitized JSON with boolean checks. The flags
`modelLoaded: false`, `videoGenerated: false` and
`safeToActivatePaidGpu: false` remain false even if the API report says
`runtime_api_compatible`.

## Follow-on verification

- Use `staging_preflight.py` and `create_model_manifest.py` for the
  complete operator-reviewed model snapshot verification.
- Audit and pin package versions in a separate controlled environment;
  merely importing a library does not prove compatibility during inference.
- The official Diffusers Wan documentation illustrates
  `WanPipeline` and `AutoencoderKLWan` with the 1.3B model.
  https://huggingface.co/docs/diffusers/api/pipelines/wan
- For a genuine video, the owner must approve a bounded GPU provider test and
  ensure provider-level automatic shutdown and spending controls.
- Only the manual staging canary can report real video generation after
  actual model execution and full-frame decoding; this script never does.
- Customer billing, production rollout and remote model downloads remain off.

## Offline CI tests

```sh
python3 -m unittest discover -s gpu-worker/tests -p 'test_*.py' -v
```

The unit tests inject synthetic modules and use temporary JSON files; no GPU
or real AI model is used. Passing them is not a video generation claim.
