"""Offline encoder-to-optimizer integration using tiny, randomly initialized models."""
import argparse
import json
import subprocess
import sys
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
from evaluate_video_adapter import holdout_loss
from prepare_training_frames import prepare_evaluation_frames, prepare_frames
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


def export_pair(left, right, clip):
    if left.shape != (17, 32, 32, 3) or right.shape != left.shape:
        raise RuntimeError("Unexpected comparison dimensions")
    changed = (left != right).any(dim=-1).sum().item()
    if not changed:
        raise RuntimeError("The trained adapter produced identical RGB frames")
    joined = torch.cat((left, right), dim=2).contiguous().numpy().tobytes()
    # Lossless RGB keeps even single-level differences intact in the review copy.
    subprocess.run(["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                    "-s", "64x32", "-r", "16", "-i", "pipe:0", "-c:v", "libx264rgb",
                    "-crf", "0", str(clip)], input=joined, check=True)
    decoded = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(clip),
                                       "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"])
    if decoded != joined:
        raise RuntimeError("Exported comparison did not preserve all RGB frames")
    return changed


def compare(batch, evaluations, provenance, vae, root, output):
    base = small_model().eval()
    transformer = root / "transformer"
    base.save_pretrained(transformer)
    window = root / "window.safetensors"
    save_file(batch, str(window))
    train_model = type(base).from_pretrained(transformer, local_files_only=True)
    checkpoint = run(train_model, transformer_identity(transformer), [window], root / "training", 4)
    candidate = type(base).from_pretrained(transformer, local_files_only=True)
    load_for_inference(candidate, root, checkpoint)
    cases = []
    clips = []
    for scene, evaluation in evaluations.items():
        for seed in (1701, 1702, 1703):
            noise = torch.randn(evaluation["latents"].shape, generator=torch.Generator().manual_seed(seed))
            text = evaluation["text_embeddings"]
            baseline_losses = holdout_loss(base, evaluation, noise)
            candidate_losses = holdout_loss(candidate, evaluation, noise)
            left = render(base, vae, noise, text)
            right = render(candidate, vae, noise, text)
            clip = root / ("comparison.mp4" if not cases else f"{scene}-{seed}.mp4")
            changed = export_pair(left, right, clip)
            clips.append(clip)
            delta = sum(c - b for b, c in zip(baseline_losses, candidate_losses)) / len(baseline_losses)
            cases.append({"scene": scene, "caption": provenance["evaluations"][scene]["caption"],
                          "seed": seed, "baseline_flow_mse": baseline_losses, "adapter_flow_mse": candidate_losses,
                          "mean_mse_delta": delta, "frames": len(left), "changed_pixel_positions_across_frames": changed,
                          "file": clip.name, "comparison_sha256": fingerprint(clip)})
    deltas = [case["mean_mse_delta"] for case in cases]
    summary = {"pairs": len(cases), "lower_error": sum(d < 0 for d in deltas),
               "higher_error": sum(d > 0 for d in deltas), "equal_error": deltas.count(0),
               "mean_mse_delta": sum(deltas) / len(deltas)}
    report = {"fixture": "synthetic CPU test with randomly initialized tiny Wan models",
              "left": "base", "right": "trained adapter", "clips": provenance,
              "eval_noise_levels": [0.25, 0.5, 0.75], "training_steps": 4, "sampling_steps": 4, "fps": 16,
              "adapter_sha256": fingerprint(checkpoint / "adapter.safetensors"), **cases[0],
              "cases": cases, "summary": summary}
    if output is not None:
        output.mkdir(parents=True, exist_ok=False)
        for clip in clips:
            (output / clip.name).write_bytes(clip.read_bytes())
        (output / "comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(summary), flush=True)
    return checkpoint


def main(output):
    torch.manual_seed(31)
    with tempfile.TemporaryDirectory() as work:
        run_fixture(Path(work).resolve(), output)


def run_fixture(root, output):
    rows = []
    for split, source, caption in (("train", "testsrc2", "moving shapes"),
                                   ("eval", "smptebars", "color bars"),
                                   ("eval", "testsrc", "moving bars")):
        video = root / f"{source}.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                        f"{source}=size=64x64:rate=16:duration=2", "-c:v", "mpeg4", str(video)], check=True)
        rows.append({"file": video.name, "sha256": fingerprint(video), "caption": caption,
                     "scene": source, "split": split, "rights": "original",
                     "rights_ref": "synthetic test generator"})
    manifest = {"version": 1, "clips": rows}
    window = prepare_frames(root, manifest, "testsrc2.mp4")
    held_out = {row["scene"]: prepare_evaluation_frames(root, manifest, row["file"])
                for row in rows if row["split"] == "eval"}
    def describe(window):
        return {key: window[key] for key in ("scene", "sha256", "caption")}
    provenance = {"train": describe(window), "eval": describe(held_out["smptebars"]),
                  "evaluations": {scene: describe(clip) for scene, clip in held_out.items()}}
    vocab = Tokenizer(WordLevel({"<pad>": 0, "<unk>": 1, "moving": 2, "shapes": 3,
                                 "color": 4, "bars": 5}, unk_token="<unk>"))
    vocab.pre_tokenizer = Whitespace()
    tokenizer = PreTrainedTokenizerFast(tokenizer_object=vocab, pad_token="<pad>", unk_token="<unk>")
    encoder = UMT5EncoderModel(UMT5Config(vocab_size=6, d_model=16, d_kv=8, d_ff=32, num_layers=1, num_heads=2))
    vae = AutoencoderKLWan(base_dim=8, dim_mult=[1, 2, 2, 2], z_dim=4, num_res_blocks=1,
                           latents_mean=[0]*4, latents_std=[1]*4)
    # Crop for the tiny CPU transformer; production encoding consumes the full window.
    def encode_window(clip):
        return encode(clip["frames"][:, :32, 176:208].copy(), clip["caption"], vae, tokenizer, encoder, length=8)
    batch = encode_window(window)
    evaluations = {scene: encode_window(clip) for scene, clip in held_out.items()}
    assert batch["latents"].shape == (1, 4, 5, 4, 4)
    text = batch["text_embeddings"]
    assert text.shape == (1, 8, 16) and text[:, 2:].count_nonzero() == 0
    checkpoint = compare(batch, evaluations, provenance, vae, root, output)
    vae.save_pretrained(root / "vae")
    tokenizer.save_pretrained(root / "tokenizer")
    encoder.save_pretrained(root / "text_encoder")
    manifest_path = root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest))
    dataset = root / "windows"
    worker_dir = Path(__file__).parent
    encode_command = [sys.executable, str(worker_dir / "encode_training_manifest.py"), str(root),
                      str(root), str(manifest_path), str(dataset)]
    subprocess.run(encode_command, check=True)
    entries = json.loads((dataset / "index.json").read_text())["windows"]
    assert [entry["source_file"] for entry in entries] == ["testsrc2.mp4"]
    training_window = dataset / entries[0]["window"]
    assert fingerprint(training_window) == entries[0]["window_sha256"]
    assert entries[0]["source_sha256"] == window["sha256"]
    train_command = [sys.executable, str(worker_dir / "train_video_adapter.py"), str(root),
                     str(root / "manifest-training"), "--dataset-index", str(dataset / "index.json"),
                     "--manifest", str(manifest_path), "--steps", "1"]
    subprocess.run(train_command, check=True)
    assert (root / "manifest-training" / "step-1" / "adapter.json").is_file()
    index = json.loads((dataset / "index.json").read_text())
    index["windows"][0]["window_sha256"] = "0" * 64
    (dataset / "index.json").write_text(json.dumps(index))
    rejected = subprocess.run(train_command + ["--resume"], capture_output=True, text=True)
    assert rejected.returncode and "checksum differs" in rejected.stderr
    report = root / "evaluation.json"
    command = [sys.executable, str(Path(__file__).with_name("evaluate_video_adapter.py")),
               str(root), str(checkpoint), str(root), str(manifest_path), str(report), "--seeds", "7"]
    subprocess.run(command, check=True)
    result = json.loads(report.read_text())
    assert [case["scene"] for case in result["cases"]] == ["smptebars", "testsrc"]
    assert all(case["seed"] == 7 for case in result["cases"])
    assert result["adapter_sha256"] == fingerprint(checkpoint / "adapter.safetensors")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-dir", type=Path, help="New directory for the synthetic MP4 and report")
    main(parser.parse_args().review_dir)
