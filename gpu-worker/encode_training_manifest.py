"""Encode the training split of a reviewed clip manifest on CPU."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile

from safetensors.torch import save_file

from encode_training_window import encode, load_encoders
from prepare_training_frames import prepare_frames
from wan_adapter_bundle import fingerprint


def prepare_dataset(snapshot, clips, manifest_path, output):
    if output.exists():
        raise FileExistsError(output)
    raw = manifest_path.read_bytes()
    manifest = json.loads(raw)
    rows = sorted((row for row in manifest["clips"] if row["split"] == "train"),
                  key=lambda row: row["file"])
    if not rows or len({row["sha256"] for row in rows}) != len(rows):
        raise ValueError("Expected distinct training clips")
    encoders = load_encoders(snapshot.resolve(strict=True))
    # Stage outside the destination so a failed encode never exposes a partial dataset.
    with tempfile.TemporaryDirectory(dir=output.parent) as temp:
        staged = Path(temp) / "dataset"
        staged.mkdir()
        windows = []
        for index, row in enumerate(rows):
            clip = prepare_frames(clips, manifest, row["file"])
            tensors = encode(clip["frames"], clip["caption"], *encoders)
            filename = f"window-{index:08d}.safetensors"
            path = staged / filename
            metadata = {key: clip[key] for key in ("scene", "caption", "sha256")}
            metadata["start_frame"] = str(clip["start_frame"])
            save_file(tensors, str(path), metadata=metadata)
            windows.append({"window": filename, "start_frame": clip["start_frame"], "source_file": row["file"],
                            "source_sha256": clip["sha256"], "window_sha256": fingerprint(path)})
        index_path = staged / "index.json"
        index_path.write_text(json.dumps({"version": 1, "manifest_sha256": hashlib.sha256(raw).hexdigest(),
                                          "windows": windows}, indent=2) + "\n", encoding="utf-8")
        # Reserve the name exclusively, including against other concurrent encoders.
        output.mkdir()
        try:
            staged.replace(output)
        except OSError:
            output.rmdir()
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("snapshot", "clips", "manifest", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    prepare_dataset(args.snapshot, args.clips, args.manifest, args.output)
