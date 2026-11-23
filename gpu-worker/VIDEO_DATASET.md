# Prepare footage for an Eternyx video experiment

Use Python 3.11+ and ffprobe (from FFmpeg) on your own computer. Keep the clip directory, permissions records, CSV and generated manifest outside the repository. This command reads local MP4 files and writes metadata. It does not upload footage, start training, or provision a GPU.

1. Film two **different scenes** you own, or select clips whose license permits the intended training and evaluation use. Keep the original permission or license record. Capture a description of the visible subject, action and camera movement.
2. Put every take, crop and edit from one scene in the same split. Reserve a different scene for evaluation. To evaluate unfamiliar people or settings, reserve those subjects and locations too. The checker detects identical file contents and shared scene labels. Review related clips and the actual permissions yourself.
3. Create a UTF-8 CSV with the following headers. Replace the examples with descriptions and references for your own clips.

```csv
file,scene,split,caption,rights,rights_ref,quality_check
workshop-wide.mp4,workshop-dawn,train,A mechanic opens the door in a static wide shot,original,shoot-log-01,Does the door swing outward?
courtyard-pan.mp4,courtyard-evening,eval,Camera pans left as a bicycle crosses the courtyard,original,shoot-log-02,Does the bicycle keep its shape during the pan?
```

4. Run `python gpu-worker/prepare_video_dataset.py /path/to/clips annotations.csv dataset-v1.json`. Choose a new output filename for each reviewed version. A successful manifest includes the split, caption, rights reference, evaluation question, SHA-256, frame dimensions and duration of each clip.
5. Review clips with a video player for motion, blur, personal information and caption accuracy. ffprobe checks stream metadata. For a later experiment, train only on entries marked `train`. Keep the `eval` clips and their questions for a blind comparison. Two clips exercise the workflow; they are not a sufficient training set.

## Choose the action in each clip

Add an optional `start_frame` column to the annotation CSV. Count from zero on the resampled 16 fps timeline. For example, `32` selects the 17 frames from 2.00 through 3.00 seconds. A blank or omitted value selects the opening window. Select a point with 17 real frames remaining and caption the selected action. The contact sheet displays timestamps relative to the clip. Encoded windows and evaluation cases carry the selected offset.

## Compare possible windows for one clip

```sh
python gpu-worker/compare_footage_windows.py ./clips dataset-v1.json workshop-wide.mp4 options.html --starts 0 8 32
```

To explore without choosing frame numbers, replace `--starts 0 8 32` with `--samples 5`. The tool spaces candidates across the probed duration, includes the current selection and removes duplicate offsets. Actual decoding determines completeness. Open the ranked links to inspect the largest pixel changes, or download the CSV for all candidates. Camera shake and cuts can also produce large changes. Use the caption and previews to select the action.

Add `--playback` to embed a silent MP4 of each complete window. Use the player's controls to play, pause or scrub. Video playback time starts at zero within the window. The peak-change timestamp and frame-by-frame measurements use the clip timeline. The separate frame-change CSV includes every adjacent pair and its source frame numbers. Pixel measurements use the original decoded RGB frames before preview compression.

Open the local HTML to compare timestamps, frames and adjacent-frame pixel changes. An incomplete candidate is marked individually. Save the manifest for the window that matches your caption, then use that file for encoding, training and evaluation. The exported copy changes only the selected clip's start frame. The HTML contains footage previews and downloadable copies of the dataset annotations.

## Combine window choices from several clips

Supply the same manifest used by the picker, a new output directory and one `--pick FILE START_FRAME` per selected clip.

```sh
python gpu-worker/select_footage_windows.py ./clips dataset-v1.json selected-windows --pick workshop-wide.mp4 8 --pick courtyard-pan.mp4 0
```

Open `selected-windows/footage-review.html` to review the resulting training and evaluation windows together. Use `selected-windows/dataset.json` in the encoder. The receipt in `selections.json` records previous and selected offsets and both manifest hashes. All windows are decoded and checked before the completed directory is published.

## Inspect the selected windows before encoding

```sh
python gpu-worker/review_training_footage.py ./clips dataset-v1.json footage-review.html
```

Open the HTML locally to see the first, middle and last decoded frames, captions, review questions and permission references for each split. The identical-frame count compares every adjacent RGB pair in the selected window. A static shot can legitimately have repeated frames. The file embeds source thumbnails and permission references, so keep it with the local footage. The CPU command uses FFmpeg, NumPy and Pillow.

## Estimate a pilot's training time

Once a trainer is available, time several full optimizer updates after warm-up on the intended hardware, including data loading and all gradient-accumulation microsteps. Keep the clip length, resolution, batch size and training settings representative. Inference render timings measure a different workload.

Run this calculator locally. The following numbers are illustrative:

```sh
python gpu-worker/estimate_training_time.py --steps 500 --step-seconds 18 20 22 --overhead-minutes 30
```

The example projects 3.28 hours from the mean step time plus overhead. The fastest and slowest samples give two scenarios, not a confidence interval. Supply total expected overhead across loading, checkpointing and evaluation. The calculator does not start training or reserve compute. Model quality must be evaluated separately.

## Prepare the first training window

Use a reviewed local manifest, Python 3.11+, NumPy and FFmpeg. For example:

```sh
python gpu-worker/prepare_training_frames.py ./clips dataset-v1.json workshop-wide.mp4 workshop-window.npz
```

This CPU step takes 17 frames from the selected offset (zero by default) at 16 fps after resampling, fits the picture inside 384 × 224 with black padding, and stores RGB bytes in time × height × width × channels order. Short clips fail instead of receiving invented frames. The archive includes the original caption, scene, frame rate and source digest. Open it with `numpy.load(path, allow_pickle=False)`. Keep clips unchanged while preparing windows, and check that the caption describes the opening window. VAE encoding and caption embedding are still required before these frames can enter the Wan adapter training step.

## Run a local training pilot

Use a reviewed local Wan snapshot and a new output directory. The step count is illustrative.

```sh
python gpu-worker/run_video_pilot.py ./wan-snapshot ./clips selected-windows/dataset.json ./pilot-01 --steps 10 --seeds 7 17
```

The command copies the exact manifest, encodes the training split, trains an indexed adapter, scores the held-out clips and writes `review.html`. Each stage runs in its own offline CPU process so its models are released before the next stage. The full-size snapshot still needs sufficient RAM and CPU time. A completed run writes `pilot.json` with the checkpoint path, dataset and adapter digests, evaluation seeds and case count. If a stage fails, its error is reported and intermediate files remain available for inspection. Use a fresh directory when rerunning the complete command.

## Prepare and train from a whole manifest

With a reviewed manifest and a local Wan snapshot, run these commands in Bash on a CPU machine with FFmpeg and the training dependencies. Choose a new output directory for the encoded dataset.

```sh
python gpu-worker/encode_training_manifest.py ./wan-snapshot ./clips dataset-v1.json ./encoded-v1
python gpu-worker/train_video_adapter.py ./wan-snapshot ./training --dataset-index ./encoded-v1/index.json --manifest dataset-v1.json --steps 100
```

The encoder loads the models once, checks each training clip against the manifest and saves its selected window. The numbered filenames follow source-path order. The trainer checks the manifest digest, ordered training sources, window annotations and encoded file digests before updating weights, including on resume. Use an immutable local dataset during training. Evaluation clips stay in the held-out split. The step count above is illustrative.

## Score an adapter on reviewed footage

Run the evaluator on a CPU machine with FFmpeg, the training dependencies, the local Wan snapshot and the trained adapter bundle. The full snapshot and encoders must fit in RAM. The evaluation rows should describe footage held out from adapter training. Use the same reviewed manifest that defined the training split.

```sh
python gpu-worker/evaluate_video_adapter.py ./wan-snapshot ./training/step-100 ./clips dataset-v1.json evaluation.json --seeds 1701 1702 1703
```

The evaluator encodes the selected window and caption of each evaluation clip. Each paired measurement uses identical noise with the adapter disabled and enabled. The JSON records the clip, manifest and adapter hashes, the seed and the scores at three noise levels. A negative mean delta means lower flow prediction error on that clip and seed. Judge visible motion and prompt fidelity separately using rendered clips.

Indexed training checkpoints record the reviewed manifest SHA-256, encoded index SHA-256, number of training windows and completed step. Evaluation copies these fields into the report and requires the original manifest bytes for indexed checkpoints. Keep that manifest alongside the dataset. Older bundles and runs trained from explicit window lists can still be evaluated. Their reports use null for any unavailable training provenance.

