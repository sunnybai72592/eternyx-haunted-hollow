"""Contract tests of the ACTUAL Wan inference function with fake library modules.

No GPU, model weights, downloads, generation, or paid services. Fake export
writes MP4-shaped fixture bytes ONLY to verify the concrete function wiring.
"""
import contextlib
import json
import importlib.util
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("eternyx_wan_contract", ROOT / "wan21_infer.py")
wan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wan)

class InferenceContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.snapshot = self.root / "trusted-model"
        self.snapshot.mkdir()
        self.output = self.root / "generated.mp4"
        self.calls = []
        self.cuda_available = True
        self.bf16_supported = True
        self.pipeline_frames = ["synthetic-frame-only"]

        torch = types.ModuleType("torch")
        torch.float32 = object()
        torch.bfloat16 = object()
        torch.cuda = types.SimpleNamespace(
            is_available=lambda: self.cuda_available,
            is_bf16_supported=lambda: self.bf16_supported,
        )
        @contextlib.contextmanager
        def inference_mode():
            self.calls.append(("inference_mode_enter",))
            try:
                yield
            finally:
                self.calls.append(("inference_mode_exit",))
        torch.inference_mode = inference_mode

        test_case = self
        class VAE:
            @classmethod
            def from_pretrained(cls, *args, **kwargs):
                test_case.calls.append(("vae_load", args, kwargs))
                return "fake-vae"
        class Pipeline:
            @classmethod
            def from_pretrained(cls, *args, **kwargs):
                test_case.calls.append(("pipeline_load", args, kwargs))
                return cls()
            def enable_model_cpu_offload(self):
                test_case.calls.append(("enable_cpu_offload",))
            def __call__(self, **kwargs):
                test_case.calls.append(("generate", kwargs))
                return types.SimpleNamespace(frames=[test_case.pipeline_frames])
        def fake_export(frames, output, fps):
            test_case.calls.append(("export_mp4", frames, fps))
            Path(output).write_bytes(
                bytes.fromhex("000000146674797069736f6d") + b"synthetic-fixture-not-a-video"
            )
        diffusers = types.ModuleType("diffusers")
        diffusers.WanPipeline = Pipeline
        diffusers.AutoencoderKLWan = VAE
        utils = types.ModuleType("diffusers.utils")
        utils.export_to_video = fake_export
        diffusers.utils = utils
        self.libs = patch.dict(sys.modules, {
            "torch": torch, "diffusers": diffusers, "diffusers.utils": utils,
        })
        self.libs.start()
        self.env = patch.dict(os.environ, {}, clear=False)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.libs.stop()
        self.temp.cleanup()

    def test_full_real_function_wiring_only_uses_local_model_and_exports_mp4(self):
        wan.generate_with_wan({
            "prompt": "Quiet mountains",
            "negative_prompt": "flicker",
            "num_frames": 17,
        }, self.snapshot, self.output)
        vae = next(x for x in self.calls if x[0] == "vae_load")
        self.assertEqual(vae[1], (str(self.snapshot),))
        self.assertEqual(vae[2]["subfolder"], "vae")
        self.assertIs(vae[2]["local_files_only"], True)
        pipe = next(x for x in self.calls if x[0] == "pipeline_load")
        self.assertEqual(pipe[1], (str(self.snapshot),))
        self.assertEqual(pipe[2]["vae"], "fake-vae")
        self.assertIs(pipe[2]["local_files_only"], True)
        self.assertEqual([x[0] for x in self.calls], [
            "vae_load", "pipeline_load", "enable_cpu_offload",
            "inference_mode_enter", "generate", "inference_mode_exit",
            "export_mp4",
        ])
        generated = next(x for x in self.calls if x[0] == "generate")
        self.assertEqual(generated[1], {
            "prompt": "Quiet mountains", "negative_prompt": "flicker",
            "num_frames": 17,
        })
        self.assertEqual(next(x for x in self.calls if x[0] == "export_mp4")[2], 16)
        self.assertTrue(self.output.is_file())
        self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
        self.assertEqual(os.environ["TRANSFORMERS_OFFLINE"], "1")

    def test_seeded_runs_get_fresh_cpu_generators(self):
        class Generator:
            def __init__(self, device):
                self.device = device

            def manual_seed(self, seed):
                self.seed = seed
                return self

        with patch.object(sys.modules["torch"], "Generator", Generator, create=True):
            for seed in (0, 0, 4294967295):
                job = wan.parse_job(json.dumps({"featureKey": "ai.video.text_to_video",
                    "prompt": "Workshop", "durationSeconds": 1, "seed": seed}))
                wan.generate_with_wan(job, self.snapshot, self.output)
        generators = [data["generator"] for name, *args in self.calls
                      if name == "generate" for data in args]
        self.assertEqual([(g.device, g.seed) for g in generators],
                         [("cpu", 0), ("cpu", 0), ("cpu", 4294967295)])
        self.assertIsNot(generators[0], generators[1])

    def test_malformed_seeds_are_rejected_before_inference(self):
        for seed in (True, False, -1, 4294967296, None, "12", 1.5):
            with self.subTest(seed=seed), self.assertRaisesRegex(ValueError, "seed"):
                wan.parse_job(json.dumps({"featureKey": "ai.video.text_to_video",
                    "prompt": "Workshop", "durationSeconds": 1, "seed": seed}))

    def test_no_cuda_fails_before_loading_any_model_weights(self):
        self.cuda_available = False
        with self.assertRaisesRegex(RuntimeError, "CUDA GPU unavailable"):
            wan.generate_with_wan({"prompt": "x", "negative_prompt": "",
                                   "num_frames": 17}, self.snapshot, self.output)
        self.assertEqual(self.calls, [])
        self.assertFalse(self.output.exists())

    def test_bf16_incompatible_gpu_fails_before_loading_weights(self):
        self.bf16_supported = False
        with self.assertRaisesRegex(RuntimeError, "CUDA BF16 support unavailable"):
            wan.generate_with_wan({"prompt": "x", "negative_prompt": "",
                                   "num_frames": 17}, self.snapshot, self.output)
        self.assertEqual(self.calls, [])
        self.assertFalse(self.output.exists())

if __name__ == "__main__":
    unittest.main()
