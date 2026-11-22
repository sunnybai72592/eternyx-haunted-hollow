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
