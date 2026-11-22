"""Inspect actual locally rendered MP4 frames on CPU with offline FFmpeg."""
import argparse
import base64
import csv
import hashlib
from html import escape
import io
import json
import math
from pathlib import Path
import shutil
import subprocess
from fractions import Fraction

MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_FRAMES = 64
MAX_PIXELS = 512 * 512
DARK_RGB_THRESHOLD = 16
DARK_PIXEL_SHARE = 0.95
NEAR_STATIC_RGB_DELTA = 2.0
TIMEOUT_SECONDS = 45


def media_path(path):
    if path.is_symlink() or not path.is_file() or path.suffix.lower() != ".mp4":
        raise ValueError("Input must be a regular local .mp4 file, not a symlink")
    size = path.stat().st_size
    if not 0 < size <= MAX_FILE_BYTES:
        raise ValueError("MP4 size must be between 1 byte and 32 MiB")
    return path


def execute(command, *, input_bytes=None, timeout=TIMEOUT_SECONDS):
    try:
        result = subprocess.run(command, input=input_bytes, capture_output=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Offline FFmpeg command unavailable or timed out") from error
    if result.returncode != 0:
        raise ValueError("Offline FFmpeg refused or could not decode this local MP4")
    return result.stdout


def probe(path):
    media_path(path)
    raw = execute(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
                   "-show_entries", "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,nb_frames",
                   "-show_entries", "format=format_name",
                   "-of", "json", str(path)])
    try:
        data = json.loads(raw)
        streams = [stream for stream in data["streams"] if stream.get("codec_type") == "video"]
        if len(streams) != 1 or "mp4" not in data["format"]["format_name"]:
            raise ValueError("Expected one video stream in a local MP4 container")
        stream = streams[0]
        width, height = stream["width"], stream["height"]
        if (type(width) is not int or type(height) is not int or
                not 1 <= width <= 512 or not 1 <= height <= 512 or width * height > MAX_PIXELS):
            raise ValueError("Video dimensions exceed the bounded CPU decode size")
        fps = Fraction(stream["avg_frame_rate"])
        nominal = Fraction(stream["r_frame_rate"])
        if not (1 <= fps <= 60) or fps != nominal:
            raise ValueError("Only fixed-frame-rate video between 1 and 60 FPS is supported")
        declared = stream.get("nb_frames", "N/A")
        if declared not in (None, "N/A", ""):
            declared = int(declared)
            if not 1 <= declared <= MAX_FRAMES:
                raise ValueError("Video exceeds the 64-frame CPU audit limit")
    except (KeyError, TypeError, ZeroDivisionError, OverflowError) as error:
        raise ValueError("Incomplete or invalid MP4 metadata") from error
    return {"width": width, "height": height, "fps_numerator": fps.numerator,
            "fps_denominator": fps.denominator, "declared_frames": declared if type(declared) is int else None}


def decode(path, metadata):
    width, height = metadata["width"], metadata["height"]
    raw = execute(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-threads", "1",
                   "-protocol_whitelist", "file,pipe", "-i", str(path), "-map", "0:v:0",
                   "-an", "-sn", "-dn", "-frames:v", str(MAX_FRAMES + 1),
                   "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"])
    stride = width * height * 3
    if len(raw) % stride or not 0 < len(raw) // stride <= MAX_FRAMES:
        raise ValueError("Decoded MP4 is empty, truncated or exceeds the 64-frame limit")
    frames = [raw[i:i + stride] for i in range(0, len(raw), stride)]
    declared = metadata["declared_frames"]
    if declared is not None and declared != len(frames):
        raise ValueError("Decoded frame count differs from MP4 metadata")
    return frames


def frame_metrics(frames, pixels):
    rows = []
    previous = None
    for index, frame in enumerate(frames):
        mean_rgb = sum(frame) / len(frame)
        dark = sum(1 for i in range(0, len(frame), 3)
                   if max(frame[i], frame[i + 1], frame[i + 2]) < DARK_RGB_THRESHOLD) / pixels
        adjacent = None
        changed = None
        repeated = False
        if previous is not None:
            adjacent = sum(abs(a - b) for a, b in zip(previous, frame)) / len(frame)
            changed = sum(1 for i in range(0, len(frame), 3)
                          if frame[i:i + 3] != previous[i:i + 3]) / pixels
            repeated = frame == previous
        rows.append({"frame": index, "mean_rgb": round(mean_rgb, 6),
                     "dark_pixel_fraction": round(dark, 6),
                     "dark_frame": dark >= DARK_PIXEL_SHARE, "adjacent_mean_rgb_change": None if adjacent is None else round(adjacent, 6),
                     "adjacent_changed_pixel_fraction": None if changed is None else round(changed, 6),
                     "exact_repeat": repeated,
                     "near_static_transition": previous is not None and adjacent <= NEAR_STATIC_RGB_DELTA})
        previous = frame
    return rows


