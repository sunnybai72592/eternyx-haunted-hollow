"""CPU training smoke test for a small Wan transformer with synthetic inputs."""
import argparse
from pathlib import Path

import torch
from diffusers import WanTransformer3DModel
from peft import LoraConfig, get_peft_model_state_dict, set_peft_model_state_dict
from safetensors.torch import load_file, save_file


def attach_adapter(model, rank):
    model.requires_grad_(False)
    model.add_adapter(LoraConfig(r=rank, lora_alpha=rank, target_modules=["to_q", "to_v"]))
    return [parameter for parameter in model.parameters() if parameter.requires_grad]


def train_step(model, optimizer, latents, text_embeddings, generator):
    """One flow-matching update on normalized video latents and text states."""
    noise = torch.randn(latents.shape, generator=generator, device=latents.device, dtype=latents.dtype)
    time = torch.rand(latents.shape[0], generator=generator, device=latents.device)
    mix = time.to(latents.dtype).view(-1, 1, 1, 1, 1)
    noisy = (1 - mix) * latents + mix * noise
    optimizer.zero_grad(set_to_none=True)
    prediction = model(noisy, time * 1000, text_embeddings).sample
    loss = torch.nn.functional.mse_loss(prediction.float(), (noise - latents).float())
    if not torch.isfinite(loss):
        raise ValueError("Non-finite training loss")
    loss.backward()
    torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0,
                                  error_if_nonfinite=True)
    optimizer.step()
    return loss.item()


def small_model():
    return WanTransformer3DModel(patch_size=(1, 2, 2), num_attention_heads=2,
                                 attention_head_dim=12, in_channels=4, out_channels=4,
                                 text_dim=16, freq_dim=32, ffn_dim=32, num_layers=1,
                                 rope_max_seq_len=32)


def smoke(output):
    output.mkdir(parents=True, exist_ok=False)
    torch.manual_seed(42)
    model = small_model()
    base = {key: value.detach().clone() for key, value in model.state_dict().items()}
    trainable = attach_adapter(model, 2)
    frozen = [(p, p.detach().clone()) for p in model.parameters() if not p.requires_grad]
    original = [p.detach().clone() for p in trainable]
    rng = torch.Generator(device="cpu").manual_seed(17)
    latents = torch.randn(1, 4, 2, 8, 8, generator=rng)
    text = torch.randn(1, 6, 16, generator=rng)
    loss = train_step(model, torch.optim.AdamW(trainable, lr=1e-3), latents, text, rng)
    if any(not torch.equal(p, before) for p, before in frozen):
        raise RuntimeError("A frozen base weight changed")
    if not any(not torch.equal(p, before) for p, before in zip(trainable, original)):
        raise RuntimeError("No adapter weights changed")
    path = output / "synthetic-smoke-adapter.safetensors"
    save_file(get_peft_model_state_dict(model), str(path))
    restored = small_model()
    restored.load_state_dict(base)
    attach_adapter(restored, 2)
    set_peft_model_state_dict(restored, load_file(str(path)))
    timestep = torch.tensor([500.0])
    with torch.no_grad():
        expected = model.eval()(latents, timestep, text).sample
        actual = restored.eval()(latents, timestep, text).sample
        torch.testing.assert_close(actual, expected, rtol=0, atol=0)
    print(f"CPU synthetic step passed. Loss {loss:.6f}. Adapter round-trip verified.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New directory for disposable tiny-model weights")
    smoke(parser.parse_args().output)
