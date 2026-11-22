"""Tiny REAL neural autoregressive video baseline, trained and sampled entirely on CPU.

One hidden layer with trainable matrix weights, tanh, sigmoid and explicit SGD
backpropagation. Fits low-resolution next-frame RGB on RIGHTS-REVIEWED local
16 FPS video, then synthesizes new pixels from learned weights and a seeded
random process. Produces actual H.264 MP4 with the existing offline renderer.

This is NOT pretrained diffusion, NOT prompt-to-video, and NOT realistic video.
Python standard library and the existing locally installed FFmpeg only.
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
from learn_cpu_video_texture import (WIDTH, HEIGHT, PIXELS, COLORS, decode,
                                    checked_input, validate_label, validate_output_dir,
                                    learn_motion)
from render_video_timeline import FPS, probe, video_info, render, sha256

INPUTS = 12
HIDDEN = 12
OUTPUTS = 3
GRID_W = 8
GRID_H = 6
MAX_SOURCES = 8
MAX_FRAMES = 64
MAX_SAMPLE_SECONDS = 8
MAX_MODEL_BYTES = 128 * 1024
MAX_SAMPLES_PER_PAIR = 48
MAX_EPOCHS = 4
DEFAULT_EPOCHS = 3
MAX_SEED = 2**31 - 1
MAX_OUTPUT_BYTES = 64 * 1024 * 1024


def rgb(state):
    return ((state >> 4) / 3, ((state >> 2) & 3) / 3, (state & 3) / 3)


def encode_state(r, g, b):
    return ((min(3, int(r * 4)) << 4) |
            (min(3, int(g * 4)) << 2) |
            min(3, int(b * 4)))


def features(previous, pos, fraction):
    x, y = pos % WIDTH, pos // WIDTH
    here = rgb(previous[pos])
    left = rgb(previous[y * WIDTH + (x - 1) % WIDTH])
    above = rgb(previous[((y - 1) % HEIGHT) * WIDTH + x])
    return (*here, *left, *above,
            x / (WIDTH - 1), y / (HEIGHT - 1), fraction)


def activation(value):
    # Bound exponent to avoid overflow while parsing adversarial weights.
    return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, value))))


def init_weights(seed):
    rng = random.Random(seed)
    return {
        "w1": [[rng.uniform(-0.15, 0.15) for _ in range(INPUTS)]
               for _ in range(HIDDEN)],
        "b1": [0.0] * HIDDEN,
        "w2": [[rng.uniform(-0.15, 0.15) for _ in range(HIDDEN)]
               for _ in range(OUTPUTS)],
        "b2": [0.0] * OUTPUTS,
    }


def predict(weights, x):
    hidden = [math.tanh(sum(w * v for w, v in zip(row, x)) + bias)
              for row, bias in zip(weights["w1"], weights["b1"])]
    outputs = [activation(sum(w * v for w, v in zip(row, hidden)) + bias)
               for row, bias in zip(weights["w2"], weights["b2"])]
    return hidden, outputs


def sample_mse(weights, samples):
    if not samples:
        raise ValueError("Cannot evaluate an empty training/holdout sample set")
    loss = 0.0
    persistence = 0.0
    for old, target, pos, fraction in samples:
        _, pred = predict(weights, features(old, pos, fraction))
        y = rgb(target[pos])
        baseline = rgb(old[pos])
        loss += sum((p - v) ** 2 for p, v in zip(pred, y))
        persistence += sum((p - v) ** 2 for p, v in zip(baseline, y))
    denom = len(samples) * OUTPUTS
    return loss / denom, persistence / denom


def train_example(weights, entry, lr):
    old, target, pos, fraction = entry
    x = features(old, pos, fraction)
    y = rgb(target[pos])
    hidden, outputs = predict(weights, x)
    # d(mean squared error)/d(output preactivation), sigmoid derivative.
    dout = [(2 / OUTPUTS) * (p - desired) * p * (1 - p)
            for p, desired in zip(outputs, y)]
    # Compute hidden derivatives before mutating output weights.
    dh = [(1 - hidden[j] ** 2) *
          sum(dout[k] * weights["w2"][k][j] for k in range(OUTPUTS))
          for j in range(HIDDEN)]
    for k in range(OUTPUTS):
        for j in range(HIDDEN):
            weights["w2"][k][j] -= lr * dout[k] * hidden[j]
        weights["b2"][k] -= lr * dout[k]
    for j in range(HIDDEN):
        for k in range(INPUTS):
            weights["w1"][j][k] -= lr * dh[j] * x[k]
        weights["b1"][j] -= lr * dh[j]


def build_samples(frames, train_end):
    training = []
    holdout = []
    for i in range(1, len(frames)):
        fraction = i / max(1, len(frames) - 1)
        # Deterministic rotating pixel positions cover the whole small frame
        # over the temporal window, rather than accidentally using only its top.
        rng = random.Random(i * 7919 + len(frames))
        positions = rng.sample(range(PIXELS), MAX_SAMPLES_PER_PAIR)
        dst = training if i < train_end else holdout
        for pos in positions:
            dst.append((frames[i - 1], frames[i], pos, fraction))
    return training, holdout


def train(folder, destination, rights_ref, selected=None, seed=42, epochs=DEFAULT_EPOCHS):
    validate_output_dir(destination)
    validate_label(rights_ref)
    if type(seed) is not int or not 0 <= seed <= MAX_SEED:
        raise ValueError("Training seed must be an integer between 0 and 2147483647")
    if type(epochs) is not int or not 1 <= epochs <= MAX_EPOCHS:
        raise ValueError("CPU epochs must be an integer between 1 and 4")
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError("Training source must be a real local folder")
    names = list(selected) if selected is not None else sorted(
        item.name for item in folder.iterdir()
        if item.is_file() and item.name.lower().endswith(".mp4"))
    if not 1 <= len(names) <= MAX_SOURCES or len({n.casefold() for n in names}) != len(names):
        raise ValueError("Choose 1–8 distinct local MP4 sources")
    sources = [(name, checked_input(folder, name)) for name in names]
    grid = [[0.0, 0.0, 0.0] for _ in range(GRID_W * GRID_H)]
    grid_counts = [0] * len(grid)
    motion = [0] * 9
    train_samples = []
    holdout_samples = []
    receipts = []
    for name, path in sources:
        frames, real_count = decode(path)
        frames = frames[:MAX_FRAMES]
        if len(frames) < 8:
            raise ValueError("Each local video needs at least eight decoded frames")
        cutoff = max(6, (len(frames) * 3) // 4)
        new_train, new_holdout = build_samples(frames, cutoff)
        train_samples.extend(new_train)
        holdout_samples.extend(new_holdout)
        for frame in frames[:cutoff]:
            for pos, state in enumerate(frame):
                x, y = pos % WIDTH, pos // WIDTH
                block = (y * GRID_H // HEIGHT) * GRID_W + x * GRID_W // WIDTH
                rgb_color = rgb(state)
                for channel in range(3):
                    grid[block][channel] += rgb_color[channel]
                grid_counts[block] += 1
        for i in range(1, cutoff):
            motion[learn_motion(frames[i - 1], frames[i])] += 1
        receipts.append({
            "file": name, "sha256": sha256(path), "rights_ref": rights_ref,
            "decoded_frames": real_count, "used_frames": len(frames),
            "train_frames": cutoff, "holdout_frames": len(frames) - cutoff,
        })
    if not train_samples or not holdout_samples:
        raise ValueError("Insufficient train/holdout transitions")
    for i, total in enumerate(grid_counts):
        if total < 1:
            raise ValueError("A learned spatial grid cell received no training frames")
        grid[i] = [round(value / total, 8) for value in grid[i]]
    weights = init_weights(seed)
    before, _ = sample_mse(weights, train_samples[:min(128, len(train_samples))])
    rng = random.Random(seed + 91)
    for _ in range(epochs):
        rng.shuffle(train_samples)
        for example in train_samples:
            train_example(weights, example, 0.085)
    after, _ = sample_mse(weights, train_samples[:min(128, len(train_samples))])
    holdout_mse, baseline_mse = sample_mse(weights, holdout_samples)
    metrics = {
        "train_examples": len(train_samples), "holdout_examples": len(holdout_samples),
        "training_mse_before": round(before, 8),
        "training_mse_after": round(after, 8),
        "holdout_neural_mse": round(holdout_mse, 8),
        "holdout_persistence_baseline_mse": round(baseline_mse, 8),
        "interpretation": "Held-out pixel MSE, not realism or text-prompt fidelity.",
    }
    model = {
        "version": 1, "kind": "cpu_tiny_neural_video",
        "neural_network": True, "model_generation": True,
        "text_to_video": False, "architecture": {
            "type": "one_hidden_layer_autoregressive_pixel_mlp",
            "inputs": INPUTS, "hidden": HIDDEN, "outputs": OUTPUTS,
            "activations": ["tanh", "sigmoid"],
        },
        "fps": FPS, "width": WIDTH, "height": HEIGHT,
        "seed": seed, "epochs": epochs, "source_count": len(receipts),
        "sources": receipts,
        "weights": weights, "start_grid": grid,
        "motion_histogram": motion, "metrics": metrics,
    }
    encoded = json.dumps(model, separators=(",", ":"), allow_nan=False).encode()
    if len(encoded) > MAX_MODEL_BYTES:
        raise ValueError("Learned neural model exceeds 128 KiB")
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-neural-train-", dir=destination.parent))
    try:
        checkpoint = stage / "model.json"
        checkpoint.write_bytes(encoded + b"\n")
        report = {
            "version": 1, "kind": "cpu_tiny_neural_video_training",
            "model_sha256": sha256(checkpoint),
            "neural_network": True, "text_to_video": False,
            "architecture": model["architecture"],
            "training_sources": receipts,
            "training_source_count": len(receipts),
            "seed": seed, "epochs": epochs, "metrics": metrics,
            "note": "Tiny neural autoregressive pixel MLP trained with real CPU SGD, not a diffusion/video foundation model.",
        }
        (stage / "training-report.json").write_text(json.dumps(report, indent=2) + "\n")
        validate_output_dir(destination)
        stage.rename(destination)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def read_model(path):
    if (path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_MODEL_BYTES):
        raise ValueError("Trained neural model must be a bounded regular local JSON file")
    try:
        model = json.loads(path.read_bytes(), object_pairs_hook=unique_keys)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("Malformed tiny neural model JSON") from error
    if (not isinstance(model, dict) or model.get("kind") != "cpu_tiny_neural_video" or
            model.get("version") != 1 or model.get("neural_network") is not True or
            model.get("model_generation") is not True or model.get("text_to_video") is not False or
            model.get("fps") != FPS or model.get("width") != WIDTH or model.get("height") != HEIGHT):
        raise ValueError("Not a supported tiny CPU neural video checkpoint")
    if model.get("architecture") != {
        "type": "one_hidden_layer_autoregressive_pixel_mlp",
        "inputs": INPUTS, "hidden": HIDDEN, "outputs": OUTPUTS,
        "activations": ["tanh", "sigmoid"],
    }:
        raise ValueError("Neural architecture differs from supported CPU MLP")
    def float_matrix(value, rows, cols):
        return (isinstance(value, list) and len(value) == rows and
                all(isinstance(row, list) and len(row) == cols and
                    all(type(v) in (int, float) and math.isfinite(v) and abs(v) <= 30
                        for v in row) for row in value))
    def float_vector(value, length):
        return (isinstance(value, list) and len(value) == length and
                all(type(v) in (int, float) and math.isfinite(v) and abs(v) <= 30 for v in value))
    w = model.get("weights")
    if (not isinstance(w, dict) or set(w) != {"w1", "b1", "w2", "b2"} or
            not float_matrix(w["w1"], HIDDEN, INPUTS) or
            not float_vector(w["b1"], HIDDEN) or
            not float_matrix(w["w2"], OUTPUTS, HIDDEN) or
            not float_vector(w["b2"], OUTPUTS)):
        raise ValueError("Checkpoint has malformed or unsafe neural weight tensors")
    grid = model.get("start_grid")
    if (not float_matrix(grid, GRID_W * GRID_H, 3) or
            any(not 0 <= v <= 1 for row in grid for v in row)):
        raise ValueError("Invalid trained color initialization grid")
    shift = model.get("motion_histogram")
    if (not isinstance(shift, list) or len(shift) != 9 or
            any(type(n) is not int or n < 0 or n > 100000 for n in shift) or sum(shift) < 1):
        raise ValueError("No valid learned temporal motion prior")
    sources = model.get("sources")
    if (not isinstance(sources, list) or not 1 <= len(sources) <= MAX_SOURCES or
            model.get("source_count") != len(sources)):
        raise ValueError("Invalid neural training source provenance")
    for source in sources:
        if (not isinstance(source, dict) or not isinstance(source.get("sha256"), str) or
                len(source["sha256"]) != 64 or
                any(c not in "0123456789abcdef" for c in source["sha256"])):
            raise ValueError("Invalid source SHA-256 in neural checkpoint")
        validate_label(source.get("rights_ref"))
    if (type(model.get("seed")) is not int or not 0 <= model["seed"] <= MAX_SEED or
            type(model.get("epochs")) is not int or not 1 <= model["epochs"] <= MAX_EPOCHS):
        raise ValueError("Invalid neural training seed or epochs")
    metrics = model.get("metrics")
    if (not isinstance(metrics, dict) or
            any(type(metrics.get(field)) not in (int, float) or
                not math.isfinite(metrics[field]) or metrics[field] < 0 for field in
                ("training_mse_before", "training_mse_after", "holdout_neural_mse",
                 "holdout_persistence_baseline_mse"))):
        raise ValueError("Invalid measured neural train/holdout evaluation metrics")
    return model


def sample_frames(model, seconds, seed):
    if type(seconds) is not int or not 1 <= seconds <= MAX_SAMPLE_SECONDS:
        raise ValueError("Neural sample duration must be 1–8 seconds")
    if type(seed) is not int or not 0 <= seed <= MAX_SEED:
        raise ValueError("Neural sample seed must be a 31-bit nonnegative integer")
    rng = random.Random(seed)
    grid = model["start_grid"]
    states = bytearray(PIXELS)
    for pos in range(PIXELS):
        x, y = pos % WIDTH, pos // WIDTH
        block = (y * GRID_H // HEIGHT) * GRID_W + x * GRID_W // WIDTH
        mean = grid[block]
        values = [max(0.0, min(0.999, color + rng.uniform(-0.11, 0.11))) for color in mean]
        states[pos] = encode_state(*values)
    frames = []
    for step in range(seconds * FPS):
        if step:
            # Motion frequencies are learned from consecutive real source frames.
            shift = rng.choices(range(9), weights=model["motion_histogram"], k=1)[0]
            dx, dy = shift % 3 - 1, shift // 3 - 1
            moved = bytes(states[((y - dy) % HEIGHT) * WIDTH + ((x - dx) % WIDTH)]
                          for y in range(HEIGHT) for x in range(WIDTH))
            updated = bytearray(PIXELS)
            visual = bytearray(PIXELS * 3)
            fraction = step / max(1, seconds * FPS - 1)
            for pos in range(PIXELS):
                _, prediction = predict(model["weights"], features(moved, pos, fraction))
                # Bounded seeded innovation avoids a static replay of the mean
                # regression result. Network still supplies the dominant signal.
                colors = [max(0.0, min(0.999, value + rng.gauss(0, 0.07)))
                          for value in prediction]
                updated[pos] = encode_state(*colors)
                for k in range(3):
                    visual[pos * 3 + k] = int(colors[k] * 255)
            states = updated
            frames.append(bytes(visual))
        else:
            initial = bytearray(PIXELS * 3)
            for pos, state in enumerate(states):
                for channel, value in enumerate(rgb(state)):
                    initial[pos * 3 + channel] = int(255 * value)
            frames.append(bytes(initial))
    return frames


def generate(model_path, destination, seconds=2, seed=42,
             profile="landscape", quality="standard"):
    validate_output_dir(destination)
    if profile not in ("landscape", "portrait", "square") or quality not in ("standard", "high"):
        raise ValueError("Unsupported neural sample output profile or quality")
    model = read_model(model_path)
    frames = sample_frames(model, seconds, seed)
    if len(frames) != seconds * FPS or any(len(raw) != PIXELS * 3 for raw in frames):
        raise ValueError("Generated neural RGB frame budget incorrect")
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-neural-sample-", dir=destination.parent))
    try:
        clip = stage / "clip-01.mp4"
        args = [
            "ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-threads", "1",
            "-f", "rawvideo", "-pixel_format", "rgb24",
            "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS),
            "-i", "pipe:0", "-map", "0:v:0", "-an", "-sn", "-dn",
            "-map_metadata", "-1", "-frames:v", str(len(frames)),
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(clip),
        ]
        try:
            proc = subprocess.run(args, input=b"".join(frames), capture_output=True,
                                  timeout=90, check=False)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise ValueError("Local FFmpeg missing or CPU video encode timed out") from error
        if proc.returncode or not clip.is_file() or not 0 < clip.stat().st_size <= MAX_OUTPUT_BYTES:
            raise ValueError("Local neural H.264 encoder failed")
        if video_info(probe(clip, count_frames=True)) != (WIDTH, HEIGHT, len(frames)):
            raise ValueError("Neural MP4 failed actual decoded frame count checks")
        board = {"version": 2, "shots": [{
            "file": "clip-01.mp4", "source_sha256": sha256(clip),
            "start_frame": 0, "frames": len(frames),
            "caption": "Original tiny neural CPU video texture (not diffusion)",
            "rights_ref": "derived-from-owner-reviewed-neural-training-footage",
            "fade_in_frames": 0, "fade_out_frames": 0,
        }]}
        path = stage / "eternyx-video-v2.json"
        path.write_text(json.dumps(board, indent=2) + "\n", encoding="utf-8")
        result = render(path, stage, stage / "render", profile=profile, quality=quality)
        report = {
            "version": 1, "kind": "cpu_tiny_neural_video_sample",
            "neural_network": True, "text_to_video": False, "model_generation": True,
            "model_sha256": sha256(model_path),
            "sample_seed": seed, "seconds": seconds,
            "profile": profile, "quality": quality,
            "source_clip_sha256": sha256(clip),
            "video_sha256": result["video"]["sha256"],
            "storyboard_sha256": sha256(path),
            "training_source_sha256": [source["sha256"] for source in model["sources"]],
            "holdout_neural_mse": model["metrics"]["holdout_neural_mse"],
            "holdout_baseline_mse": model["metrics"]["holdout_persistence_baseline_mse"],
            "note": "Genuine tiny 12-12-3 neural pixel model, not photorealistic diffusion or text-to-video.",
        }
        (stage / "generation-report.json").write_text(json.dumps(report, indent=2) + "\n")
        validate_output_dir(destination)
        stage.rename(destination)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    fit = sub.add_parser("train")
    fit.add_argument("--input", type=Path, required=True)
    fit.add_argument("--output", type=Path, required=True)
    fit.add_argument("--rights-ref", type=str, required=True)
    fit.add_argument("--clip", action="append")
    fit.add_argument("--seed", type=int, default=42)
    fit.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS)
    sample = sub.add_parser("generate")
    sample.add_argument("--model", type=Path, required=True)
    sample.add_argument("--output", type=Path, required=True)
    sample.add_argument("--seconds", type=int, default=2)
    sample.add_argument("--seed", type=int, default=42)
    sample.add_argument("--profile", choices=("landscape", "portrait", "square"), default="landscape")
    sample.add_argument("--quality", choices=("standard", "high"), default="standard")
    args = parser.parse_args()
    try:
        if args.command == "train":
            result = train(args.input, args.output, args.rights_ref, args.clip, args.seed, args.epochs)
            print(json.dumps({"trained_model": str(args.output / "model.json"),
                              "model_sha256": result["model_sha256"],
                              "training_sources": result["training_source_count"],
                              "metrics": result["metrics"]}))
        else:
            result = generate(args.model, args.output, args.seconds, args.seed,
                              args.profile, args.quality)
            print(json.dumps({"finished_mp4": str(args.output / "render" / "video.mp4"),
                              "video_sha256": result["video_sha256"],
                              "model_sha256": result["model_sha256"]}))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as err:
        parser.error(str(err))


if __name__ == "__main__":
    main()
