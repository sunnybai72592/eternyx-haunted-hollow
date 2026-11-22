"""Measure paired Wan flow prediction error on local manifest evaluation clips."""
import argparse
import hashlib
import json
from pathlib import Path

import torch
from diffusers import AutoencoderKLWan, WanTransformer3DModel
from transformers import AutoTokenizer, UMT5EncoderModel

from encode_training_window import encode
from prepare_training_frames import prepare_evaluation_frames
from wan_adapter_bundle import fingerprint, load_for_inference


NOISE_LEVELS = (0.25, 0.5, 0.75)


@torch.inference_mode()
def holdout_loss(model, batch, noise):
    """Flow velocity MSE at fixed noise levels on the unseen clip."""
    clean = batch["latents"]
    target = noise - clean
    losses = []
    for t in NOISE_LEVELS:
        noisy = clean.lerp(noise, t)
        prediction = model(noisy, torch.tensor([1000 * t]), batch["text_embeddings"]).sample
        loss = torch.nn.functional.mse_loss(prediction.float(), target.float())
        if not torch.isfinite(loss):
            raise ValueError("Non-finite evaluation loss")
        losses.append(loss.item())
    return losses


def evaluate(snapshot, adapter, clips, manifest_bytes, seeds):
    manifest = json.loads(manifest_bytes)
    rows = [row for row in manifest["clips"] if row["split"] == "eval"]
    if not rows or len({row["sha256"] for row in rows}) != len(rows):
        raise ValueError("Expected distinct evaluation clips")
    if not seeds or len(set(seeds)) != len(seeds) or any(not 0 <= seed < 2**32 for seed in seeds):
        raise ValueError("Provide distinct unsigned 32-bit seeds")
    options = {"local_files_only": True, "use_safetensors": True}
    model = WanTransformer3DModel.from_pretrained(snapshot / "transformer", **options)
    load_for_inference(model, snapshot, adapter.resolve(strict=True))
    vae = AutoencoderKLWan.from_pretrained(snapshot / "vae", **options)
    tokenizer = AutoTokenizer.from_pretrained(snapshot / "tokenizer", local_files_only=True)
    encoder = UMT5EncoderModel.from_pretrained(snapshot / "text_encoder", **options)
    cases = []
    for row in rows:
        window = prepare_evaluation_frames(clips, manifest, row["file"])
        batch = encode(window["frames"], window["caption"], vae, tokenizer, encoder)
        for seed in seeds:
            noise = torch.randn(batch["latents"].shape, generator=torch.Generator().manual_seed(seed))
            model.disable_adapters()
            baseline = holdout_loss(model, batch, noise)
            model.enable_adapters()
            candidate = holdout_loss(model, batch, noise)
            delta = sum(c - b for b, c in zip(baseline, candidate)) / len(NOISE_LEVELS)
            cases.append({"scene": window["scene"], "source_sha256": window["sha256"], "seed": seed,
                          "baseline_flow_mse": baseline, "adapter_flow_mse": candidate, "mean_mse_delta": delta})
    return {"version": 1, "metric": "flow velocity mean squared error", "noise_levels": NOISE_LEVELS,
            "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
            "adapter_sha256": fingerprint(adapter / "adapter.safetensors"), "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("snapshot", "adapter", "clips", "manifest", "output"):
        parser.add_argument(name, type=Path)
    parser.add_argument("--seeds", type=int, nargs="+", default=[1701, 1702, 1703])
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Choose a new report path")
    result = evaluate(args.snapshot, args.adapter, args.clips, args.manifest.read_bytes(), args.seeds)
    with args.output.open("x", encoding="utf-8") as stream:
        try:
            json.dump(result, stream, indent=2, allow_nan=False)
            stream.write("\n")
            stream.flush()
        except OSError:
            args.output.unlink(missing_ok=True)
            raise


if __name__ == "__main__":
    main()
