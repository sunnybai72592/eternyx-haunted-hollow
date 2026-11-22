"""Encode a locally prepared Wan 2.1 training window on CPU."""
import argparse
from pathlib import Path

import numpy as np
import torch
from diffusers import AutoencoderKLWan
from safetensors.torch import save
from transformers import AutoTokenizer, UMT5EncoderModel


@torch.no_grad()
def encode(frames, caption, vae, tokenizer, encoder, length=512):
    if frames.dtype != np.uint8 or frames.ndim != 4 or frames.shape[-1] != 3:
        raise ValueError("Expected uint8 RGB frames in THWC order")
    if not caption.strip():
        raise ValueError("Caption is empty")
    pixels = torch.from_numpy(frames).permute(3, 0, 1, 2).unsqueeze(0).float() / 127.5 - 1
    latent = vae.eval().encode(pixels).latent_dist.mode()
    mean = latent.new_tensor(vae.config.latents_mean).view(1, -1, 1, 1, 1)
    std = latent.new_tensor(vae.config.latents_std).view_as(mean)
    if mean.size(1) != latent.size(1) or not torch.all(std > 0):
        raise ValueError("Incompatible VAE normalization")
    latent = (latent - mean) / std
    tokens = tokenizer(caption.strip(), padding="max_length", truncation=True, max_length=length,
                       return_tensors="pt", return_attention_mask=True)
    mask = tokens.attention_mask
    text = encoder.eval()(input_ids=tokens.input_ids, attention_mask=mask).last_hidden_state
    text = text.masked_fill(~mask.bool().unsqueeze(-1), 0)
    if not torch.isfinite(latent).all() or not torch.isfinite(text).all():
        raise ValueError("Encoder returned non-finite values")
    return {"latents": latent.contiguous(), "text_embeddings": text.contiguous()}


def load_encoders(root):
    vae = AutoencoderKLWan.from_pretrained(root / "vae", local_files_only=True, use_safetensors=True)
    tokenizer = AutoTokenizer.from_pretrained(root / "tokenizer", local_files_only=True)
    encoder = UMT5EncoderModel.from_pretrained(root / "text_encoder", local_files_only=True, use_safetensors=True)
    return vae, tokenizer, encoder


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path, help="Reviewed local Wan 2.1 Diffusers directory")
    parser.add_argument("window", type=Path, help="NPZ produced by prepare_training_frames.py")
    parser.add_argument("output", type=Path, help="New safetensors file")
    args = parser.parse_args()
    with np.load(args.window, allow_pickle=False) as window:
        frames = window["frames"]
        if window["version"].item() != 1 or frames.shape != (17, 224, 384, 3) or window["fps"].item() != 16:
            parser.error("Expected a version 1 training window at 16 fps")
        caption = str(window["caption"].item())
        metadata = {key: str(window[key].item()) for key in ("sha256", "scene", "caption")}
        metadata["start_frame"] = str(window["start_frame"].item()) if "start_frame" in window else "0"
    root = args.snapshot.resolve(strict=True)
    vae, tokenizer, encoder = load_encoders(root)
    data = save(encode(frames, caption, vae, tokenizer, encoder), metadata=metadata)
    with args.output.open("xb") as stream:
        try:
            stream.write(data)
            stream.flush()
        except OSError:
            args.output.unlink(missing_ok=True)
            raise


if __name__ == "__main__":
    main()
