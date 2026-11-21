"""Train on local encoded windows and resume from completed CPU checkpoints (Linux)."""
import argparse
import fcntl
import hashlib
from pathlib import Path
import tempfile

import torch
from diffusers import WanTransformer3DModel
from peft import get_peft_model_state_dict, set_peft_model_state_dict
from safetensors.torch import load_file, save_file

from wan_adapter_step import attach_adapter, train_step


def fingerprint(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def run(model, base_identity, windows, output, steps, resume=False, seed=17, rank=2, interval=10):
    if min(steps, interval, rank) < 1 or not windows:
        raise ValueError("Provide encoded windows and positive steps, rank and checkpoint interval")
    digests = [fingerprint(path) for path in windows]
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
                torch.save({"identity": identity, "completed": completed, "loss": loss,
                            "optimizer": optimizer.state_dict(), "noise_rng": generator.get_state(),
                            "torch_rng": torch.get_rng_state()}, stage / "training.pt")
                stage.rename(target)
            print(f"Saved step {completed}/{steps} · loss {loss:.6f}", flush=True)
        return output / f"step-{completed}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path, help="Local Wan Diffusers snapshot")
    parser.add_argument("output", type=Path)
    parser.add_argument("windows", type=Path, nargs="+", help="Ordered train-split encoded safetensors")
    parser.add_argument("--steps", type=int, required=True, help="Total optimizer steps including completed steps")
    parser.add_argument("--checkpoint-every", type=int, default=10)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    root = args.snapshot.resolve(strict=True) / "transformer"
    base = {p.name: fingerprint(p) for p in sorted(root.iterdir())
            if p.is_file() and p.suffix in (".json", ".safetensors")}
    model = WanTransformer3DModel.from_pretrained(root, local_files_only=True, use_safetensors=True)
    run(model, base, args.windows, args.output, args.steps, args.resume, interval=args.checkpoint_every)
