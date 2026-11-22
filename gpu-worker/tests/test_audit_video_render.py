"""Regression tests with actual FFmpeg-encoded local MP4 fixtures; no ML model needed."""
import csv
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audit_video_render import audit, compare, evaluate_flags, inspect, media_path, probe, save


ROOT = Path(__file__).resolve().parents[1]
HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


@unittest.skipUnless(HAS_FFMPEG, "Requires local FFmpeg CLI")
class RealMP4AuditTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.black = self.make("black.mp4", "color=c=black:s=32x32:r=8:d=0.5")
        self.moving = self.make("moving.mp4", "testsrc=size=32x32:rate=8:duration=0.5")

    def make(self, name, source):
        path = self.root / name
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-f", "lavfi",
                        "-i", source, "-an", "-threads", "1", "-c:v", "mpeg4",
                        "-pix_fmt", "yuv420p", str(path)], check=True, timeout=15)
        return path

    def test_real_black_frames_and_identical_transition_metrics(self):
        item = inspect(self.black)
        summary = item["summary"]
        self.assertEqual((summary["width"], summary["height"]), (32, 32))
        self.assertEqual(summary["fps"], "8/1")
        self.assertEqual(summary["frame_count"], 4)
        self.assertEqual(summary["dark_frame_count"], 4)
        self.assertEqual(summary["identical_transition_count"], 3)
        self.assertEqual(summary["near_static_transition_count"], 3)
        self.assertEqual(len(summary["sha256"]), 64)
        self.assertEqual([row["frame"] for row in item["rows"]], [0, 1, 2, 3])
        self.assertIsNone(item["rows"][0]["adjacent_mean_rgb_change"])
        self.assertTrue(all(row["adjacent_mean_rgb_change"] == 0 for row in item["rows"][1:]))

    def test_real_motion_is_detected_on_decoded_frames(self):
        result = inspect(self.moving)
        self.assertEqual(result["summary"]["frame_count"], 4)
        self.assertGreater(result["summary"]["mean_adjacent_rgb_change"], 0)
        self.assertLess(result["summary"]["identical_transition_count"], 3)
        self.assertTrue(any(row["adjacent_changed_pixel_fraction"] > 0 for row in result["rows"][1:]))

    def test_paired_difference_on_equal_frame_rate_and_dimensions(self):
        left, right = inspect(self.black), inspect(self.moving)
        comparison = compare(left, right)
        self.assertEqual(comparison["paired_frames"], 4)
        self.assertEqual(comparison["identical_frame_pairs"], 0)
        self.assertGreater(comparison["mean_absolute_rgb_difference"], 0)
        self.assertEqual(len(comparison["per_frame_absolute_rgb_difference"]), 4)
        self.assertEqual(compare(left, left)["identical_frame_pairs"], 4)
        self.assertEqual(compare(left, left)["mean_absolute_rgb_difference"], 0)

    def test_mismatch_is_rejected_and_does_not_write_report(self):
        other = self.make("other.mp4", "testsrc=size=48x32:rate=8:duration=0.5")
        with self.assertRaisesRegex(ValueError, "Paired renders differ"):
            audit(self.black, other)
        faster = self.make("faster.mp4", "testsrc=size=32x32:rate=16:duration=0.5")
        with self.assertRaisesRegex(ValueError, "Paired renders differ"):
            audit(self.black, faster)
        shorter = self.make("short.mp4", "testsrc=size=32x32:rate=8:duration=0.25")
        with self.assertRaisesRegex(ValueError, "Paired renders differ"):
            audit(self.black, shorter)

    def test_actual_png_thumbnails_are_embedded_and_local_only(self):
        summary, csv_text, html = audit(self.black, self.moving, max_dark_frames=0,
                                        max_identical_transitions=0)
        self.assertFalse(summary["passes_configured_limits"])
        self.assertEqual(summary["flags"]["reference"],
                         ["dark_frame_count", "identical_transition_count"])
        self.assertIn("paired_comparison", summary)
        self.assertEqual(html.count("data:image/png;base64,"), 6)
        self.assertNotIn("http://", html)
        self.assertNotIn("https://", html)
        rows = list(csv.DictReader(io.StringIO(csv_text)))
        self.assertEqual(len(rows), 8)
        self.assertEqual({row["video"] for row in rows}, {"reference", "candidate"})
        dest = self.root / "audit"
        save(dest, summary, csv_text, html)
        self.assertEqual(json.loads((dest / "summary.json").read_text()), summary)
        self.assertEqual((dest / "frames.csv").read_text(), csv_text)
        self.assertEqual((dest / "review.html").read_text(), html)
        with self.assertRaisesRegex(ValueError, "never overwritten"):
            save(dest, summary, csv_text, html)

    def test_cli_gate_returns_exit_two_after_writing_true_evidence(self):
        cmd = [sys.executable, str(ROOT / "audit_video_render.py"), "--reference", str(self.black),
               "--max-identical-transitions", "0", "--fail-on-flags",
               "--output", str(self.root / "gate")]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertFalse(json.loads(result.stdout)["passes_configured_limits"])
        self.assertTrue((self.root / "gate" / "review.html").exists())
        again = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        self.assertNotEqual(again.returncode, 0)
        self.assertIn("never overwritten", again.stderr)
        passed = subprocess.run([sys.executable, str(ROOT / "audit_video_render.py"),
                                 "--reference", str(self.moving), "--max-identical-transitions", "3",
                                 "--output", str(self.root / "pass"), "--fail-on-flags"],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(passed.returncode, 0, passed.stderr)
        self.assertTrue(json.loads(passed.stdout)["passes_configured_limits"])

    def test_reject_symlink_overlarge_and_unreadable_media(self):
        link = self.root / "link.mp4"
        link.symlink_to(self.black)
        with self.assertRaisesRegex(ValueError, "not a symlink"):
            media_path(link)
        invalid = self.root / "invalid.mp4"
        invalid.write_text("not a media file")
        with self.assertRaisesRegex(ValueError, "FFmpeg"):
            probe(invalid)
        giant = self.root / "giant.mp4"
        with giant.open("wb") as stream:
            stream.truncate(32 * 1024 * 1024 + 1)
        with self.assertRaisesRegex(ValueError, "32 MiB"):
            media_path(giant)

    def test_reject_more_than_64_decoded_frames(self):
        long = self.make("long.mp4", "testsrc=size=32x32:rate=16:duration=5")
        with self.assertRaisesRegex(ValueError, "64-frame"):
            inspect(long)

    def test_invalid_thresholds(self):
        summary = inspect(self.black)["summary"]
        for invalid in (True, -1, 65, 2.5):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                evaluate_flags(summary, max_dark_frames=invalid)
        self.assertEqual(evaluate_flags(summary), [])
        self.assertEqual(evaluate_flags(summary, max_dark_frames=4,
                                        max_identical_transitions=3), [])

    def test_synthetic_test_src_is_not_called_a_generated_ai_video(self):
        summary, _, html = audit(self.moving)
        self.assertEqual(summary["engine"], "offline FFmpeg CPU RGB frame inspection")
        self.assertNotIn("paired_comparison", summary)
        self.assertEqual(html.count("data:image/png;base64,"), 3)
        self.assertIn("do not measure prompt fidelity", html)


if __name__ == "__main__":
    unittest.main()
