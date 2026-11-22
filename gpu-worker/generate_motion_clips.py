"""Create original abstract animated MP4s from structured presets, entirely on CPU.

This is procedural graphics, NOT AI generation or model training. Produces actual
decoded/verified H.264 clips and then a finished MP4 using ETERNYX v2 renderer.
Python standard library + locally installed FFmpeg/FFprobe/libx264 only.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile

from render_video_timeline import (FPS, read_board, render, sha256, probe, video_info)

STYLES = ("aurora", "orbit", "ripple", "particles", "scanlines", "sunrise")
PALETTES = {
    "ocean": ((4, 24, 47), (22, 139, 172), (154, 225, 239)),
    "sunset": ((48, 15, 61), (216, 75, 95), (255, 197, 112)),
    "forest": ((5, 34, 30), (54, 148, 103), (194, 228, 140)),
    "violet": ((24, 14, 59), (117, 74, 209), (234, 154, 248)),
    "mono": ((9, 16, 26), (103, 124, 151), (230, 240, 249)),
}
SIZES = {
    "landscape": (128, 72),
    "portrait": (72, 128),
    "square": (128, 128),
}
MAX_SCENES = 8
MAX_TOTAL_FRAMES = 480
MAX_HIGH_FRAMES = 160
MAX_CONFIG_BYTES = 32 * 1024
RIGHTS_REF = "eternyx-original-cpu-procedural-v1"
TWO_PI = 2 * math.pi


def text_field(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 180:
        raise ValueError("Each scene needs a caption of 1-180 printable characters")
    if any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError("Scene captions cannot contain control characters")
    return value


def no_duplicate_keys(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError("Duplicate scene configuration key")
        obj[key] = value
    return obj


def read_config(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Scene configuration must be a regular local JSON file")
    with path.open("rb") as stream:
        raw = stream.read(MAX_CONFIG_BYTES + 1)
    if len(raw) > MAX_CONFIG_BYTES:
        raise ValueError("Scene JSON exceeds 32 KiB")
    try:
        data = json.loads(raw, object_pairs_hook=no_duplicate_keys)
    except (UnicodeError, json.JSONDecodeError) as err:
        raise ValueError("Invalid UTF-8 scene JSON") from err
    if (not isinstance(data, dict) or set(data) !=
            {"version", "profile", "quality", "scenes"} or
            type(data["version"]) is not int or data["version"] != 1):
        raise ValueError("Expected version 1 structured procedural scene configuration")
    if (not isinstance(data["profile"], str) or data["profile"] not in SIZES or
            not isinstance(data["quality"], str) or data["quality"] not in ("standard", "high")):
        raise ValueError("Choose a supported output profile and quality")
    scenes = data["scenes"]
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= MAX_SCENES:
        raise ValueError("Choose between 1 and 8 procedural scenes")
    total = 0
    for scene in scenes:
        if (not isinstance(scene, dict) or set(scene) !=
                {"style", "palette", "seconds", "seed", "caption"}):
            raise ValueError("Each scene requires style, palette, seconds, seed and caption")
        if (not isinstance(scene["style"], str) or scene["style"] not in STYLES or
                not isinstance(scene["palette"], str) or scene["palette"] not in PALETTES):
            raise ValueError("Unsupported procedural style or palette")
        seconds, seed = scene["seconds"], scene["seed"]
        if type(seconds) is not int or not 1 <= seconds <= 8:
            raise ValueError("Scene duration must be an integer between 1 and 8 seconds")
        if type(seed) is not int or not 0 <= seed <= 2**31 - 1:
            raise ValueError("Scene seed must be an unsigned 31-bit integer")
        text_field(scene["caption"])
        total += seconds * FPS
    limit = MAX_HIGH_FRAMES if data["quality"] == "high" else MAX_TOTAL_FRAMES
    if total > limit:
        raise ValueError("Total scene budget exceeded (30s standard, 10s high)")
    return data, hashlib.sha256(raw).hexdigest(), total


def clamp(v):
    return max(0, min(255, int(v + 0.5)))


def interp(a, b, mix):
    return a + (b - a) * max(0.0, min(1.0, mix))


def pixel(style, x, y, phase, seed):
    # Normalized coordinates 0..1. No external assets, network data or ML.
    t = phase * TWO_PI
    if style == "aurora":
        ribbon = 0.48 + 0.22 * math.sin(x * 8 + t * 0.85 + seed * 0.003)
        glow = math.exp(-((y - ribbon) / 0.17) ** 2)
        return min(1.0, 0.12 + 0.68 * glow + 0.20 * x)
    if style == "orbit":
        cx = 0.5 + 0.25 * math.cos(t + seed * 0.002)
        cy = 0.5 + 0.25 * math.sin(t + seed * 0.002)
        radius = math.hypot(x - cx, y - cy)
        return min(1.0, math.exp(-(radius / 0.22) ** 2) + 0.14 * math.sin(t + x * 5) ** 2)
    if style == "ripple":
        dist = math.hypot(x - (0.5 + 0.08 * math.sin(t)),
                          y - (0.5 + 0.08 * math.cos(t)))
        return 0.5 + 0.44 * math.sin(dist * 45 - t * 4 + seed * 0.001)
    if style == "scanlines":
        stripe = math.sin((x * 10 + y * 6) * TWO_PI - t * 0.75 + seed * 0.01)
        return 0.38 + 0.34 * (stripe ** 2) + 0.22 * y
    if style == "sunrise":
        cx = 0.5
        cy = 0.75 - 0.48 * phase
        d = math.hypot((x - cx) * 1.1, y - cy)
        sun = math.exp(-(d / 0.17) ** 2)
        return min(1.0, 0.18 + 0.45 * (1.0 - y) + 0.48 * sun)
    # Seeded moving particle points against a soft gradient.
    return 0.14 + 0.45 * y + 0.08 * math.sin(x * 12 + t * 0.5)


def generate_rgb(style, palette, seed, frame_number, frames, width, height):
    colors = PALETTES[palette]
    phase = frame_number / max(1, frames)
    output = bytearray(width * height * 3)
    xi = [i / max(1, width - 1) for i in range(width)]
    yi = [j / max(1, height - 1) for j in range(height)]
    for y in range(height):
        ry = yi[y]
        for x in range(width):
            rx = xi[x]
            level = max(0.0, min(1.0, pixel(style, rx, ry, phase, seed)))
            if level < 0.5:
                channel_a, channel_b, blend = colors[0], colors[1], level * 2
            else:
                channel_a, channel_b, blend = colors[1], colors[2], (level - 0.5) * 2
            k = (y * width + x) * 3
            output[k] = clamp(interp(channel_a[0], channel_b[0], blend))
            output[k + 1] = clamp(interp(channel_a[1], channel_b[1], blend))
            output[k + 2] = clamp(interp(channel_a[2], channel_b[2], blend))
    if style == "particles":
        # Deterministic integer LCG: points drift across the canvas over time.
        for p in range(36):
            mix = (seed + p * 23456789) & 0x7fffffff
            mix = (1103515245 * mix + 12345) & 0x7fffffff
            px = ((mix % 10000) / 10000 + phase * (0.13 + (p % 5) * 0.026)) % 1
            mix = (1103515245 * mix + 12345) & 0x7fffffff
            py = ((mix % 10000) / 10000 - phase * (0.15 + (p % 3) * 0.023)) % 1
            center_x, center_y = int(px * width), int(py * height)
            for dy in (-1, 0, 1):
                yy = center_y + dy
                if not 0 <= yy < height:
                    continue
                for dx in (-1, 0, 1):
                    xx = center_x + dx
                    if not 0 <= xx < width:
                        continue
                    k = (yy * width + xx) * 3
                    strength = 0.75 if dx == 0 and dy == 0 else 0.42
                    for channel in range(3):
                        output[k + channel] = clamp(interp(output[k + channel], colors[2][channel], strength))
    return output


def encode_scene(scene, index, output, profile, quality):
    scale = 2 if quality == "high" else 1
    width, height = SIZES[profile]
    width *= scale
    height *= scale
    frames = scene["seconds"] * FPS
    command = [
        "ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-threads", "1",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", f"{width}x{height}",
        "-framerate", str(FPS), "-i", "pipe:0",
        "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1",
        "-frames:v", str(frames), "-c:v", "libx264", "-preset", "ultrafast",
        "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(output),
    ]
    try:
        proc = subprocess.Popen(command, stdin=subprocess.PIPE,
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except OSError as err:
        raise ValueError("FFmpeg is required locally for procedural MP4 output") from err
    try:
        for frame in range(frames):
            proc.stdin.write(generate_rgb(scene["style"], scene["palette"], scene["seed"],
                                          frame, frames, width, height))
        proc.stdin.close()
        try:
            proc.wait(timeout=120)
        except subprocess.TimeoutExpired as err:
            proc.kill()
            proc.wait()
            raise ValueError("CPU procedural scene encode exceeded time limit") from err
        if proc.returncode:
            raise ValueError("CPU procedural H.264 encode failed")
    except (OSError, BrokenPipeError) as err:
        proc.kill()
        proc.wait()
        raise ValueError("Could not stream procedural RGB frames into local FFmpeg") from err
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        if proc.stderr:
            proc.stderr.close()
    if not output.is_file() or not 0 < output.stat().st_size <= 64 * 1024 * 1024:
        raise ValueError("Procedural MP4 missing or exceeds 64 MiB")
    actual_width, actual_height, actual_frames = video_info(probe(output, count_frames=True))
    if (actual_width, actual_height, actual_frames) != (width, height, frames):
        raise ValueError("Procedural MP4 did not decode with requested dimensions or frame count")
    return {"index": index, "filename": output.name, "sha256": sha256(output),
            "frames": frames, "seconds": scene["seconds"], "width": width,
            "height": height, "style": scene["style"], "palette": scene["palette"],
            "seed": scene["seed"], "caption": scene["caption"], "rights_ref": RIGHTS_REF}


def create(config_path, destination):
    config, config_digest, total = read_config(config_path)
    if destination.exists() or destination.is_symlink():
        raise ValueError("Output directory already exists: no overwriting")
    if destination.parent.is_symlink() or not destination.parent.is_dir():
        raise ValueError("Output parent must exist and not be a symlink")
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-motion-", dir=destination.parent))
    try:
        assets = []
        board = {"version": 2, "shots": []}
        for i, scene in enumerate(config["scenes"], start=1):
            path = stage / f"clip-{i:02d}.mp4"
            asset = encode_scene(scene, i, path, config["profile"], config["quality"])
            assets.append(asset)
            board["shots"].append({
                "file": path.name, "source_sha256": asset["sha256"],
                "start_frame": 0, "frames": asset["frames"],
                "caption": scene["caption"], "rights_ref": RIGHTS_REF,
                "fade_in_frames": 0, "fade_out_frames": 0,
            })
        board_path = stage / "eternyx-video-v2.json"
        board_path.write_text(json.dumps(board, indent=2, ensure_ascii=False) + "\n",
                              encoding="utf-8")
        # Always create a real playable finished MP4, without extra manual steps.
        result = render(board_path, stage, stage / "render",
                        profile=config["profile"], quality=config["quality"])
        report = {
            "version": 1, "kind": "cpu_procedural_motion",
            "model_generation": False, "scene_config_sha256": config_digest,
            "profile": config["profile"], "quality": config["quality"],
            "total_frames": total, "scenes": assets,
            "compiled_video_sha256": result["video"]["sha256"],
            "editor_storyboard_sha256": sha256(board_path),
            "note": "Original seeded procedural graphics, not AI generative inference.",
        }
        (stage / "generation-report.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if destination.exists() or destination.is_symlink():
            raise ValueError("Output appeared while rendering; refusing overwrite")
        stage.rename(destination)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenes", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        report = create(args.scenes, args.output)
        print(json.dumps({
            "output": str(args.output), "scenes": len(report["scenes"]),
            "total_frames": report["total_frames"],
            "finished_mp4": str(args.output / "render" / "video.mp4"),
            "finished_sha256": report["compiled_video_sha256"],
        }))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
