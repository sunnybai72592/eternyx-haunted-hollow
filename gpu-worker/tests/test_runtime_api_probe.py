"""Zero-download runtime compatibility regression tests.

These intentionally use injected fake modules. Passing tests do not claim a
working GPU, model loading, or AI video generation.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runtime_api_probe import check_runtime, check_local_model_index

class RuntimeCompatibilityTests(unittest.TestCase):
    def fake_import(self, name):
        modules = {
            "torch": SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True,
                is_bf16_supported=lambda: True),
                bfloat16=object(), float32=object()),
            "diffusers": SimpleNamespace(WanPipeline=lambda: None,
                AutoencoderKLWan=lambda: None),
            "diffusers.utils": SimpleNamespace(export_to_video=lambda *a: None),
        }
        return modules[name]

    def test_complete_injected_api_only_reports_compatibility(self):
        result = check_runtime(importer=self.fake_import)
        self.assertEqual(result["status"], "runtime_api_compatible")
        self.assertFalse(result["modelLoaded"])
        self.assertFalse(result["videoGenerated"])
        self.assertFalse(result["safeToActivatePaidGpu"])
        self.assertTrue(all(result["checks"].values()))

    def test_rejects_missing_wan_pipeline_symbol(self):
        def importer(name):
            if name == "diffusers":
                return SimpleNamespace(AutoencoderKLWan=lambda: None)
            return self.fake_import(name)
        result = check_runtime(importer=importer)
        self.assertEqual(result["status"], "blocked")
        self.assertFalse(result["checks"]["api:diffusers"])

    def test_rejects_incompatible_bfloat16_gpu(self):
        result = check_runtime(importer=self.fake_import,
            cuda_available=lambda: True, bf16_supported=lambda: False)
        self.assertEqual(result["status"], "blocked")
        self.assertFalse(result["checks"]["cuda_bfloat16_supported"])

    def test_missing_library_does_not_raise_or_execute_model(self):
        def importer(name):
            raise ModuleNotFoundError(name)
        result = check_runtime(importer=importer)
        self.assertEqual(result["status"], "blocked")
        self.assertFalse(result["checks"]["api:torch"])
        self.assertFalse(result["checks"]["cuda_detected"])

    def test_model_index_schema_and_unsafe_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            index = root / "model_index.json"
            index.write_text(json.dumps({"_class_name": "WanPipeline",
                "vae": ["diffusers", "AutoencoderKLWan"],
                "transformer": ["diffusers", "WanTransformer3DModel"]}))
            self.assertTrue(check_local_model_index(str(root)))
            alias = root.parent / (root.name + "-linked")
            try:
                alias.symlink_to(root, target_is_directory=True)
                self.assertFalse(check_local_model_index(str(alias)))
            finally:
                alias.unlink(missing_ok=True)
            index.write_text(json.dumps({"_class_name": "SomethingElse"}))
            self.assertFalse(check_local_model_index(str(root)))
            index.write_bytes(b"x" * 65537)
            self.assertFalse(check_local_model_index(str(root)))

    def test_rejects_missing_video_encoder_export(self):
        def importer(name):
            if name == "diffusers.utils":
                return SimpleNamespace()
            return self.fake_import(name)
        self.assertFalse(check_runtime(importer=importer)["checks"]["api:diffusers.utils"])

if __name__ == "__main__":
    unittest.main()
