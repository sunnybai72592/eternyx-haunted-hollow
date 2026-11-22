"""Train and sample a tiny *learned* CPU video texture model from local reviewed footage.

This is a first-order discrete temporal Markov model, not neural diffusion or
text-to-video. It learns 64-color pixel transitions and coarse motion frequencies
from real decoded 16 FPS footage, then *samples new frame states* from its learned
parameters. Generated output contains neither source MP4s nor original RGB frames.
The low-resolution synthesized textures are experimental and not photorealistic.

Only Python standard library + locally installed FFmpeg/FFprobe/libx264.
No external AI API, paid GPU, remote model weights or auto-download.
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
from render_video_timeline import FPS, probe, video_info, render, sha256

WIDTH, HEIGHT = 32, 18
PIXELS = WIDTH * HEIGHT
COLORS = 64
MAX_SOURCES = 8
MAX_TRAIN_FRAMES = 240
MAX_GENERATE_SECONDS = 8
MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_MODEL_BYTES = 1024 * 1024
MAX_OUTPUT_BYTES = 64 * 1024 * 1024
RIGHTS_LIMIT = 180
PROFILE_CHOICES = ("landscape", "portrait", "square")
QUALITY_CHOICES = ("standard", "high")


def validate_label(text):
    if (not isinstance(text, str) or not text.strip() or len(text) > RIGHTS_LIMIT or
            any(ord(c) < 32 or ord(c) == 127 for c in text)):
        raise ValueError("Rights reference must be printable, nonblank and no more than 180 characters")
    return text


def validate_output_dir(path):
    if path.exists() or path.is_symlink():
        raise ValueError("Output directory already exists; no overwriting")
    if path.parent.is_symlink() or not path.parent.is_dir():
        raise ValueError("Output parent must be an existing non-symlink directory")


def checked_input(folder, name):
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError("Source folder must be a real local directory")
    if (not isinstance(name, str) or not 1 <= len(name) <= 180 or
            name.startswith((".", "~")) or "/" in name or "\\" in name or
            ":" in name or any(ord(c) < 32 or ord(c) == 127 for c in name) or
            not name.lower().endswith(".mp4")):
        raise ValueError("Select safe, flat local MP4 input filenames")
    item = folder / name
    if (item.is_symlink() or not item.is_file() or
            not 0 < item.stat().st_size <= MAX_SOURCE_BYTES):
        raise ValueError("Training source must be regular, not a symlink, <=64 MiB")
    return item


def run_ffmpeg(args, timeout=90, stdin=None):
    try:
        process = subprocess.run(args, input=stdin, capture_output=True,
                                 timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as err:
        raise ValueError("Local CPU FFmpeg not found or exceeded its time limit") from err
    if process.returncode:
        raise ValueError("Local CPU FFmpeg failed to read or render training media")
    return process.stdout


def decode(path):
    _, _, count = video_info(probe(path, count_frames=True))
    length = min(MAX_TRAIN_FRAMES, count)
    if length < 8:
        raise ValueError("Training video needs at least eight actual decoded 16 FPS frames")
    raw = run_ffmpeg([
        "ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-threads", "1",
        "-protocol_whitelist", "file,pipe", "-i", str(path),
        "-map", "0:v:0", "-vf",
        f"scale={WIDTH}:{HEIGHT}:flags=area,format=rgb24",
        "-frames:v", str(length), "-an", "-sn", "-dn",
        "-f", "rawvideo", "pipe:1",
    ])
    frame_size = PIXELS * 3
    if len(raw) != frame_size * length:
        raise ValueError("Actual training decoded frames differ from source metadata")
    return [quantize(raw[i * frame_size:(i + 1) * frame_size])
            for i in range(length)], count


def quantize(raw):
    # Four levels per channel => 64 categorical color classes.
    if len(raw) != PIXELS * 3:
        raise ValueError("Unexpected decoded RGB frame size")
    return bytes(((raw[p] >> 6) << 4) | ((raw[p + 1] >> 6) << 2) | (raw[p + 2] >> 6)
                 for p in range(0, len(raw), 3))


def shift_score(previous, actual, dx, dy):
    matched = 0
    checked = 0
    for y in range(2, HEIGHT - 2, 3):
        sy = y - dy
        for x in range(2, WIDTH - 2, 3):
            sx = x - dx
            aa = actual[y * WIDTH + x]
            bb = previous[sy * WIDTH + sx]
            # Compare coarse brightness and color instead of strict identical pixels.
            matched += abs((aa >> 4) - (bb >> 4))
            matched += abs(((aa >> 2) & 3) - ((bb >> 2) & 3))
            matched += abs((aa & 3) - (bb & 3))
            checked += 1
    return matched / max(1, checked)


def learn_motion(previous, actual):
    options = [(shift_score(previous, actual, dx, dy), abs(dx) + abs(dy), dy, dx)
               for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
    _, _, dy, dx = min(options)
    return (dy + 1) * 3 + (dx + 1)


def learn(folder, output, rights_ref, selected=None):
    validate_output_dir(output)
    validate_label(rights_ref)
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError("Input folder must be an existing, non-symlink directory")
    names = (list(selected) if selected is not None else
             sorted(path.name for path in folder.iterdir()
                    if path.is_file() and path.name.lower().endswith(".mp4")))
    if not 1 <= len(names) <= MAX_SOURCES or len(set(n.casefold() for n in names)) != len(names):
        raise ValueError("Select 1-8 distinct source clips; use --clip with larger folders")
    sources = [(name, checked_input(folder, name)) for name in names]
    position = [[0] * COLORS for _ in range(PIXELS)]
    transitions = [[0] * COLORS for _ in range(COLORS)]
    global_colors = [0] * COLORS
    shifts = [0] * 9
    train_pairs = 0
    holdout_pairs = 0
    heldout = []
    receipts = []
    for name, path in sources:
        frames, actual_count = decode(path)
        # Last quarter is held out from learning, to avoid reporting training loss as evaluation.
        train_length = max(4, int(len(frames) * 0.75))
        for frame in frames[:train_length]:
            for pos, state in enumerate(frame):
                position[pos][state] += 1
                global_colors[state] += 1
        for i in range(1, train_length):
            previous, current = frames[i - 1], frames[i]
            shifts[learn_motion(previous, current)] += 1
            for p in range(PIXELS):
                transitions[previous[p]][current[p]] += 1
            train_pairs += PIXELS
        for i in range(train_length, len(frames)):
            prior, next_frame = frames[i - 1], frames[i]
            heldout.append((prior, next_frame))
            holdout_pairs += PIXELS
        receipts.append({
            "file": name, "sha256": sha256(path),
            "rights_ref": rights_ref, "decoded_frames": actual_count,
            "used_frames": len(frames), "train_frames": train_length,
            "holdout_frames": len(frames) - train_length,
        })
    if not train_pairs or not holdout_pairs:
        raise ValueError("Cannot train and evaluate on distinct temporal windows")
    # Fixed Laplace-smoothed NLL: lower means a better predictive fit, not better video quality.
    state_nll = 0.0
    baseline_nll = 0.0
    color_total = sum(global_colors)
    totals = [sum(row) for row in transitions]
    for prior, next_frame in heldout:
        for old, new in zip(prior, next_frame):
            state_nll -= math.log((transitions[old][new] + 1) / (totals[old] + COLORS))
            baseline_nll -= math.log((global_colors[new] + 1) / (color_total + COLORS))
    metrics = {
        "holdout_pairs": holdout_pairs, "training_pairs": train_pairs,
        "holdout_transition_nll": round(state_nll / holdout_pairs, 6),
        "holdout_color_baseline_nll": round(baseline_nll / holdout_pairs, 6),
        "interpretation": "Average held-out categorical negative log likelihood; not perceptual or prompt fidelity.",
    }
    model = {
        "version": 1, "kind": "cpu_learned_color_motion_markov",
        "model_type": "64-state categorical temporal transition + 3x3 learned motion histogram",
        "neural_network": False, "text_to_video": False, "model_generation": True,
        "fps": FPS, "width": WIDTH, "height": HEIGHT, "colors": COLORS,
        "source_count": len(receipts), "sources": receipts,
        "global_colors": global_colors, "position_colors": position,
        "color_transitions": transitions, "motion_shifts": shifts,
        "metrics": metrics,
    }
    encoded = json.dumps(model, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(encoded) > MAX_MODEL_BYTES:
        raise ValueError("Trained CPU model exceeds one MiB")
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-learn-", dir=output.parent))
    try:
        (stage / "model.json").write_bytes(encoded + b"\n")
        report = {
            "version": 1, "kind": "cpu_learned_motion_training",
            "model_sha256": sha256(stage / "model.json"),
            "training_source_count": len(receipts),
            "training_sources": receipts,
            "metrics": metrics,
            "neural_network": False,
            "note": "Real learned categorical motion transitions from local footage; not neural text-to-video.",
        }
        (stage / "training-report.json").write_text(
            json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def read_model(path):
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_MODEL_BYTES:
        raise ValueError("Model must be a regular, bounded local JSON file")
    try:
        data = json.loads(path.read_bytes(), object_pairs_hook=unique_keys)
    except (UnicodeError, json.JSONDecodeError) as err:
        raise ValueError("Malformed learned model JSON") from err
    if (not isinstance(data, dict) or data.get("kind") != "cpu_learned_color_motion_markov" or
            data.get("version") != 1 or data.get("fps") != FPS or
            data.get("width") != WIDTH or data.get("height") != HEIGHT or
            data.get("colors") != COLORS or data.get("neural_network") is not False or
            data.get("text_to_video") is not False or data.get("model_generation") is not True):
        raise ValueError("Not a compatible CPU learned motion model")
    def matrix(value, rows, cols):
        if (not isinstance(value, list) or len(value) != rows or
                any(not isinstance(row, list) or len(row) != cols or
                    any(type(item) is not int or not 0 <= item <= MAX_TRAIN_FRAMES * MAX_SOURCES * PIXELS
                        for item in row) for row in value)):
            raise ValueError("Invalid learned model count matrix")
    matrix(data.get("position_colors"), PIXELS, COLORS)
    matrix(data.get("color_transitions"), COLORS, COLORS)
    for key, size in (("global_colors", COLORS), ("motion_shifts", 9)):
        values = data.get(key)
        if (not isinstance(values, list) or len(values) != size or
                any(type(item) is not int or item < 0 or item > MAX_TRAIN_FRAMES * MAX_SOURCES * PIXELS
                    for item in values) or sum(values) < 1):
            raise ValueError("Invalid learned motion/color frequencies")
    if (not isinstance(data.get("sources"), list) or not 1 <= len(data["sources"]) <= MAX_SOURCES or
            data.get("source_count") != len(data["sources"])):
        raise ValueError("Missing licensed local model training provenance")
    for row in data["sources"]:
        if (not isinstance(row, dict) or not isinstance(row.get("sha256"), str) or
                len(row["sha256"]) != 64 or
                any(c not in "0123456789abcdef" for c in row["sha256"])):
            raise ValueError("Invalid training source checksum")
        validate_label(row.get("rights_ref"))
    if (not all(sum(v) > 0 for v in data["position_colors"]) or
            not all(sum(v) >= 0 for v in data["color_transitions"])):
        raise ValueError("Model has invalid empirical color distributions")
    if sum(sum(row) for row in data["color_transitions"]) < 1:
        raise ValueError("Learned model has no temporal transitions")
    return data


def sample_counts(weights, rng):
    total = sum(weights)
    if total <= 0:
        raise ValueError("Cannot sample from empty learned weights")
    n = rng.randrange(total)
    for i, count in enumerate(weights):
        n -= count
        if n < 0:
            return i
    raise ValueError("Malformed categorical weights")


def frame_rgb(states):
    frame = bytearray(PIXELS * 3)
    for i, state in enumerate(states):
        frame[3 * i] = ((state >> 4) & 3) * 64 + 32
        frame[3 * i + 1] = ((state >> 2) & 3) * 64 + 32
        frame[3 * i + 2] = (state & 3) * 64 + 32
    return bytes(frame)


def synthesize_frames(model, seconds, seed):
    if type(seconds) is not int or not 1 <= seconds <= MAX_GENERATE_SECONDS:
        raise ValueError("Generate 1–8 seconds per trained texture clip")
    if type(seed) is not int or not 0 <= seed <= 2**31 - 1:
        raise ValueError("Sample seed must be an unsigned 31-bit integer")
    rng = random.Random(seed)
    states = [sample_counts(row, rng) for row in model["position_colors"]]
    outputs = [frame_rgb(states)]
    for _ in range(1, seconds * FPS):
        shift = sample_counts(model["motion_shifts"], rng)
        dx, dy = shift % 3 - 1, shift // 3 - 1
        moved = [states[((y - dy) % HEIGHT) * WIDTH + ((x - dx) % WIDTH)]
                 for y in range(HEIGHT) for x in range(WIDTH)]
        next_states = []
        for i, old in enumerate(moved):
            transitions = model["color_transitions"][old]
            # Mostly sample learned temporal transitions, occasionally location-dependent colors.
            candidates = (model["position_colors"][i] if rng.randrange(10) == 0 or
                          sum(transitions) == 0 else transitions)
            next_states.append(sample_counts(candidates, rng))
        states = next_states
        outputs.append(frame_rgb(states))
    return outputs


def generate(model_path, output, seconds=3, seed=42, profile="landscape", quality="standard"):
    validate_output_dir(output)
    if profile not in PROFILE_CHOICES or quality not in QUALITY_CHOICES:
        raise ValueError("Unsupported video output preset")
    model = read_model(model_path)
    raw = b"".join(synthesize_frames(model, seconds, seed))
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-sampled-", dir=output.parent))
    try:
        clip = stage / "clip-01.mp4"
        run_ffmpeg([
            "ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-threads", "1",
            "-f", "rawvideo", "-pixel_format", "rgb24",
            "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS), "-i", "pipe:0",
            "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1",
            "-frames:v", str(seconds * FPS), "-c:v", "libx264", "-preset", "ultrafast",
            "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(clip),
        ], stdin=raw)
        if not clip.is_file() or not 0 < clip.stat().st_size <= MAX_OUTPUT_BYTES:
            raise ValueError("Sampled MP4 missing or exceeded output size limit")
        size = video_info(probe(clip, count_frames=True))
        if size != (WIDTH, HEIGHT, seconds * FPS):
            raise ValueError("Sampled clip failed actual decoded frame verification")
        caption = "Locally sampled learned CPU video texture (non-neural)"
        board = {"version": 2, "shots": [{
            "file": clip.name, "source_sha256": sha256(clip),
            "start_frame": 0, "frames": seconds * FPS,
            "caption": caption,
            "rights_ref": "derived-from-local-reviewed-training-footage",
            "fade_in_frames": 0, "fade_out_frames": 0,
        }]}
        storyboard = stage / "eternyx-video-v2.json"
        storyboard.write_text(json.dumps(board, indent=2) + "\n", encoding="utf-8")
        rendered = render(storyboard, stage, stage / "render", profile=profile, quality=quality)
        report = {
            "version": 1, "kind": "cpu_learned_video_sample",
            "model_generation": True, "neural_network": False, "text_to_video": False,
            "model_sha256": sha256(model_path),
            "sample_seed": seed, "seconds": seconds,
            "profile": profile, "quality": quality,
            "sampled_clip_sha256": sha256(clip),
            "finished_video_sha256": rendered["video"]["sha256"],
            "storyboard_sha256": sha256(storyboard),
            "training_sources": model["sources"], "metrics": model["metrics"],
            "note": "Novel categorical frame samples from a small trained Markov texture model, not a neural diffusion video.",
        }
        (stage / "generation-report.json").write_text(
            json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    fit = commands.add_parser("train", help="Learn local categorical temporal and motion patterns")
    fit.add_argument("--input", type=Path, required=True)
    fit.add_argument("--output", type=Path, required=True)
    fit.add_argument("--rights-ref", type=str, required=True)
    fit.add_argument("--clip", action="append")
    sample = commands.add_parser("generate", help="Sample novel frames from an existing trained model")
    sample.add_argument("--model", type=Path, required=True)
    sample.add_argument("--output", type=Path, required=True)
    sample.add_argument("--seconds", type=int, default=3)
    sample.add_argument("--seed", type=int, default=42)
    sample.add_argument("--profile", choices=PROFILE_CHOICES, default="landscape")
    sample.add_argument("--quality", choices=QUALITY_CHOICES, default="standard")
    args = parser.parse_args()
    try:
        if args.command == "train":
            result = learn(args.input, args.output, args.rights_ref, args.clip)
            print(json.dumps({
                "trained_model": str(args.output / "model.json"),
                "model_sha256": result["model_sha256"],
                "training_sources": result["training_source_count"],
                "metrics": result["metrics"],
            }))
        else:
            result = generate(args.model, args.output, args.seconds, args.seed,
                              args.profile, args.quality)
            print(json.dumps({
                "video": str(args.output / "render" / "video.mp4"),
                "video_sha256": result["finished_video_sha256"],
                "model_sha256": result["model_sha256"], "seconds": result["seconds"],
            }))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as err:
        parser.error(str(err))


if __name__ == "__main__":
    main()