## Estimate a longer run from a local pilot

Run at least three steps on representative hardware and data. The pilot receipt records elapsed wall time, durations for encoding, training, evaluation and review, and each optimizer update including window loading. The training-stage duration includes setup and checkpoint writes.

```sh
python gpu-worker/estimate_training_time.py --pilot ./pilot-01/pilot.json --steps 1000
```

The projection drops the first update as warm-up and uses the remaining samples to report mean-based, fastest and slowest time estimates. By default these cover optimizer updates only. Supply `--overhead-minutes` to include anticipated startup, checkpoint and evaluation time. A miniature CI run verifies the calculation. Benchmark the full-size model separately.

## Export the evaluated adapter for inference

```sh
python gpu-worker/export_video_adapter.py ./pilot-01 ./inference-adapter
```

The exporter checks the copied weights against the checkpoint metadata, completion receipt and evaluation report. It also compares the training step and dataset provenance before publishing the two inference files in a new directory. Keep the pilot directory for future training or inspection. Set `ETERNYX_WAN_ADAPTER_DIR` to the absolute export directory on a renderer with the matching local Wan snapshot. Exporting runs locally and does not start a render.

## Compare benchmark plans within a time budget

```sh
python gpu-worker/estimate_training_time.py --pilot ./pilot-01/pilot.json --steps 100 --also-steps 250 500 --warmup-steps 1 --budget-minutes 60 --overhead-minutes 10
```

Each scenario uses the retained samples and the same overhead. The time-budget section rounds down the updates that fit at the measured mean and slowest rates. Leave at least two samples after warm-up. New pilot receipts identify the CPU architecture, Python version, configured OpenMP thread setting and transformer file hashes. Older receipts can still produce estimates with unavailable benchmark context shown as null. These projections assume comparable hardware, data and settings.


## CPU-only benchmark planning after the miniature pilot

The local pipeline can measure **real CPU optimizer updates** using an offline, self-hosted snapshot. It does not call an AI API or start a paid GPU. The tiny synthetic CI model is a correctness fixture, **not** a performance estimate for a production-size Wan model. Repeat the pilot on the actual intended local CPU and data before planning longer experiments.

For a complete run with an optional 15-minute budget and extra step targets:

```sh
python gpu-worker/estimate_training_time.py \
  --pilot ./pilot-01/pilot.json --steps 100 \
  --also-steps 250 500 --warmup-steps 1 \
  --auto-overhead --overhead-minutes 2 --budget-minutes 15 \
  --output ./cpu-plan-v1.json
```

The five new safeguards and planning outputs are:

1. **Verified pilot input:** A version-1 receipt, valid positive optimizer timings, matching training-step count when present, and CPU provenance when present. Older receipts without benchmark context remain readable. The plan includes the SHA-256 of the receipt bytes for later comparison.
2. **Measured end-to-end overhead:** With `--auto-overhead`, the calculator adds the difference between the pilot wall time and all measured optimizer updates, **plus excluded warm-up updates once**, to any extra `--overhead-minutes` supplied. This covers local encoding, setup, checkpointing and evaluation seen in the pilot; real overhead may change with data and model size. Without the flag, prior default projections remain optimizer-step-only.
3. **Timing variability:** Reports nearest-rank observed p90, a p90 duration projection and coefficient of variation. With only two or three samples, p90 will often equal the slowest sample. These are descriptive observations, **not** confidence intervals, predictive guarantees or a measure of model quality.
4. **Time-budget decisions:** Budget capacity includes p90 updates alongside mean and worst observed update times. Each compared target shows booleans for fitting at those rates, using full-precision durations rather than rounded displayed hours. The budget includes fixed overhead.
5. **Local audit plan:** `--output` writes exactly the JSON printed to stdout to a **new** file. An existing path will never be overwritten. Keep this plan with your private `pilot.json` and source manifest; do not commit private footage or proprietary model assets.

This is a CPU benchmark and planning tool, not a job scheduler or a model-training progress promise. If the full-size snapshot is too large for available RAM, the actual run is not feasible regardless of its estimated time.


## Compare multiple completed CPU video adapter experiments

After training separate adapters on **the same reviewed manifest**, evaluate each checkpoint using the **same held-out clips and noise seeds** with `evaluate_video_adapter.py`. Select one reference adapter and compare candidate adapter evaluation receipts without loading a model, renting a GPU, or calling an external AI service.

```sh
python gpu-worker/compare_video_evaluations.py \
  --reference ./pilot-reference/evaluation.json \
  --candidate short=./pilot-short/evaluation.json \
  --candidate long=./pilot-long/evaluation.json \
  --output ./comparison-01 \
  --max-mean-regression 0 \
  --max-pair-regression 0.05 \
  --max-scene-regression 0.02 \
  --fail-on-regression
```

The tool implements five practical capabilities:

1. **Strict comparable provenance:** It checks versioned evaluation JSON, file digests, training-manifest and indexed dataset identities, identical held-out source/seed sets, window offsets, noise levels and near-equal baseline-model errors. If any differ, comparison fails rather than reporting a misleading winner. Inputs are regular local JSON files under 4 MiB each.
2. **Paired adapter measurements:** For each held-out clip, seed and noise level, the CSV records candidate adapter error minus reference adapter error. Negative changes favor the candidate on this metric; the JSON includes source receipt hashes, adapter hashes and training steps.
3. **Deterministic multi-candidate ranking:** Up to 12 uniquely named candidate reports are sorted by mean paired MSE change, with a stable name tie-break. All candidates are checked against the same reference.
4. **Configurable regression gates:** The mean change, worst individual clip/seed mean change and worst scene-average change are each compared against a nonnegative threshold. `--fail-on-regression` returns exit code 2 for gate failures **after saving** the evidence.
5. **Private, create-only evidence:** A new output directory contains `summary.json`, `pairs.csv` and an escaped, offline `review.html`. Existing directories are never replaced. Keep raw JSON evaluation reports and rendered video inspections alongside the results outside the repository.

**Interpretation:** Lower held-out flow-prediction MSE does not establish realistic movement, recognizable images, prompt adherence or high-quality output. The tool compares *already evaluated* adapters only, never trains them. All models and footage remain local; no subscription or paid compute is activated. If you changed the dataset, baseline model, evaluation cases or noise levels, run a separate experiment series rather than forcing a comparison.


## Inspect actual rendered MP4 frames without a GPU

The previous steps benchmark **optimizer timings and held-out flow-prediction errors**. Neither number demonstrates that the output video looks good. For locally saved short MP4 outputs, use this separate offline CPU auditor to inspect the decoded images directly:

```sh
python gpu-worker/audit_video_render.py \
  --reference ./tiny-render-before.mp4 \
  --candidate ./tiny-render-after.mp4 \
  --output ./video-frame-audit-01 \
  --max-dark-frames 1 --max-identical-transitions 2 \
  --fail-on-flags
```

Omit `--candidate` to inspect one MP4. The CLI uses **local FFprobe and FFmpeg only**; it does not generate or train video, contact an AI API, rent compute, or need PyTorch. Keep input videos and the output folder outside the repository.

Five improvements in this milestone:

1. **Bounded real MP4 decoding:** Checks that the input is a local regular MP4 (not a symlink), at most 32 MiB, with one video stream, fixed frame rate from 1 to 60 fps, no more than 64 decoded frames and no more than 512 × 512 pixels. FFmpeg decodes actual frames into CPU RGB data; an empty or mismatched decode fails.
2. **Frame-level diagnostics:** Calculates mean RGB intensity, proportion of near-black pixels, dark-frame count, exact repeats, near-static transitions, and mean RGB difference between consecutive frames. This flags potentially frozen or dark renders without pretending all low-motion/low-light videos are bad.
3. **Paired render comparison:** Requires identical width, height, frame rate and frame count, then measures exact matching frames and per-frame absolute RGB differences. Larger differences do **not** indicate a better video.
4. **Private visual review:** Embeds actual first, middle and last decoded frames as PNG thumbnails in a portable local HTML report. Exports all per-frame metrics as CSV and a JSON summary with source file SHA-256 hashes.
5. **Optional reproducible checks:** Choose upper limits for dark frames or identical transitions. With `--fail-on-flags`, the CLI saves the audit **before** exiting with status 2 if a limit is exceeded. Existing output directories are never overwritten.

