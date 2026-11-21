"""Exercise two-window cycling and exact resume with the real CPU training step."""
from pathlib import Path
import tempfile
import unittest

import torch
from safetensors.torch import load_file, save_file
from unittest.mock import patch

import train_video_adapter as trainer
from wan_adapter_step import small_model


class ResumeTests(unittest.TestCase):
    def test_training_continuation(self):
        def model():
            torch.manual_seed(41)
            return small_model()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
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
                expected = trainer.run(model(), "tiny", windows, root / "continuous", 4)
                self.assertEqual(seen, [0, 1, 0, 1])
            interrupted = root / "resumed"
            trainer.run(model(), "tiny", windows, interrupted, 1)
            with self.assertRaisesRegex(ValueError, "changed"):
                trainer.run(model(), "tiny", windows[::-1], interrupted, 4, resume=True)
            actual = trainer.run(model(), "tiny", windows, interrupted, 4, resume=True)
            reference = load_file(str(expected / "adapter.safetensors"))
            restored = load_file(str(actual / "adapter.safetensors"))
            self.assertEqual(reference.keys(), restored.keys())
            for key in reference:
                torch.testing.assert_close(reference[key], restored[key], rtol=0, atol=0)


if __name__ == "__main__":
    unittest.main()
