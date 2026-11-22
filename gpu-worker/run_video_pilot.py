"""Run a local CPU video adapter pilot from a reviewed dataset manifest."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def run_pilot(snapshot, clips, manifest, output, steps, seeds):
    if steps < 1 or not seeds or len(set(seeds)) != len(seeds) or any(not 0 <= s < 2**32 for s in seeds):
        raise ValueError("Provide positive steps and distinct unsigned 32-bit evaluation seeds")
    raw = manifest.read_bytes()
    dataset = json.loads(raw)
    if dataset.get("version") != 1 or {row["split"] for row in dataset["clips"]} != {"train", "eval"}:
        raise ValueError("A version 1 manifest with training and evaluation footage is required")
    snapshot = snapshot.resolve(strict=True)
    clips = clips.resolve(strict=True)
    output.mkdir(mode=0o700)
    reviewed = output / "dataset.json"
    reviewed.write_bytes(raw)
    encoded = output / "windows"
    training = output / "training"
    checkpoint = training / f"step-{steps}"
    evaluation = output / "evaluation.json"
    env = {**os.environ, "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "CUDA_VISIBLE_DEVICES": ""}
    stages = [
        ("encode_training_manifest.py", [snapshot, clips, reviewed, encoded]),
        ("train_video_adapter.py", [snapshot, training, "--dataset-index", encoded / "index.json",
                                    "--manifest", reviewed, "--steps", str(steps)]),
        ("evaluate_video_adapter.py", [snapshot, checkpoint, clips, reviewed, evaluation,
                                       "--seeds", *map(str, seeds)]),
        ("review_video_evaluation.py", [evaluation, output / "review.html"]),
    ]
    for script, arguments in stages:
        print(f"Running {script}", flush=True)
        subprocess.run([sys.executable, Path(__file__).with_name(script), *arguments], env=env, check=True)
    report = json.loads(evaluation.read_bytes())
    receipt = {"version": 1, "training_step": report["training_step"], "training_dataset": report["training_dataset"],
               "adapter_sha256": report["adapter_sha256"], "evaluation_seeds": seeds, "cases": len(report["cases"]),
               "checkpoint": str(checkpoint.relative_to(output)), "review": "review.html"}
    pending = output / ".pilot.json.tmp"
    pending.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    pending.replace(output / "pilot.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("snapshot", "clips", "manifest", "output"):
        parser.add_argument(name, type=Path)
    parser.add_argument("--steps", type=int, required=True)
    parser.add_argument("--seeds", nargs="+", type=int, default=[1701, 1702, 1703])
    args = parser.parse_args()
    run_pilot(args.snapshot, args.clips, args.manifest, args.output, args.steps, args.seeds)