The dedicated `CPU video frame audit` GitHub workflow exercises these paths using real FFmpeg-generated test MP4s with motion, static scenes and mismatched frame counts. These fixtures validate decoding and diagnostics; **they are not evidence of a trained high-quality video generator**. Subject realism, motion coherence, caption alignment and overall quality still require separately reviewed rendered clips. Input video thumbnails may contain sensitive imagery, so keep the generated local reports private.


## Assemble a real CPU-only short video from reviewed clips

You can now **create a playable MP4**, without a GPU, from clips you own or have the right to use. This is a local timeline renderer, not a trained text-to-video generator. Use Python 3.11+, FFmpeg/FFprobe with libx264, and the `gpu-worker/assemble_video_storyboard.py` CLI.

Create a private `storyboard.json` with exact source-file SHA-256 values (from `sha256sum clips/name.mp4` on Linux, or your preferred SHA-256 utility):

```json
{
  "version": 1,
  "shots": [
    {
      "file": "motion.mp4",
      "source_sha256": "REPLACE_WITH_THE_ACTUAL_64_CHARACTER_LOWERCASE_SHA256",
      "start_frame": 4,
      "frames": 8,
      "caption": "A moving subject enters the frame",
      "rights_ref": "original-footage-log-001"
    },
    {
      "file": "ending.mp4",
      "source_sha256": "REPLACE_WITH_THE_ACTUAL_64_CHARACTER_LOWERCASE_SHA256",
      "start_frame": 0,
      "frames": 8,
      "caption": "The scene fades into darkness",
      "rights_ref": "original-footage-log-002"
    }
  ]
}
```

Replace the example digests before use. Source MP4s must have **fixed 16 FPS**, be no larger than 512 × 512 pixels or 32 MiB each, and have no more than 64 decoded frames. Choose 1–8 shots totaling no more than 64 frames (4 seconds); this intentionally stays within the existing short CPU audit boundary.

```sh
python gpu-worker/assemble_video_storyboard.py \
  --storyboard ./storyboard.json --clips ./clips \
  --output ./assembled-01 --width 128 --height 72
```

Six real capabilities in one milestone:

1. **Reviewed shot manifests:** Every cut carries a relative local MP4 path, source SHA-256, starting frame, length, human caption and rights reference. Invalid paths, symlinks, corrupted checksums, unsafe text, oversized manifests and unsupported frame rates fail closed.
2. **Real frame-accurate assembly:** FFmpeg decodes the selected source intervals, letterboxes them to a common even output size, concatenates the timeline and encodes a new H.264 MP4 at 16 FPS. It does not reuse or label test footage as AI-generated footage.
3. **Subtitles as an editable sidecar:** The tool exports `captions.srt`, with captions placed on exact shot boundaries. The subtitles are deliberately **not burned into the MP4** and can be edited or switched off in compatible players.
4. **Verified private output:** The compiler decodes the assembled MP4 again, confirms pixel dimensions, frame rate and total frame count, then records the rendered MP4 SHA-256 and all original source hashes in `manifest.json`. Original footage is never changed.
5. **Actual visual review:** Local `preview.html` embeds an image taken from the rendered middle frame of each shot, alongside timeline frame positions, captions and rights references. Escaped HTML prevents captions from being interpreted as markup.
6. **Create-only delivery and tests:** Outputs are packaged in a new directory with `video.mp4`, `captions.srt`, `manifest.json` and `preview.html`. Existing output directories are never intentionally overwritten. Dedicated CPU-only CI tests encode real sample videos with FFmpeg and verify cuts, rights/digests, the render, preview and failure behavior.

**Scope:** The 4-second limit is intentional for short local experiments. This milestone does not synthesize new imagery, run a model, introduce audio, use external APIs or provision GPUs. Source clips may contain sensitive information: retain the outputs locally and review actual source rights independently.



## CPU-only video editing v2: 30-second timelines, fades, aspect profiles and licensed soundtrack

The earlier `assemble_video_storyboard.py` is intentionally capped at four seconds because it uses the miniature `audit_video_render.py` frame-buffer validator. The new `render_video_timeline.py` is a **separate v2 workflow** for longer, practical short-form editing. It uses FFprobe's counted decoded frames and FFmpeg streaming rather than loading the entire source or finished 30-second RGB timeline into Python memory. Both editors remain available.

Create `storyboard-v2.json` locally; replace each illustrative digest below with the actual SHA-256 of the original file. Every media file should remain outside the Git repository.

```json
{
  "version": 2,
  "shots": [
    {
      "file": "intro.mp4",
      "source_sha256": "REPLACE_WITH_ACTUAL_64_CHARACTER_LOWERCASE_SHA256",
      "start_frame": 16,
      "frames": 64,
      "caption": "An introduction filmed outdoors",
      "rights_ref": "original-footage-log-001",
      "fade_in_frames": 8,
      "fade_out_frames": 0
    },
    {
      "file": "detail.mp4",
      "source_sha256": "REPLACE_WITH_ACTUAL_64_CHARACTER_LOWERCASE_SHA256",
      "start_frame": 0,
      "frames": 96,
      "caption": "Close-up of the work",
      "rights_ref": "original-footage-log-002",
      "fade_in_frames": 0,
      "fade_out_frames": 8
    }
  ],
  "soundtrack": {
    "file": "approved-audio.wav",
    "source_sha256": "REPLACE_WITH_ACTUAL_64_CHARACTER_LOWERCASE_SHA256",
    "rights_ref": "audio-use-permission-001",
    "volume_percent": 35
  }
}
```

To create a real 10-second video with external subtitles and a looping approved audio track:

```sh
python gpu-worker/render_video_timeline.py \
  --storyboard ./storyboard-v2.json --media ./my-footage \
  --output ./timeline-v2-01 --profile portrait --quality standard
```

This milestone delivers **six functional improvements in one PR**:

1. **Longer streaming CPU timelines:** Cuts one to eight locally reviewed MP4 shots into a playable H.264 MP4 up to 480 frames, or 30 seconds at 16 FPS. Each source can contain up to 960 frames (60 seconds), be no larger than 512 × 512 pixels and 64 MiB, and must be fixed-rate 16 FPS. All actual decoded frame counts are checked before selecting cuts.
2. **Optional shot fades:** Set `fade_in_frames` and `fade_out_frames` to 0–16 frames within each shot. These fade **to/from black**, not cross-dissolves or generated animation. Hard cuts otherwise preserve exact shot boundaries.
3. **Licensed background audio:** Add an optional WAV, MP3 or M4A soundtrack with its own SHA-256, rights reference and bounded 0–100% volume. FFmpeg loops short soundtracks to cover the timeline, trims the output and encodes the result as AAC. Source-video audio is discarded. The rights reference is an operator assertion, not a legal license verification.
4. **Platform-sized exports:** `--profile landscape|portrait|square` selects 16:9, 9:16 or 1:1. `--quality standard|high` outputs 256px base profiles or up to 512px high profiles. Scaling preserves the original scene aspect ratio using padding rather than stretching.
5. **Real rendered preview and subtitles:** A single bounded FFmpeg pass selects one actual output frame per shot for offline PNG-based `preview.html`. Human-authored captions become precisely timed, editable `captions.srt`, not baked into the video.
6. **Private, verified output:** Before publishing, the tool recounts real decoded output frames and verifies dimensions, 16 FPS, expected audio presence and output SHA-256. The create-only directory contains `video.mp4`, `captions.srt`, `manifest.json` and `preview.html`, without exposing source absolute paths.

**Constraints and costs:** This is a genuine CPU-based local video **editor**, not generative AI training, text-to-video synthesis, or a promise of production image quality. No paid GPU, external AI API, cloud hosting, GPU scheduling or subscription enforcement is required. Keep private source media and review pages outside the repo. A dedicated CPU integration CI suite creates and validates real MP4 and WAV fixtures; synthetic FFmpeg test patterns prove editing correctness, not AI-generated video quality.



## Prepare a v2 local CPU video project from the ETERNYX website

The **AI Video Studio** page now includes a **Local CPU video editor handoff** section above the older text-only storyboard planner. This is a real browser-based project preparer for the offline `render_video_timeline.py` program:

