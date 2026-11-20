# Wan GPU inference function — concrete offline contract tests

This PR exercises the **real** `generate_with_wan()` implementation with
dependency-injected fake `torch`, `diffusers` and `diffusers.utils` modules.

Unlike test-only request builders or model API presence checks, this tests the
specific production inference function path and catches accidental changes in
the Diffusers calls, local-only loading, frame arguments, CPU offload, and
output export.

## Runtime change
- Require an actual CUDA device and BF16 capability **before** loading
  any Wan weights. This matches the previously merged runtime compatibility
  probe and avoids a predictable unsuccessful large-weight load.
- Wrap the pipeline invocation in `torch.inference_mode()` so PyTorch
  autograd tracking is disabled during inference.
- Preserve local-only model loading, existing frame limits, the private
  output path and existing model/no-spend approval gates.

## Offline tests (CI)
`gpu-worker/tests/test_wan21_pipeline_contract.py` checks:
1. Wan VAE and pipeline load from the provided local directory, with
   `local_files_only=True`; no online model download path.
2. The runner installs the VAE, enables CPU offload, enters/exits
   inference mode and passes prompt, negative prompt and frame count
   to the generation pipeline.
3. MP4 export uses the result frames and our configured FPS.
4. Absent CUDA stops without loading model components or writing media.
5. Unsupported GPU BF16 likewise fails before loading weights.

Synthetic frames and MP4-shaped bytes in these tests **are not
AI-generated videos** and are never presented to customers. The real GPU
pipeline has not been executed or benchmarked as part of this PR.

## Still necessary before a real run
- Independently review and pin the true model weights and dependencies.
- Provision compatible NVIDIA GPU hardware with enough VRAM.
- Confirm provider-enforced payment and termination limits.
- Run an owner-approved single video with the real staging canary.
- Confirm a decodable MP4, private delivery, owner authorization and central
  credits reconciliation before enabling production subscriptions.

No GPU is rented or started; no paid generation or deployments occur here.