def inspect(path):
    metadata = probe(path)
    frames = decode(path, metadata)
    rows = frame_metrics(frames, metadata["width"] * metadata["height"])
    transitions = rows[1:]
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    fps = Fraction(metadata["fps_numerator"], metadata["fps_denominator"])
    summary = {"sha256": digest.hexdigest(), "width": metadata["width"], "height": metadata["height"],
               "fps": f"{fps.numerator}/{fps.denominator}", "frame_count": len(frames),
               "duration_seconds": round(len(frames) / float(fps), 6),
               "mean_rgb": round(sum(row["mean_rgb"] for row in rows) / len(rows), 6),
               "dark_frame_count": sum(row["dark_frame"] for row in rows),
               "identical_transition_count": sum(row["exact_repeat"] for row in transitions),
               "near_static_transition_count": sum(row["near_static_transition"] for row in transitions),
               "mean_adjacent_rgb_change": (round(sum(row["adjacent_mean_rgb_change"] for row in transitions)
                                                  / len(transitions), 6) if transitions else None)}
    return {"summary": summary, "rows": rows, "frames": frames}


def compare(reference, candidate):
    base = reference["summary"]
    other = candidate["summary"]
    for field in ("width", "height", "fps", "frame_count"):
        if base[field] != other[field]:
            raise ValueError("Paired renders differ in dimensions, FPS or frame count")
    frames = len(reference["frames"])
    samples = [sum(abs(a - b) for a, b in zip(left, right)) / len(left)
               for left, right in zip(reference["frames"], candidate["frames"])]
    return {"paired_frames": frames, "identical_frame_pairs": sum(left == right for left, right in
                                                                 zip(reference["frames"], candidate["frames"])),
            "mean_absolute_rgb_difference": round(sum(samples) / frames, 6),
            "per_frame_absolute_rgb_difference": [round(value, 6) for value in samples],
            "note": "Pixel differences are descriptive; greater difference is not proof of better quality."}


def validate_limit(value, flag):
    if value is not None and (type(value) is not int or value < 0 or value > MAX_FRAMES):
        raise ValueError(f"{flag} must be an integer between 0 and 64")
    return value


def evaluate_flags(summary, max_dark_frames=None, max_identical_transitions=None):
    validate_limit(max_dark_frames, "--max-dark-frames")
    validate_limit(max_identical_transitions, "--max-identical-transitions")
    failures = []
    if max_dark_frames is not None and summary["dark_frame_count"] > max_dark_frames:
        failures.append("dark_frame_count")
    if max_identical_transitions is not None and summary["identical_transition_count"] > max_identical_transitions:
        failures.append("identical_transition_count")
    return failures


def png(frame, width, height):
    data = execute(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-threads", "1",
                    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s:v", f"{width}x{height}", "-i", "pipe:0",
                    "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], input_bytes=frame, timeout=15)
    if not data.startswith(b"\x89PNG\r\n\x1a\n") or len(data) > 2 * 1024 * 1024:
        raise ValueError("Frame preview encoding failed")
    return base64.b64encode(data).decode("ascii")


def html_report(report, images):
    def table(headers, values):
        head = "".join(f"<th scope='col'>{escape(str(column))}</th>" for column in headers)
        rows = "".join("<tr>" + "".join(f"<td>{escape(str(column))}</td>" for column in row) + "</tr>"
                       for row in values)
        return f"<div class='scroll'><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>"
    cards = []
    for name, item in report["videos"].items():
        data = item["summary"]
        stats = table(["Frames", "Dark frames", "Exact repeats", "Near-static", "Mean RGB"],
                      [[data["frame_count"], data["dark_frame_count"], data["identical_transition_count"],
                        data["near_static_transition_count"], data["mean_rgb"]]])
        thumbnails = "".join(f"<figure><img alt='{escape(name)} frame {index}' src='data:image/png;base64,{img}'>"
                             f"<figcaption>Frame {index}</figcaption></figure>" for index, img in images[name])
        cards.append(f"<section><h2>{escape(name.title())}</h2>{stats}<div class='pictures'>{thumbnails}</div></section>")
    paired = report.get("paired_comparison")
    pair_table = ""
    if paired is not None:
        pair_table = "<h2>Paired render difference</h2>" + table(
            ["Paired frames", "Identical pairs", "Mean absolute RGB difference"],
            [[paired["paired_frames"], paired["identical_frame_pairs"], paired["mean_absolute_rgb_difference"]]])
    flags = table(["Video", "Exceeded limits"], [[name, ", ".join(items) if items else "none"]
                                              for name, items in report["flags"].items()])
    return ("""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Eternyx CPU video render audit</title><style>:root{color-scheme:light dark}
body{font:1rem/1.5 system-ui;max-width:70rem;margin:2rem auto;padding:0 1rem}
table{border-collapse:collapse;width:100%}td,th{padding:.55rem;text-align:left;border-bottom:1px solid #777}
.scroll{overflow-x:auto}.pictures{display:flex;gap:1rem;flex-wrap:wrap}figure{margin:0;max-width:30%}
img{max-width:100%;height:auto}figcaption{font-size:.85rem}</style><main>
<h1>Eternyx offline render audit</h1><p>Actual decoded MP4 frames, analyzed on CPU.
Counts and RGB differences do not measure prompt fidelity, aesthetic quality, or subject realism.
Nearly static or dark frames can be intentional. Review the pictures and videos yourself.</p>
""" + "".join(cards) + pair_table + "<h2>Optional limit checks</h2>" + flags
        + "<p>Raw frame measurements are in <a href='frames.csv'>frames.csv</a>. "
          "Provenance and thresholds are in <a href='summary.json'>summary.json</a>.</p></main></html>\n")


def csv_report(videos):
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["video", "frame", "mean_rgb", "dark_pixel_fraction", "dark_frame",
                     "adjacent_mean_rgb_change", "adjacent_changed_pixel_fraction", "exact_repeat", "near_static_transition"])
    for name, item in videos.items():
        for row in item["rows"]:
            writer.writerow([name, row["frame"], row["mean_rgb"], row["dark_pixel_fraction"],
                             row["dark_frame"], row["adjacent_mean_rgb_change"],
                             row["adjacent_changed_pixel_fraction"], row["exact_repeat"],
                             row["near_static_transition"]])
    return out.getvalue()


