# Real GPU canary — full-frame validation and process termination

This PR improves the manual staging canary added by PR #281, which is
confirmed merged. **No GPU has been rented or started.** No model weights,
production API keys, external billing integration or customer charges are added.

## What changes
- The canary invokes the approved local inference executable using a **new
  process group**. If the approved runtime limit expires, it issues SIGKILL to
  the entire process group, not just the immediate Python process. This helps
  prevent orphaned GPU workloads continuing to run. This behavior requires
  POSIX/Linux; non-POSIX platforms fail closed.
- After the video runner returns, `ffprobe -count_frames` verifies that the
  selected video stream has a positive number of decoded frames and bounded
  dimensions, and `ffmpeg -xerror` attempts to **decode the entire video** to
  a null output. It will not accept merely an MP4-looking header or a stream
  declaration with zero frames.
- The one-run canary's JSON evidence gains `decodedFrames` alongside width,
  height, bytes, model revision and elapsed GPU processing time.
- A dedicated zero-cost Python regression suite validates process timeouts,
  frame counts, invalid stream metadata, FFmpeg decode failures and output
  limits. It uses local subprocesses plus explicitly simulated probe responses;
  **it does not simulate AI video as real production output**.

## Limits requiring operator attention
This code only terminates the processes it starts. It does **not** shut down a
rented cloud GPU instance or stop a provider's billing clock. The operator
must still configure a provider-enforced spending limit, GPU auto-stop and an
independent watchdog. The canary still needs a manually reviewed and
cryptographically pinned model snapshot, a compatible CUDA environment,
private storage and explicit owner approval.

The Python CI workflow runs the offline regression tests. Any real-GPU
acceptance must happen only after provider-level costs and expiry are bounded.
Before production, confirm actual generated playback, moderation, owner-bound
private Supabase delivery, credits/refunds and retry behavior. Nothing here
enables paid subscriptions or live video generation.

Run free tests:

```sh
python3 -m unittest discover -s gpu-worker/tests -p 'test_*.py' -v
```
