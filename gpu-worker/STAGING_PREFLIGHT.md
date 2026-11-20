# Wan GPU staging: zero-spend readiness and bounded process I/O

This milestone follows merged PR #282. **No paid GPU has been started and no
model has been installed or executed.** This is a source-only safety hardening
and readiness diagnostic. Its offline CI cannot prove CUDA compatibility.

## Zero-spend command

From repository root:

```sh
python3 gpu-worker/staging_preflight.py \
  --model-dir /absolute/reviewed/wan-model \
  --manifest /absolute/reviewed/wan-manifest.json \
  --private-dir /absolute/private/ai-video
```

This command uses Python metadata, checks whether tools are on PATH, validates
the **full local snapshot hash manifest**, and checks private storage
permissions. It does NOT import torch, rent hardware, call an AI provider,
download weights, run FFmpeg or touch production Supabase.

If you have independently checked that a provisioned NVIDIA CUDA GPU is
available, pass `--gpu-confirmed`. This is a **manual declaration** rather
than GPU hardware verification; the GPU canary's `nvidia-smi` and real
inference must still verify actual compatibility. Without this declaration
the readiness result is blocked. It only reports `ready_for_manual_review`
when all checks pass—never `safe to start billing`.

Preflight outputs a sanitized JSON `checks` object and exit status 0 for
manual-review-ready or 2 when blocked. It does not print private paths,
API keys, hash digests or customer prompts. No cloud-cost limit can be set
or enforced by this script.

## Process execution hardening

`gpu_canary_process.bounded_subprocess` no longer stores unlimited stdout
or stderr with `subprocess.communicate()`. It now:
- caps output before accumulating more than the configured byte bound;
- reads stdout with a POSIX selector while the process executes;
- discards stderr, which may contain confidential model/cache paths;
- feeds bounded stdin from a private temporary file to avoid bidirectional
  pipe deadlocks;
- starts each invocation in a private POSIX session and kills the entire
  process group on timeout, excessive output or other failure;
- returns only validated UTF-8 stdout on a zero exit status.

The real one-shot staging canary no longer temporarily overwrites the entire
Python process environment to check the model and media paths. Paths are
checked directly and passed explicitly to its inference subprocess.

## Remaining prepayment controls

**A child-process timeout is NOT GPU rental shutdown.** Before launching any
chargeable GPU, the owner must choose a provider with acceptable prepaid
minimum and enforce an external spending cap, automatic instance termination,
storage budget and idle-time protections. Paid testing remains disabled.

Run zero-cost local regression checks:

```sh
python3 -m unittest discover -s gpu-worker/tests -p 'test_*.py' -v
```

A successful preflight does not attest real model weights or GPU performance
unless the supplied manifest was independently reviewed and the operator
verified the exact upstream immutable revision. It is not permission to
turn on payments or production video generation.