1. Choose up to eight original local MP4 files. The browser reads each file and calculates a SHA-256 locally; it does **not** upload footage or make AI API calls. The original clip player previews only the source footage, not an assembled result.
2. Pick a source for each shot, set its starting frame and number of frames, optional fade-in/out frame counts, human-authored caption and rights/permission reference. Add, remove or reorder up to eight cuts. Timings are exactly 16 FPS; a full v2 project may contain up to 480 frames (30 seconds).
3. Optionally choose a WAV, MP3 or M4A soundtrack, enter its rights reference and set a 0–100% volume. Its SHA-256 is included in the manifest. Source clip audio is not copied by the CLI.
4. Choose landscape/portrait/square output and standard/high resolution. The app builds the exact v2 JSON schema expected by the Python renderer, with a local SRT subtitle preview.
5. Download **eternyx-video-v2.json**, and put all the **unchanged original media files** together in a `local-video-media` folder in a local checkout of the repository. Run the displayed Python command, using locally installed FFmpeg/FFprobe and libx264. The rendered `eternyx-video-output/video.mp4` exists only **after the local command succeeds**; the website does not claim to render MP4 files or run Python in the browser.
6. Keep a local backup of the downloaded JSON. The browser editor deliberately keeps selected File objects and object URLs in temporary memory, not in localStorage, Supabase or cloud storage. Reloading clears the media selection. The Python renderer independently validates 16 FPS, real frame counts, hashes, dimensions and codecs; the website cannot assert those properties just by reading a browser File object.

This is a free/offline pathway for owners of suitable local equipment. It is **not** text-to-video synthesis or a remotely connected GPU worker. No paid GPU, AI API or subscription is activated.



## Verify and review an actual completed CPU-rendered MP4 in AI Video Studio

The Studio local CPU editor now has a **rendered-output verification and review** workspace alongside its project exporter. After successfully running `render_video_timeline.py` with your own footage, open **AI Video Studio**, then use **Inspect your actual rendered MP4**.

1. Select the generated `eternyx-video-output/video.mp4` and `eternyx-video-output/manifest.json`. Optionally select `captions.srt` from the same output directory. The MP4 is hashed entirely **inside the browser**, not uploaded. Hard limits: MP4 ≤64 MiB, receipt ≤64 KiB, optional SRT ≤32 KiB.
2. Click **Verify and preview render**. The app verifies SHA-256 and exact file byte count against the Python renderer's self-reported receipt. It also validates the receipt's v2 format, frame count, duration, 16 FPS claim, size preset, shot index ordering, source digests, recorded rights, cuts, fades and soundtrack identity.
3. If the original Studio project is still prepared, the verifier independently SHA-256 hashes the exact exported JSON bytes and compares the renderer's storyboard hash, shot definitions, optional soundtrack and selected profile/quality to the on-screen project. If the project has been cleared, the verifier performs **receipt/file integrity only** and states that it did not match the current Studio project.
4. If an unedited `captions.srt` sidecar is selected, the verifier compares its text/timecodes to the expected 16-FPS shot captions. Manually edited subtitles can intentionally differ; reverify without that optional sidecar to review the video independently.
5. Play the **actual imported rendered MP4** in a browser video player. If an original source is still selected, compare it with the result in a separate independent player. Browser-reported width, height and duration provide another advisory check but are not full codec/frame-count verification.
6. Select a **human** outcome (approved for local use, needs revision, undecided), enter observations, and download `eternyx-local-video-human-review.json`. It records the exact rendered MP4 hash, project hash, whether the current project matched, review timestamp, and human notes; it does **not** invent motion realism, aesthetic or prompt-fidelity scores.

**Important boundaries:** An MP4 and manifest with matching SHA-256 values show only **local file/receipt consistency**; hashes alone are not a trusted digital signature and a forged matching pair is possible. Independently assess footage licensing, audio, timing and visual quality. All original and rendered files remain on your device unless you deliberately share them. No paid GPU, external AI API, model download, hosted rendering or subscription feature is enabled.



## CPU-only smartphone video preparation: MOV, M4V and MP4 to 16 FPS

Previously, the v2 CPU video editor required input clips to already be fixed-rate **16 FPS**. The new `gpu-worker/prepare_video_sources.py` accepts existing phone or camera clips as local inputs and produces compatible H.264 16 FPS MP4 files, without a GPU or cloud video processing.

On the AI Video Studio page, expand **Import ordinary phone footage (24/30/60 FPS)** for the local command, bounds, and report-verification controls. With FFmpeg/FFprobe with libx264 installed on your own computer:

```sh
# Create ./phone-clips containing 1–8 original MP4, MOV, or M4V files
python gpu-worker/prepare_video_sources.py \
  --input ./phone-clips --output ./local-video-media \
  --start-seconds 0 --seconds 30
```

Optional `--clip "my-file.mov"` can be repeated to choose specific filenames if a folder contains more videos. The converter never rewrites originals; it first processes files in a private temporary directory and atomically publishes a **new**, create-only output folder with `clip-01.mp4`, `clip-02.mp4` and `preparation-report.json`. The report includes original/output SHA-256, source frame rate and duration, normalized dimensions, actual decoded frame count and output byte size.

Six practical improvements:

1. **Ordinary footage compatibility.** Accept MP4, MOV and M4V files, including 24 FPS, 30 FPS and other rates up to 120 FPS. FFmpeg converts their timing to **fixed 16 FPS**. Container auto-rotation handles typical phone orientation metadata; the local output is constrained to even H.264 dimensions, max 512 by 512 pixels, and keeps the original display proportions.
2. **Bounded local trimming.** Set an integer start offset from 0–299 seconds and per-file duration limit from 1–60 seconds. Source clips must be up to 300 seconds, 1920×1080 pixels and 64 MiB each. Generated clips contain up to 960 frames (60 seconds), compatible with the existing v2 editor.
3. **Explicit audio removal.** Original video audio, subtitles, attachments and metadata are not copied into the prepared clip. Add a separately rights-reviewed soundtrack through the existing AI Video Studio audio selector.
4. **Verified output and provenance.** Every prepared MP4 is probed and its frames actually counted; output resolution, 16 FPS and bounded frame count are verified. Source and output SHA-256 values are included in a small, local preparation report.
5. **Private Studio handoff.** Select generated `clip-XX.mp4` in Studio. Optionally open `preparation-report.json` to compare the report’s sizes and SHA-256 values to the actual bytes the browser has hashed. This is **local self-reported consistency**, not trusted digital-signature verification.
6. **Real integration tests.** Dedicated CI exercises actual 24/30 FPS sample videos, source audio removal, portrait output, trimming, output overwrite protections, malformed inputs, path/symlink refusal, CLI and the full route **phone file → 16 FPS MP4 → v2 CPU editor → playable final video**. Browser tests validate commands and report matching.

**Boundary:** This is a video transcoder and editor input preparer. It does **not** create new AI images/videos, learn a generative model, enable external inference APIs, spend paid GPU credits, upload private media, or activate subscriptions. This tool processes camera footage you already have rights to use.



## Create original CPU motion videos without external footage or paid AI services

The **AI Video Studio** page now includes **Create original motion clips on CPU**, a real procedural animation builder. This is distinct from training or running a generative text-to-video model: the visual motion is drawn by deterministic mathematical patterns, not learned weights. Its value is real locally-created b-roll, original animated backgrounds, simple moving intros and video transitions that can be used immediately in a short-form video project.

Choose from six motion styles (**aurora, orbit, ripple, particles, scanlines, sunrise**) and five color palettes (**ocean, sunset, forest, violet, mono**). Enter a reproducibility seed, a caption for editable subtitles, 1–8 seconds per scene, and the desired landscape/portrait/square frame shape. **Standard** permits 1–8 scenes totaling at most 30 seconds; **high** limits total time to 10 seconds to keep CPU work bounded. All use 16 FPS, and even H.264 dimensions from the existing supported renderer profiles.

From the Studio, download `eternyx-motion-scenes.json` into your local copy of ETERNYX, then run:

```sh
python gpu-worker/generate_motion_clips.py \
  --scenes ./eternyx-motion-scenes.json \
  --output ./eternyx-motion-output
```

The output directory is **create-only** and contains:

- `clip-01.mp4`, `clip-02.mp4`, etc. — genuine CPU-generated original animated RGB motion encoded to H.264
- `eternyx-video-v2.json` — a real v2 offline renderer storyboard containing each source's SHA-256, shot boundaries and human captions
- `generation-report.json` — SHA-256 of input configuration, clips, v2 board and finished MP4; styles, color palettes, seeds, dimensions and the explicit procedural origin
- `render/video.mp4` — the **finished playable video** assembled automatically using the same `render_video_timeline.py` renderer already used by our editor
- `render/manifest.json`, `render/captions.srt` and `render/preview.html` — output SHA-256, verified decoded frames, editable caption sidecar and actual rendered shot thumbnails

