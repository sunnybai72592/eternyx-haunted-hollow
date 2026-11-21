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
