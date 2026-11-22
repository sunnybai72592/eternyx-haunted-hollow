"""Real FFmpeg tests for the short offline CPU video storyboard builder."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import shutil

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from assemble_video_storyboard import (assemble, captions_srt, dimensions, load_manifest,
                                       validate_source, validate_shots)
from audit_video_render import inspect

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "Local FFmpeg is required")
class StoryboardAssemblerTests(unittest.TestCase):
    def setUp(self):
        context = tempfile.TemporaryDirectory()
        self.addCleanup(context.cleanup)
        self.root = Path(context.name)
        self.clips = self.root / "clips"
        self.clips.mkdir()
        self.source_a = self.make("motion.mp4", "testsrc=size=32x32:rate=16:duration=2")
        self.source_b = self.make("black.mp4", "color=c=black:s=32x32:r=16:d=2")
        self.doc = {"version": 1, "shots": [
            {"file": "motion.mp4", "source_sha256": self.digest(self.source_a),
             "start_frame": 4, "frames": 8, "caption": "A moving test pattern",
             "rights_ref": "synthetic-ffmpeg-testsrc"},
            {"file": "black.mp4", "source_sha256": self.digest(self.source_b),
             "start_frame": 0, "frames": 8, "caption": "Black frame sample",
             "rights_ref": "synthetic-ffmpeg-color"},
        ]}
        self.storyboard = self.root / "storyboard.json"
        self.write_doc()

    @staticmethod
    def digest(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def make(self, name, source):
        path = self.clips / name
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error",
                        "-f", "lavfi", "-i", source, "-an", "-threads", "1",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)],
                       capture_output=True, timeout=20, check=True)
        return path

    def write_doc(self):
        self.storyboard.write_text(json.dumps(self.doc), encoding="utf-8")

    def test_actual_mp4_concat_with_frame_accurate_cuts_and_provenance(self):
        target = self.root / "render"
        record = assemble(self.storyboard, self.clips, target)
        self.assertEqual(record["total_frames"], 16)
        self.assertEqual(record["video"]["frame_count"], 16)
        self.assertEqual(record["video"]["fps"], "16/1")
        self.assertEqual((record["video"]["width"], record["video"]["height"]), (128, 72))
        self.assertEqual(record["audio"], "removed")
        self.assertFalse(record["model_generation"])
        self.assertEqual(record["shots"][0]["timeline_start_frame"], 0)
        self.assertEqual(record["shots"][1]["timeline_start_frame"], 8)
        self.assertEqual(record["shots"][0]["source_sha256"], self.doc["shots"][0]["source_sha256"])
        self.assertEqual(record["shots"][1]["dark_frames_in_source_cut"], 8)
        self.assertGreater(record["shots"][0]["nonidentical_transitions_in_source_cut"], 0)
        self.assertEqual(self.digest(target / "video.mp4"), record["video"]["sha256"])
        self.assertEqual(json.loads((target / "manifest.json").read_text()), record)
        preview = (target / "preview.html").read_text()
        self.assertEqual(preview.count("data:image/png;base64,"), 2)
        self.assertIn("A moving test pattern", preview)
        self.assertNotIn("http://", preview)
        self.assertNotIn("https://", preview)
        subs = (target / "captions.srt").read_text()
        self.assertIn("00:00:00,000 --> 00:00:00,500", subs)
        self.assertIn("00:00:00,500 --> 00:00:01,000", subs)
        self.assertIn("Black frame sample", subs)
        self.assertEqual(inspect(target / "video.mp4")["summary"]["frame_count"], 16)
        with self.assertRaisesRegex(ValueError, "overwriting"):
            assemble(self.storyboard, self.clips, target)

    def test_single_shot_and_custom_dimensions(self):
        self.doc["shots"] = [self.doc["shots"][0]]
        self.write_doc()
        dest = self.root / "single"
        receipt = assemble(self.storyboard, self.clips, dest, 64, 64)
        self.assertEqual(receipt["video"]["frame_count"], 8)
        self.assertEqual((receipt["video"]["width"], receipt["video"]["height"]), (64, 64))
        self.assertEqual((dest / "preview.html").read_text().count("data:image/png;base64,"), 1)

    def test_sha256_mismatch_fails_without_partial_directory(self):
        self.doc["shots"][0]["source_sha256"] = "0" * 64
        self.write_doc()
        destination = self.root / "bad"
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            assemble(self.storyboard, self.clips, destination)
        self.assertFalse(destination.exists())

    def test_reject_url_absolute_paths_and_symlinks(self):
        for name in ("../motion.mp4", "/tmp/external.mp4", "https://remote.mp4",
                     "nested/../motion.mp4", "x\\motion.mp4"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate_source(self.clips, name)
        link = self.clips / "link.mp4"
        link.symlink_to(self.source_a)
        with self.assertRaisesRegex(ValueError, "Symlink"):
            validate_source(self.clips, "link.mp4")
        directory = self.clips / "nested"
        directory.mkdir()
        (directory / "linked").symlink_to(self.clips, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "Symlink"):
            validate_source(self.clips, "nested/linked/motion.mp4")
        root_link = self.root / "root-link"
        root_link.symlink_to(self.clips, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            validate_shots(root_link, self.doc)

    def test_reject_bad_shot_boundaries_and_rights(self):
        mutations = [
            ("negative", {"start_frame": -1}),
            ("past-end", {"start_frame": 31, "frames": 2}),
            ("zero", {"frames": 0}),
            ("not-integer", {"frames": 1.5}),
            ("boolean", {"frames": True}),
            ("blank-rights", {"rights_ref": ""}),
            ("bad-caption", {"caption": "\nInjected\n"}),
            ("bad-digest", {"source_sha256": "a"}),
            ("too-many", {"frames": 65}),
        ]
        for name, changes in mutations:
            with self.subTest(name=name):
                self.doc["shots"][0].update(changes)
                self.write_doc()
                with self.assertRaises(ValueError):
                    assemble(self.storyboard, self.clips, self.root / "invalid")
                self.assertFalse((self.root / "invalid").exists())
                self.doc["shots"][0] = {"file": "motion.mp4", "source_sha256": self.digest(self.source_a),
                                       "start_frame": 4, "frames": 8, "caption": "A moving test pattern",
                                       "rights_ref": "synthetic-ffmpeg-testsrc"}

    def test_storyboard_schema_duplicate_keys_and_limits(self):
        for invalid in ('{"version":1,"version":1,"shots":[]}',
                        '{"version":true,"shots":[]}',
                        '{"version":1,"shots":[]}',
                        '{"version":1,"shots":[{}],"unknown":true}',
                        '{"version":1,"shots":"x"}'):
            with self.subTest(invalid=invalid):
                self.storyboard.write_text(invalid)
                with self.assertRaises(ValueError):
                    load_manifest(self.storyboard)
        self.storyboard.write_bytes(b" " * 32769)
        with self.assertRaisesRegex(ValueError, "32 KiB"):
            load_manifest(self.storyboard)
        self.doc["shots"] = [self.doc["shots"][0]] * 9
        self.write_doc()
        with self.assertRaises(ValueError):
            load_manifest(self.storyboard)

    def test_combined_length_limit(self):
        self.doc["shots"] = [{**self.doc["shots"][0], "start_frame": 0, "frames": 32}] * 3
        self.write_doc()
        with self.assertRaisesRegex(ValueError, "64 frames"):
            assemble(self.storyboard, self.clips, self.root / "too-long")

    def test_reject_unsupported_fps_without_writing(self):
        slower = self.make("slow.mp4", "testsrc=size=32x32:rate=8:duration=2")
        self.doc["shots"][0]["file"] = "slow.mp4"
        self.doc["shots"][0]["source_sha256"] = self.digest(slower)
        self.write_doc()
        with self.assertRaisesRegex(ValueError, "16 FPS"):
            assemble(self.storyboard, self.clips, self.root / "wrong-fps")

    def test_escape_captions_in_html_and_keep_subtitle_unicode(self):
        self.doc["shots"][0]["caption"] = "<Demo> & مَرْحَبًا"
        self.write_doc()
        dest = self.root / "html-safe"
        assemble(self.storyboard, self.clips, dest)
        html = (dest / "preview.html").read_text()
        self.assertIn("&lt;Demo&gt; &amp; مَرْحَبًا", html)
        self.assertNotIn("<Demo>", html)
        self.assertIn("<Demo> & مَرْحَبًا", (dest / "captions.srt").read_text())

    def test_cli_works_without_external_api(self):
        dest = self.root / "cli"
        call = [sys.executable, str(ROOT / "assemble_video_storyboard.py"),
                "--storyboard", str(self.storyboard), "--clips", str(self.clips),
                "--output", str(dest), "--width", "64", "--height", "64"]
        result = subprocess.run(call, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["frames"], 16)
        self.assertEqual(payload["video_sha256"], self.digest(dest / "video.mp4"))
        repeated = subprocess.run(call, capture_output=True, text=True, timeout=30)
        self.assertNotEqual(repeated.returncode, 0)
        self.assertIn("overwriting is forbidden", repeated.stderr)


if __name__ == "__main__":
    unittest.main()
