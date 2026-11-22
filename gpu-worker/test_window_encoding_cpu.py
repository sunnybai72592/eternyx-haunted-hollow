"""Offline encoder-to-optimizer integration using tiny, randomly initialized models."""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

import torch
from diffusers import AutoencoderKLWan
from safetensors.torch import save_file
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from transformers import PreTrainedTokenizerFast, UMT5Config, UMT5EncoderModel

from encode_training_window import encode
from prepare_training_frames import prepare_frames
from train_video_adapter import run
from wan_adapter_bundle import fingerprint, load_for_inference, transformer_identity
from wan_adapter_step import small_model


@torch.inference_mode()
def render(model, vae, noise, text):
    latent = noise.clone()
    # Four uniform Euler steps from noise (t=1) to the video latent (t=0).
    for timestep in (1000., 750., 500., 250.):
        velocity = model(latent, torch.tensor([timestep]), text).sample
        latent = latent - 0.25 * velocity
    # This fixture uses unit latent standard deviation and zero mean.
    pixels = vae.decode(latent).sample[0].permute(1, 2, 3, 0)
    if not pixels.isfinite().all():
        raise ValueError("Non-finite decoded pixels")
    return ((pixels.clamp(-1, 1) + 1) * 127.5).round().to(torch.uint8)


def compare(batch, vae, root, output):
    base = small_model().eval()
    transformer = root / "transformer"
    base.save_pretrained(transformer)
    window = root / "window.safetensors"
    save_file(batch, str(window))
    train_model = type(base).from_pretrained(transformer, local_files_only=True)
    checkpoint = run(train_model, transformer_identity(transformer), [window], root / "training", 4)
    seed = 1701
    noise = torch.randn(batch["latents"].shape, generator=torch.Generator().manual_seed(seed))
    text = batch["text_embeddings"]
    left = render(base, vae, noise, text)
    load_for_inference(base, root, checkpoint)
    right = render(base, vae, noise, text)
    if left.shape != (17, 32, 32, 3) or right.shape != left.shape:
        raise RuntimeError("Unexpected comparison dimensions")
    changed = (left != right).any(dim=-1).sum().item()
    if not changed:
        raise RuntimeError("The trained adapter produced identical RGB frames")
    joined = torch.cat((left, right), dim=2).contiguous().numpy().tobytes()
    # Lossless RGB keeps even single-level differences intact in the review copy.
    clip = root / "comparison.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                    "-s", "64x32", "-r", "16", "-i", "pipe:0", "-c:v", "libx264rgb",
                    "-crf", "0", str(clip)], input=joined, check=True)
    decoded = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(clip),
                                       "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"])
    if decoded != joined:
        raise RuntimeError("Exported comparison did not preserve all RGB frames")
    report = {"fixture": "synthetic CPU test with randomly initialized tiny Wan models",
              "left": "base", "right": "trained adapter", "caption": "moving shapes",
              "seed": seed, "training_steps": 4, "sampling_steps": 4, "fps": 16,
              "frames": len(left), "changed_pixel_positions_across_frames": changed,
              "adapter_sha256": fingerprint(checkpoint / "adapter.safetensors"),
              "comparison_sha256": fingerprint(clip)}
    if output is not None:
        output.mkdir(parents=True, exist_ok=False)
        (output / clip.name).write_bytes(clip.read_bytes())
        (output / "comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report), flush=True)


def main(output):
    torch.manual_seed(31)
    with tempfile.TemporaryDirectory() as work:
        root = Path(work)
        video = root / "sample.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                        "testsrc2=size=64x64:rate=16:duration=2", "-c:v", "mpeg4", str(video)], check=True)
        row = {"file": video.name, "sha256": hashlib.sha256(video.read_bytes()).hexdigest(),
               "caption": "moving shapes", "scene": "test", "split": "train",
               "rights": "original", "rights_ref": "synthetic test generator"}
        window = prepare_frames(root, {"version": 1, "clips": [row]}, video.name)
    vocab = Tokenizer(WordLevel({"<pad>": 0, "<unk>": 1, "moving": 2, "shapes": 3}, unk_token="<unk>"))
    vocab.pre_tokenizer = Whitespace()
    tokenizer = PreTrainedTokenizerFast(tokenizer_object=vocab, pad_token="<pad>", unk_token="<unk>")
    encoder = UMT5EncoderModel(UMT5Config(vocab_size=4, d_model=16, d_kv=8, d_ff=32, num_layers=1, num_heads=2))
    vae = AutoencoderKLWan(base_dim=8, dim_mult=[1, 2, 2, 2], z_dim=4, num_res_blocks=1,
                           latents_mean=[0]*4, latents_std=[1]*4)
    # Crop for the tiny CPU transformer; production encoding consumes the full window.
    batch = encode(window["frames"][:, :32, 176:208].copy(), window["caption"], vae, tokenizer, encoder, length=8)
    assert batch["latents"].shape == (1, 4, 5, 4, 4)
    text = batch["text_embeddings"]
    assert text.shape == (1, 8, 16) and text[:, 2:].count_nonzero() == 0
    with tempfile.TemporaryDirectory() as work:
        compare(batch, vae, Path(work).resolve(), output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-dir", type=Path, help="New directory for the synthetic MP4 and report")
    main(parser.parse_args().review_dir)
