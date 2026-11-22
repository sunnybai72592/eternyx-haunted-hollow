"""Decode one train-split clip from a reviewed Eternyx manifest to local RGB frames."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np

WIDTH, HEIGHT, FPS, FRAMES = 384, 224, 16, 17


def prepare_frames(root, manifest, name):
    return _prepare_split(root, manifest, name, "train")


def prepare_evaluation_frames(root, manifest, name):
    return _prepare_split(root, manifest, name, "eval")


def _prepare_split(root, manifest, name, split):
    if manifest.get("version") != 1 or not isinstance(manifest.get("clips"), list):
        raise ValueError("Expected a version 1 dataset manifest")
    rows = manifest["clips"]
    matches = [row for row in rows if row["file"] == name]
    if len(matches) != 1 or matches[0]["split"] != split:
        raise ValueError(f"Select one {split}-split clip by its exact manifest path")
    row = matches[0]
    start = row.get("start_frame", 0)
    if type(start) is not int or not 0 <= start <= 2**31 - 1:
        raise ValueError("Invalid start_frame")
    scene = row["scene"].strip().casefold()
    if not scene or not row["caption"].strip() or row["rights"] not in ("original", "licensed") or not row["rights_ref"].strip():
        raise ValueError("Missing training annotation or rights reference")
    for other in rows:
        if other["split"] not in ("train", "eval"):
            raise ValueError("Unknown dataset split")
        if other["split"] != split and (other["sha256"] == row["sha256"] or other["scene"].strip().casefold() == scene):
            raise ValueError("Training and evaluation footage overlap")
    root = root.resolve(strict=True)
    path = (root / name).resolve(strict=True)
    if Path(name).is_absolute() or not path.is_relative_to(root) or path.suffix.lower() != ".mp4" or not path.is_file():
        raise ValueError("Expected a local MP4 inside the clip directory")
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
        if digest != row["sha256"]:
            raise ValueError("Clip changed since manifest preparation")
    decoded = subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file", "-f", "mov",
        "-i", str(path), "-map", "0:v:0", "-an", "-sn", "-dn", "-vf",
        f"fps={FPS},trim=start_frame={start}:end_frame={start + FRAMES},setpts=PTS-STARTPTS,"
        f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1",
        "-frames:v", str(FRAMES), "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
    ], capture_output=True, check=True, timeout=60)
    if len(decoded.stdout) != FRAMES * HEIGHT * WIDTH * 3:
        raise ValueError("Clip is too short for 17 frames at 16 fps")
    frames = np.frombuffer(decoded.stdout, dtype=np.uint8).reshape(FRAMES, HEIGHT, WIDTH, 3)
    return {"frames": frames, "caption": row["caption"], "scene": row["scene"],
            "sha256": digest, "start_frame": start, "fps": FPS, "version": 1}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clips", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("clip", help="Exact relative file path from the training split")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        batch = prepare_frames(args.clips, json.loads(args.manifest.read_text(encoding="utf-8")), args.clip)
        with args.output.open("xb") as stream:
            try:
                np.savez_compressed(stream, **batch)
                stream.flush()
            except OSError:
                args.output.unlink(missing_ok=True)
                raise
    except (OSError, KeyError, TypeError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Cannot prepare frames: {error}\n")


if __name__ == "__main__":
    main()
