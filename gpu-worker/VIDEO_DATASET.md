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

This CPU step takes the first 17 frames at 16 fps after resampling, fits the picture inside 384 × 224 with black padding, and stores RGB bytes in time × height × width × channels order. Short clips fail instead of receiving invented frames. The archive includes the original caption, scene, frame rate and source digest. Open it with `numpy.load(path, allow_pickle=False)`. Keep clips unchanged while preparing windows, and check that the caption describes the opening window. VAE encoding and caption embedding are still required before these frames can enter the Wan adapter training step.

## Prepare and train from a whole manifest

With a reviewed manifest and a local Wan snapshot, run these commands in Bash on a CPU machine with FFmpeg and the training dependencies. Choose a new output directory for the encoded dataset.

```sh
python gpu-worker/encode_training_manifest.py ./wan-snapshot ./clips dataset-v1.json ./encoded-v1
python gpu-worker/train_video_adapter.py ./wan-snapshot ./training --dataset-index ./encoded-v1/index.json --manifest dataset-v1.json --steps 100
```

The encoder loads the models once, checks each training clip against the manifest and saves its opening window. The numbered filenames follow source-path order. The trainer checks the manifest digest, ordered training sources, window annotations and encoded file digests before updating weights, including on resume. Use an immutable local dataset during training. Evaluation clips stay in the held-out split. The step count above is illustrative.

## Score an adapter on reviewed footage

Run the evaluator on a CPU machine with FFmpeg, the training dependencies, the local Wan snapshot and the trained adapter bundle. The full snapshot and encoders must fit in RAM. The evaluation rows should describe footage held out from adapter training. Use the same reviewed manifest that defined the training split.

```sh
python gpu-worker/evaluate_video_adapter.py ./wan-snapshot ./training/step-100 ./clips dataset-v1.json evaluation.json --seeds 1701 1702 1703
```

The evaluator encodes the opening window and caption of each evaluation clip. Each paired measurement uses identical noise with the adapter disabled and enabled. The JSON records the clip, manifest and adapter hashes, the seed and the scores at three noise levels. A negative mean delta means lower flow prediction error on that clip and seed. Judge visible motion and prompt fidelity separately using rendered clips.

Indexed training checkpoints record the reviewed manifest SHA-256, encoded index SHA-256, number of training windows and completed step. Evaluation copies these fields into the report and requires the original manifest bytes for indexed checkpoints. Keep that manifest alongside the dataset. Older bundles and runs trained from explicit window lists can still be evaluated. Their reports use null for any unavailable training provenance.
