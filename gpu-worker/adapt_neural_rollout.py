"""Adapt EXISTING ETERNYX two-frame neural video weights to their own predictions.

This is an honest CPU-only autoregressive training experiment, not text-to-video,
diffusion, a new foundation model, or a claimed improvement in cinematic quality.
The adaptation samples generated states from TRAINING-PREFIX windows only, never
feeds unseen holdout frames into the model during adaptation, and reports causal
1/4/8 step MSE before and after. No checkpoint overwrite and no GPU or AI API.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import random
import shutil
import subprocess
import tempfile
from time import perf_counter

import train_spatiotemporal_neural_video as model_v2
from learn_cpu_video_texture import checked_input, validate_output_dir
from render_video_timeline import FPS, probe, video_info, sha256

MAX_SOURCES = 3
MAX_EPOCHS = 3
MAX_DEPTH = 3
MAX_SAMPLE_SECONDS = 2
POSITIONS = 32
MAX_VIDEO_BYTES = 64 * 1024 * 1024
LEARNING_RATE = 0.055


def training_sources(model, root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Only a real local training folder is supported")
    sources = model["sources"]
    if not 1 <= len(sources) <= MAX_SOURCES:
        raise ValueError("Adaptation supports 1–3 original training sources")
    results = []
    for source in sources:
        path = checked_input(root, source["file"])
        if sha256(path) != source["sha256"]:
            raise ValueError("Local training source SHA-256 differs from the original checkpoint")
        frames, count = model_v2.read_frames(path)
        if (count != source["decoded_frames"] or
                len(frames) != source["used_frames"] or
                len(frames) < 32):
            raise ValueError("Source frame count differs from original neural v2 training")
        cutoff = max(7,(len(frames)*3)//4)
        if (cutoff != source["train_frames"] or
                len(frames)-cutoff != source["holdout_frames"] or
                len(frames)-cutoff < 8):
            raise ValueError("Training split changed, or fewer than 8 unseen frames available")
        results.append((source, frames, cutoff))
    return results


def rollout_frame(weights, older, recent, fraction):
    """Generate one fully causal 48x28 frame using ONLY synthetic previous states."""
    target = bytearray(model_v2.N)
    for pos in range(model_v2.N):
        _, predicted = model_v2.forward(
            weights, model_v2.feature(older, recent, pos, fraction))
        target[pos] = model_v2.quantized(*[min(.999,max(0.,x)) for x in predicted])
    return bytes(target)


def causal_metrics(weights, datasets):
    windows = {}
    for horizon in (1,4,8):
        weighted_pred = 0.
        weighted_base = 0.
        pixels = 0
        for _, frames, cutoff in datasets:
            loss, baseline, actual = model_v2.holdout_rollout(
                weights, frames, cutoff, steps=horizon)
            weighted_pred += loss * actual
            weighted_base += baseline * actual
            pixels += actual
        if pixels != len(datasets)*model_v2.N*horizon:
            raise ValueError("Fair evaluation requires equal full holdout horizons")
        windows[str(horizon)] = {
            "steps":horizon,"evaluated_pixels":pixels,
            "model_mse":round(weighted_pred/pixels,8),
            "static_baseline_mse":round(weighted_base/pixels,8),
        }
    return windows


def one_step_mse(weights, datasets):
    examples=[]
    for _,frames,cutoff in datasets:
        for i in range(cutoff,len(frames)):
            positions=random.Random(i*103+len(frames)).sample(
                range(model_v2.N),POSITIONS)
            for pos in positions:
                examples.append((frames[i-2],frames[i-1],frames[i],pos,
                                 i/(len(frames)-1)))
    return model_v2.mse(weights,examples)


def build_training_replay(weights, datasets, seed, epoch, mix_percent):
    """Return bounded supervised examples, with only training-prefix labels.

    The model sees two real initial prefix frames; subsequent simulated frames
    are predicted autoregressively. No held-out frames become an input or label.
    """
    rng=random.Random(seed + epoch*173)
    augmented=[]
    teacher=[]
    used=[]
    for source,frames,cutoff in datasets:
        # Include positions distributed across the temporal training prefix.
        anchors=sorted(set((2, max(2,cutoff//3), max(2,cutoff//2))))
        for anchor in anchors:
            depth=min(MAX_DEPTH,cutoff-anchor)
            if depth<1:continue
            older,recent=frames[anchor-2],frames[anchor-1]
            for k in range(depth):
                t=anchor+k
                fraction=t/max(1,len(frames)-1)
                future=rollout_frame(weights,older,recent,fraction)
                positions=rng.sample(range(model_v2.N),POSITIONS)
                augmented.extend((older,recent,frames[t],pos,fraction)
                                 for pos in positions)
                # Replay a matching teacher-forced example from the same
                # TRAINING prefix to limit catastrophic drift.
                if mix_percent:
                    teacher.extend((frames[t-2],frames[t-1],frames[t],pos,fraction)
                                   for pos in positions)
                older,recent=recent,future
            used.append({"source_sha256":source["sha256"],
                         "anchor":anchor,"depth":depth})
    # Bounded teacher mix, fixed by percentage of free-running examples.
    count=(len(augmented)*mix_percent)//100
    if count:
        augmented.extend(rng.sample(teacher,min(count,len(teacher))))
    rng.shuffle(augmented)
    return augmented,used,count


def side_by_side(original, adapted, output, frames):
    cmd=[
        "ffmpeg","-nostdin","-hide_banner","-v","error","-threads","1",
        "-protocol_whitelist","file,pipe","-i",str(original),
        "-protocol_whitelist","file,pipe","-i",str(adapted),
        "-filter_complex_threads","1",
        "-filter_complex",
        "[0:v]setpts=PTS-STARTPTS[left];[1:v]setpts=PTS-STARTPTS[right];"
        "[left][right]hstack=inputs=2[out]",
        "-map","[out]","-an","-sn","-dn","-map_metadata","-1",
        "-frames:v",str(frames),"-r",str(FPS),
        "-c:v","libx264","-preset","ultrafast","-crf","23",
        "-pix_fmt","yuv420p","-movflags","+faststart",str(output),
    ]
    try:
        result=subprocess.run(cmd,capture_output=True,check=False,timeout=120)
    except (OSError,subprocess.TimeoutExpired) as err:
        raise ValueError("Offline side-by-side CPU encoding unavailable or timed out") from err
    if result.returncode or not output.is_file() or not 0<output.stat().st_size<=MAX_VIDEO_BYTES:
        raise ValueError("Side-by-side video failed FFmpeg encoding")
    if video_info(probe(output,count_frames=True)) != (512,144,frames):
        raise ValueError("Output has unexpected actual H264 dimensions/frame count")
    return {"file":"comparison.mp4","sha256":sha256(output),
            "video_bytes":output.stat().st_size,
            "width":512,"height":144,"frame_count":frames}


def adapt(checkpoint_path,root,output,epochs=1,mix_percent=50,seed=42,
          seconds=1,stability=45,variation=6):
    validate_output_dir(output)
    if type(epochs) is not int or not 1<=epochs<=MAX_EPOCHS:
        raise ValueError("Adaptation epochs must be integers 1–3")
    if type(mix_percent) is not int or not 0<=mix_percent<=100:
        raise ValueError("Teacher replay mix must be an integer 0–100 percent")
    if type(seed) is not int or not 0<=seed<=2**31-1:
        raise ValueError("Adaptation seed must be a 31-bit nonnegative integer")
    if type(seconds) is not int or not 1<=seconds<=MAX_SAMPLE_SECONDS:
        raise ValueError("Comparison samples must be 1–2 seconds")
    if type(stability) is not int or not 0<=stability<=85:
        raise ValueError("Temporal stability must be an integer 0–85")
    if type(variation) is not int or not 0<=variation<=20:
        raise ValueError("Temporal variation must be an integer 0–20")
    original=model_v2.read_model(checkpoint_path)
    datasets=training_sources(original,root)
    before_weights=copy.deepcopy(original["weights"])
    baseline_windows=causal_metrics(before_weights,datasets)
    before_one_step,before_persistence=one_step_mse(before_weights,datasets)
    trained=copy.deepcopy(original)
    started=perf_counter()
    examples_count=0
    teacher_count=0
    anchors=[]
    for epoch in range(epochs):
        replay,anchors_epoch,teacher=build_training_replay(
            trained["weights"],datasets,seed,epoch,mix_percent)
        if not replay:
            raise ValueError("No eligible causal training-prefix rollout examples")
        examples_count+=len(replay)
        teacher_count+=teacher
        anchors+=anchors_epoch
        for example in replay:
            model_v2.sgd(trained["weights"],example,lr=LEARNING_RATE)
    training_seconds=round(perf_counter()-started,6)
    if trained["weights"]==original["weights"]:
        raise ValueError("Causal adaptation did not update trainable neural weights")
    after_windows=causal_metrics(trained["weights"],datasets)
    after_one_step,after_persistence=one_step_mse(trained["weights"],datasets)
    if abs(after_persistence-before_persistence)>1e-10:
        raise ValueError("Static one-step baseline changed on the same held-out targets")
    # Preserve original training stage metrics, but update the existing
    # checkpoint's current held-out values to describe the adapted weights.
    trained["metrics"]["one_step_holdout_mse"]=round(after_one_step,8)
    trained["metrics"]["one_step_persistence_mse"]=round(after_persistence,8)
    trained["metrics"]["four_step_rollout_mse"]=after_windows["4"]["model_mse"]
    trained["metrics"]["four_step_static_baseline_mse"]=after_windows["4"]["static_baseline_mse"]
    trained["metrics"]["interpretation"]=(
        "Original base training loss plus adapted-weight heldout evaluations; "
        "see adaptation report for full 1/4/8-step comparison.")
    original_sha=sha256(checkpoint_path)
    trained["adaptation"]={
        "kind":"causal_training_prefix_rollout","base_model_sha256":original_sha,
        "epochs":epochs,"seed":seed,"teacher_replay_percent":mix_percent,
        "training_examples":examples_count,"teacher_examples":teacher_count,
        "source_count":len(datasets),
        "no_holdout_training":True,
    }
    raw=json.dumps(trained,separators=(",",":"),allow_nan=False).encode("utf-8")
    if len(raw)>model_v2.MAX_MODEL_BYTES:
        raise ValueError("Adapted v2 neural checkpoint exceeds allowed byte size")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-causal-adapt-",dir=output.parent))
    try:
        adapted_dir=stage/"adapted-model"
        adapted_dir.mkdir()
        adapted_path=adapted_dir/"model.json"
        adapted_path.write_bytes(raw+b"\n")
        model_v2.read_model(adapted_path)
        base_out,_=timed(lambda:model_v2.generate(
            checkpoint_path,stage/"baseline",seconds=seconds,seed=seed,
            profile="landscape",quality="standard",
            stability=stability,variation=variation))
        updated_out,_=timed(lambda:model_v2.generate(
            adapted_path,stage/"adapted",seconds=seconds,seed=seed,
            profile="landscape",quality="standard",
            stability=stability,variation=variation))
        left=stage/"baseline"/"render"/"video.mp4"
        right=stage/"adapted"/"render"/"video.mp4"
        if (sha256(left)!=base_out["final_mp4_sha256"] or
                sha256(right)!=updated_out["final_mp4_sha256"]):
            raise ValueError("Video output does not match its model origin receipt")
        pair=side_by_side(left,right,stage/"comparison.mp4",seconds*FPS)
        report={
            "version":1,"kind":"cpu_neural_causal_rollout_adaptation",
            "neural_network":True,"text_to_video":False,"model_generation":True,
            "base_model_sha256":original_sha,
            "adapted_model_sha256":sha256(adapted_path),
            "adapted_model_file":"adapted-model/model.json",
            "training_source_count":len(datasets),
            "sources":[{
                "file":source["file"],"sha256":source["sha256"],
                "decoded_frames":source["decoded_frames"],
                "used_frames":source["used_frames"],
                "training_prefix_frames":source["train_frames"],
                "holdout_frames":source["holdout_frames"],
            } for source,_,_ in datasets],
            "training":{
                "epochs":epochs,"seed":seed,"teacher_replay_percent":mix_percent,
                "free_running_depth":MAX_DEPTH,
                "total_examples":examples_count,
                "teacher_examples":teacher_count,
                "causal_anchors":anchors,
                "training_seconds":training_seconds,
                "learning_rate":LEARNING_RATE,
                "no_holdout_training":True,
            },
            "evaluation":{
                "resolution":"48x28","steps":[1,4,8],
                "baseline":baseline_windows,"adapted":after_windows,
                "one_step_teacher_forced_baseline_mse":round(before_one_step,8),
                "one_step_teacher_forced_adapted_mse":round(after_one_step,8),
                "static_one_step_mse":round(before_persistence,8),
                "interpretation":(
                    "Measured on identical held-out targets. Error may worsen; "
                    "not a cinematic quality or training-success rating."
                ),
            },
            "sampling":{
                "seconds":seconds,"seed":seed,"stability_percent":stability,
                "variation_percent":variation,
            },
            "artifacts":{
                "baseline":{
                    "file":"baseline/render/video.mp4",
                    "sha256":sha256(left),"video_bytes":left.stat().st_size,
                    "frame_count":seconds*FPS,
                },
                "adapted":{
                    "file":"adapted/render/video.mp4",
                    "sha256":sha256(right),"video_bytes":right.stat().st_size,
                    "frame_count":seconds*FPS,
                },
                "comparison":pair,
            },
            "note":(
                "A CPU-only two-frame neural v2 checkpoint adapted on causal "
                "training-prefix rollouts. Metrics do not guarantee improvement. "
                "No text-to-video, diffusion, cloud API or paid GPU."
            ),
        }
        (stage/"adaptation-report.json").write_text(
            json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf-8")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def timed(action):
    start=perf_counter()
    result=action()
    return result,round(perf_counter()-start,6)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model",type=Path,required=True)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--epochs",type=int,default=1)
    parser.add_argument("--mix-percent",type=int,default=50)
    parser.add_argument("--seed",type=int,default=42)
    parser.add_argument("--seconds",type=int,default=1)
    parser.add_argument("--stability",type=int,default=45)
    parser.add_argument("--variation",type=int,default=6)
    args=parser.parse_args()
    try:
        receipt=adapt(args.model,args.input,args.output,args.epochs,
                      args.mix_percent,args.seed,args.seconds,
                      args.stability,args.variation)
        print(json.dumps({
            "adapted_model_sha256":receipt["adapted_model_sha256"],
            "comparison_mp4":str(args.output/"comparison.mp4"),
            "comparison_sha256":receipt["artifacts"]["comparison"]["sha256"],
            "holdout_8_step_before":receipt["evaluation"]["baseline"]["8"]["model_mse"],
            "holdout_8_step_after":receipt["evaluation"]["adapted"]["8"]["model_mse"],
        }))
    except (OSError,ValueError,TypeError,KeyError,json.JSONDecodeError) as err:
        parser.error(str(err))


if __name__=="__main__":
    main()
