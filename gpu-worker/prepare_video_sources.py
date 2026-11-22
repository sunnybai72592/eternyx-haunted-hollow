"""Offline CPU video import: normalize ordinary local phone videos for ETERNYX's 16 FPS editor.

No external API, model inference, paid GPU or network media protocols. Outputs are
new files; originals stay unchanged. Uses system FFmpeg and FFprobe with libx264.
"""
import argparse
from fractions import Fraction
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from render_video_timeline import FPS, MAX_SOURCE_BYTES, probe, sha256, video_info

MAX_CLIPS = 8
MAX_INPUT_PIXELS = 1920 * 1080
MAX_INPUT_DURATION = 300
MAX_OUTPUT_SECONDS = 60
MAX_OUTPUT_FRAMES = MAX_OUTPUT_SECONDS * FPS
EXTENSIONS = {".mp4", ".mov", ".m4v"}
SAFE_NAME = re.compile(r"[^/\\:\x00-\x1f\x7f]{1,180}\Z")


def source_path(folder, filename):
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError("Input must be a local directory, not a symlink")
    if (not isinstance(filename, str) or not SAFE_NAME.fullmatch(filename) or
            filename.startswith("~") or filename.startswith(".") or
            Path(filename).suffix.lower() not in EXTENSIONS):
        raise ValueError("Source name must be a safe flat MP4, MOV or M4V filename")
    path = folder / filename
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_SOURCE_BYTES:
        raise ValueError("Source must be a regular video file up to 64 MiB, not a symlink")
    return path