Use **Inspect your actual rendered MP4** in the Studio to open `render/video.mp4` and its `render/manifest.json` for local integrity inspection and human review. Without a matching existing editor project in memory, the Studio explicitly labels its inspection as **standalone video/receipt consistency**, not a claim of correspondence to the current timeline editor state.

### Guarantees and boundaries

1. **Original animation styles:** The six patterns use deterministic CPU math with a configurable seed; no footage, proprietary model, copyrighted visual asset, video API or paid accelerator is accessed.
2. **One-step final rendering:** The script creates each real MP4 scene and then calls the existing v2 editor to generate a finished MP4, captions and local review files automatically.
3. **Portable output presets:** Landscape, portrait and square shapes are supported, at standard or high resolution, always bounded by the existing 16 FPS H.264 renderer.
4. **Reproducible project metadata:** JSON records the input seeds and exact source/output SHA-256 values; repeated runs with identical source/config and identical codec/environment settings can be compared. Video byte-for-byte identity across different FFmpeg versions and platforms is not guaranteed.
5. **Fail-closed private delivery:** Duplicate JSON keys, unsupported scenes/palettes, invalid captions, seeds or durations, malformed input, and pre-existing output directories are rejected. Work is staged in a temporary private directory so incomplete generation is not published.
6. **No AI overclaim:** These are procedural graphics generated by explicit formulas, **not AI-trained natural footage**, prompt understanding, model inference or training. This remains a free, offline CPU visual-creation foundation while the separate generative AI Video model roadmap continues.

Dedicated CI exercises real MP4 encodes, all six animated styles, all five palettes, deterministic seeds, multi-scene assembly, high portrait/square outputs, v2 receipt hashes, and rejected or interrupted renders. Browser regression tests verify JSON schema, safe bounds and Studio wiring.

All generated content remains on the operator's machine unless deliberately shared. No external API, GPU provider or subscription action is activated.



## First actual CPU-trained video model: a small Markov texture generator

The AI Video Studio now has **Train a small video texture model on CPU**. Unlike the earlier original procedural animations (which use fixed mathematical equations), this deliberately modest experiment **learns statistical parameters from real local video frames** and then samples new moving pixels from those learned parameters.

### 1. Local training

The tool requires reviewed 16 FPS MP4 input clips produced by the existing `prepare_video_sources.py` or equivalent. Place 1–8 local clips in `./local-video-media`. Sources must be no more than 64 MiB each, 512x512 or smaller, fixed 16 FPS, with at least eight real decodable frames. For CPU limits, it uses only the first **240 frames (15 seconds)** from each clip, downscaled to **32 × 18 RGB** pixels.

```sh
python gpu-worker/learn_cpu_video_texture.py train \
  --input ./local-video-media \
  --output ./eternyx-learned-cpu-model \
  --rights-ref operator-reviewed-original-footage
```

The tool trains a **64-color-state categorical transition model** plus a **3×3 empirical coarse-motion histogram**. It also learns a position-dependent color distribution for initializing new texture samples. These are actual measured frequencies and state transitions, not randomly assigned fake scores. There are **no learned neural layers, neural network weights, diffusion parameters or text conditioning**. Training uses only Python standard library and local FFmpeg/FFprobe; no Torch, CUDA, model-provider account or internet connection is needed.

The first 75% of each decoded training window contributes model counts; the final 25% are held out. The report contains actual held-out **transition negative log likelihood** and a **global color frequency baseline** on the same held-out frames. Lower negative log likelihood means better *categorical prediction*; it does not measure realism, aesthetic quality, continuity or text-prompt alignment.

A new create-only folder `eternyx-learned-cpu-model` receives `model.json` (learned counts, source digests and rights references) and `training-report.json` (holdout metrics and model SHA-256). It does not contain raw source frames or source MP4 files. However, position/color distributions may reveal visual style or aspects of private footage, so **keep the trained model file private**.

### 2. Sample new video from the trained model

```sh
python gpu-worker/learn_cpu_video_texture.py generate \
  --model ./eternyx-learned-cpu-model/model.json \
  --output ./eternyx-learned-cpu-video \
  --seconds 3 --seed 42 --profile landscape --quality standard
```

Choose an integer 1–8 second duration, seed 0–2147483647, landscape/portrait/square, and standard/high. The trained parameters and the seed determine the generated coarse animated texture; the implementation samples per-pixel categorical transitions and learned global translations. It **does not copy training MP4 frames into the generated output** or merely replay a training clip. It can still resemble training inputs because it is explicitly conditioned on their empirical visual patterns. Different seeds produce distinct samples; the same model and seed reproduce the same sampled RGB frames. Encoded MP4 hashes may differ between FFmpeg environments.

The tool creates actual `eternyx-learned-cpu-video/clip-01.mp4`, a matching v2 `eternyx-video-v2.json`, and a full finished `eternyx-learned-cpu-video/render/video.mp4` via the existing CPU video renderer. `render/manifest.json`, `render/captions.srt` and `render/preview.html` are included. The separate `generation-report.json` **explicitly labels these outputs as learned non-neural model-generated pixels**. The v2 renderer's own manifest still labels its **editing/assembly operation** as non-generative: the **source** of the assembled frames was learned, the **final rendering operation** is conventional editing. Do not confuse those two independent claims.

### 3. Local inspection and limitations

In AI Video Studio, expand the CPU learned-model section. Copy commands, choose sample parameters, and optionally select both the actual `model.json` and `training-report.json` from your computer. WebCrypto SHA-256 checks that the selected model file matches the training report without uploading model files. Real held-out metrics are displayed exactly as recorded; no invented model quality or realism score is shown. Open the finished MP4 and `render/manifest.json` in the already available **Inspect your actual rendered MP4** workflow to review it locally.

**Boundaries:**

- This is a **learned video texture baseline**, not a high-capability neural video diffusion model, not prompt-to-video, not realistic human/action animation, and not pretrained Wan inference. It demonstrates genuine learned temporal sampling and the completed offline train → sample → MP4 pipeline within a small CPU budget.
- The model is a first-order categorical estimator and has very low visual resolution. Outputs will look like stylized, sometimes noisy abstract moving textures; photorealistic production quality should not be expected.
- Training data rights are operator-attested with a required reference, **not legally certified**; no dataset, training video or model is published.
- Training is bounded (8 sources, first 15 seconds each, tiny 32x18 frames); generation is limited to 8 seconds. Output folders are create-only and incomplete batches are removed on failure.
- The data-dependent model, training and generation run **locally**; the website prepares safe commands and verifies reports but does not run video inference remotely. No paid GPU, external AI API, hidden model download or subscription is enabled.
- ETERNYX's separate Wan adapter research workflow remains distinct and is **not represented as trained, deployed or operational** by this prototype.

Dedicated CI creates actual synthetic MP4 training clips, trains on real decoded frames, checks held-out sample counts and provenance, generates new seeded frames, rejects tampered model schemas, renders real portrait/square/landscape MP4s and tests the CLI. Browser regressions cover command injection, model receipt integrity, accurate metrics and no-upload Studio integration.



## Genuine tiny neural video baseline (CPU-only): learn a predictor, sample new frames

The **AI Video Studio** local editor now includes the collapsible **Experimental tiny neural video model · CPU-only** workspace. This is ETERNYX's first locally trainable **neural network** video baseline. It is independent of the earlier Markov color-count baseline and the fixed mathematical animation presets. This MLP has *trainable matrices, biases, non-linear activations and explicit stochastic-gradient backpropagation*, so it is a real, albeit exceptionally small, neural model.

**Limitations are essential:** This is a pixel-level **12-input → 12-hidden-unit → 3-output** autoregressive next-frame color predictor operating on **32×18** frames, **not** a latent diffusion transformer, pretrained foundation model, high-resolution real-scene generator or natural-language text-to-video system. Expect highly abstract, noisy/colorful, low-detail textures, not cinematic output. Do not describe its output as photorealistic AI video.

### Train the tiny neural model with local, rights-reviewed video

Place 1–8 genuinely owned/licensed, fixed **16 FPS** MP4 clips in `./local-video-media`. Each must contain at least eight decoded frames and meet the local 512×512 / 64 MiB source limits. The trainer works with only the first **64 decoded frames** from each source. It quantizes each video frame to a 64-color representation at 32×18 resolution. Training uses the earlier 75% of each temporal window; later windows are held out from optimizer updates.

