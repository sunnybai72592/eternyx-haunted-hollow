"""Offline acceptance for the real Wan inference executable contract.

A controlled test renderer writes MP4-shaped fixture bytes, NOT AI video; the
actual diffusers/GPU path needs a separately approved CUDA staging test.
"""
import importlib.util
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[1] / "wan21_infer.py"
spec = importlib.util.spec_from_file_location("eternyx_wan21_inference", FILE)
wan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wan)

BASE = {"featureKey": "ai.video.text_to_video",
        "prompt": "Golden sunrise above the sea", "durationSeconds": 2}

class WanInferenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.model = self.root / "model"
        self.model.mkdir()
        (self.model / "model_index.json").write_text('{"_class_name":"WanPipeline"}')
        self.media = self.root / "private"
        self.media.mkdir(mode=0o700)
        self.env = patch.dict(os.environ, {
            "ETERNYX_WAN21_MODEL_DIR": str(self.model),
            "ETERNYX_PRIVATE_VIDEO_DIR": str(self.media),
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_validated_frame_count_and_restricted_staging_scope(self):
        job = wan.parse_job(json.dumps(BASE))
        self.assertEqual(job["num_frames"], 33)
        self.assertEqual(job["negative_prompt"], "")
        for data in [
            {**BASE, "durationSeconds": 6},
            {**BASE, "durationSeconds": 2.0},
            {**BASE, "aspectRatio": "9:16"},
            {**BASE, "featureKey": "ai.video.image_to_video"},
            {**BASE, "overrideModel": "/tmp/malicious"},
            {**BASE, "prompt": " "},
        ]:
            with self.assertRaises(ValueError):
                wan.parse_job(json.dumps(data))

    def test_offline_fixture_renderer_persists_private_mp4_with_opaque_handle(self):
        def fixture_renderer(job, model, dest):
            self.assertEqual(model, self.model)
            self.assertEqual(job["num_frames"], 33)
            dest.write_bytes(b"\x00\x00\x00\x14ftypisom" + b"fixture-not-real-video")
        output = wan.run(json.dumps(BASE), generator=fixture_renderer)
        self.assertRegex(output["outputReference"], r"^asset_[a-f0-9]{32}$")
        files = list(self.media.glob("*.mp4"))
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0].name, output["outputReference"] + ".mp4")
        self.assertEqual(stat.S_IMODE(files[0].stat().st_mode), 0o600)

    def test_missing_or_invalid_mp4_never_creates_successful_asset(self):
        def bad_renderer(_job, _model, dest):
            dest.write_bytes(b"not-video")
        with self.assertRaises(ValueError):
            wan.run(json.dumps(BASE), generator=bad_renderer)
        self.assertEqual(list(self.media.glob("*.mp4")), [])

    def test_private_directory_permissions_are_enforced(self):
        self.media.chmod(0o755)
        with self.assertRaises(ValueError):
            wan.validated_storage_path()

    def test_symlink_roots_and_boolean_version_fail_closed(self):
        self.assertRaises(ValueError, wan.parse_job, json.dumps({**BASE, "version": True}))
        model_link = self.root / "model-link"
        model_link.symlink_to(self.model, target_is_directory=True)
        with patch.dict(os.environ, {"ETERNYX_WAN21_MODEL_DIR": str(model_link)}):
            self.assertRaises(ValueError, wan.validated_model_path)
        storage_link = self.root / "private-link"
        storage_link.symlink_to(self.media, target_is_directory=True)
        with patch.dict(os.environ, {"ETERNYX_PRIVATE_VIDEO_DIR": str(storage_link)}):
            self.assertRaises(ValueError, wan.validated_storage_path)

    def test_absent_local_model_cannot_trigger_implicit_download(self):
        (self.model / "model_index.json").unlink()
        with self.assertRaises(ValueError):
            wan.run(json.dumps(BASE), generator=lambda *_: None)

    def test_no_cuda_model_load_is_hidden_behind_real_inference(self):
        self.assertEqual(wan.MODEL_NAME, "Wan-AI/Wan2.1-T2V-1.3B-Diffusers")
        self.assertTrue(callable(wan.generate_with_wan))

if __name__ == "__main__":
    unittest.main()
