"""No paid GPUs, no cloud calls, no CUDA, no weights in these tests."""
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "staging_gpu_canary.py"
spec = importlib.util.spec_from_file_location("eternyx_wan_canary", MODULE)
canary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(canary)

class GPUCanaryOfflineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.model = self.root / "model"
        self.model.mkdir()
        (self.model / "model_index.json").write_text('{"_class_name":"WanPipeline"}')
        self.manifest = self.root / "model-hashes.json"
        self.write_manifest()

    def tearDown(self):
        self.tmp.cleanup()

    def write_manifest(self):
        files = {}
        for item in self.model.rglob("*"):
            if item.is_file():
                files[item.relative_to(self.model).as_posix()] = hashlib.sha256(item.read_bytes()).hexdigest()
        self.manifest.write_text(json.dumps({
            "modelId": canary.MODEL_ID, "revision": "a" * 40, "files": files,
        }))

    def test_approval_and_capped_cost_must_be_present(self):
        self.assertRaises(ValueError, canary.authorize, "", 60, 150, 100)
        self.assertEqual(canary.authorize(canary.APPROVAL, 600, 150, 100), 30)
        self.assertRaises(ValueError, canary.authorize, canary.APPROVAL, 600, 150, 10)
        self.assertRaises(ValueError, canary.authorize, canary.APPROVAL, 9999, 150, 500)
        self.assertRaises(ValueError, canary.authorize, canary.APPROVAL, 60, True, 100)

    def test_verified_snapshot_requires_exact_pinned_hashes(self):
        self.assertEqual(canary.verify_manifest(str(self.model), str(self.manifest)), "a" * 40)
        (self.model / "model_index.json").write_text('{"_class_name":"WrongPipeline"}')
        self.assertRaises(ValueError, canary.verify_manifest, str(self.model), str(self.manifest))

    def test_extra_files_and_traversal_are_rejected(self):
        (self.model / "unreviewed.bin").write_bytes(b"untrusted")
        self.assertRaises(ValueError, canary.verify_manifest, str(self.model), str(self.manifest))
        (self.model / "unreviewed.bin").unlink()
        value = json.loads(self.manifest.read_text())
        value["files"]["../outside.bin"] = "0" * 64
        self.manifest.write_text(json.dumps(value))
        self.assertRaises(ValueError, canary.verify_manifest, str(self.model), str(self.manifest))

    def test_symlink_model_snapshot_is_denied(self):
        shortcut = self.root / "linked"
        shortcut.symlink_to(self.model, target_is_directory=True)
        self.assertRaises(ValueError, canary.verify_manifest, str(shortcut), str(self.manifest))

    def test_never_executes_without_isolated_staging(self):
        args = type("Args", (), {"dry_run": False, "approval": canary.APPROVAL,
            "max_seconds": 60, "hourly_cents": 150, "allowance_cents": 100,
            "model_dir": str(self.model), "manifest": str(self.manifest),
            "private_dir": str(self.root)})()
        with patch.dict(os.environ, {"ETERNYX_GPU_STAGING_ENV": ""}):
            self.assertRaises(ValueError, canary.run_once, args)

    def test_denies_fake_gpu_smoke_mode(self):
        args = type("Args", (), {"dry_run": True})()
        with patch.dict(os.environ, {"ETERNYX_GPU_STAGING_ENV": "isolated_staging"}):
            self.assertRaises(ValueError, canary.run_once, args)

if __name__ == "__main__":
    unittest.main()
