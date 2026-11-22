"""CPU-only trainable two-frame spatiotemporal neural video v2 (48x28 RGB).

A real 24->16->3 MLP with explicit SGD learns next-frame colors from the
current and preceding frames plus spatial neighbors. This is a deliberately
small, non-diffusion research baseline. It cannot understand text prompts,
render realistic scenes or replace a production video model.

Requires only Python stdlib and local FFmpeg/FFprobe/libx264 (no APIs/GPU).
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import shutil
import subprocess
import tempfile

from assemble_video_storyboard import unique_keys
from learn_cpu_video_texture import checked_input, validate_label, validate_output_dir
from render_video_timeline import FPS, probe, video_info, render, sha256

W, H = 48, 28
N = W * H
INPUTS, HIDDEN, OUTPUTS = 24, 16, 3
GRID_W, GRID_H = 12, 7
MAX_SOURCE_FRAMES = 64
MAX_SOURCES = 8
MAX_SAMPLE_SECONDS = 8
MAX_SEED = 2**31 - 1
MAX_EPOCHS = 4
MAX_MODEL_BYTES = 128 * 1024
MAX_OUTPUT_BYTES = 64 * 1024 * 1024
POSITIONS_PER_PAIR = 40
LAYOUT = {"type": "two_frame_neighborhood_mlp", "inputs": INPUTS,
          "hidden": HIDDEN, "outputs": OUTPUTS, "activations": ["tanh", "sigmoid"]}


def colors(s):
    return ((s >> 4) / 3.0, ((s >> 2) & 3) / 3.0, (s & 3) / 3.0)


def quantized(r, g, b):
    return (min(3, max(0, int(r * 4))) << 4 |
            min(3, max(0, int(g * 4))) << 2 |
            min(3, max(0, int(b * 4))))


def quantize_frame(raw):
    if len(raw) != N * 3:
        raise ValueError("Invalid 48x28 decoded frame")
    return bytes((raw[k] >> 6) << 4 | (raw[k+1] >> 6) << 2 | raw[k+2] >> 6
                 for k in range(0, len(raw), 3))


def read_frames(path):
    _, _, actual = video_info(probe(path, count_frames=True))
    if actual < 9:
        raise ValueError("Two-frame neural training needs at least nine decoded 16 FPS frames")
    requested = min(actual, MAX_SOURCE_FRAMES)
    try:
        result = subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-threads", "1",
            "-protocol_whitelist", "file,pipe", "-i", str(path),
            "-map", "0:v:0", "-vf", f"scale={W}:{H}:flags=area,format=rgb24",
            "-frames:v", str(requested), "-an", "-sn", "-dn",
            "-f", "rawvideo", "pipe:1",
        ], capture_output=True, check=False, timeout=90)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Local FFmpeg unavailable or decode exceeded time limit") from error
    if result.returncode or len(result.stdout) != requested * N * 3:
        raise ValueError("Actual 48x28 decoded frames do not match source metadata")
    return [quantize_frame(result.stdout[i*N*3:(i+1)*N*3])
            for i in range(requested)], actual


def feature(older, recent, pos, phase):
    x, y = pos % W, pos // W
    left = y * W + (x - 1) % W
    right = y * W + (x + 1) % W
    top = ((y - 1) % H) * W + x
    down = ((y + 1) % H) * W + x
    # 7 RGB neighborhoods across TWO causal frames, plus x/y and time.
    return (*colors(recent[pos]), *colors(recent[left]), *colors(recent[right]),
            *colors(recent[top]), *colors(recent[down]),
            *colors(older[pos]), *colors(older[top]),
            x / (W - 1), y / (H - 1), phase)


def create_weights(seed):
    rng = random.Random(seed)
    return {
        "w1": [[rng.uniform(-0.13, 0.13) for _ in range(INPUTS)]
               for _ in range(HIDDEN)],
        "b1": [0.0] * HIDDEN,
        "w2": [[rng.uniform(-0.13, 0.13) for _ in range(HIDDEN)]
               for _ in range(OUTPUTS)],
        "b2": [0.0] * OUTPUTS,
    }


def forward(weights, inputs):
    hidden = [math.tanh(sum(w*v for w,v in zip(row,inputs)) + bias)
              for row,bias in zip(weights["w1"], weights["b1"])]
    outputs = [1 / (1 + math.exp(-max(-30, min(30,
               sum(w*v for w,v in zip(row,hidden)) + bias))))
               for row,bias in zip(weights["w2"], weights["b2"])]
    return hidden, outputs


def sgd(weights, sample, lr=0.075):
    older, recent, target, pos, phase = sample
    inputs = feature(older, recent, pos, phase)
    hidden, prediction = forward(weights,inputs)
    expected = colors(target[pos])
    delta = [(2/3) * (p - y) * p * (1-p) for p,y in zip(prediction,expected)]
    # Hidden gradients are calculated BEFORE mutating output weights.
    gradient = [(1-hidden[j]**2) *
                sum(delta[k]*weights["w2"][k][j] for k in range(OUTPUTS))
                for j in range(HIDDEN)]
    for k in range(OUTPUTS):
        for j in range(HIDDEN):
            weights["w2"][k][j] -= lr*delta[k]*hidden[j]
        weights["b2"][k] -= lr*delta[k]
    for j in range(HIDDEN):
        for k in range(INPUTS):
            weights["w1"][j][k] -= lr*gradient[j]*inputs[k]
        weights["b1"][j] -= lr*gradient[j]


def mse(weights, entries):
    if not entries:
        raise ValueError("Need real training or holdout examples")
    error = baseline = 0.0
    for older,recent,target,pos,phase in entries:
        _, output = forward(weights, feature(older,recent,pos,phase))
        truth = colors(target[pos])
        prior = colors(recent[pos])
        error += sum((p-t)**2 for p,t in zip(output,truth))
        baseline += sum((p-t)**2 for p,t in zip(prior,truth))
    return error/(len(entries)*3),baseline/(len(entries)*3)


def motion_score(previous, current, dx, dy):
    value = 0
    count = 0
    for y in range(2,H-2,4):
        for x in range(2,W-2,4):
            a = colors(current[y*W+x])
            b = colors(previous[(y-dy)*W+(x-dx)])
            value += sum(abs(u-v) for u,v in zip(a,b))
            count += 1
    return value / max(1,count)


def observed_shift(previous, current):
    candidates = [(motion_score(previous,current,dx,dy),
                   abs(dx)+abs(dy), (dy+1)*3+dx+1)
                  for dy in (-1,0,1) for dx in (-1,0,1)]
    return min(candidates)[-1]


def sample_rgb(states):
    raw=bytearray(N*3)
    for pos,state in enumerate(states):
        for k,value in enumerate(colors(state)):
            raw[pos*3+k]=int(value*255)
    return bytes(raw)


def raw_diagnostics(frames):
    if not frames or any(len(frame)!=N*3 for frame in frames):
        raise ValueError("Frame diagnostics require valid real 48x28 RGB frames")
    deltas=[]
    duplicates=0
    for old,new in zip(frames,frames[1:]):
        total=sum(abs(a-b) for a,b in zip(old,new))
        deltas.append(total/(N*3*255))
        duplicates += int(total==0)
    return {
        "frame_count":len(frames),
        "mean_adjacent_rgb_delta":round(sum(deltas)/len(deltas),8) if deltas else 0,
        "max_adjacent_rgb_delta":round(max(deltas),8) if deltas else 0,
        "identical_adjacent_pairs":duplicates,
        "interpretation":"Raw frame differences only; lower can mean smooth or collapsed output.",
    }


def sample_next(weights,older,recent,phase,blend,variation,rng,innovations):
    updated=bytearray(N)
    rgb_output=bytearray(N*3)
    for pos in range(N):
        _, prediction=forward(weights,feature(older,recent,pos,phase))
        prior=colors(recent[pos])
        pixel=[]
        for k in range(3):
            noise = innovations[pos*3+k]*0.85 + rng.gauss(0,1)*0.53
            innovations[pos*3+k]=noise
            value=max(0.0,min(0.999,(1-blend)*prediction[k]+blend*prior[k]
                              +variation*noise))
            pixel.append(value)
            rgb_output[pos*3+k]=int(value*255)
        updated[pos]=quantized(*pixel)
    return bytes(updated),bytes(rgb_output)


def holdout_rollout(weights,frames,cutoff,steps=4):
    """Causal free-running multi-step MSE, not teacher-forced one-step predictions.

    Start with the last two training-prefix frames and predict heldout frames.
    Neither predictions nor their inputs use ground-truth heldout frames.
    """
    older,recent=frames[cutoff-2],frames[cutoff-1]
    baseline=recent
    prediction_error=baseline_error=0
    count=0
    for t in range(cutoff,min(len(frames),cutoff+steps)):
        upcoming=bytearray(N)
        for pos in range(N):
            _,next_rgb=forward(weights,feature(older,recent,pos,t/(len(frames)-1)))
            upcoming[pos]=quantized(*[min(.999,c) for c in next_rgb])
            expected=colors(frames[t][pos])
            guessed=colors(upcoming[pos])
            initial=colors(baseline[pos])
            prediction_error+=sum((a-b)**2 for a,b in zip(guessed,expected))
            baseline_error+=sum((a-b)**2 for a,b in zip(initial,expected))
            count+=3
        older,recent=recent,bytes(upcoming)
    if count==0:
        raise ValueError("No heldout rollout targets")
    return prediction_error/count,baseline_error/count,count//3


def train(root,output,rights_ref,selected=None,seed=42,epochs=2):
    validate_output_dir(output)
    validate_label(rights_ref)
    if type(seed) is not int or not 0<=seed<=MAX_SEED:
        raise ValueError("Training seed must be a 31-bit integer")
    if type(epochs) is not int or not 1<=epochs<=MAX_EPOCHS:
        raise ValueError("Train using 1–4 CPU epochs")
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Video root must be a real local directory")
    names=list(selected) if selected is not None else sorted(
        p.name for p in root.iterdir() if p.is_file() and p.suffix.lower()==".mp4")
    if not 1<=len(names)<=MAX_SOURCES or len(set(n.casefold() for n in names))!=len(names):
        raise ValueError("Select 1–8 distinct local video files")
    sources=[(name,checked_input(root,name)) for name in names]
    grid=[[0.,0.,0.] for _ in range(GRID_W*GRID_H)]
    grid_counts=[0]*(GRID_W*GRID_H)
    shifts=[0]*9
    training=[]
    holdout=[]
    cases=[]
    receipts=[]
    for name,path in sources:
        frames,actual=read_frames(path)
        cutoff=max(7,(len(frames)*3)//4)
        for i in range(2,len(frames)):
            rng=random.Random((i+1)*13007+len(frames))
            positions=rng.sample(range(N),POSITIONS_PER_PAIR)
            samples=[(frames[i-2],frames[i-1],frames[i],pos,i/(len(frames)-1))
                     for pos in positions]
            (training if i<cutoff else holdout).extend(samples)
        for frame in frames[:cutoff]:
            for pos,state in enumerate(frame):
                x,y=pos%W,pos//W
                cell=(y*GRID_H//H)*GRID_W+x*GRID_W//W
                for channel,value in enumerate(colors(state)):
                    grid[cell][channel]+=value
                grid_counts[cell]+=1
        for i in range(1,cutoff):
            shifts[observed_shift(frames[i-1],frames[i])]+=1
        cases.append((frames,cutoff))
        receipts.append({
            "file":name,"sha256":sha256(path),"rights_ref":rights_ref,
            "decoded_frames":actual,"used_frames":len(frames),
            "train_frames":cutoff,"holdout_frames":len(frames)-cutoff,
        })
    if not training or not holdout:
        raise ValueError("Insufficient train and heldout video pairs")
    grid=[[round(x/n,8) for x in row] for row,n in zip(grid,grid_counts)]
    weights=create_weights(seed)
    reference=training[:min(128,len(training))]
    before,_=mse(weights,reference)
    rng=random.Random(seed+11)
    for _ in range(epochs):
        rng.shuffle(training)
        for example in training:
            sgd(weights,example)
    after,_=mse(weights,reference)
    one_step,holdout_persistence=mse(weights,holdout)
    rollouts=[holdout_rollout(weights,frames,cutoff) for frames,cutoff in cases]
    examples=sum(x[2] for x in rollouts)
    rollout=sum(x[0]*x[2] for x in rollouts)/examples
    rollout_baseline=sum(x[1]*x[2] for x in rollouts)/examples
    metrics={
        "training_examples":len(training),"holdout_examples":len(holdout),
        "training_mse_before":round(before,8),
        "training_mse_after":round(after,8),
        "one_step_holdout_mse":round(one_step,8),
        "one_step_persistence_mse":round(holdout_persistence,8),
        "four_step_rollout_mse":round(rollout,8),
        "four_step_static_baseline_mse":round(rollout_baseline,8),
        "rollout_evaluated_pixels":examples,
        "interpretation":"Observed pixel MSE and free-running four-step rollout versus fixed-frame baseline, not photorealism.",
    }
    model={
        "version":2,"kind":"cpu_neural_spatiotemporal_video",
        "neural_network":True,"text_to_video":False,"model_generation":True,
        "architecture":LAYOUT,"width":W,"height":H,"fps":FPS,
        "source_count":len(receipts),"sources":receipts,"seed":seed,
        "epochs":epochs,"weights":weights,"start_grid":grid,
        "motion_histogram":shifts,"metrics":metrics,
    }
    raw=json.dumps(model,separators=(",",":"),allow_nan=False).encode()
    if len(raw)>MAX_MODEL_BYTES:
        raise ValueError("Neural v2 checkpoint exceeds 128 KiB")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-neural-v2-train-",dir=output.parent))
    try:
        checkpoint=stage/"model.json"
        checkpoint.write_bytes(raw+b"\n")
        report={
            "version":2,"kind":"cpu_neural_spatiotemporal_training",
            "neural_network":True,"text_to_video":False,
            "model_sha256":sha256(checkpoint),
            "architecture":LAYOUT,"width":W,"height":H,"fps":FPS,
            "seed":seed,"epochs":epochs,"training_sources":receipts,
            "training_source_count":len(receipts),"metrics":metrics,
            "note":"Genuine two-frame neural pixel baseline; not a production neural diffusion or text-to-video model.",
        }
        (stage/"training-report.json").write_text(json.dumps(report,indent=2)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def read_model(path):
    if path.is_symlink() or not path.is_file() or not 0<path.stat().st_size<=MAX_MODEL_BYTES:
        raise ValueError("Neural v2 checkpoint must be a bounded local file")
    try:
        model=json.loads(path.read_bytes(),object_pairs_hook=unique_keys)
    except (UnicodeError,json.JSONDecodeError) as error:
        raise ValueError("Invalid neural v2 model JSON") from error
    if (not isinstance(model,dict) or model.get("version")!=2 or
            model.get("kind")!="cpu_neural_spatiotemporal_video" or
            model.get("neural_network") is not True or
            model.get("text_to_video") is not False or
            model.get("model_generation") is not True or
            model.get("architecture")!=LAYOUT or
            model.get("width")!=W or model.get("height")!=H or model.get("fps")!=FPS):
        raise ValueError("Not a valid 48x28 two-frame neural v2 model")
    def matrix(values,rows,cols):
        return (isinstance(values,list) and len(values)==rows and
                all(isinstance(row,list) and len(row)==cols and
                    all(type(n) in (int,float) and math.isfinite(n) and abs(n)<=30
                        for n in row) for row in values))
    def vector(values,length):
        return (isinstance(values,list) and len(values)==length and
                all(type(n) in (int,float) and math.isfinite(n) and abs(n)<=30 for n in values))
    w=model.get("weights")
    if not isinstance(w,dict) or set(w)!={"w1","b1","w2","b2"} or not (
            matrix(w["w1"],HIDDEN,INPUTS) and vector(w["b1"],HIDDEN) and
            matrix(w["w2"],OUTPUTS,HIDDEN) and vector(w["b2"],OUTPUTS)):
        raise ValueError("Malformed or nonfinite neural v2 weights")
    grid=model.get("start_grid")
    if not matrix(grid,GRID_W*GRID_H,3) or any(
            not 0<=c<=1 for cell in grid for c in cell):
        raise ValueError("Invalid trained 48x28 neural color grid")
    motion=model.get("motion_histogram")
    if (not isinstance(motion,list) or len(motion)!=9 or
            any(type(v) is not int or not 0<=v<=MAX_SOURCES*MAX_SOURCE_FRAMES
                for v in motion) or sum(motion)<1):
        raise ValueError("Invalid trained motion histogram")
    sources=model.get("sources")
    if (not isinstance(sources,list) or not 1<=len(sources)<=MAX_SOURCES or
            model.get("source_count")!=len(sources)):
        raise ValueError("Incomplete neural source provenance")
    for row in sources:
        if (not isinstance(row,dict) or not isinstance(row.get("sha256"),str) or
                len(row["sha256"])!=64 or
                any(c not in "0123456789abcdef" for c in row["sha256"])):
            raise ValueError("Invalid source SHA-256")
        validate_label(row.get("rights_ref"))
    if (type(model.get("seed")) is not int or not 0<=model["seed"]<=MAX_SEED or
            type(model.get("epochs")) is not int or not 1<=model["epochs"]<=MAX_EPOCHS):
        raise ValueError("Invalid neural training parameters")
    metrics=model.get("metrics")
    keys=("training_mse_before","training_mse_after","one_step_holdout_mse",
          "one_step_persistence_mse","four_step_rollout_mse",
          "four_step_static_baseline_mse")
    if (not isinstance(metrics,dict) or
            any(type(metrics.get(k)) not in (int,float) or
                not math.isfinite(metrics[k]) or metrics[k]<0 for k in keys)):
        raise ValueError("Missing measured neural v2 evaluation metrics")
    return model


def sample_frames(model,seconds,seed,stability=45,variation=6):
    if type(seconds) is not int or not 1<=seconds<=MAX_SAMPLE_SECONDS:
        raise ValueError("Neural v2 samples must be 1–8 seconds")
    if type(seed) is not int or not 0<=seed<=MAX_SEED:
        raise ValueError("Sampling seed must be an unsigned 31-bit integer")
    if type(stability) is not int or not 0<=stability<=85:
        raise ValueError("Stability must be an integer 0–85")
    if type(variation) is not int or not 0<=variation<=20:
        raise ValueError("Variation must be an integer 0–20")
    rng=random.Random(seed)
    initial=bytearray(N)
    for pos in range(N):
        x,y=pos%W,pos//W
        cell=(y*GRID_H//H)*GRID_W+x*GRID_W//W
        rgb0=[max(0,min(.999,color+rng.uniform(-.08,.08)))
              for color in model["start_grid"][cell]]
        initial[pos]=quantized(*rgb0)
    older=recent=bytes(initial)
    frames=[sample_rgb(initial)]
    innovations=[0.0]*(N*3)
    blend=stability/100
    amount=variation/100
    for step in range(1,seconds*FPS):
        shift=rng.choices(range(9),weights=model["motion_histogram"])[0]
        dx,dy=shift%3-1,shift//3-1
        move=lambda states:bytes(states[((y-dy)%H)*W+((x-dx)%W)]
                                 for y in range(H) for x in range(W))
        moved_recent=move(recent)
        moved_older=move(older)
        updated,rgb_frame=sample_next(
            model["weights"],moved_older,moved_recent,
            step/max(1,seconds*FPS-1),blend,amount,rng,innovations)
        older,recent=recent,updated
        frames.append(rgb_frame)
    return frames


def generate(model_path,output,seconds=2,seed=42,profile="landscape",
             quality="standard",stability=45,variation=6):
    validate_output_dir(output)
    if profile not in ("landscape","portrait","square") or quality not in ("standard","high"):
        raise ValueError("Unsupported offline neural v2 output preset")
    model=read_model(model_path)
    frames=sample_frames(model,seconds,seed,stability,variation)
    raw=b"".join(frames)
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-neural-v2-sample-",dir=output.parent))
    try:
        clip=stage/"clip-01.mp4"
        try:
            cmd=[
                "ffmpeg","-nostdin","-hide_banner","-v","error","-threads","1",
                "-f","rawvideo","-pixel_format","rgb24","-video_size",f"{W}x{H}",
                "-framerate",str(FPS),"-i","pipe:0","-map","0:v:0",
                "-an","-sn","-dn","-map_metadata","-1",
                "-frames:v",str(len(frames)),"-c:v","libx264",
                "-preset","ultrafast","-crf","23","-pix_fmt","yuv420p",
                "-movflags","+faststart",str(clip),
            ]
            run=subprocess.run(cmd,input=raw,capture_output=True,check=False,timeout=90)
        except (OSError,subprocess.TimeoutExpired) as error:
            raise ValueError("Offline CPU H264 encoder unavailable or timed out") from error
        if run.returncode or not clip.is_file() or not 0<clip.stat().st_size<=MAX_OUTPUT_BYTES:
            raise ValueError("Neural v2 clip encoding failed")
        if video_info(probe(clip,count_frames=True))!=(W,H,len(frames)):
            raise ValueError("Actual decoded 48x28 neural frames do not match request")
        board={"version":2,"shots":[{
            "file":clip.name,"source_sha256":sha256(clip),
            "start_frame":0,"frames":len(frames),
            "caption":"Two-frame learned neural CPU video texture (not diffusion)",
            "rights_ref":"derived-from-reviewed-training-footage",
            "fade_in_frames":0,"fade_out_frames":0,
        }]}
        board_path=stage/"eternyx-video-v2.json"
        board_path.write_text(json.dumps(board,indent=2)+"\n")
        rendered=render(board_path,stage,stage/"render",profile=profile,quality=quality)
        report={
            "version":2,"kind":"cpu_neural_spatiotemporal_sample",
            "neural_network":True,"text_to_video":False,"model_generation":True,
            "model_sha256":sha256(model_path),"fps":FPS,
            "width":W,"height":H,"seconds":seconds,"sample_seed":seed,
            "profile":profile,"quality":quality,
            "stability_percent":stability,"variation_percent":variation,
            "raw_frames_sha256":hashlib.sha256(raw).hexdigest(),
            "temporal_metrics":raw_diagnostics(frames),
            "sample_clip_sha256":sha256(clip),
            "final_mp4_sha256":rendered["video"]["sha256"],
            "storyboard_sha256":sha256(board_path),
            "holdout_evaluation":model["metrics"],
            "training_source_sha256":[row["sha256"] for row in model["sources"]],
            "note":"Real two-frame neural video training/sampling; not photorealistic text-to-video.",
        }
        (stage/"generation-report.json").write_text(
            json.dumps(report,indent=2,allow_nan=False)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest="command",required=True)
    fit=sub.add_parser("train")
    fit.add_argument("--input",type=Path,required=True)
    fit.add_argument("--output",type=Path,required=True)
    fit.add_argument("--rights-ref",required=True)
    fit.add_argument("--clip",action="append")
    fit.add_argument("--seed",type=int,default=42)
    fit.add_argument("--epochs",type=int,default=2)
    sample=sub.add_parser("generate")
    sample.add_argument("--model",type=Path,required=True)
    sample.add_argument("--output",type=Path,required=True)
    sample.add_argument("--seconds",type=int,default=2)
    sample.add_argument("--seed",type=int,default=42)
    sample.add_argument("--profile",choices=("landscape","portrait","square"),default="landscape")
    sample.add_argument("--quality",choices=("standard","high"),default="standard")
    sample.add_argument("--stability",type=int,default=45)
    sample.add_argument("--variation",type=int,default=6)
    args=parser.parse_args()
    try:
        if args.command=="train":
            result=train(args.input,args.output,args.rights_ref,args.clip,args.seed,args.epochs)
            print(json.dumps({"model":str(args.output/"model.json"),
                "model_sha256":result["model_sha256"],"metrics":result["metrics"]}))
        else:
            result=generate(args.model,args.output,args.seconds,args.seed,args.profile,
                            args.quality,args.stability,args.variation)
            print(json.dumps({"video":str(args.output/"render"/"video.mp4"),
                "video_sha256":result["final_mp4_sha256"],"model_sha256":result["model_sha256"]}))
    except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__=="__main__":
    main()