def inspect_input(path):
    args = ["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
            "-show_entries",
            "stream=codec_type,width,height,avg_frame_rate:format=duration,format_name",
            "-of", "json", str(path)]
    try:
        result = subprocess.run(args, check=False, capture_output=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Local FFprobe not found or timed out") from error
    if result.returncode:
        raise ValueError("Local video could not be probed")
    try:
        data = json.loads(result.stdout)
        names = data["format"]["format_name"].split(",")
        if not ("mov" in names or "mp4" in names):
            raise ValueError("Input is not a supported MP4/MOV container")
        streams = [item for item in data["streams"] if item.get("codec_type") == "video"]
        if len(streams) != 1:
            raise ValueError("Input must have exactly one video stream")
        video = streams[0]
        width, height = video["width"], video["height"]
        if (type(width) is not int or type(height) is not int or
                not 16 <= width <= 1920 or not 16 <= height <= 1920 or
                width * height > MAX_INPUT_PIXELS):
            raise ValueError("Input video exceeds 1920x1080 pixels or is too small")
        rate = Fraction(video["avg_frame_rate"])
        if rate <= 0 or rate > 120:
            raise ValueError("Input frame rate must be between 0 and 120 FPS")
        duration = float(data["format"]["duration"])
        if not (0 < duration <= MAX_INPUT_DURATION):
            raise ValueError("Input duration must be greater than zero and <=300 seconds")
    except (KeyError, TypeError, ValueError, ZeroDivisionError, OverflowError) as error:
        if isinstance(error, ValueError) and "Input" in str(error):
            raise
        raise ValueError("Input has invalid or unsupported video metadata") from error
    return {
        "width": width, "height": height,
        "reported_fps": f"{rate.numerator}/{rate.denominator}",
        "reported_duration_seconds": round(duration, 3),
    }


def normalize_one(source, output, *, start_seconds=0, seconds=60):
    if type(start_seconds) is not int or not 0 <= start_seconds < MAX_INPUT_DURATION:
        raise ValueError("Start offset must be an integer from 0 to 299 seconds")
    if type(seconds) is not int or not 1 <= seconds <= MAX_OUTPUT_SECONDS:
        raise ValueError("Output limit must be an integer from 1 to 60 seconds")
    original = inspect_input(source)
    if start_seconds >= original["reported_duration_seconds"]:
        raise ValueError("Requested start is beyond the source video")
    remaining = original["reported_duration_seconds"] - start_seconds
    if remaining < 0.1:
        raise ValueError("Requested interval is too short for 16 FPS")
    # FFmpeg autorotates MOV/MP4 phone footage by default, then preserves aspect
    # without stretching or upscaling to a larger size. Require even H264 dimensions.
    filtergraph = (
        "fps=16:round=near,"
        "scale=w='min(512,iw)':h='min(512,ih)':"
        "force_original_aspect_ratio=decrease:force_divisible_by=2,"
        "setsar=1,format=yuv420p"
    )
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-threads", "1",
           "-ss", str(start_seconds), "-protocol_whitelist", "file,pipe",
           "-i", str(source), "-map", "0:v:0", "-an", "-sn", "-dn",
           "-map_metadata", "-1", "-map_chapters", "-1",
           "-vf", filtergraph, "-frames:v", str(seconds * FPS),
           "-t", str(seconds), "-r", str(FPS),
           "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)]
    try:
        run = subprocess.run(cmd, capture_output=True, check=False, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Local FFmpeg unavailable or exceeded the CPU limit") from error
    if run.returncode:
        raise ValueError("Local CPU video normalization failed")
    if not output.is_file() or not 0 < output.stat().st_size <= MAX_SOURCE_BYTES:
        raise ValueError("Prepared MP4 missing or exceeds the renderer source limit")
    # Re-count real decoded frames, not a predicted number.
    width, height, frames = video_info(probe(output, count_frames=True))
    if frames > seconds * FPS or frames > MAX_OUTPUT_FRAMES:
        raise ValueError("Prepared video has more frames than requested")
    return {**original, "prepared_width": width, "prepared_height": height,
            "prepared_fps": f"{FPS}/1", "prepared_frames": frames,
            "prepared_duration_seconds": frames / FPS,
            "prepared_sha256": sha256(output),
            "prepared_bytes": output.stat().st_size}


def prepare(folder, destination, *, clips=None, start_seconds=0, seconds=60):
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError("Input must be a real local directory, not a symlink")
    if destination.exists() or destination.is_symlink():
        raise ValueError("Output directory must be new; existing files are never overwritten")
    if destination.parent.is_symlink() or not destination.parent.is_dir():
        raise ValueError("Output parent must already exist and must not be a symlink")
    if clips:
        selected = list(clips)
    else:
        selected = sorted(item.name for item in folder.iterdir()
                          if item.is_file() and item.suffix.lower() in EXTENSIONS)
    if not 1 <= len(selected) <= MAX_CLIPS:
        raise ValueError("Select between 1 and 8 videos; use --clip to select from a larger folder")
    if len({name.casefold() for name in selected}) != len(selected):
        raise ValueError("Duplicate source filenames are not permitted")
    originals = [(name, source_path(folder, name)) for name in selected]
    # Stage the entire batch; no partial output leaks if a later source fails.
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-video-prepare-", dir=destination.parent))
    try:
        rows = []
        for i, (name, path) in enumerate(originals, 1):
            target = stage / f"clip-{i:02d}.mp4"
            info = normalize_one(path, target, start_seconds=start_seconds, seconds=seconds)
            rows.append({
                "source_filename": name, "source_sha256": sha256(path),
                "prepared_filename": target.name, **info,
                "start_seconds": start_seconds, "seconds_limit": seconds,
            })
        report = {
            "version": 1, "kind": "local_cpu_video_import",
            "model_generation": False,
            "source_count": len(rows),
            "clips": rows,
            "note": "Prepared clips were transcoded from local footage, not AI-generated.",
        }
        (stage / "preparation-report.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if destination.exists() or destination.is_symlink():
            raise ValueError("Output directory appeared while preparing; refusing overwrite")
        stage.rename(destination)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Flat folder of original MP4/MOV/M4V clips")
    parser.add_argument("--output", type=Path, required=True, help="New folder for normalized 16 FPS MP4 files")
    parser.add_argument("--clip", action="append", help="Specific filename (repeat up to eight times)")
    parser.add_argument("--start-seconds", type=int, default=0, help="Trim initial portion of each clip")
    parser.add_argument("--seconds", type=int, default=60, help="Maximum output seconds per clip (1–60)")
    args = parser.parse_args()
    try:
        report = prepare(args.input, args.output, clips=args.clip,
                         start_seconds=args.start_seconds, seconds=args.seconds)
        print(json.dumps({"prepared": report["source_count"], "output": str(args.output),
                          "filenames": [row["prepared_filename"] for row in report["clips"]]}))
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