```sh
python gpu-worker/train_tiny_neural_video.py train \
  --input ./local-video-media --output ./eternyx-tiny-neural-model \
  --rights-ref owner-reviewed-local-video --seed 42 --epochs 3
```

The model takes RGB information from the previous frame's current, left and upper pixels, normalized x/y position, and temporal fraction. Its tanh hidden layer and sigmoid RGB output are fitted by explicit backpropagation using bounded per-pair pixel samples. Training uses deterministic seeds and 1–4 CPU epochs; it does not import PyTorch, install model weights, call cloud models, require CUDA or download data.

Real evaluations are recorded for the same held-out next-frame examples: **neural per-channel squared error** and a **previous-frame persistence baseline**. The report also records training MSE before/after SGD. Those are *measured predictive errors*, not invented perceptual ratings or evidence of realistic motion. The neural model is not required to outperform the persistence baseline on all material; results determine whether it did on that dataset.

Outputs in the new create-only directory `eternyx-tiny-neural-model`:

- `model.json` contains the neural weight matrices, biases, initialization grid, observed coarse motion frequencies, source SHA-256 and rights references; no full input MP4 or raw original decoded frames are copied
- `training-report.json` contains model SHA-256, measured train/held-out losses, architecture and sources

The learned spatial color grid and model parameters can still reveal style information from the training material; keep the model and reports private, and never assume that not storing raw MP4s provides complete privacy.

### Sample and render novel learned video pixels offline

```sh
python gpu-worker/train_tiny_neural_video.py generate \
  --model ./eternyx-tiny-neural-model/model.json \
  --output ./eternyx-tiny-neural-sample \
  --seconds 2 --seed 42 --profile landscape --quality standard
```

The generator uses seeded stochastic initialization and neural next-frame predictions with bounded variation and empirical coarse motion frequencies. It **samples novel pixels rather than replaying source MP4s**. A different seed yields different results; the same model and seed yield repeatable uncompressed RGB frames. Exact MP4 encoder bytes can differ between FFmpeg versions.

The output directory includes an actual playable `clip-01.mp4`, `eternyx-video-v2.json`, `render/video.mp4`, `render/manifest.json`, `render/captions.srt`, `render/preview.html` and `generation-report.json`. The **neural sample report explicitly labels generation as neural**, while the v2 renderer's receipt describes only the non-generative *assembly/encoding* step. The final video is an upscaled, low-information neural texture, not a high-detail new world scene.

Use the Studio's **Inspect your actual rendered MP4** workflow to re-import the finished video and renderer manifest for local hash/codec checks and a human review. You can also select `model.json` and `training-report.json` together in the neural Studio workspace for browser-local WebCrypto SHA-256 comparison and inspection of measured MSE.

### CPU, security and evaluation boundaries

Training and sampling run via Python's standard library and locally installed FFmpeg/FFprobe with libx264. The model fits small 12×12 and 3×12 trainable matrices and generates **1–8 seconds at 16 FPS** per sample; no API key, paid GPU or external AI service is needed. Local folder names are create-only; source path traversal, symlinks, malformed checkpoints, unsupported frame rates or sizes, nonfinite weights, missing rights references and excessive budgets are rejected.

A dedicated GitHub Actions workflow trains neural weights from real CI-generated MP4s and verifies independent seeded outputs, actual decoded frame counts, original/assembled video receipts, malformed model refusal and CLI operation. Browser regression tests verify command safety, model/report integrity and that no remote inference is implied. This baseline does **not** claim the ETERNYX flagship generative model is finished; separate Wan/adapter research remains ongoing.



## Neural temporal consistency controls and real MP4 seed auditions

The existing **Experimental tiny neural video model · CPU-only** now exposes two controls when sampling already-trained neural weights:

- **Temporal stability (integer 0–85%, default 45%).** Motion-shift the previous low-resolution frame according to the model's learned motion frequencies, then blend its previous pixel colors with the new neural RGB prediction. The model always contributes at least 15% of the next-pixel prediction. High stability can reduce frame-to-frame change but may also suppress visual variation or collapse dynamics.
- **Controlled variation (integer 0–20%, default 6%).** Noise is now temporally correlated (an AR(1) process), rather than drawing unrelated independent Gaussian jitter every pixel every frame. This is only a seed-controlled sampling technique; it does not change training weights or ensure perceived motion quality.

Use the Studio controls to generate a single video, or run directly:

```sh
python gpu-worker/train_tiny_neural_video.py generate \
  --model ./eternyx-tiny-neural-model/model.json \
  --output ./eternyx-tiny-neural-sample \
  --seconds 2 --seed 42 --profile landscape --quality standard \
  --stability 60 --variation 5
```

The video generation receipt now includes the selected settings, the SHA-256 of the uncompressed *generated* RGB frames, and genuine **temporal-frame diagnostics** from those exact frames: count, mean and maximum adjacent-frame absolute RGB differences (normalized 0–1), identical adjacent frame pairs and mean brightness of first/last frames. These are **low-level diagnostics, not aesthetics, realism, good motion, or prompt-adherence scores**. Smaller deltas can mean less flicker **or** no motion.

### Compare up to three real output videos

In the same Studio workspace, use **Audition three actual neural videos side by side** to choose 1–3 distinct seeds. Every candidate is generated from the same trained neural model, same stability/variation settings and selected output preset; all run locally with Python + FFmpeg.

```sh
python gpu-worker/audit_neural_video_variants.py \
  --model ./eternyx-tiny-neural-model/model.json \
  --output ./eternyx-tiny-neural-audition \
  --seeds 42 43 44 --seconds 2 \
  --profile landscape --quality standard \
  --stability 60 --variation 5
```

Auditions are limited to **three candidates** and **four seconds each** to keep CPU usage bounded. Each candidate gets a create-only `candidate-01` / `candidate-02` / `candidate-03` directory with a real `render/video.mp4`, its original sampled clip, source/renderer receipts and captions. The shared `audition-report.json` verifies actual decoded frame counts and includes SHA-256 and byte sizes for every completed MP4. If any candidate fails, **the entire audition batch is removed** and no partial output folder is published.

For inspection, select the shared `audition-report.json`, then one to three actual candidate `video.mp4` files from those local folders (the filenames can be identical). WebCrypto SHA-256 checks each file's real bytes against the matching candidate entry, and the Studio presents **independent playback**, seeds, frame counts and measured raw RGB deltas side by side. This is a local, **self-attested integrity comparison**, not a trusted signature or an automated preference/ranking. Listen/watch and make your own creative judgment; users should not interpret a lower raw frame delta as universally better video.

All of these improvements use the **same existing tiny neural checkpoint schema** and CPU-only ffmpeg generator; no retraining is required to try the new sampling controls. There is no paid GPU, external AI inference API, high-resolution model, text-to-video capability, cloud upload or subscription feature. Measured improvements on small input clips must not be generalized to professional AI-generated video quality.



## CPU neural v2: learned higher-detail 48×28 video and honest multi-step evaluation

AI Video Studio now includes **Neural v2 · Two-frame motion and richer 48×28 detail (CPU)**, an optional new neural architecture beside the original v1. **This does not overwrite v1 weights**, and v1 checkpoints cannot masquerade as v2 weights.

The earlier real neural baseline trains on 32×18 decoded frames using one previous frame. V2 introduces seven concrete changes:

