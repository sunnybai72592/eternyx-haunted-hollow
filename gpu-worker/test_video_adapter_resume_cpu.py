"""Exercise two-window cycling and exact resume with the real CPU training step."""
from pathlib import Path
import tempfile
import unittest

import torch
from safetensors.torch import load_file, save_file
from unittest.mock import patch

import train_video_adapter as trainer
from wan_adapter_bundle import load_for_inference, transformer_identity
from wan_adapter_step import small_model


class ResumeTests(unittest.TestCase):
    def test_training_continuation(self):
        def model():
            torch.manual_seed(41)
            return small_model()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base_model = model()
            base_model.save_pretrained(root / "transformer")
            identity = transformer_identity(root / "transformer")
            windows = [root / "first.safetensors", root / "second.safetensors"]
            for index, path in enumerate(windows):
                save_file({"latents": torch.full((1, 4, 2, 8, 8), float(index)),
                           "text_embeddings": torch.ones(1, 6, 16)}, str(path))
            forward = trainer.train_step
            seen = []
            def record(net, opt, latents, text, generator):
                seen.append(latents.flatten()[0].item())
                return forward(net, opt, latents, text, generator)
            with patch.object(trainer, "train_step", record):
                expected = trainer.run(base_model, identity, windows, root / "continuous", 4)
                self.assertEqual(seen, [0, 1, 0, 1])
            interrupted = root / "resumed"
            trainer.run(model(), identity, windows, interrupted, 1)
            with self.assertRaisesRegex(ValueError, "changed"):
                trainer.run(model(), identity, windows[::-1], interrupted, 4, resume=True)
            actual = trainer.run(model(), identity, windows, interrupted, 4, resume=True)
            reference = load_file(str(expected / "adapter.safetensors"))
            restored = load_file(str(actual / "adapter.safetensors"))
            self.assertEqual(reference.keys(), restored.keys())
            for key in reference:
                torch.testing.assert_close(reference[key], restored[key], rtol=0, atol=0)
            # Inference should need only the two portable bundle files.
            (actual / "training.pt").unlink()
            candidate = model().eval()
            inputs = (torch.ones(1, 4, 2, 8, 8), torch.tensor([500.]), torch.ones(1, 6, 16))
            with torch.no_grad():
                baseline = candidate(*inputs).sample
                load_for_inference(candidate, root, actual)
                predicted = candidate(*inputs).sample
                torch.testing.assert_close(predicted, base_model.eval()(*inputs).sample, rtol=0, atol=0)
                self.assertFalse(torch.equal(predicted, baseline))
            self.assertFalse(any(p.requires_grad for p in candidate.parameters()))
            config = root / "transformer" / "config.json"
            original = config.read_bytes()
            config.write_bytes(original + b" ")
            with self.assertRaisesRegex(ValueError, "base transformer mismatch"):
                load_for_inference(model(), root, actual)
            config.write_bytes(original)
            with (actual / "adapter.safetensors").open("ab") as stream:
                stream.write(b"changed")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                load_for_inference(model(), root, actual)


if __name__ == "__main__":
    unittest.main()
