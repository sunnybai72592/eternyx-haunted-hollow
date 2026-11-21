"""Offline encoder-to-optimizer integration using tiny, randomly initialized models."""
import hashlib
import subprocess
import tempfile
from pathlib import Path

import torch
from diffusers import AutoencoderKLWan
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from transformers import PreTrainedTokenizerFast, UMT5Config, UMT5EncoderModel

from encode_training_window import encode
from prepare_training_frames import prepare_frames
from wan_adapter_step import attach_adapter, small_model, train_step


def main():
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
    model = small_model()
    params = attach_adapter(model, 2)
    before = [p.detach().clone() for p in params]
    train_step(model, torch.optim.AdamW(params, lr=0.001), batch["latents"], text,
               torch.Generator().manual_seed(17))
    assert any(not torch.equal(a, b) for a, b in zip(before, params))
    print("Decoded MP4, encoded frames and caption, verified adapter update on CPU.")


if __name__ == "__main__":
    main()
