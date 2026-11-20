# AI Video: offline worker-to-output acceptance

This milestone provides the first automated **whole-worker lifecycle** check
against real localhost HTTP and the real Python subprocess runner:
POST submission -> durable queued job -> worker claim -> executable invocation
-> persisted output reference -> successful status GET -> authenticated
private MP4 GET -> idempotent request replay.

**The test executable generates a minimal MP4-shaped fixture, not AI frames.**
It does not prove that the Wan model loads or that output playback is valid.
No paid GPU provider, model weights, live Supabase instance, payments or
subscription credits are accessed. The existing Python CI workflow picks up
the test automatically.

## Additional fail-closed checks
- Reject a symbolic link supplied as the model snapshot root or the private
  output directory (including a link to an otherwise valid destination).
- Reject the boolean `true` as a request version, rather than letting Python's
  `True == 1` equality silently accept it.

## Before enabling real GPU inference
1. Pin a commercially permitted model snapshot and Python/CUDA dependencies.
2. Build a reviewed inference image with a **real** MP4 parser/decoder validation
   (a magic-header check alone does not prove media integrity).
3. Confirm staging cost cap and auto-stop/no-idle GPU policy with the operator.
4. Run a real text prompt through model rendering; verify frames, duration,
   output size, decoding, private storage access and task/owner binding.
5. Prove end-to-end Supabase RLS, approved moderation, credit settlement,
   idempotent retries and refunds in an isolated staging environment.
6. Keep billing and production video feature activation disabled until sign-off.

Run the zero-cost tests locally:

```sh
python3 -m unittest discover -s gpu-worker/tests -p 'test_*.py' -v
```