1. **2.33× more learned spatial pixels** per frame: 48×28 = 1,344 positions, instead of v1's 32×18 = 576. Finished output is still upscaled by the existing conventional FFmpeg renderer; **pixel count is not equivalent to photorealism**.
2. **Two-frame causal context:** a 24-input → 16-hidden → 3-output MLP predicts the next RGB color from RGB pixels in the two previous frames, four immediate current-frame neighbors, spatial coordinates and temporal position. All weights/biases are trained with genuine bounded SGD and tanh/sigmoid activations, using local Python standard library only.
3. **Held-out one-step model vs persistence:** final 25% temporal window is excluded from training, measured using real target pixels, and compared to the previous-frame predictor. We do not assume v2 wins.
4. **True four-step free-running holdout:** starting only from the last two training-prefix frames, the model predicts successive quantized frames; its next-step inputs are its **own predictions**, not the unseen held-out targets. Recorded MSE is compared to a static last-training-frame baseline across the same held-out time steps. This better exposes autoregressive drift than teacher-forced one-step MSE; it is not a quality score.
5. **Real-seeded inference:** sample 1–8 seconds at 16 FPS with trained neural weights, learned aggregate color initialization, empirical motion shifts, adjustable temporal stability and correlated stochastic variation. Samples are newly computed RGB pixels, not a replay of input MP4 footage.
6. **Verified local MP4:** each run creates a real 48×28 H.264 `clip-01.mp4`, an editable v2 storyboard, a finished `render/video.mp4`, renderer manifest/SRT/preview and a distinct neural-origin `generation-report.json` with SHA-256 of the model, uncompressed generated RGB frames, source clip and final video.
7. **Studio integrity and independent tests:** browser UI provides bounded offline commands and SHA-256 checks of selected real `model.json`/training report and actual finished `video.mp4`/generation report, with local playable video. Dedicated FFmpeg CI checks training gradients, contextual features, real 48×28 output, causal rollout, video hashes, supported aspect ratios, malformed model rejection, rights/source-path protections and atomic rollback.

### Training example

Create `./local-video-media` containing 1–8 locally owned/licensed constant **16 FPS** MP4 clips (at least nine frames each; each at most 64 MiB, source resolution no greater than 512×512). The previous smartphone-import converter can normalize ordinary MOV/MP4 phone footage.

```sh
python gpu-worker/train_spatiotemporal_neural_video.py train \
  --input ./local-video-media --output ./eternyx-neural-v2-model \
  --rights-ref owner-reviewed-video --seed 42 --epochs 2
```

The model processes the first 64 frames (4 seconds) of each input at the small learned resolution. The final 25% of each temporal source window is held out. The create-only output directory contains `model.json` with learned matrices, aggregate grid, empirical motion prior and source SHA-256 metadata; `training-report.json` records architecture, sampled training/holdout examples, one-step MSE, baseline MSE and causal four-step rollout MSE. Training uses 1–4 CPU epochs with a bounded number of pixel samples per input pair. No neural pretrained checkpoints or model downloads are accessed.

### Sampling example

```sh
python gpu-worker/train_spatiotemporal_neural_video.py generate \
  --model ./eternyx-neural-v2-model/model.json \
  --output ./eternyx-neural-v2-video --seconds 2 --seed 42 \
  --profile landscape --quality standard \
  --stability 45 --variation 6
```

The create-only output directory contains `clip-01.mp4`, `eternyx-video-v2.json`, `render/video.mp4`, `render/manifest.json`, `render/captions.srt`, `render/preview.html` and `generation-report.json`. The generation report records the measured raw pixel frame differences and independent MP4 SHA-256, while the renderer receipt describes only the downstream conventional editing/encoding operation.

**Interpretation/limits:** A 48×28 neural texture is an incremental research baseline, **not** photorealistic video, prompt-to-video, diffusion inference or a production generative model. More detail and two-frame context provide more learned information, but no guaranteed improvement in subjective quality or temporal consistency. Check the holdout metrics and visually inspect the actual MP4. Neural weights and aggregate color statistics may reveal details about local footage; keep model files private. All training, sampling and checking are local/offline; no paid GPU, remote AI API, subscription enforcement or media upload occurs.



## Matched neural v1 vs v2 benchmark: real same-source errors, CPU timings and H.264 side-by-side

The **AI Video Studio** includes **Fair neural v1 vs v2 comparison · Same footage · CPU-only**. This workflow helps determine whether the two CPU-trained neural video baselines improve *measured prediction* under a comparable local dataset. Unlike comparing separate model training reports (which evaluate at different spatial resolutions), it evaluates both models on the same ground-truth target frame grid and checks every selected training source's SHA-256.

### Run with the same licensed footage

Place 1–3 owned/reviewed 16 FPS MP4 clips in the local `./local-video-media` folder. Each must have at least **32 actual decoded frames** (so the last-quarter holdout contains at least eight steps), source resolution at most 512×512 and file size at most 64 MiB. The benchmark consumes at most 64 frames per clip. Select 1–2 training epochs for **both** models. It creates two new checkpoints inside an atomic, create-only output batch without modifying existing v1 or v2 model directories.

```sh
python gpu-worker/compare_cpu_neural_video.py \
  --input ./local-video-media \
  --output ./eternyx-neural-comparison \
  --rights-ref owner-reviewed-video --seed 42 --epochs 1 --seconds 1
```

The tool produces:

- `model-v1/model.json` and `model-v2/model.json` plus matching training reports, trained independently with equal source names/bytes, source SHA-256, random seed, epochs and identical temporal 75%/25% training/holdout boundaries.
- `comparison-report.json`: explicit common evaluation target **48×28**, native v2 predictions and nearest-neighbor upscaled v1 predictions (from 32×18) on the SAME **4-level-per-RGB-channel quantized** held-out video pixels. It records real 1, 4 and 8-step *causal free-running* MSE against the same static-last-training-frame baseline, actual per-step errors, and local monotonic wall-clock training and rendering timings. The model's predicted intermediate pixels feed subsequent predictions; unseen held-out targets are used only for error calculation.
- `sample-v1/render/video.mp4` and `sample-v2/render/video.mp4`: genuinely sampled short neural CPU video outputs and their own conventional editing/encoding receipts and generated-origin reports.
- `comparison.mp4`: an actual playable **512×144 H.264** video with v1 on the left and v2 on the right. This is a *visual review tool*, not a claim that either model generates more realistic footage. The SHA-256 and actual decoded frame count of each of the three MP4s are verified and recorded.

The report records actual measured CPU wall time for separate training, evaluation, video generation/encoding and side-by-side assembly. Such single-run timings are **machine- and workload-specific**; no guaranteed benchmark performance across hardware is implied. Checkpoints and sources are still small CPU video-texture models—this is not photorealistic text-to-video, diffusion inference, improved text prompt conditioning or finished flagship production inference.

### View and verify without uploads

Download/select the local `comparison-report.json` in the Studio's comparator section to inspect one-, four- and eight-step errors and measured CPU timings. Select the two distinct `video.mp4` files and `comparison.mp4`; although the individual MP4s share a basename, the browser matches their *actual bytes* by SHA-256 and size to the precise version indicated in the report. The videos can be played independently or as a stacked side-by-side clip without uploading any files.

Important distinctions:

1. **Matched dataset:** Both models train on identical source files, temporal boundaries and integer epoch budgets. Different architectures, spatial resolutions and training sample counts still prevent claims of a perfectly controlled architecture comparison.
2. **Matched evaluation:** V1 outputs are resampled by nearest-neighbor to the 48×28 target, while v2 operates natively at 48×28. This avoids reporting metrics calculated against different ground-truth targets; it does not eliminate architectural bias or prove better perception.
3. **No teacher forcing in rollout:** Both models start from true final training-prefix frame(s); their own predictions—not actual held-out frames—feed successive steps. The same constant training-prefix frame is the baseline for both models.
4. **8-step error is not realism:** Lower error can favor blurry, static or color-averaged video, and a persistence baseline may beat either network. No automatic winner/quality score is produced. Use direct visual inspection.
5. **Bounded local execution:** Only 1–3 MP4s, first 64 frames each, 1–2 epochs and 1–2 seconds of side-by-side output. Paths, source types, rights reference, model sample file hashes, decoded frame counts and output sizes are guarded; an interrupted batch leaves no published partial output.
6. **No hidden paid services:** The code uses Python standard library and existing locally installed FFmpeg/FFprobe/libx264; there is no paid GPU, model download, remote AI API, media upload or subscription.

Dedicated CPU integration tests independently train both models on real FFmpeg-created clips, recompute per-step MSE on the common 48×28 target, verify exact video hashes/decoded frames, check real elapsed timings and full-batch rollback, and test the offline CLI. Browser regressions reject malformed evidence and mismatched MP4 hashes before playback.



## Causal neural v2 rollout adaptation (CPU): train on synthetic history, measure drift honestly

After training the ETERNYX 48×28 two-frame neural v2 model and optionally running the v1/v2 matched benchmark, you can now test whether *causal training-prefix adaptation* reduces accumulated prediction drift. This **does not create a new paid AI service**, require pretrained models, or promise improved visual quality.

The new **Neural v2 · Causal rollout adaptation and 8-step drift review** panel in AI Video Studio prepares this offline command:

