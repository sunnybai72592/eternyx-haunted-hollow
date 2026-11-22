"""Train on local encoded windows and resume from completed CPU checkpoints (Linux)."""
import argparse
import fcntl
import hashlib
import json
import re
from pathlib import Path
import tempfile

import torch
from diffusers import WanTransformer3DModel
from peft import get_peft_model_state_dict, set_peft_model_state_dict
from safetensors import safe_open
from safetensors.torch import load_file, save_file

from wan_adapter_bundle import fingerprint, transformer_identity, write_metadata
from wan_adapter_step import attach_adapter, train_step


def read_dataset(index_path, manifest_path):
    index_bytes = index_path.read_bytes()
    index = json.loads(index_bytes)
    raw = manifest_path.read_bytes()
    if index["version"] != 1 or hashlib.sha256(raw).hexdigest() != index["manifest_sha256"]:
        raise ValueError("Dataset index does not match the reviewed manifest")
    manifest = json.loads(raw)
    rows = sorted((row for row in manifest["clips"] if row["split"] == "train"), key=lambda row: row["file"])
    entries = index["windows"]
    if manifest["version"] != 1 or not rows or len(entries) != len(rows):
        raise ValueError("Incomplete training split")
    windows = []
    digests = []
    for row, entry in zip(rows, entries):
        name = entry["window"]
        if not isinstance(name, str) or not re.fullmatch(r"window-[0-9]{8,}\.safetensors", name):
            raise ValueError("Invalid indexed window filename")
        path = index_path.parent / name
        if path.is_symlink() or not path.is_file():
            raise ValueError("Missing or linked indexed window")
        if (entry["source_file"], entry["source_sha256"]) != (row["file"], row["sha256"]):
            raise ValueError("Indexed training sources differ from the manifest")
        with safe_open(str(path), framework="pt") as handle:
            metadata = handle.metadata() or {}
        start = row.get("start_frame", 0)
        if (type(start) is not int or not 0 <= start <= 2**31 - 1
                or entry.get("start_frame", 0) != start or metadata.get("start_frame", "0") != str(start)):
            raise ValueError("Indexed window offset differs from the manifest")
        if any(metadata.get(key) != row[key] for key in ("sha256", "caption", "scene")):
            raise ValueError("Window annotations differ from the manifest")
        windows.append(path)
        digests.append(entry["window_sha256"])
    dataset = {"manifest_sha256": index["manifest_sha256"], "index_sha256": hashlib.sha256(index_bytes).hexdigest(),
               "window_count": len(windows)}
    return windows, digests, dataset


def run(model, base_identity, windows, output, steps, resume=False, seed=17, rank=2, interval=10, expected_digests=None,
        dataset=None):
    if min(steps, interval, rank) < 1 or not windows:
        raise ValueError("Provide encoded windows and positive steps, rank and checkpoint interval")
    digests = [fingerprint(path) for path in windows]
    if expected_digests is not None and digests != expected_digests:
        raise ValueError("Encoded window checksum differs from the dataset index")
    if len(set(digests)) != len(windows):
        raise ValueError("The window list contains duplicate files")
    identity = {"format": 1, "base": base_identity, "windows": digests, "seed": seed,
                "rank": rank, "optimizer": "AdamW", "lr": 0.001, "torch": str(torch.__version__)}
    output.mkdir(parents=True, exist_ok=True)
    with (output / ".training.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        checkpoints = sorted((p for p in output.glob("step-*") if p.is_dir()
                              and p.name[5:].isdigit()), key=lambda p: int(p.name[5:]))
        if bool(checkpoints) != resume:
            raise ValueError("Use --resume for an existing run, or a new directory for a fresh run")
        torch.manual_seed(seed)
        params = attach_adapter(model, rank)
        model.train()
        optimizer = torch.optim.AdamW(params, lr=identity["lr"])
        generator = torch.Generator().manual_seed(seed)
        completed = 0
        if resume:
            latest = checkpoints[-1]
            state = torch.load(latest / "training.pt", map_location="cpu", weights_only=True)
            if state["identity"] != identity:
                raise ValueError("Checkpoint base, ordered windows or training configuration changed")
            previous_dataset = state.get("training_dataset")
            if previous_dataset is not None:
                if dataset is not None and dataset != previous_dataset:
                    raise ValueError("Checkpoint training dataset changed")
                dataset = previous_dataset
            completed = state["completed"]
            if completed != int(latest.name[5:]) or steps < completed:
                raise ValueError("Invalid checkpoint step or requested total")
            set_peft_model_state_dict(model, load_file(str(latest / "adapter.safetensors")))
            optimizer.load_state_dict(state["optimizer"])
            generator.set_state(state["noise_rng"])
            torch.set_rng_state(state["torch_rng"])
        for index in range(completed, steps):
            batch = load_file(str(windows[index % len(windows)]))
            loss = train_step(model, optimizer, batch["latents"], batch["text_embeddings"], generator)
            completed = index + 1
            if completed % interval and completed != steps:
                continue
            target = output / f"step-{completed}"
            with tempfile.TemporaryDirectory(dir=output) as temp:
                stage = Path(temp) / "checkpoint"
                stage.mkdir()
                save_file(get_peft_model_state_dict(model), str(stage / "adapter.safetensors"))
                write_metadata(stage, base_identity, rank, dataset=dataset, step=completed)
                torch.save({"training_dataset": dataset, "identity": identity, "completed": completed, "loss": loss,
                            "optimizer": optimizer.state_dict(), "noise_rng": generator.get_state(),
                            "torch_rng": torch.get_rng_state()}, stage / "training.pt")
                stage.rename(target)
            print(f"Saved step {completed}/{steps} · loss {loss:.6f}", flush=True)
        return output / f"step-{completed}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path, help="Local Wan Diffusers snapshot")
    parser.add_argument("output", type=Path)
    parser.add_argument("windows", type=Path, nargs="*", help="Ordered train-split encoded safetensors")
    parser.add_argument("--dataset-index", type=Path, help="Dataset index produced by the manifest encoder")
    parser.add_argument("--manifest", type=Path, help="Reviewed manifest used to create the index")
    parser.add_argument("--steps", type=int, required=True, help="Total optimizer steps including completed steps")
    parser.add_argument("--checkpoint-every", type=int, default=10)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    if bool(args.dataset_index) != bool(args.manifest) or bool(args.windows) == bool(args.dataset_index):
        parser.error("Supply ordered windows or both --dataset-index and --manifest")
    windows, digests, dataset = read_dataset(args.dataset_index, args.manifest) if args.dataset_index else (args.windows, None, None)
    root = args.snapshot.resolve(strict=True) / "transformer"
    base = transformer_identity(root)
    model = WanTransformer3DModel.from_pretrained(root, local_files_only=True, use_safetensors=True)
    run(model, base, windows, args.output, args.steps, args.resume,
        interval=args.checkpoint_every, expected_digests=digests, dataset=dataset)
