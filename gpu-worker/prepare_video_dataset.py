"""Build a local, versioned clip manifest. No network, CUDA, or model dependencies."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import subprocess
import sys

FIELDS = ("file", "scene", "split", "caption", "rights", "rights_ref", "quality_check")


def inspect_clip(path):
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-protocol_whitelist", "file", "-f", "mov",
         "-select_streams", "v:0", "-show_entries", "stream=width,height,duration",
         "-of", "json", str(path)], capture_output=True, text=True, timeout=30, check=True)
    streams = json.loads(proc.stdout).get("streams", [])
    if not streams:
        raise ValueError("missing video stream")
    stream = streams[0]
    width, height = int(stream["width"]), int(stream["height"])
    duration = float(stream["duration"])
    if min(width, height) < 1 or not 0 < duration < float("inf"):
        raise ValueError("invalid video dimensions or duration")
    return {"width": width, "height": height, "duration_seconds": duration}


def prepare(root, sheet, inspect=inspect_clip):
    root = root.resolve(strict=True)
    clips, seen, scenes = [], set(), {}
    reader = csv.DictReader(sheet)
    if sorted(reader.fieldnames or []) not in (sorted(FIELDS), sorted((*FIELDS, "start_frame"))):
        raise ValueError("CSV headers must be " + ",".join(FIELDS))
    for row in reader:
        try:
            if None in row or any(v is None for v in row.values()):
                raise ValueError("incorrect number of fields")
            item = {key: value.strip() for key, value in row.items()}
            offset = item.pop("start_frame", "")
            if offset:
                if not offset.isascii() or not offset.isdecimal() or int(offset) > 2**31 - 1:
                    raise ValueError("start_frame must be a nonnegative 32-bit frame offset")
                item["start_frame"] = int(offset)
            if any(not item[key] for key in FIELDS):
                raise ValueError("all fields are required")
            if item["rights"] not in ("original", "licensed"):
                raise ValueError("record original or licensed footage and its rights reference")
            if item["split"] not in ("train", "eval"):
                raise ValueError("split must be train or eval")
            scene = item["scene"].casefold()
            if scenes.setdefault(scene, item["split"]) != item["split"]:
                raise ValueError("one scene cannot occur in both splits")
            rel = Path(item["file"])
            path = (root / rel).resolve(strict=True)
            if rel.is_absolute() or not path.is_relative_to(root) or path.suffix.lower() != ".mp4" or not path.is_file():
                raise ValueError("use an MP4 inside the clip directory")
            with path.open("rb") as source:
                digest = hashlib.file_digest(source, "sha256").hexdigest()
            if digest in seen:
                raise ValueError("duplicate clip content")
            seen.add(digest)
            clips.append({**item, "file": path.relative_to(root).as_posix(), "sha256": digest, **inspect(path)})
        except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
            raise ValueError(f"CSV line {reader.line_num}: {error}") from error
    if set(scenes.values()) != {"train", "eval"}:
        raise ValueError("include separate training and evaluation scenes")
    return {"version": 1, "clips": sorted(clips, key=lambda clip: clip["file"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clips", type=Path)
    parser.add_argument("annotations", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        with args.annotations.open(encoding="utf-8-sig", newline="") as sheet:
            manifest = prepare(args.clips, sheet)
        # Exclusive creation protects a previously reviewed manifest on a rerun.
        with args.output.open("x", encoding="utf-8") as output:
            try:
                json.dump(manifest, output, indent=2, ensure_ascii=False)
                output.write("\n")
                output.flush()
            except OSError:
                args.output.unlink(missing_ok=True)
                raise
    except (ValueError, OSError, csv.Error) as error:
        parser.exit(1, f"Cannot prepare dataset: {error}\n")


if __name__ == "__main__":
    main()
