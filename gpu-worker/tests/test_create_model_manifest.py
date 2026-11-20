"""Offline model provenance-inventory tests. No models, network or GPU used."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from create_model_manifest import (
    REVIEW_ACK, create_manifest, inventory,
)
from staging_gpu_canary import verify_manifest

REVISION = "b" * 40

class ModelManifestToolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.model = self.root / "reviewed-model"
        self.model.mkdir(mode=0o700)
        (self.model / "model_index.json").write_text('{"_class_name":"WanPipeline"}')
        (self.model / "vae").mkdir()
        (self.model / "vae" / "config.json").write_text('{"sample_size":128}')
        (self.model / "weights.bin").write_bytes(b"synthetic-fixture-only")
        self.output = self.root / "manifest.json"

    def tearDown(self):
        self.temp.cleanup()

    def test_build_and_verify_complete_snapshot_inventory(self):
        result = create_manifest(str(self.model), REVISION, str(self.output), REVIEW_ACK)
        self.assertEqual(result["fileCount"], 3)
        self.assertEqual(result["status"], "manifest_created")
        self.assertEqual(verify_manifest(str(self.model), str(self.output)), REVISION)
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        value = json.loads(self.output.read_text())
        self.assertEqual(list(value["files"]), sorted(value["files"]))
        self.assertTrue(all(len(digest) == 64 for digest in value["files"].values()))

    def test_refuses_to_overwrite_or_write_inside_model(self):
        self.output.write_text("existing")
        with self.assertRaises(ValueError):
            create_manifest(str(self.model), REVISION, str(self.output), REVIEW_ACK)
        self.assertEqual(self.output.read_text(), "existing")
        inside = self.model / "manifest.json"
        with self.assertRaises(ValueError):
            create_manifest(str(self.model), REVISION, str(inside), REVIEW_ACK)
        self.assertFalse(inside.exists())

    def test_requires_explicit_review_and_revision(self):
        with self.assertRaises(ValueError):
            inventory(str(self.model), REVISION, "")
        with self.assertRaises(ValueError):
            inventory(str(self.model), "not-a-revision", REVIEW_ACK)
        with self.assertRaises(ValueError):
            inventory(str(self.model), REVISION.upper().replace("B", "B"), REVIEW_ACK)

    def test_rejects_nested_model_symlink_and_does_not_create_manifest(self):
        outside = self.root / "outside"
        outside.write_bytes(b"not-a-model")
        (self.model / "linked.bin").symlink_to(outside)
        with self.assertRaises(ValueError):
            create_manifest(str(self.model), REVISION, str(self.output), REVIEW_ACK)
        self.assertFalse(self.output.exists())

    def test_missing_index_and_file_ceiling_fail_closed(self):
        (self.model / "model_index.json").unlink()
        with self.assertRaises(ValueError):
            inventory(str(self.model), REVISION, REVIEW_ACK)
        (self.model / "model_index.json").write_text("fixture")
        with self.assertRaises(ValueError):
            inventory(str(self.model), REVISION, REVIEW_ACK, max_files=2)

    def test_mutated_snapshot_fails_consumer_integrity_verification(self):
        create_manifest(str(self.model), REVISION, str(self.output), REVIEW_ACK)
        (self.model / "weights.bin").write_bytes(b"modified-weights")
        with self.assertRaises(ValueError):
            verify_manifest(str(self.model), str(self.output))

if __name__ == "__main__":
    unittest.main()
