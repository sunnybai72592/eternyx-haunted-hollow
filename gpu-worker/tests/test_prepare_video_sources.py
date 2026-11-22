"""Actual local FFmpeg input-normalization regressions; requires no model/GPU/API."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_video_sources import prepare, normalize_one, source_path
from render_video_timeline import render, sha256, probe, video_info


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "Requires FFmpeg CLI")
class PhoneFootagePreparationTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.inputs = self.root / "phone"
        self.inputs.mkdir()
        self.landscape = self.make("camera.mov", rate=30, width=64, height=36)
        self.portrait = self.make("vertical.mp4", rate=24, width=36, height=64)

    def make(self, name, *, rate, width, height, seconds=3, audio=False):
        target = self.inputs / name
        cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
               "-f", "lavfi", "-i", f"testsrc=size={width}x{height}:rate={rate}:duration={seconds}"]
        if audio:
            cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}"]
        cmd += ["-threads", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p"]
        if audio:
            cmd += ["-c:a", "aac", "-shortest"]
        else:
            cmd += ["-an"]
        cmd += [str(target)]
        subprocess.run(cmd, check=True, capture_output=True, timeout=25)
        return target

    def test_30fps_phone_mov_is_converted_into_actual_16fps_h264(self):
        dest = self.root / "normalized"
        receipt = prepare(self.inputs, dest, clips=["camera.mov"], seconds=2)
        self.assertEqual(receipt["kind"], "local_cpu_video_import")
        self.assertFalse(receipt["model_generation"])
        self.assertEqual(receipt["source_count"], 1)
        item = receipt["clips"][0]
        self.assertEqual(item["source_filename"], "camera.mov")
        self.assertEqual(item["prepared_filename"], "clip-01.mp4")
        self.assertEqual(item["source_sha256"], sha256(self.landscape))
        self.assertEqual(item["prepared_sha256"], sha256(dest / "clip-01.mp4"))
        self.assertEqual(item["prepared_fps"], "16/1")
        self.assertEqual(item["prepared_frames"], 32)
        self.assertEqual((item["prepared_width"], item["prepared_height"]), (64, 36))
        self.assertEqual(video_info(probe(dest / "clip-01.mp4", count_frames=True)), (64, 36, 32))
        self.assertEqual(json.loads((dest / "preparation-report.json").read_text()), receipt)
        self.assertFalse(list(self.root.glob(".eternyx-video-prepare-*")))
        self.assertTrue(self.landscape.is_file())

    def test_portrait_24fps_makes_valid_16fps_video_without_stretching(self):
        target = self.root / "portrait-output.mp4"
        result = normalize_one(self.portrait, target, start_seconds=1, seconds=1)
        self.assertEqual(result["prepared_frames"], 16)
        self.assertEqual(result["prepared_fps"], "16/1")
        self.assertEqual((result["prepared_width"], result["prepared_height"]), (36, 64))
        self.assertEqual(result["reported_fps"], "24/1")

    def test_phone_container_comments_are_not_copied(self):
        # Camera/MOV global metadata can include confidential device/location notes.
        marked = self.inputs / "private.mov"
        subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
             "-f", "lavfi", "-i", "testsrc=size=64x36:rate=30:duration=1",
             "-threads", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p",
             "-metadata", "comment=private-phone-device-tag", str(marked)],
            capture_output=True, check=True, timeout=20,
        )
        def comments(path):
            raw = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format_tags=comment",
                 "-of", "json", str(path)],
                capture_output=True, check=True, timeout=15,
            ).stdout.decode()
            return raw
        self.assertIn("private-phone-device-tag", comments(marked))
        prepared = self.root / "private-prepared"
        prepare(self.inputs, prepared, clips=["private.mov"], seconds=1)
        self.assertNotIn("private-phone-device-tag", comments(prepared / "clip-01.mp4"))

    def test_audio_is_removed_from_prepared_source_clips(self):
        with_audio = self.make("sound.m4v", rate=30, width=64, height=36, audio=True)
        result = prepare(self.inputs, self.root / "silenced", clips=["sound.m4v"], seconds=1)
        self.assertEqual(result["clips"][0]["prepared_frames"], 16)
        streams = probe(self.root / "silenced" / "clip-01.mp4")
        self.assertEqual(len([stream for stream in streams if stream.get("codec_type") == "audio"]), 0)

    def test_multi_clip_conversion_is_sorted_deterministic_and_create_only(self):
        output = self.root / "multiple"
        result = prepare(self.inputs, output, seconds=1)
        self.assertEqual([item["source_filename"] for item in result["clips"]], ["camera.mov", "vertical.mp4"])
        self.assertEqual([item["prepared_filename"] for item in result["clips"]], ["clip-01.mp4", "clip-02.mp4"])
        for item in result["clips"]:
            self.assertEqual(item["prepared_frames"], 16)
        with self.assertRaisesRegex(ValueError, "never overwritten"):
            prepare(self.inputs, output, seconds=1)
        self.assertEqual(json.loads((output / "preparation-report.json").read_text()), result)

    def test_bad_second_clip_never_publishes_partial_output(self):
        fake = self.inputs / "corrupted.mp4"
        fake.write_bytes(b"not real footage")
        out = self.root / "bad"
        with self.assertRaises(ValueError):
            prepare(self.inputs, out, clips=["camera.mov", "corrupted.mp4"], seconds=1)
        self.assertFalse(out.exists())
        self.assertFalse(list(self.root.glob(".eternyx-video-prepare-*")))

    def test_reject_symlink_source_and_source_root(self):
        link = self.inputs / "linked.mov"
        link.symlink_to(self.landscape)
        with self.assertRaisesRegex(ValueError, "not a symlink"):
            source_path(self.inputs, "linked.mov")
        root_link = self.root / "root-link"
        root_link.symlink_to(self.inputs, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            prepare(root_link, self.root / "invalid")
        self.assertFalse((self.root / "invalid").exists())

    def test_reject_url_traversal_extensions_and_size(self):
        for name in ("../camera.mov", "/tmp/fake.mp4", "https://a.mp4",
                     "nested/camera.mov", "foo\\bar.mp4", "x.mp3",
                     ".hidden.mov", "~temporary.mp4", "colon:x.mov"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                source_path(self.inputs, name)
        too_large = self.inputs / "huge.mp4"
        with too_large.open("wb") as stream:
            stream.truncate(64 * 1024 * 1024 + 1)
        with self.assertRaisesRegex(ValueError, "64 MiB"):
            source_path(self.inputs, "huge.mp4")

    def test_validation_of_bounds_and_duplicate_names(self):
        target = self.root / "nothing.mp4"
        for bounds in ({"seconds":0}, {"seconds":61}, {"seconds":True},
                       {"start_seconds":-1}, {"start_seconds":300},
                       {"start_seconds":True}, {"start_seconds":4}):
            with self.subTest(bounds=bounds), self.assertRaises(ValueError):
                normalize_one(self.landscape, target, **bounds)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            prepare(self.inputs, self.root / "dup", clips=["camera.mov", "camera.mov"], seconds=1)
        with self.assertRaises(ValueError):
            prepare(self.inputs, self.root / "empty", clips=["camera.mov"] * 9)

    def test_normalized_phone_footage_renders_in_real_v2_editor(self):
        normalized = self.root / "local-video-media"
        prep = prepare(self.inputs, normalized, clips=["camera.mov", "vertical.mp4"], seconds=2)
        board = {"version": 2, "shots": []}
        for i, item in enumerate(prep["clips"]):
            board["shots"].append({
                "file": item["prepared_filename"],
                "source_sha256": item["prepared_sha256"],
                "start_frame": 0, "frames": 16,
                "caption": "Source shot " + str(i + 1), "rights_ref": "owner-original-footage",
                "fade_in_frames": 0, "fade_out_frames": 0,
            })
        storyboard = self.root / "eternyx-video-v2.json"
        storyboard.write_text(json.dumps(board, indent=2) + "\n")
        result = render(storyboard, normalized, self.root / "final-video")
        self.assertEqual(result["total_frames"], 32)
        self.assertEqual(result["video"]["frame_count"], 32)
        self.assertEqual(result["video"]["fps"], "16/1")
        self.assertEqual(result["video"]["width"], 256)
        self.assertEqual(result["video"]["height"], 144)
        self.assertTrue((self.root / "final-video" / "video.mp4").exists())

    def test_command_line_reports_real_prepared_local_files(self):
        output = self.root / "command"
        cmd = [sys.executable, str(Path(__file__).resolve().parents[1] / "prepare_video_sources.py"),
               "--input", str(self.inputs), "--output", str(output), "--clip", "camera.mov",
               "--start-seconds", "1", "--seconds", "1"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["prepared"], 1)
        self.assertEqual(payload["filenames"], ["clip-01.mp4"])
        self.assertTrue((output / "clip-01.mp4").exists())
        repeated = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        self.assertNotEqual(repeated.returncode, 0)
        self.assertIn("never overwritten", repeated.stderr)


if __name__ == "__main__":
    unittest.main()
