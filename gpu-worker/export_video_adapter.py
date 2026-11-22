"""Export the two inference files from a completed local video pilot."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile

from wan_adapter_bundle import fingerprint


def export(pilot, output):
    receipt = json.loads((pilot / "pilot.json").read_bytes())
    step = receipt["training_step"]
    if type(step) is not int or step < 1 or receipt["version"] != 1:
        raise ValueError("Invalid pilot receipt")
    relative = Path("training") / f"step-{step}"
    if receipt["checkpoint"] != relative.as_posix():
        raise ValueError("Unexpected checkpoint path in receipt")
    checkpoint = pilot / relative
    if checkpoint.resolve(strict=True) != pilot.resolve(strict=True) / relative:
        raise ValueError("Linked checkpoint directory")
    if output.exists():
        raise FileExistsError(output)
    report = json.loads((pilot / "evaluation.json").read_bytes())
    with tempfile.TemporaryDirectory(dir=output.parent) as temp:
        staged = Path(temp) / "bundle"
        staged.mkdir(mode=0o700)
        for name in ("adapter.json", "adapter.safetensors"):
            source = checkpoint / name
            if source.is_symlink() or not source.is_file():
                raise ValueError(f"Missing or linked checkpoint file: {name}")
            shutil.copyfile(source, staged / name)
        metadata = json.loads((staged / "adapter.json").read_bytes())
        digest = fingerprint(staged / "adapter.safetensors")
        if digest != metadata["sha256"] or digest != receipt["adapter_sha256"] or digest != report["adapter_sha256"]:
            raise ValueError("Exported weights differ from the evaluated adapter")
        for key in ("training_step", "training_dataset"):
            if metadata[key] != receipt[key] or metadata[key] != report[key]:
                raise ValueError(f"Checkpoint provenance mismatch: {key}")
        output.mkdir(mode=0o700)
        try:
            staged.replace(output)
        except OSError:
            output.rmdir()
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pilot", type=Path)
    parser.add_argument("output", type=Path, help="New inference bundle directory")
    args = parser.parse_args()
    export(args.pilot, args.output)
