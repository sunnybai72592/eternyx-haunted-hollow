"""Fair, CPU-only offline v1/v2 neural video benchmark with actual MP4 comparison.

Both neural trainers use the SAME licensed 16 FPS source videos and the same
time-window split. Their own predictions are evaluated on the SAME quantized
48x28 source targets. V1 predictions are nearest-neighbor upscaled from 32x18
for evaluation, not evaluated on a more lenient low-resolution target.

This compares measured error and CPU wall times, NEVER infers realistic video
quality, model superiority or text-to-video ability from MSE. No GPU/API.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
from time import perf_counter

import train_tiny_neural_video as v1
import train_spatiotemporal_neural_video as v2
from learn_cpu_video_texture import checked_input, validate_label, validate_output_dir
from render_video_timeline import FPS, probe, sha256, video_info

MAX_SOURCES = 3
MIN_FRAMES = 32
MAX_FRAMES = 64
MAX_SECONDS = 2
MAX_EPOCHS = 2
MAX_VIDEO_BYTES = 64 * 1024 * 1024


def safe_sources(root, selected):
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Training folder must be a real local directory")
    names = list(selected) if selected is not None else sorted(
        p.name for p in root.iterdir() if p.is_file() and p.suffix.lower() == ".mp4")
    if (not 1 <= len(names) <= MAX_SOURCES or
            any(not isinstance(name, str) for name in names) or
            len({name.casefold() for name in names}) != len(names)):
        raise ValueError("Select 1–3 distinct reviewed MP4 videos for a bounded CPU comparison")
    sources = []
    for name in names:
        path = checked_input(root, name)
        _, _, frame_count = video_info(probe(path, count_frames=True))
        if frame_count < MIN_FRAMES:
            raise ValueError("Fair eight-step evaluation requires >=32 decoded frames per video")
        sources.append({"file": name, "sha256": sha256(path),
                        "actual_frames": frame_count, "path": path})
    return sources


def v1_step(model, previous, fraction):
    states = bytearray(v1.PIXELS)
    for pos in range(v1.PIXELS):
        _, output = v1.predict(model["weights"], v1.features(previous, pos, fraction))
        states[pos] = v1.encode_state(*[min(.999, max(0.0, n)) for n in output])
    return bytes(states)


def v2_step(model, older, previous, fraction):
    states = bytearray(v2.N)
    for pos in range(v2.N):
        _, output = v2.forward(model["weights"], v2.feature(older, previous, pos, fraction))
        states[pos] = v2.quantized(*[min(.999, max(0.0, n)) for n in output])
    return bytes(states)


def nearest_v1_to_v2(frame):
    if len(frame) != v1.PIXELS:
        raise ValueError("V1 prediction must be an actual 32x18 frame")
    return bytes(frame[(y * v1.HEIGHT // v2.H) * v1.WIDTH +
                       (x * v1.WIDTH // v2.W)]
                 for y in range(v2.H) for x in range(v2.W))


def frame_mse(prediction, ground_truth):
    if len(prediction) != v2.N or len(ground_truth) != v2.N:
        raise ValueError("Comparison must use the same 48x28 pixel grid")
    total = 0.0
    for p, truth in zip(prediction, ground_truth):
        total += sum((a-b)**2 for a,b in zip(v2.colors(p),v2.colors(truth)))
    return total / (v2.N * 3)


def evaluate_sources(sources, checkpoint_v1, checkpoint_v2, steps=8):
    if type(steps) is not int or not 1 <= steps <= 8:
        raise ValueError("Use 1–8 actual free-running heldout steps")
    totals = [[0.0,0.0,0.0,0] for _ in range(steps)]
    for item in sources:
        low,_ = v1.decode(item["path"])
        high,_ = v2.read_frames(item["path"])
        low,high = low[:MAX_FRAMES],high[:MAX_FRAMES]
        if len(low) != len(high) or len(low) < MIN_FRAMES:
            raise ValueError("Unequal decoded source lengths invalidate the comparison")
        cutoff = (len(high)*3)//4
        if cutoff != max(6,int(len(low)*.75)) or cutoff != max(7,(len(high)*3)//4):
            raise ValueError("V1/V2 training prefix is not identical; refusing leaky evaluation")
        if len(high)-cutoff < steps:
            raise ValueError("Insufficient matched heldout frames for causal multi-step evaluation")
        v1_prev = low[cutoff-1]
        v2_older,v2_prev = high[cutoff-2], high[cutoff-1]
        fixed_baseline = high[cutoff-1]
        for offset in range(steps):
            frame_idx = cutoff+offset
            fraction = frame_idx / max(1,len(high)-1)
            v1_next = v1_step(checkpoint_v1, v1_prev, fraction)
            v2_next = v2_step(checkpoint_v2, v2_older, v2_prev, fraction)
            truth = high[frame_idx]  # heldout input ONLY in metric; never predicted state
            sums=totals[offset]
            sums[0] += frame_mse(nearest_v1_to_v2(v1_next),truth)
            sums[1] += frame_mse(v2_next,truth)
            sums[2] += frame_mse(fixed_baseline,truth)
            sums[3] += 1
            v1_prev = v1_next
            v2_older,v2_prev = v2_prev,v2_next
    entries = []
    for idx,(a,b,c,count) in enumerate(totals,1):
        if count != len(sources):
            raise ValueError("Some source videos omitted from a heldout step")
        entries.append({"step":idx,"source_count":count,
                        "v1_mse":round(a/count,8),
                        "v2_mse":round(b/count,8),
                        "static_baseline_mse":round(c/count,8)})
    def average(n,key):
        return round(sum(entry[key] for entry in entries[:n])/n,8)
    windows = {}
    for count in (1,4,8):
        if steps >= count:
            windows[str(count)] = {"steps":count,
                "v1_mse":average(count,"v1_mse"),
                "v2_mse":average(count,"v2_mse"),
                "static_baseline_mse":average(count,"static_baseline_mse")}
    return {
        "version":1, "resolution":"48x28",
        "target":"4-level/channel quantized original 48x28 heldout RGB",
        "v1_evaluation":"32x18 v1 samples nearest-neighbor upscaled to 48x28",
        "v2_evaluation":"Native 48x28 v2 samples",
        "teacher_forcing":False, "same_sources":True,
        "temporal_split":"identical first 75% train / last 25% heldout",
        "steps":entries,"windows":windows,
        "interpretation":"Matched causal predictive MSE, not video quality or text-prompt alignment.",
    }


def timed(call):
    started=perf_counter()
    result=call()
    elapsed=perf_counter()-started
    if not math.isfinite(elapsed) or elapsed < 0:
        raise ValueError("Invalid measured CPU duration")
    return result,round(elapsed,6)


def stack_videos(left,right,output,frames):
    command=[
        "ffmpeg","-nostdin","-hide_banner","-v","error","-threads","1",
        "-protocol_whitelist","file,pipe","-i",str(left),
        "-protocol_whitelist","file,pipe","-i",str(right),
        "-filter_complex_threads","1",
        "-filter_complex",
        "[0:v]setpts=PTS-STARTPTS[left];[1:v]setpts=PTS-STARTPTS[right];"
        "[left][right]hstack=inputs=2[v]",
        "-map","[v]","-an","-sn","-dn","-map_metadata","-1",
        "-frames:v",str(frames),"-r",str(FPS),
        "-c:v","libx264","-preset","ultrafast","-crf","23",
        "-pix_fmt","yuv420p","-movflags","+faststart",str(output),
    ]
    try:
        proc=subprocess.run(command,capture_output=True,timeout=120,check=False)
    except (OSError,subprocess.TimeoutExpired) as error:
        raise ValueError("Offline side-by-side CPU video export failed") from error
    if proc.returncode or not output.is_file() or not 0<output.stat().st_size<=MAX_VIDEO_BYTES:
        raise ValueError("Side-by-side CPU H264 video was not generated")
    if video_info(probe(output,count_frames=True))!=(512,144,frames):
        raise ValueError("Side-by-side MP4 actual decoded frames do not match")
    return {"file":"comparison.mp4","sha256":sha256(output),
            "video_bytes":output.stat().st_size,
            "width":512,"height":144,"frame_count":frames}


def benchmark(folder,output,rights_ref,selected=None,seed=42,epochs=1,seconds=1):
    validate_output_dir(output)
    validate_label(rights_ref)
    if type(seed) is not int or not 0<=seed<=v1.MAX_SEED:
        raise ValueError("Benchmark seed must be an unsigned 31-bit integer")
    if type(epochs) is not int or not 1<=epochs<=MAX_EPOCHS:
        raise ValueError("Benchmark training must use 1–2 bounded CPU epochs")
    if type(seconds) is not int or not 1<=seconds<=MAX_SECONDS:
        raise ValueError("Benchmark video must be 1–2 seconds")
    sources=safe_sources(folder,selected)
    names=[x["file"] for x in sources]
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-neural-benchmark-",dir=output.parent))
    try:
        low_train,low_train_s=timed(lambda:v1.train(
            folder,stage/"model-v1",rights_ref,selected=names,seed=seed,epochs=epochs))
        high_train,high_train_s=timed(lambda:v2.train(
            folder,stage/"model-v2",rights_ref,selected=names,seed=seed,epochs=epochs))
        if ([x["sha256"] for x in low_train["training_sources"]] !=
            [x["sha256"] for x in high_train["training_sources"]] or
            [x["sha256"] for x in sources] !=
            [x["sha256"] for x in low_train["training_sources"]]):
            raise ValueError("Models trained on different source identities")
        low_model=stage/"model-v1"/"model.json"
        high_model=stage/"model-v2"/"model.json"
        evaluation,evaluation_s=timed(lambda:evaluate_sources(
            sources,v1.read_model(low_model),v2.read_model(high_model)))
        low_sample,low_sample_s=timed(lambda:v1.generate(
            low_model,stage/"sample-v1",seconds=seconds,seed=seed,
            profile="landscape",quality="standard"))
        high_sample,high_sample_s=timed(lambda:v2.generate(
            high_model,stage/"sample-v2",seconds=seconds,seed=seed,
            profile="landscape",quality="standard"))
        v1video=stage/"sample-v1"/"render"/"video.mp4"
        v2video=stage/"sample-v2"/"render"/"video.mp4"
        if (sha256(v1video)!=low_sample["video_sha256"] or
            sha256(v2video)!=high_sample["final_mp4_sha256"]):
            raise ValueError("One output video does not match its actual model renderer")
        stacked,stack_seconds=timed(lambda:stack_videos(
            v1video,v2video,stage/"comparison.mp4",seconds*FPS))
        def artifact(name,model,receipt,mp4,generated_sha,resolution,source_count):
            return {
                "model_file":f"model-{name}/model.json",
                "model_sha256":sha256(model),
                "model_bytes":model.stat().st_size,
                "training_report_file":f"model-{name}/training-report.json",
                "sample_file":f"sample-{name}/render/video.mp4",
                "sample_sha256":sha256(mp4),
                "sample_bytes":mp4.stat().st_size,
                "sample_origin_receipt_sha256":sha256(
                    stage/f"sample-{name}"/"generation-report.json"),
                "learned_resolution":resolution,
                "sample_frames":seconds*FPS,
                "training_source_count":source_count,
            }
        v1_artifact=artifact("v1",low_model,low_train,v1video,low_sample["video_sha256"],
                            "32x18",len(sources))
        v2_artifact=artifact("v2",high_model,high_train,v2video,high_sample["final_mp4_sha256"],
                            "48x28",len(sources))
        report={
            "version":1,"kind":"cpu_neural_v1_v2_comparison",
            "neural_network":True,"text_to_video":False,
            "model_generation":True,
            "seed":seed,"epochs":epochs,"seconds":seconds,"fps":FPS,
            "sources":[{key:item[key] for key in ("file","sha256","actual_frames")}
                       for item in sources],
            "same_training_sources":True,
            "evaluation":evaluation,
            "cpu_elapsed_seconds":{
                "v1_training":low_train_s,"v2_training":high_train_s,
                "matched_evaluation":evaluation_s,
                "v1_sample_and_render":low_sample_s,
                "v2_sample_and_render":high_sample_s,
                "side_by_side_encoding":stack_seconds,
                "interpretation":"Local single-run wall clock, hardware-dependent; not controlled performance benchmarking.",
            },
            "artifacts":{
                "v1":v1_artifact,"v2":v2_artifact,"comparison":stacked,
            },
            "interpretation":(
                "Same sources, same 75/25 temporal split, 48x28 quantized target; "
                "v1 predictions nearest-neighbor upscaled. Matched causal MSE "
                "and wall-clock times do not establish cinematic quality."
            ),
        }
        (stage/"comparison-report.json").write_text(
            json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf-8")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--rights-ref",required=True)
    parser.add_argument("--clip",action="append")
    parser.add_argument("--seed",type=int,default=42)
    parser.add_argument("--epochs",type=int,default=1)
    parser.add_argument("--seconds",type=int,default=1)
    args=parser.parse_args()
    try:
        result=benchmark(args.input,args.output,args.rights_ref,
                         args.clip,args.seed,args.epochs,args.seconds)
        print(json.dumps({
            "output":str(args.output),
            "side_by_side_video":str(args.output/"comparison.mp4"),
            "sha256":result["artifacts"]["comparison"]["sha256"],
            "sources":len(result["sources"]),
            "causal_8_step":result["evaluation"]["windows"]["8"],
            "elapsed_seconds":result["cpu_elapsed_seconds"],
        }))
    except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__=="__main__":
    main()
