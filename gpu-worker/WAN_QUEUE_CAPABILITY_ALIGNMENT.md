# GPU worker queue admission matches installed Wan inference capabilities

This PR fixes a real mismatch between the Python GPU service and its approved
Wan2.1 text-to-video runner. Previously the HTTP worker admitted durations
of 1–60 seconds and aspect ratios 16:9, 9:16 and 1:1, while the local inference
implementation explicitly supports **1–5 seconds and only 16:9**. Unsupported
requests could enter the durable GPU queue and fail after a GPU worker claimed
them. In a billed environment this risks wasted capacity and confused users.

## Supported by the current local Wan runner

- `featureKey = ai.video.text_to_video` only
- `durationSeconds` must be a strict integer 1–5 (no bools/floats)
- `aspectRatio` must be 16:9 when specified, otherwise defaults to 16:9
- Prompt and optional negative prompt must pass existing length validation
- `version` remains strictly integer 1; extra fields are rejected
- Image-to-video, portrait/square formats, longer videos and audio remain
  **unsupported** and must not be queued for this model.

The job store validates requests before persistence, ensuring unsupported jobs
never enter `queued` state. The HTTP API returns an invalid-request response
for unsupported capability selections, with no new credits or charges applied
by the GPU worker. The existing Edge Function model selection and credit
reservation flow must separately apply matching feature availability gates.

## Verification

The new zero-GPU unit tests verify accepted durations, rejection of all
unsupported shapes without database inserts, and run accepted request shapes
through the **actual** `wan21_infer.parse_job` parser to catch contract drift.

```sh
python3 -m unittest discover -s gpu-worker/tests -p 'test_*.py' -v
```

CI still must pass. No weights downloaded, no GPU started, no inference
executed, no Supabase deployed and no customer subscription enabled.
