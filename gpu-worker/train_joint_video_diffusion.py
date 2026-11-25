"""Experimental CPU-only, tag-conditioned joint clip diffusion baseline.

Trains a small neural x0 denoiser on noisy whole-video tensors from local MP4s.
Reverse DDIM starts with random noise, not an input image or training video.
This is a tiny research model (16x12, 16 frames), not natural-language T2V.
NumPy CPU only. Checkpoint uses bounded numeric JSON, never pickle.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile

from assemble_video_storyboard import unique_keys
from learn_cpu_video_texture import checked_input, validate_label, validate_output_dir, run_ffmpeg
from render_video_timeline import probe, video_info, sha256

W, H, F, FPS = 16, 12, 16, 16
D, HIDDEN = W * H * F * 3, 24
STEPS, TAGS = 12, 2
MAX_SOURCES, MAX_UPDATES, MAX_MODEL_BYTES = 12, 600, 16 * 1024 * 1024
KIND = "cpu_joint_clip_diffusion_v1"


def numpy():
    try:
        import numpy as np
    except ImportError as error:
        raise ValueError("Install NumPy in your local CPU Python environment") from error
    return np


def bounded_json(path, maximum):
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= maximum:
        raise ValueError("Expected a bounded regular JSON file")
    return json.loads(path.read_bytes(), object_pairs_hook=unique_keys)


def check_seed(seed):
    if type(seed) is not int or not 0 <= seed < 2**31:
        raise ValueError("Seed must be an unsigned 31-bit integer")


def check_tag(tag):
    if not isinstance(tag, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{1,23}", tag):
        raise ValueError("Use a trained lowercase tag of 2-24 characters")
    return tag


def dataset(root, manifest):
    np = numpy()
    rows = bounded_json(manifest, 16384)
    if not isinstance(rows, list) or not 4 <= len(rows) <= MAX_SOURCES:
        raise ValueError("Supply 4-12 approved source records, two tags with train and holdout files")
    seen_names, seen_hashes, seen_decoded = set(), set(), set()
    train, heldout, provenance = [], [], []
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"file", "sha256", "tag", "split", "rights_ref"}:
            raise ValueError("Invalid dataset source record")
        path = checked_input(root, row["file"])
        tag = check_tag(row["tag"])
        validate_label(row["rights_ref"])
        if row["split"] not in ("train", "holdout"):
            raise ValueError("Dataset split must be train or holdout")
        actual_hash = sha256(path)
        if row["sha256"] != actual_hash or actual_hash in seen_hashes or row["file"].casefold() in seen_names:
            raise ValueError("Source hash mismatch or duplicate file across dataset splits")
        seen_names.add(row["file"].casefold())
        seen_hashes.add(actual_hash)
        _, _, count = video_info(probe(path, count_frames=True), expected_fps=FPS)
        if count < F:
            raise ValueError("Each approved source needs at least 16 native 16 FPS frames")
        length = min(count, 48)
        raw = run_ffmpeg(["ffmpeg", "-nostdin", "-v", "error", "-threads", "1",
            "-protocol_whitelist", "file,pipe", "-i", str(path), "-map", "0:v:0",
            "-vf", f"scale={W}:{H}:flags=area,format=rgb24", "-frames:v", str(length),
            "-an", "-sn", "-dn", "-f", "rawvideo", "pipe:1"])
        if len(raw) != length * W * H * 3 or sha256(path) != actual_hash:
            raise ValueError("Source changed or decoded frame count disagrees")
        clips = []
        # Exact duplicate decoded windows are forbidden, even under different
        # containers. This does not detect near duplicates or related footage.
        for offset in range(0, length - F + 1, F):
            segment = raw[offset*W*H*3:(offset+F)*W*H*3]
            digest = hashlib.sha256(segment).hexdigest()
            if digest in seen_decoded:
                raise ValueError("Duplicate decoded training/holdout clip")
            seen_decoded.add(digest)
            clips.append(np.frombuffer(segment, dtype=np.uint8).astype(np.float32) / 127.5 - 1)
        target = train if row["split"] == "train" else heldout
        target.extend((tag, clip) for clip in clips)
        provenance.append({**row, "decoded_frames": count, "windows": len(clips)})
    tags = sorted({tag for tag, _ in train})
    if len(tags) != TAGS or {tag for tag, _ in heldout} != set(tags):
        raise ValueError("Exactly two tags, each with separate train and holdout source files, are required")
    return tags, train, heldout, provenance


def schedule():
    np = numpy()
    # Cumulative signal retention; final state is almost pure Gaussian noise.
    return np.cos(np.linspace(0, np.pi/2, STEPS+1, dtype=np.float64))**2


def weights(seed):
    np = numpy()
    rng = np.random.default_rng(seed)
    return {
        "w1": rng.normal(0, 1/(D+3)**.5, (D+3, HIDDEN)).astype(np.float32),
        "b1": np.zeros(HIDDEN, np.float32),
        "w2": rng.normal(0, .02, (HIDDEN, D)).astype(np.float32),
        "b2": np.zeros(D, np.float32),
        # Explicit learned conditional residual, initialized to zero. Unlike
        # the tiny one-hot input alone, it cannot be drowned out by 9216 pixels.
        "tag_bias": np.zeros((TAGS, D), np.float32),
    }


def condition(x, times, labels):
    np = numpy()
    return np.concatenate((x, np.asarray(times, np.float32).reshape(-1, 1)/STEPS,
                           np.eye(TAGS, dtype=np.float32)[labels]), axis=1)


def forward(model, noisy, times, labels):
    np = numpy()
    inp = condition(noisy, times, labels)
    hidden = np.tanh(inp @ model["w1"] + model["b1"])
    # Train an unsaturated x0 head; clamp the estimate at inference, not
    # inside the training gradient. Both shared and tag-specific weights learn.
    predicted = hidden @ model["w2"] + model["b2"] + model["tag_bias"][labels]
    return inp, hidden, predicted


def batch(items, tags, rng, indices, times=None):
    np = numpy()
    clean = np.stack([items[i][1] for i in indices])
    labels = np.array([tags.index(items[i][0]) for i in indices])
    if times is None:
        times = rng.integers(1, STEPS+1, size=len(indices))
    alpha = schedule()[times].astype(np.float32).reshape(-1, 1)
    noise = rng.standard_normal(clean.shape, dtype=np.float32)
    noisy = np.sqrt(alpha)*clean + np.sqrt(1-alpha)*noise
    return clean, noisy, times, labels


def evaluate(model, items, tags):
    np = numpy()
    rng = np.random.default_rng(601)
    losses, baselines, swapped_losses = [], [], []
    for step in (3, 6, 9, 12):
        for i in range(len(items)):
            clean, noisy, t, y = batch(items, tags, rng, [i], np.array([step]))
            _, _, pred = forward(model, noisy, t, y)
            losses.append(float(np.mean((np.clip(pred,-1,1)-clean)**2)))
            _, _, swapped = forward(model, noisy, t, 1-y)
            swapped_losses.append(float(np.mean((np.clip(swapped,-1,1)-clean)**2)))
            baselines.append(float(np.mean((np.clip(noisy,-1,1)-clean)**2)))
    return {"denoising_mse": float(np.mean(losses)), "noisy_input_mse": float(np.mean(baselines)),
            "swapped_tag_mse": float(np.mean(swapped_losses)),
            "windows": len(items), "noise_levels": [3,6,9,12]}


def fit(train, heldout, tags, seed, updates):
    np = numpy()
    rng = np.random.default_rng(seed)
    model = weights(seed)
    before = evaluate(model, train, tags)
    holdout_before = evaluate(model, heldout, tags)
    m = {k: np.zeros_like(v) for k,v in model.items()}
    v = {k: np.zeros_like(v) for k,v in model.items()}
    pools = [[i for i,(label,_) in enumerate(train) if label==tag] for tag in tags]
    for step in range(1, updates+1):
        indices = np.concatenate([rng.choice(pool, size=2, replace=True) for pool in pools])
        rng.shuffle(indices)
        clean, noisy, times, labels = batch(train, tags, rng, indices)
        inp, h, pred = forward(model, noisy, times, labels)
        delta = (2/pred.size)*(pred-clean)
        tag_grad = np.zeros_like(model["tag_bias"])
        np.add.at(tag_grad, labels, delta)
        back = (delta @ model["w2"].T)*(1-h**2)
        grad = {"w2": h.T @ delta, "b2": delta.sum(axis=0), "tag_bias": tag_grad,
                "w1": inp.T @ back, "b1": back.sum(axis=0)}
        for k in model:
            m[k] = .9*m[k]+.1*grad[k]
            v[k] = .999*v[k]+.001*grad[k]**2
            model[k] -= .002*(m[k]/(1-.9**step))/(np.sqrt(v[k]/(1-.999**step))+1e-8)
    metrics = {"train_before": before, "train_after": evaluate(model, train, tags),
               "holdout_before": holdout_before, "holdout_after": evaluate(model, heldout, tags),
               "interpretation": "Denoising MSE on fixed noise draws; not perceptual quality or prompt understanding."}
    return model, metrics


def train(root, manifest, output, seed=42, updates=120):
    validate_output_dir(output)
    check_seed(seed)
    if type(updates) is not int or not 1 <= updates <= MAX_UPDATES:
        raise ValueError("Training updates must be 1-600")
    tags, training, heldout, provenance = dataset(root, manifest)
    model, metrics = fit(training, heldout, tags, seed, updates)
    checkpoint = {"kind": KIND, "version": 1, "tags": tags,
                  "shape": [F,H,W,3], "fps": FPS, "diffusion_steps": STEPS,
                  "training_seed": seed, "updates": updates, "sources": provenance,
                  "weights": {k:v.tolist() for k,v in model.items()}}
    encoded = json.dumps(checkpoint, separators=(",",":"), allow_nan=False).encode("utf-8")
    if len(encoded) > MAX_MODEL_BYTES:
        raise ValueError("Checkpoint exceeds safe size")
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-diffusion-",dir=output.parent))
    try:
        (stage/"model.json").write_bytes(encoded)
        report = {"kind": KIND, "model_sha256": sha256(stage/"model.json"),
                  "training_updates": updates, "parameters": sum(v.size for v in model.values()),
                  "sources": provenance, "metrics": metrics,
                  "whole_file_holdout": True, "text_to_video": False}
        (stage/"training-report.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def load(path):
    np = numpy()
    data = bounded_json(path, MAX_MODEL_BYTES)
    if not isinstance(data,dict) or data.get("kind")!=KIND or data.get("version")!=1 or data.get("shape")!=[F,H,W,3] or data.get("fps")!=FPS or data.get("diffusion_steps")!=STEPS:
        raise ValueError("Incompatible joint diffusion checkpoint")
    tags = data.get("tags")
    if not isinstance(tags,list) or len(tags)!=TAGS or len(set(check_tag(t) for t in tags))!=TAGS:
        raise ValueError("Invalid checkpoint tags")
    arrays = data.get("weights")
    shapes = {"w1":(D+3,HIDDEN),"b1":(HIDDEN,),"w2":(HIDDEN,D),"b2":(D,), "tag_bias":(TAGS,D)}
    if not isinstance(arrays,dict) or set(arrays)!=set(shapes):
        raise ValueError("Invalid checkpoint weights")
    model = {}
    for k,shape in shapes.items():
        try:
            a = np.asarray(arrays[k],dtype=np.float32)
        except (ValueError, TypeError, OverflowError) as error:
            raise ValueError("Invalid numeric checkpoint") from error
        if a.shape!=shape or not np.isfinite(a).all() or np.max(np.abs(a))>100:
            raise ValueError("Invalid checkpoint tensor shape or values")
        model[k] = a
    return tags, model


def sample(model, tags, tag, seed):
    np = numpy()
    check_seed(seed)
    if tag not in tags:
        raise ValueError("Unknown trained tag; free-form prompts are not supported")
    rng = np.random.default_rng(seed)
    x = rng.standard_normal((1,D),dtype=np.float32)
    alphas = schedule()
    for t in range(STEPS,0,-1):
        _,_, clean = forward(model,x,np.array([t]),np.array([tags.index(tag)]))
        clean = np.clip(clean,-1,1)
        # Deterministic DDIM reverse update using learned x0 estimates.
        eps = (x-np.sqrt(alphas[t])*clean)/np.sqrt(1-alphas[t])
        x = (np.sqrt(alphas[t-1])*clean + np.sqrt(1-alphas[t-1])*eps).astype(np.float32)
    return np.rint((np.clip(x,-1,1)+1)*127.5).astype(np.uint8).reshape(F,H,W,3)


def generate(checkpoint, output, tag, seed=42):
    np = numpy()
    validate_output_dir(output)
    model_hash = sha256(checkpoint) if checkpoint.is_file() and not checkpoint.is_symlink() and checkpoint.stat().st_size<=MAX_MODEL_BYTES else None
    tags, model = load(checkpoint)
    if model_hash != sha256(checkpoint):
        raise ValueError("Checkpoint changed while loading")
    frames = sample(model,tags,tag,seed)
    raw = frames.tobytes()
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-diffusion-sample-",dir=output.parent))
    try:
        clip = stage/"generated.mp4"
        # Encode native 16x12 samples at 16fps; scale explicitly for playable
        # output, not a claimed increase in learned resolution.
        run_ffmpeg(["ffmpeg","-nostdin","-v","error","-threads","1","-f","rawvideo",
                    "-pixel_format","rgb24","-video_size",f"{W}x{H}","-framerate",str(FPS),
                    "-i","pipe:0","-vf","scale=256:192:flags=neighbor","-an","-sn","-dn",
                    "-frames:v",str(F),"-c:v","libx264","-pix_fmt","yuv420p",
                    "-movflags","+faststart",str(clip)],stdin=raw)
        if video_info(probe(clip,count_frames=True),expected_fps=FPS)!=(256,192,F):
            raise ValueError("Generated MP4 failed frame verification")
        report = {"kind": KIND, "model_sha256": model_hash, "video_sha256":sha256(clip),
                  "raw_sample_sha256":hashlib.sha256(raw).hexdigest(),
                  "tag":tag,"seed":seed,"native_shape":[F,H,W,3],"fps":FPS,"seconds":F/FPS,
                  "encoded_size":[256,192],"distinct_raw_frames":len({f.tobytes() for f in frames}),
                  "mean_adjacent_rgb_delta":float(np.mean(np.abs(np.diff(frames.astype(np.float32),axis=0)))/255),
                  "source_media_used_at_inference":False,"model_generation":True,"text_to_video":False}
        (stage/"generation-report.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest="command",required=True)
    fit_parser=sub.add_parser("train")
    for name in ("input","manifest","output"):
        fit_parser.add_argument("--"+name,type=Path,required=True)
    fit_parser.add_argument("--seed",type=int,default=42)
    fit_parser.add_argument("--updates",type=int,default=120)
    gen=sub.add_parser("generate")
    gen.add_argument("--model",type=Path,required=True)
    gen.add_argument("--output",type=Path,required=True)
    gen.add_argument("--tag",required=True)
    gen.add_argument("--seed",type=int,default=42)
    args=parser.parse_args()
    try:
        report = train(args.input,args.manifest,args.output,args.seed,args.updates) if args.command=="train" else generate(args.model,args.output,args.tag,args.seed)
        print(json.dumps(report,allow_nan=False))
    except (OSError,ValueError,TypeError,KeyError) as error:
        parser.error(str(error))


if __name__=="__main__":
    main()
