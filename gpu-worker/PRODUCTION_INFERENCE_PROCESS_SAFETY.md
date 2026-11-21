# Production GPU worker subprocess safety

This change applies the **already merged and offline-tested** bounded POSIX
process runner to the actual `gpu-worker/server.py` job execution path.
Previously, only the staging canary had that protection; a real queued job
still used `subprocess.run(...capture_output=True)`.

## Real protections added

- The approved inference executable now runs in a separate POSIX process
  session. Timeout, malformed output, excessive stdout or other failure
  terminates its process group before the job is marked failed.
- Stdout is read incrementally and capped at **16 KiB while running**,
  rather than buffering arbitrary output in memory. Stderr is discarded,
  preventing accidental capture of prompts or model paths.
- Worker stdin is bounded to 12 KiB and delivered via a private local
  temporary file to avoid pipe deadlock.
- The existing JSON-only `{outputReference}` contract remains unchanged;
  no CLI commands, executable paths or URLs come from a web user.
- Reject `version: true` as a malformed payload rather than accepting
  Python's Boolean `True == 1` equality.
- Offline regression tests execute controlled local Python files. These do
  **not** generate AI videos or connect to any paid service.

## Important limitations

This is **process-level protection**, not a cloud billing kill-switch.
Terminating the process group cannot guarantee that an already-rented GPU
VM/instance has stopped accruing charges. Always require external provider
caps and forced termination plus explicit owner approval before a paid test.

The worker remains Linux/POSIX-only, private-network-only, disabled until
operator configuration, without approved model weights, a verified production
GPU, moderation approval, or enabled customer subscriptions. Successful
CI tests cannot establish that a real Wan clip has been generated.

## Validate

```sh
python3 -m unittest discover -s gpu-worker/tests -p 'test_*.py' -v
```

The dedicated GitHub Action introduced earlier runs the entire Python suite.
Do not merge if the worker job tests or the repository CI fail.
