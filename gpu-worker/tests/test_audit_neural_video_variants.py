"""Real neural sampling stability and 3-candidate H264 audition tests."""
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audit_neural_video_variants import audit
from train_tiny_neural_video import (train, generate, read_model, sample_frames,
                                     temporal_frame_metrics, WIDTH, HEIGHT)
from render_video_timeline import sha256, probe, video_info


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Actual FFmpeg and FFprobe needed")
class NeuralTemporalAuditionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory()
        cls.root = Path(cls.workspace.name)
        cls.inputs = cls.root / "local-video-media"
        cls.inputs.mkdir()
        clip = cls.inputs / "sample.mp4"
        subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
             "-f", "lavfi", "-i", "testsrc=size=64x36:rate=16:duration=1",
             "-threads", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p",
             str(clip)],
            capture_output=True, check=True, timeout=30)
        cls.folder = cls.root / "trained"
        train(cls.inputs, cls.folder, "operator-owned", selected=["sample.mp4"],
              seed=7, epochs=2)
        cls.modelpath = cls.folder / "model.json"
        cls.model = read_model(cls.modelpath)

    @classmethod
    def tearDownClass(cls):
        cls.workspace.cleanup()

    def test_actual_neural_stability_and_variation_change_sampled_rgb_bytes(self):
        first = sample_frames(self.model, 1, 42, stability=0, variation=0)
        stable = sample_frames(self.model, 1, 42, stability=80, variation=0)
        noisy = sample_frames(self.model, 1, 42, stability=80, variation=15)
        self.assertEqual(len(first), 16)
        self.assertTrue(all(len(frame) == WIDTH * HEIGHT * 3 for frame in first))
        self.assertNotEqual(first, stable)
        self.assertNotEqual(stable, noisy)
        self.assertEqual(noisy, sample_frames(self.model, 1, 42, stability=80, variation=15))
        self.assertGreater(len(set(noisy)), 3)

    def test_actual_temporal_statistics_derive_from_raw_frames(self):
        frames = sample_frames(self.model, 1, 42, stability=65, variation=4)
        audit_result = temporal_frame_metrics(frames)
        self.assertEqual(audit_result["measured_frame_count"], 16)
        self.assertEqual(audit_result["identical_adjacent_frame_pairs"],
                         sum(a == b for a, b in zip(frames, frames[1:])))
        deltas = [
            sum(abs(a - b) for a, b in zip(old, new)) / len(old) / 255
            for old, new in zip(frames, frames[1:])
        ]
        self.assertAlmostEqual(audit_result["mean_temporal_absolute_delta"],
                               round(sum(deltas) / len(deltas), 8))
        self.assertAlmostEqual(audit_result["max_temporal_absolute_delta"],
                               round(max(deltas), 8))
        self.assertGreater(audit_result["mean_temporal_absolute_delta"], 0)
        self.assertIn("not automatically higher visual quality",
                      audit_result["interpretation"])

    def test_temporal_parameter_bounds_are_fail_closed(self):
        for stability in (-1, 86, 3.5, True, "45", None):
            with self.subTest(stability=stability), self.assertRaises(ValueError):
                sample_frames(self.model, 1, 42, stability=stability)
        for variation in (-1, 21, 2.5, True, "6", None):
            with self.subTest(variation=variation), self.assertRaises(ValueError):
                sample_frames(self.model, 1, 42, variation=variation)
        with self.assertRaises(ValueError):
            temporal_frame_metrics([])
        with self.assertRaises(ValueError):
            temporal_frame_metrics([b"invalid"])

    def test_single_stable_neural_mp4_includes_actual_reported_frame_metrics(self):
        out = self.root / "single"
        result = generate(self.modelpath, out, seconds=1, seed=12,
                          stability=75, variation=3)
        self.assertEqual(result["stability_percent"], 75)
        self.assertEqual(result["variation_percent"], 3)
        self.assertEqual(result["temporal_frame_metrics"]["measured_frame_count"], 16)
        self.assertEqual(len(result["raw_frames_sha256"]), 64)
        self.assertEqual(video_info(probe(out / "render" / "video.mp4",
                                          count_frames=True)), (256, 144, 16))
        self.assertEqual(result["video_sha256"], sha256(out / "render" / "video.mp4"))
        self.assertEqual(json.loads((out / "generation-report.json").read_text()), result)

    def test_two_actual_neural_variants_generate_valid_independent_playable_outputs(self):
        out = self.root / "audition-two"
        report = audit(self.modelpath, out, [15, 16], seconds=1,
                       stability=60, variation=8, profile="square")
        self.assertEqual(report["candidate_count"], 2)
        self.assertTrue(report["neural_network"])
        self.assertFalse(report["text_to_video"])
        self.assertEqual(report["model_sha256"], sha256(self.modelpath))
        self.assertEqual(report["stability_percent"], 60)
        self.assertEqual(report["variation_percent"], 8)
        a, b = report["candidates"]
        self.assertNotEqual(a["video_sha256"], b["video_sha256"])
        for row in report["candidates"]:
            mp4 = out / row["file"]
            manifest = out / row["candidate"] / "render" / "manifest.json"
            self.assertEqual(sha256(mp4), row["video_sha256"])
            self.assertEqual(sha256(manifest), row["renderer_manifest_sha256"])
            self.assertEqual(video_info(probe(mp4, count_frames=True)),
                             (256, 256, 16))
            self.assertEqual(row["temporal_frame_metrics"]["measured_frame_count"], 16)
            self.assertEqual(row["model_sha256"], sha256(self.modelpath))
            self.assertEqual(row["actual_decoded_frames"], 16)
        self.assertEqual(json.loads((out / "audition-report.json").read_text()), report)
        self.assertFalse(list(self.root.glob(".eternyx-neural-audition-*")))
        with self.assertRaisesRegex(ValueError, "no overwriting"):
            audit(self.modelpath, out, [11], seconds=1)

    def test_invalid_seed_sets_or_duration_rejected_before_output(self):
        inputs = [[], [42, 42], [True], [-1], [2147483648],
                  [1, 2, 3, 4], ["42"], None]
        for i, seeds in enumerate(inputs):
            with self.subTest(seeds=seeds), self.assertRaises(ValueError):
                audit(self.modelpath, self.root / f"bad-{i}", seeds, seconds=1)
            self.assertFalse((self.root / f"bad-{i}").exists())
        for value in [0, 5, 1.5, True]:
            with self.subTest(seconds=value), self.assertRaises(ValueError):
                audit(self.modelpath, self.root / "bad-duration", [42], seconds=value)
        self.assertFalse((self.root / "bad-duration").exists())

    def test_audition_failing_second_candidate_never_publishes_partial_directory(self):
        from audit_neural_video_variants import generate as original
        calls = []
        def fake(*args, **kwargs):
            calls.append(kwargs["seed"])
            if len(calls) > 1:
                raise ValueError("Simulated second FFmpeg candidate failure")
            return original(*args, **kwargs)
        with patch("audit_neural_video_variants.generate", side_effect=fake):
            with self.assertRaisesRegex(ValueError, "Simulated second"):
                audit(self.modelpath, self.root / "partial", [11, 12], seconds=1)
        self.assertEqual(calls, [11, 12])
        self.assertFalse((self.root / "partial").exists())
        self.assertFalse(list(self.root.glob(".eternyx-neural-audition-*")))

    def test_cli_actual_audition_and_checksum_verification(self):
        out = self.root / "audition-cli"
        tool = Path(__file__).resolve().parents[1] / "audit_neural_video_variants.py"
        run = subprocess.run(
            [sys.executable, str(tool), "--model", str(self.modelpath),
             "--output", str(out), "--seeds", "17", "--seconds", "1",
             "--stability", "70", "--variation", "2"],
            capture_output=True, text=True, timeout=90)
        self.assertEqual(run.returncode, 0, run.stderr)
        obj = json.loads(run.stdout)
        self.assertEqual(obj["candidates"], 1)
        self.assertEqual(obj["model_sha256"], sha256(self.modelpath))
        self.assertTrue((out / "candidate-01" / "render" / "video.mp4").is_file())
        repeated = subprocess.run(
            [sys.executable, str(tool), "--model", str(self.modelpath),
             "--output", str(out), "--seeds", "17", "--seconds", "1"],
            capture_output=True, text=True, timeout=90)
        self.assertNotEqual(repeated.returncode, 0)
        self.assertIn("no overwriting", repeated.stderr)


if __name__ == "__main__":
    unittest.main()
