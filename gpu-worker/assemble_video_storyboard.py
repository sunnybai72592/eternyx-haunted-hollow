"""Assemble short, rights-reviewed local MP4 shots into a real CPU-rendered video."""
import argparse
import base64
from html import escape
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from audit_video_render import inspect, png

MAX_SHOTS = 8
MAX_TOTAL_FRAMES = 64
MAX_MANIFEST_BYTES = 32768
FPS = 16
HEX64 = re.compile(r"[0-9a-f]{64}\Z")


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key in storyboard")
        result[key] = value
    return result


def load_manifest(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Storyboard must be a regular local JSON file")
    with path.open("rb") as stream:
        data = stream.read(MAX_MANIFEST_BYTES + 1)
    if len(data) > MAX_MANIFEST_BYTES:
        raise ValueError("Storyboard exceeds 32 KiB")
    obj = json.loads(data, object_pairs_hook=unique_keys)
    if not isinstance(obj, dict) or set(obj) != {"version", "shots"} or type(obj["version"]) is not int or obj["version"] != 1:
        raise ValueError("Expected version 1 storyboard with shots")
    if not isinstance(obj["shots"], list) or not 1 <= len(obj["shots"]) <= MAX_SHOTS:
        raise ValueError("Supply between 1 and 8 shots")
    return obj


def validate_source(root, name):
    if not isinstance(name, str) or not 1 <= len(name) <= 240 or "\\" in name or "\x00" in name:
        raise ValueError("Shot file must be a safe relative MP4 path")
    rel = Path(name)
    if (rel.is_absolute() or not rel.parts or any(x in ("..", ".") for x in rel.parts)
            or rel.suffix.lower() != ".mp4" or ":" in name):
        raise ValueError("No URLs, absolute paths or traversal in shot file")
    at = root
    for part in rel.parts:
        at = at / part
        if at.is_symlink():
            raise ValueError("Symlinked shot paths are not allowed")
    if not at.is_file():
        raise ValueError("Shot file does not exist")
    return at


def validate_shots(root, storyboard):
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Shot root must be an existing local directory, not a symlink")
    output = []
    total = 0
    cache = {}
    for index, raw in enumerate(storyboard["shots"]):
        if not isinstance(raw, dict) or set(raw) != {"file", "source_sha256", "start_frame",
                                                     "frames", "caption", "rights_ref"}:
            raise ValueError("Every shot needs file, digest, start_frame, frames, caption and rights_ref")
        first, frames = raw["start_frame"], raw["frames"]
        if (type(first) is not int or type(frames) is not int or
                first < 0 or not 1 <= frames <= MAX_TOTAL_FRAMES):
            raise ValueError("Shot frame offsets and lengths must be nonnegative integers")
        if (not isinstance(raw["source_sha256"], str) or
                not HEX64.fullmatch(raw["source_sha256"])):
            raise ValueError("A full lowercase source SHA-256 is required")
        for field in ("caption", "rights_ref"):
            value = raw[field]
            if (not isinstance(value, str) or not value.strip() or len(value) > 180
                    or any(ord(ch) < 32 or ord(ch) == 127 for ch in value)):
                raise ValueError(f"Shot {field} must be printable, nonblank and <=180 characters")
        source = validate_source(root, raw["file"])
        if raw["file"] not in cache:
            cache[raw["file"]] = inspect(source)
        item = cache[raw["file"]]
        if item["summary"]["sha256"] != raw["source_sha256"]:
            raise ValueError("Source SHA-256 does not match reviewed storyboard")
        if item["summary"]["fps"] != "16/1":
            raise ValueError("Storyboard currently requires 16 FPS input footage")
        if first + frames > item["summary"]["frame_count"]:
            raise ValueError("Shot cut extends beyond real decoded frames")
        total += frames
        if total > MAX_TOTAL_FRAMES:
            raise ValueError("Combined storyboard exceeds 64 frames (4 seconds at 16 FPS)")
        chosen = item["frames"][first:first + frames]
        width, height = item["summary"]["width"], item["summary"]["height"]
        change = sum(a != b for a, b in zip(chosen, chosen[1:]))
        dark = sum(sum(max(frame[k:k + 3]) < 16 for k in range(0, len(frame), 3)) /
                   (width * height) >= 0.95 for frame in chosen)
        output.append({"index": index, "source": source, "file": raw["file"],
                       "source_sha256": raw["source_sha256"], "start_frame": first,
                       "frames": frames, "timeline_start_frame": total - frames,
                       "caption": raw["caption"], "rights_ref": raw["rights_ref"],
                       "dark_frames_in_source_cut": dark,
                       "nonidentical_transitions_in_source_cut": change})
    return output, total


def dimensions(width, height):
    if (type(width) is not int or type(height) is not int or
            width < 16 or height < 16 or width > 512 or height > 512 or
            width % 2 or height % 2 or width * height > 512 * 512):
        raise ValueError("Output dimensions must be even, between 16 and 512")
    return width, height


def make_video(shots, total_frames, output, width, height):
    command = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
               "-filter_complex_threads", "1", "-threads", "1"]
    for shot in shots:
        command.extend(["-protocol_whitelist", "file,pipe", "-i", str(shot["source"])])
    filters = []
    for i, shot in enumerate(shots):
        start, end = shot["start_frame"], shot["start_frame"] + shot["frames"]
        # All filter arguments below are bounded integers; no raw caption/path interpolation.
        filters.append(f"[{i}:v:0]trim=start_frame={start}:end_frame={end},"
                       f"setpts=PTS-STARTPTS,scale={width}:{height}:force_original_aspect_ratio=decrease,"
                       f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v{i}]")
    filters.append("".join(f"[v{i}]" for i in range(len(shots))) +
                   f"concat=n={len(shots)}:v=1:a=0[outv]")
    command += ["-filter_complex", ";".join(filters), "-map", "[outv]", "-an", "-sn", "-dn",
                "-frames:v", str(total_frames), "-r", str(FPS), "-c:v", "libx264",
                "-preset", "ultrafast", "-crf", "22", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(output)]
    try:
        run = subprocess.run(command, capture_output=True, timeout=90, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Offline FFmpeg assembly failed or exceeded CPU timeout") from error
    if run.returncode:
        raise ValueError("Offline FFmpeg could not assemble the selected MP4 shots")


def subtitle_time(frame):
    milliseconds = round(frame * 1000 / FPS)
    h, rem = divmod(milliseconds, 3600 * 1000)
    m, rem = divmod(rem, 60 * 1000)
    s, ms = divmod(rem, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def captions_srt(shots):
    chunks = []
    for number, shot in enumerate(shots, 1):
        start = shot["timeline_start_frame"]
        chunks.append(f'{number}\n{subtitle_time(start)} --> {subtitle_time(start + shot["frames"])}\n'
                      f'{shot["caption"]}\n')
    return "\n".join(chunks) + "\n"


def preview_html(summary, compiled_frames, width, height):
    cards = []
    for shot in summary["shots"]:
        center = shot["timeline_start_frame"] + shot["frames"] // 2
        encoded = png(compiled_frames[center], width, height)
        cards.append(f'<article><h2>Shot {shot["index"] + 1}: {escape(shot["caption"])}</h2>'
                     f'<img alt="Rendered shot preview" src="data:image/png;base64,{encoded}">'
                     f'<p>Timeline frames {shot["timeline_start_frame"]}–'
                     f'{shot["timeline_start_frame"] + shot["frames"] - 1} '
                     f'· Source {escape(shot["file"])} · Rights {escape(shot["rights_ref"])}</p></article>')
    return ("""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Eternyx CPU storyboard preview</title><style>:root{color-scheme:light dark}body{font:1rem/1.5 system-ui;
max-width:64rem;margin:2rem auto;padding:0 1rem}article{padding:1rem 0;border-bottom:1px solid #777}
img{max-width:100%;height:auto}p{overflow-wrap:anywhere}</style><main>
<h1>Offline video storyboard render</h1><p>Real assembled MP4 frames using local FFmpeg.
Source footage, rights and captions were operator-provided; this tool does not generate AI imagery.
The MP4 has no audio; optional subtitles are stored in captions.srt.</p>
""" + "".join(cards) + """<p>See manifest.json for source hashes, cut boundaries and output checks.</p></main></html>
""")


def assemble(storyboard_path, root, destination, width=128, height=72):
    dimensions(width, height)
    storyboard = load_manifest(storyboard_path)
    shots, total = validate_shots(root, storyboard)
    if destination.exists() or destination.is_symlink():
        raise ValueError("Choose a new output directory; overwriting is forbidden")
    if not destination.parent.is_dir() or destination.parent.is_symlink():
        raise ValueError("Output parent must be an existing non-symlink directory")
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-storyboard-", dir=destination.parent))
    try:
        output = stage / "video.mp4"
        make_video(shots, total, output, width, height)
        result = inspect(output)
        if (result["summary"]["frame_count"] != total or result["summary"]["fps"] != "16/1" or
                result["summary"]["width"] != width or result["summary"]["height"] != height):
            raise ValueError("Rendered MP4 failed frame-accurate output verification")
        public_shots = [{k: v for k, v in shot.items() if k != "source"} for shot in shots]
        summary = {"version": 1, "type": "local CPU shot assembly",
                   "video": result["summary"],
                   "shots": public_shots,
                   "total_frames": total,
                   "audio": "removed", "captions": "external SRT sidecar",
                   "model_generation": False}
        (stage / "captions.srt").write_text(captions_srt(shots), encoding="utf-8")
        (stage / "manifest.json").write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n",
                                             encoding="utf-8")
        (stage / "preview.html").write_text(preview_html(summary, result["frames"], width, height),
                                             encoding="utf-8")
        if destination.exists() or destination.is_symlink():
            raise ValueError("Output directory appeared during assembly; refusing overwrite")
        stage.rename(destination)
        return summary
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--storyboard", required=True, type=Path)
    parser.add_argument("--clips", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--width", type=int, default=128)
    parser.add_argument("--height", type=int, default=72)
    args = parser.parse_args()
    try:
        summary = assemble(args.storyboard, args.clips, args.output, args.width, args.height)
        print(json.dumps({"output": str(args.output), "frames": summary["total_frames"],
                          "video_sha256": summary["video"]["sha256"]}))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