```sh
python gpu-worker/adapt_neural_rollout.py \
  --model ./eternyx-neural-v2-model/model.json \
  --input ./local-video-media \
  --output ./eternyx-neural-causal-adaptation \
  --epochs 1 --mix-percent 50 --seed 42 \
  --seconds 1 --stability 45 --variation 6
```

**Seven concrete upgrades:**

1. **Adapt the real existing v2 neural weights, without replacing v1 or v2 originals.** The adapter reads a valid v2 24→16→3 checkpoint, verifies its original local MP4 source names, content SHA-256 and exact decoded frame counts, and refuses source changes. It supports 1–3 approved local clips, each with at least 32 decoded frames and eight held-out frames.
2. **Causal free-running training-prefix examples.** From up to three anchor positions within each clip's original first-75%-of-frames training prefix, the model predicts 1–3 successive complete 48×28 frames. Its later inputs include **its own predictions**, not the hidden held-out targets. Those synthetic inputs are paired with real *training-prefix* target pixels for actual CPU SGD weight updates. Held-out frames are excluded from adaptation inputs and labels.
3. **Optional teacher-forced replay (0–100%).** Mix a bounded number of original supervised prefix examples with causal rollouts to study catastrophic forgetting versus exposure to model-generated states. The integer proportion, 1–3 adaptation epochs, seeded anchor/sample positions and SGD learning rate are recorded. This is an actual adaptation experiment and may perform worse than the original checkpoint.
4. **Independent matched before/after holdout evaluation.** Record real **1-, 4-, and 8-step autoregressive MSE** on the same held-out frames before and after adaptation. The static-last-training-frame baseline must be identical before and after; a separate one-step teacher-forced metric is also included. The held-out data is used to *evaluate* weights but not to train or select a winner. Errors are reported unchanged when adaptation makes them worse.
5. **Two genuine sampled v2 videos plus a real H.264 comparison.** Generate a baseline `baseline/render/video.mp4` and an adapted `adapted/render/video.mp4` with the same seed, seconds, stability and variation. Their neural-origin receipts are verified. A real 512×144 `comparison.mp4` places original on the **left** and adapted on the **right**, validated by FFprobe decoded frame count.
6. **Create-only atomic provenance.** A new output directory holds `adapted-model/model.json` (compatible with existing neural v2 inference), `adaptation-report.json`, actual MP4s and their per-model rendering receipts. Report includes source SHA-256, original/adapted checkpoint SHA-256, causal anchor positions and depths, example counts, mix percentage, measured training time and real video hashes/bytes. Original checkpoint and source MP4s are not modified; a failed batch leaves no published partial output.
7. **Real Studio evidence and regression gates.** The Studio allows safe CPU command customization, imported JSON interpretation of unchanged held-out metrics, local WebCrypto SHA-256 verification of the actual adapted model and MP4s, and independent on-device playback. Dedicated real-FFmpeg CI tests ensure source identity, true train-prefix-only inputs, adaptation updates, measured 1/4/8-step errors, no-overwrite behavior, atomic recovery, unsafe-input rejection and real MP4/CLI operation.

**Scientific and privacy limits:** The adapted model remains a tiny, low-resolution, non-diffusion neural video texture generator. The experiment cannot understand text instructions or create photorealistic cinematic footage. Better MSE does not automatically imply better motion or aesthetics; stronger temporal blending may collapse all dynamics. Prefer visual inspection of real MP4s and multiple licensed footage sources before any claim of progress. The self-reported SHA-256 check is a local consistency control, not cryptographic identity proof. Trained model weights/statistics can reveal information about original recordings; keep them private. No GPU charges, external AI APIs, cloud uploads or subscription enforcement are activated.



## CPU neural v2: choose replay schedules without using the final test set

The **Neural v2 · Leak-free replay schedule selection on CPU** workspace makes a scientifically important distinction that the previous single-schedule adapter did not automate. It can compare **up to three real causal training strategies** and retain the original model when none passes **inner validation**, while keeping the original last-quarter held-out footage completely separate from selection and fitting.

Training and testing an adaptation against the same 8 final held-out frames, then selecting whichever scores best on those frames, would leak information from the final test set into model selection. This tool instead uses *nested temporal windows*.

### Example: train 0%, 50% and 100% teacher replay schedules

Use an existing 48×28 two-frame neural v2 `model.json` with the **unchanged original MP4s** used to train it:

```sh
python gpu-worker/select_neural_schedule.py \
  --model ./eternyx-neural-v2-model/model.json \
  --input ./local-video-media \
  --output ./eternyx-neural-schedule \
  --mix 0 --mix 50 --mix 100 \
  --seed 42 --epochs 1 --seconds 1 \
  --stability 45 --variation 6
```

Choices must be 1–3 **distinct** percentages from 0, 25, 50, 75, 100. The existing model's original training sources are reverified with SHA-256, and each must have at least 32 decoded 16FPS frames. The first 64 frames at most are used, with the original 75% train / 25% outer test split preserved. Python standard library and local FFmpeg/FFprobe/libx264 are the only dependencies.

### Exactly which frames are used?

For a 32-frame source, the original v2 training prefix is frames **0–23** and the untouched final holdout is **24–31**. During selection, the *inner* training window ends after frame **17** (the first 18 original prefix frames), and the following inner validation targets are **18–21**. That inner validation window is safely **inside the original training prefix**, with a two-frame gap before the final held-out section.

1. Begin every candidate with a copy of the same original neural v2 weights.
2. Generate 1–3 causal next-frame synthetic states and optimize them against **inner training-prefix labels only**, optionally replaying teacher-forced prefix labels at the candidate percentage.
3. Evaluate 4-step **free-running** prediction MSE on those four *inner validation* targets only. These targets do not appear as candidate optimizer labels.
4. Include the **unchanged original checkpoint** as an explicit baseline. Choose only a candidate with inner MSE strictly smaller than the best-so-far value by at least 0.00000001; deterministic candidates are ordered by increasing mix percentage. When none improves on the original, **retain original neural weights**.
5. If a candidate is selected, start **again from the original weights** and refit only the chosen schedule, using the full original training prefix (but not outer heldout). Do **not** carry over inner candidate-trained weights.
6. Now, **after the selection is locked in**, evaluate the original and resulting weights on identical outer heldout frames using real causal 1-, 4-, and 8-step pixel MSE and the same static-last-training-frame baseline.
7. Generate both model versions with the same seed/stability/variation into separate actual H.264 MP4s, create a verified **512×144** v2 comparison with unchanged left and selected right, and save complete receipts and model/source SHA-256. New outputs are create-only and atomic.

A passing inner MSE **does not guarantee** that the chosen version improves final holdout MSE or perceived output quality. The final outer audit reports increases in loss without hiding them. Lower MSE may reward dull/blurry/static color fields. There is **no automated photorealism score, text-to-video alignment, or guarantee that a larger/harder-trained model is better**.

### File outputs and real Studio review

The new directory `eternyx-neural-schedule` contains:

- `selected-model/model.json`: an independently saved, validated v2-compatible checkpoint with the selected strategy metadata, base weight identity, and a flag saying whether any optimizer weights changed. The original trained v2 model is never overwritten.
- `schedule-report.json`: the original source SHA-256, exact inner/outer temporal boundaries, each inner candidate's measured loss and optimizer examples, the deterministic chosen mix or `null` when no candidate beats the original, full-prefix refit count, measured training/selection CPU time, original/selected outer test errors, and actual model, MP4 hashes/bytes.
- `base-sample/render/video.mp4` and `selected-sample/render/video.mp4`: two independently sampled neural v2 H.264 clips with original encoding receipts and model-origin reports.
- `comparison.mp4`: left=unchanged original v2 and right=selected schedule (or identical base weights in the explicit fallback case). Actual H.264 decoded frame counts, resolution and SHA-256 are verified.

The Studio imports the local `schedule-report.json` to display both the inner validation candidate table and the **independent** final unseen-frame 1/4/8-step audit table. For integrity inspection, import the selected `model.json` and actual video files; the browser computes SHA-256 from their bytes, matches each candidate against the report and plays the videos locally. No source or generated media is uploaded.

This remains a *tiny 48×28 neural video texture experiment*, not finished commercial text-to-video AI, pretrained diffusion inference or photorealistic scene generation. Trained model weights and aggregate appearance statistics can leak traits of training footage; keep checkpoints private. Self-reported hashes prove only local internal consistency, not digitally signed identities or licensing rights. No GPU, paid inference API or subscription changes.