def save(directory, report, csv_text, html):
    if directory.exists() or directory.is_symlink():
        raise ValueError("Choose a new output directory; existing reports are never overwritten")
    files = {"summary.json": json.dumps(report, indent=2, allow_nan=False) + "\n",
             "frames.csv": csv_text, "review.html": html}
    directory.mkdir(parents=False, exist_ok=False)
    try:
        for name, content in files.items():
            with (directory / name).open("x", encoding="utf-8", newline="") as stream:
                stream.write(content)
    except Exception:
        shutil.rmtree(directory)
        raise


def audit(reference_path, candidate_path=None, *, max_dark_frames=None, max_identical_transitions=None):
    videos = {"reference": inspect(reference_path)}
    if candidate_path is not None:
        videos["candidate"] = inspect(candidate_path)
    paired = compare(videos["reference"], videos["candidate"]) if "candidate" in videos else None
    failures = {name: evaluate_flags(item["summary"], max_dark_frames, max_identical_transitions)
                for name, item in videos.items()}
    summary = {"version": 1, "engine": "offline FFmpeg CPU RGB frame inspection",
               "bounds": {"max_file_bytes": MAX_FILE_BYTES, "max_frames": MAX_FRAMES,
                          "max_pixels_per_frame": MAX_PIXELS},
               "thresholds": {"max_dark_frames": max_dark_frames,
                              "max_identical_transitions": max_identical_transitions},
               "videos": {name: {"summary": item["summary"], "frames": item["rows"]}
                          for name, item in videos.items()},
               "flags": failures, "passes_configured_limits": not any(failures.values()),
               "interpretation": "Diagnostic only: frame statistics cannot establish generation quality."}
    if paired is not None:
        summary["paired_comparison"] = paired
    images = {}
    for name, item in videos.items():
        frames = item["frames"]
        indices = sorted(set((0, len(frames) // 2, len(frames) - 1)))
        images[name] = [(index, png(frames[index], item["summary"]["width"], item["summary"]["height"]))
                        for index in indices]
    return summary, csv_report(videos), html_report(summary, images)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True, help="Already rendered local MP4")
    parser.add_argument("--candidate", type=Path, help="Optional matched MP4 to compare framewise")
    parser.add_argument("--output", type=Path, required=True, help="New local audit directory")
    parser.add_argument("--max-dark-frames", type=int)
    parser.add_argument("--max-identical-transitions", type=int)
    parser.add_argument("--fail-on-flags", action="store_true",
                        help="Exit 2 on configured threshold exceedance after saving the audit")
    args = parser.parse_args()
    try:
        summary, csv_text, html = audit(args.reference, args.candidate,
                                        max_dark_frames=args.max_dark_frames,
                                        max_identical_transitions=args.max_identical_transitions)
        save(args.output, summary, csv_text, html)
        print(json.dumps({"output": str(args.output),
                          "passes_configured_limits": summary["passes_configured_limits"]}))
        return 2 if args.fail_on_flags and not summary["passes_configured_limits"] else 0
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
