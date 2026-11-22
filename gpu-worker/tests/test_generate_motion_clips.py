"""Real CPU scene-generation integration tests with FFmpeg, no paid GPU/API/model."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from generate_motion_clips import (
    STYLES, PALETTES, create, generate_rgb, read_config, RIGHTS_REF,
)
from render_video_timeline import sha256, probe, video_info, render

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Real FFmpeg/FFprobe required for procedural H.264 integration")
class RealCPUMotionTests(unittest.TestCase):
    def setUp(self):
        context = tempfile.TemporaryDirectory()
        self.addCleanup(context.cleanup)
        self.root = Path(context.name)
        self.config_path = self.root / "scenes.json"
        self.config = {
            "version": 1, "profile": "landscape", "quality": "standard",
            "scenes": [
                {"style": "aurora", "palette": "ocean", "seconds": 1, "seed": 42,
                 "caption": "Original flowing color ribbon"},
                {"style": "particles", "palette": "sunset", "seconds": 1, "seed": 123,
                 "caption": "Moving original particles"},
            ],
        }
        self.save()

    def save(self):
        self.config_path.write_text(
            json.dumps(self.config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def test_real_scene_clips_and_finished_video_with_v2_provenance(self):
        dest = self.root / "generated"
        receipt = create(self.config_path, dest)
        self.assertEqual(receipt["kind"], "cpu_procedural_motion")
        self.assertFalse(receipt["model_generation"])
        self.assertEqual(receipt["total_frames"], 32)
        self.assertEqual(receipt["scene_config_sha256"], sha256(self.config_path))
        self.assertEqual(len(receipt["scenes"]), 2)
        for i, item in enumerate(receipt["scenes"], 1):
            self.assertEqual(item["filename"], f"clip-{i:02d}.mp4")
            self.assertEqual(item["frames"], 16)
            self.assertEqual(item["rights_ref"], RIGHTS_REF)
            path = dest / item["filename"]
            self.assertEqual(item["sha256"], sha256(path))
            self.assertEqual(video_info(probe(path, count_frames=True)), (128, 72, 16))
        self.assertEqual(json.loads((dest / "generation-report.json").read_text()), receipt)
        boardpath = dest / "eternyx-video-v2.json"
        self.assertEqual(receipt["editor_storyboard_sha256"], sha256(boardpath))
        board = json.loads(boardpath.read_text())
        self.assertEqual(board["version"], 2)
        self.assertEqual(len(board["shots"]), 2)
        self.assertEqual(board["shots"][0]["rights_ref"], RIGHTS_REF)
        self.assertEqual(board["shots"][1]["caption"], "Moving original particles")
        self.assertEqual(board["shots"][0]["source_sha256"], receipt["scenes"][0]["sha256"])
        finished = dest / "render" / "video.mp4"
        self.assertTrue(finished.is_file())
        self.assertEqual(sha256(finished), receipt["compiled_video_sha256"])
        self.assertEqual(video_info(probe(finished, count_frames=True)), (256, 144, 32))
        render_receipt = json.loads((dest / "render" / "manifest.json").read_text())
        self.assertFalse(render_receipt["model_generation"])
        self.assertEqual(render_receipt["video"]["sha256"], receipt["compiled_video_sha256"])
        self.assertEqual(render_receipt["storyboard_sha256"], sha256(boardpath))
        self.assertIn("Original flowing color ribbon", (dest / "render" / "captions.srt").read_text())
        self.assertIn("data:image/png;base64,", (dest / "render" / "preview.html").read_text())
        self.assertFalse(list(self.root.glob(".eternyx-motion-*")))
        with self.assertRaisesRegex(ValueError, "no overwriting"):
            create(self.config_path, dest)

    def test_all_six_styles_are_actual_animated_unique_deterministic_pixels(self):
        signatures = []
        for style in STYLES:
            first = bytes(generate_rgb(style, "ocean", 42, 0, 16, 64, 36))
            later = bytes(generate_rgb(style, "ocean", 42, 8, 16, 64, 36))
            self.assertEqual(len(first), 64 * 36 * 3)
            self.assertNotEqual(first, later, "Style must show real temporal motion: " + style)
            self.assertEqual(first, bytes(generate_rgb(style, "ocean", 42, 0, 16, 64, 36)))
            signatures.append(hashlib.sha256(first).hexdigest())
        self.assertEqual(len(set(signatures)), 6)

    def test_palette_and_seed_change_original_visual_output(self):
        frames = [bytes(generate_rgb("aurora", name, 42, 3, 16, 32, 18))
                  for name in PALETTES]
        self.assertEqual(len(set(frames)), len(PALETTES))
        a = bytes(generate_rgb("particles", "violet", 11, 5, 16, 32, 18))
        b = bytes(generate_rgb("particles", "violet", 12, 5, 16, 32, 18))
        self.assertNotEqual(a, b)

    def test_actual_portrait_high_cpu_encode_and_render(self):
        self.config["profile"] = "portrait"
        self.config["quality"] = "high"
        self.config["scenes"] = [self.config["scenes"][0]]
        self.save()
        dest = self.root / "portrait"
        result = create(self.config_path, dest)
        self.assertEqual(result["scenes"][0]["width"], 144)
        self.assertEqual(result["scenes"][0]["height"], 256)
        self.assertEqual(video_info(probe(dest / "clip-01.mp4", count_frames=True)),
                         (144, 256, 16))
        self.assertEqual(video_info(probe(dest / "render" / "video.mp4", count_frames=True)),
                         (288, 512, 16))

    def test_actual_square_standard_cpu_encode(self):
        self.config["profile"] = "square"
        self.config["scenes"] = [self.config["scenes"][0]]
        self.save()
        dest = self.root / "square"
        create(self.config_path, dest)
        self.assertEqual(video_info(probe(dest / "clip-01.mp4", count_frames=True)),
                         (128, 128, 16))
        self.assertEqual(video_info(probe(dest / "render" / "video.mp4", count_frames=True)),
                         (256, 256, 16))

    def test_reject_invalid_json_duplicate_keys_and_oversize_config(self):
        invalid = [
            '{"version":1,"version":1,"profile":"square","quality":"standard","scenes":[]}',
            '{"version":true,"profile":"square","quality":"standard","scenes":[]}',
            '{"version":1,"profile":"square","quality":"standard","scenes":[]}',
            '{"version":1,"profile":"square","quality":"standard","scenes":[{}],"extra":0}',
            '{"version":1,"profile":"square","quality":"standard","scenes":"x"}',
        ]
        for source in invalid:
            with self.subTest(source=source), self.assertRaises(ValueError):
                self.config_path.write_text(source, encoding="utf-8")
                read_config(self.config_path)
        self.config_path.write_bytes(b" " * 32769)
        with self.assertRaisesRegex(ValueError, "32 KiB"):
            read_config(self.config_path)
        self.save()

    def test_reject_invalid_styles_palettes_caption_duration_seed_and_bad_quality(self):
        bad_variants = [
            {"style": "text-to-video AI"},
            {"palette": "unknown"},
            {"seconds": 0},
            {"seconds": 9},
            {"seconds": 1.5},
            {"seconds": True},
            {"seed": -1},
            {"seed": 2147483648},
            {"seed": True},
            {"caption": ""},
            {"caption": "unsafe\nline"},
            {"caption": "x" * 181},
        ]
        original = dict(self.config["scenes"][0])
        for case in bad_variants:
            self.config["scenes"] = [{**original, **case}]
            self.save()
            with self.subTest(case=case), self.assertRaises(ValueError):
                read_config(self.config_path)
        self.config["scenes"] = [original]
        self.config["quality"] = "premium"
        self.save()
        with self.assertRaises(ValueError):
            read_config(self.config_path)
        self.config["quality"] = "standard"
        self.save()

    def test_enforce_standard_30_second_and_high_10_second_cpu_budgets(self):
        one = self.config["scenes"][0]
        self.config["scenes"] = [{**one, "seconds": 8}] * 4
        self.save()
        with self.assertRaisesRegex(ValueError, "budget"):
            read_config(self.config_path)
        self.config["scenes"] = [{**one, "seconds": 8}, {**one, "seconds": 3}]
        self.config["quality"] = "high"
        self.save()
        with self.assertRaisesRegex(ValueError, "budget"):
            read_config(self.config_path)
        self.config["quality"] = "standard"
        self.save()
        self.assertEqual(read_config(self.config_path)[2], 11 * 16)
        self.config["scenes"] = [one] * 9
        self.save()
        with self.assertRaises(ValueError):
            read_config(self.config_path)

    def test_atomic_failure_retracts_partial_generated_scenes(self):
        from generate_motion_clips import encode_scene as genuine_encode
        calls = []
        def fail_after_first(scene, index, path, profile, quality):
            calls.append(index)
            if index == 2:
                raise ValueError("Simulated FFmpeg failure on second scene")
            return genuine_encode(scene, index, path, profile, quality)
        with patch("generate_motion_clips.encode_scene", side_effect=fail_after_first):
            with self.assertRaisesRegex(ValueError, "Simulated FFmpeg failure"):
                create(self.config_path, self.root / "partial")
        self.assertEqual(calls, [1, 2])
        self.assertFalse((self.root / "partial").exists())
        self.assertFalse(list(self.root.glob(".eternyx-motion-*")))

    def test_command_line_generates_real_local_mp4_and_receipts(self):
        self.config["scenes"] = [self.config["scenes"][0]]
        self.save()
        target = self.root / "cli-output"
        command = [sys.executable, str(ROOT / "generate_motion_clips.py"),
                   "--scenes", str(self.config_path), "--output", str(target)]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=120)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertEqual(payload["scenes"], 1)
        self.assertEqual(payload["total_frames"], 16)
        self.assertEqual(payload["finished_sha256"], sha256(target / "render" / "video.mp4"))
        repeated = subprocess.run(command, capture_output=True, text=True, timeout=120)
        self.assertNotEqual(repeated.returncode, 0)
        self.assertIn("no overwriting", repeated.stderr)


if __name__ == "__main__":
    unittest.main()
