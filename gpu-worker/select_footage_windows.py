"""Apply reviewed offsets together and publish a decoded contact sheet and manifest."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile

from review_training_footage import write_review


def select_windows(clips, manifest_path, picks, output):
    raw = manifest_path.read_bytes()
    manifest = json.loads(raw)
    if manifest.get("version") != 1 or not isinstance(manifest.get("clips"), list):
        raise ValueError("Expected a version 1 dataset manifest")
    rows = {row["file"]: row for row in manifest["clips"]}
    if len(rows) != len(manifest["clips"]):
        raise ValueError("Duplicate file in manifest")
    if not picks:
        raise ValueError("Choose at least one clip")
    changes = {}
    for name, value in picks:
        if name not in rows or name in changes:
            raise ValueError(f"Unknown or repeated clip: {name}")
        if not value.isascii() or not value.isdecimal() or int(value) > 2**31 - 1:
            raise ValueError("Start frame must be a nonnegative 32-bit offset")
        start = int(value)
        row = rows[name]
        changes[name] = {"file": name, "split": row["split"], "source_sha256": row["sha256"],
                         "previous_start_frame": row.get("start_frame", 0), "start_frame": start}
        row["start_frame"] = start
    if output.exists():
        raise FileExistsError(output)
    with tempfile.TemporaryDirectory(dir=output.parent) as temp:
        stage = Path(temp) / "review"
        stage.mkdir()
        selected = stage / "dataset.json"
        payload = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
        selected.write_bytes(payload)
        write_review(clips, selected, stage / "footage-review.html")
        receipt = {"version": 1, "original_manifest_sha256": hashlib.sha256(raw).hexdigest(),
                   "selected_manifest_sha256": hashlib.sha256(payload).hexdigest(),
                   "selections": list(changes.values())}
        (stage / "selections.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        output.mkdir()
        try:
            stage.replace(output)
        except OSError:
            output.rmdir()
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("clips", "manifest", "output"):
        parser.add_argument(name, type=Path)
    parser.add_argument("--pick", nargs=2, action="append", required=True, metavar=("FILE", "START_FRAME"))
    args = parser.parse_args()
    select_windows(args.clips, args.manifest, args.pick, args.output)
