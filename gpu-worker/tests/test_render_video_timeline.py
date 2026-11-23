"""Exercise real offline FFmpeg video-and-audio timeline editing without model downloads."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from render_video_timeline import (MAX_FRAMES, check_shots, check_soundtrack, html,
                                   read_board, render, safe_path, verify_output)

ROOT = Path(__file__).resolve().parents[1]
AVAILABLE = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@unittest.skipUnless(AVAILABLE, "Requires FFmpeg/FFprobe")
class OfflineVideoTimelineTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.media = self.root / "media"
        self.media.mkdir()
        self.a = self.video("moving.mp4", "testsrc=size=32x32:rate=16:duration=2")
        self.b = self.video("dark.mp4", "color=c=black:s=32x32:r=16:d=2")
        self.audio = self.sound()
        self.board = {
            "version": 2, "shots": [
                {"file": "moving.mp4", "source_sha256": self.digest(self.a),
                 "start_frame": 4, "frames": 16, "caption": "A moving sample",
                 "rights_ref": "ffmpeg-synthetic"},
                {"file": "dark.mp4", "source_sha256": self.digest(self.b),
                 "start_frame": 2, "frames": 16, "caption": "Dark sample",
                 "rights_ref": "ffmpeg-synthetic", "fade_in_frames": 4, "fade_out_frames": 4},
            ]}
        self.board_path = self.root / "board.json"
        self.write_board()

    @staticmethod
    def digest(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def run_ffmpeg(self, options, dest):
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
                        "-f", "lavfi", "-i", options, "-threads", "1",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(dest)],
                       capture_output=True, check=True, timeout=20)

    def video(self, name, filter_spec):
        dest = self.media / name
        self.run_ffmpeg(filter_spec, dest)
        return dest

    def sound(self):
        dest = self.media / "music.wav"
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
                        "-f", "lavfi", "-i", "sine=frequency=400:duration=1:sample_rate=44100",
                        "-c:a", "pcm_s16le", str(dest)], capture_output=True, check=True, timeout=15)
        return dest

    def write_board(self):
        self.board_path.write_text(json.dumps(self.board, ensure_ascii=False), encoding="utf-8")


    def test_cinematic_real_24fps_720p_and_legacy_16fps_are_separate_verified_modes(self):
        file = self.video("cinematic.mp4", "testsrc=size=1280x720:rate=24:duration=1")
        self.board = {
            "version": 2, "fps": 24,
            "shots": [{"file": "cinematic.mp4",
                       "source_sha256": self.digest(file),
                       "start_frame": 0, "frames": 24,
                       "caption": "Real frame timing",
                       "rights_ref": "ffmpeg-fixture"}],
        }
        self.write_board()
        destination = self.root / "native-720"
        result = render(self.board_path, self.media, destination,
                        "landscape", "cinematic")
        self.assertEqual(result["fps"], 24)
        self.assertEqual(result["video"]["fps"], "24/1")
        self.assertEqual(result["video"]["frame_count"], 24)
        self.assertEqual((result["video"]["width"], result["video"]["height"]), (1280, 720))
        self.assertIn("00:00:01,000", (destination / "captions.srt").read_text())
        self.assertEqual(self.digest(destination / "video.mp4"),
                         result["video"]["sha256"])
        with self.assertRaisesRegex(ValueError, "24 FPS storyboard"):
            render(self.board_path, self.media, self.root / "wrong-quality",
                   "landscape", "high")
        self.board["fps"] = 30
        self.write_board()
        with self.assertRaisesRegex(ValueError, "v2 storyboard"):
            render(self.board_path, self.media, self.root / "wrong-fps",
                   "landscape", "cinematic")

    def test_real_32_frame_video_with_fades_and_subtitles(self):
        dest = self.root / "edited"
        receipt = render(self.board_path, self.media, dest)
        self.assertEqual(receipt["total_frames"], 32)
        self.assertEqual(receipt["video"]["frame_count"], 32)
        self.assertEqual(receipt["video"]["fps"], "16/1")
        self.assertEqual((receipt["video"]["width"], receipt["video"]["height"]), (256, 144))
        self.assertFalse(receipt["video"]["audio"])
        self.assertEqual(receipt["video"]["sha256"], self.digest(dest / "video.mp4"))
        self.assertEqual(receipt["shots"][0]["timeline_start_frame"], 0)
        self.assertEqual(receipt["shots"][1]["timeline_start_frame"], 16)
        self.assertEqual(receipt["shots"][1]["fade_in_frames"], 4)
        self.assertEqual(receipt["shots"][1]["fade_out_frames"], 4)
        self.assertFalse(receipt["model_generation"])
        self.assertEqual(json.loads((dest / "manifest.json").read_text()), receipt)
        preview = (dest / "preview.html").read_text()
        self.assertEqual(preview.count("data:image/png;base64,"), 2)
        self.assertNotIn("http://", preview)
        self.assertIn("Fade in/out 4/4", preview)
        srt = (dest / "captions.srt").read_text()
        self.assertIn("00:00:01,000 --> 00:00:02,000", srt)

    def test_soundtrack_is_repeated_bounded_and_recorded_with_rights(self):
        self.board["soundtrack"] = {"file": "music.wav", "source_sha256": self.digest(self.audio),
                                    "rights_ref": "ffmpeg-synthetic-sine", "volume_percent": 35}
        self.write_board()
        dest = self.root / "music-edited"
        receipt = render(self.board_path, self.media, dest)
        self.assertTrue(receipt["video"]["audio"])
        self.assertEqual(receipt["soundtrack"]["volume_percent"], 35)
        self.assertEqual(receipt["soundtrack"]["rights_ref"], "ffmpeg-synthetic-sine")
        self.assertEqual(receipt["video"]["frame_count"], 32)
        self.assertTrue((dest / "video.mp4").stat().st_size > 0)
        self.assertFalse((dest / "preview.html").read_text().find("http://") >= 0)

    def test_actual_longer_than_four_seconds_without_full_frame_buffer(self):
        long = self.video("long.mp4", "testsrc=size=32x32:rate=16:duration=6")
        self.board["shots"] = [
            {"file": "long.mp4", "source_sha256": self.digest(long),
             "start_frame": 0, "frames": 80, "caption": "Five-second sample",
             "rights_ref": "ffmpeg-synthetic"}]
        self.write_board()
        dest = self.root / "five-seconds"
        receipt = render(self.board_path, self.media, dest)
        self.assertEqual(receipt["video"]["frame_count"], 80)
        self.assertEqual(receipt["video"]["duration_seconds"], 5)
        self.assertEqual((dest / "preview.html").read_text().count("data:image/png;base64,"), 1)

    def test_portrait_and_square_quality_presets(self):
        self.board["shots"] = [self.board["shots"][0]]
        self.write_board()
        portrait = render(self.board_path, self.media, self.root / "portrait", "portrait", "standard")
        self.assertEqual((portrait["video"]["width"], portrait["video"]["height"]), (144, 256))
        square = render(self.board_path, self.media, self.root / "square", "square", "standard")
        self.assertEqual((square["video"]["width"], square["video"]["height"]), (256, 256))
        high = render(self.board_path, self.media, self.root / "high", "landscape", "high")
        self.assertEqual((high["video"]["width"], high["video"]["height"]), (512, 288))

    def test_reject_rewritten_sources_without_partial_output(self):
        self.board["shots"][0]["source_sha256"] = "0" * 64
        self.write_board()
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            render(self.board_path, self.media, self.root / "mismatch")
        self.assertFalse((self.root / "mismatch").exists())

    def test_invalid_fades_and_cut_boundaries(self):
        original = copy.deepcopy(self.board["shots"][0])
        for bad in ({"frames": 0}, {"frames": True}, {"start_frame": -1},
                    {"start_frame": 30, "frames": 5},
                    {"fade_in_frames": 9}, {"fade_in_frames": -1},
                    {"fade_out_frames": True}, {"fade_out_frames": 17},
                    {"caption": "<\n>"}, {"rights_ref": ""}):
            with self.subTest(bad=bad):
                self.board["shots"][0] = {**original, **bad}
                self.write_board()
                with self.assertRaises(ValueError):
                    render(self.board_path, self.media, self.root / "invalid")
                self.assertFalse((self.root / "invalid").exists())
        self.board["shots"][0] = original

    def test_audio_rights_hash_and_volume_are_enforced(self):
        good = {"file": "music.wav", "source_sha256": self.digest(self.audio),
                "rights_ref": "test-audio", "volume_percent": 20}
        for bad in ({"source_sha256": "0" * 64}, {"rights_ref": ""},
                    {"volume_percent": -1}, {"volume_percent": 101}, {"volume_percent": True}):
            with self.subTest(bad=bad):
                self.board["soundtrack"] = {**good, **bad}
                self.write_board()
                with self.assertRaises(ValueError):
                    render(self.board_path, self.media, self.root / "bad-audio")
                self.assertFalse((self.root / "bad-audio").exists())

    def test_symlink_traversal_and_url_media_are_rejected(self):
        for name in ("../moving.mp4", "/tmp/a.mp4", "https://example.com/a.mp4",
                     "nested/../moving.mp4", "bad\\path.mp4"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                safe_path(self.media, name, {".mp4"}, 64 * 1024 * 1024)
        link = self.media / "link.mp4"
        link.symlink_to(self.a)
        with self.assertRaisesRegex(ValueError, "Symlink"):
            safe_path(self.media, "link.mp4", {".mp4"}, 64 * 1024 * 1024)
        top_link = self.root / "linked-root"
        top_link.symlink_to(self.media, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            safe_path(top_link, "moving.mp4", {".mp4"}, 64 * 1024 * 1024)

    def test_reject_unsupported_framerate_and_nonvideo(self):
        low = self.video("8fps.mp4", "testsrc=size=32x32:rate=8:duration=2")
        self.board["shots"][0]["file"] = "8fps.mp4"
        self.board["shots"][0]["source_sha256"] = self.digest(low)
        self.write_board()
        with self.assertRaisesRegex(ValueError, "16 FPS"):
            render(self.board_path, self.media, self.root / "bad-fps")

    def test_max_timeline_30seconds_and_no_overwrite(self):
        full = self.video("duration.mp4", "testsrc=size=32x32:rate=16:duration=31")
        self.board["shots"] = [
            {"file": "duration.mp4", "source_sha256": self.digest(full),
             "start_frame": 0, "frames": MAX_FRAMES, "caption": "Thirty seconds",
             "rights_ref": "ffmpeg-synthetic"},
            {"file": "moving.mp4", "source_sha256": self.digest(self.a),
             "start_frame": 0, "frames": 1, "caption": "Overflow", "rights_ref": "test"}
        ]
        self.write_board()
        with self.assertRaisesRegex(ValueError, "480 frames"):
            render(self.board_path, self.media, self.root / "too-long")
        self.assertFalse((self.root / "too-long").exists())
        self.board["shots"] = [self.board["shots"][0]]
        self.write_board()
        _, total = check_shots(self.board, self.media)
        self.assertEqual(total, 480)

    def test_invalid_board_schema_duplicate_keys_and_existing_export(self):
        for payload in ('{"version":2,"version":2,"shots":[]}',
                        '{"version":true,"shots":[{}]}',
                        '{"version":2,"shots":[]}',
                        '{"version":2,"shots":[{}],"remote_api":"no"}'):
            with self.subTest(payload=payload):
                self.board_path.write_text(payload)
                with self.assertRaises(ValueError):
                    read_board(self.board_path)
        self.write_board()
        dest = self.root / "once"
        render(self.board_path, self.media, dest)
        with self.assertRaisesRegex(ValueError, "no overwriting"):
            render(self.board_path, self.media, dest)

    def test_html_escapes_operator_subtitles_and_preserves_utf8_srt(self):
        self.board["shots"][0]["caption"] = "<Body> & مرحبًا"
        self.write_board()
        dest = self.root / "unicode"
        render(self.board_path, self.media, dest)
        review = (dest / "preview.html").read_text()
        self.assertIn("&lt;Body&gt; &amp; مرحبًا", review)
        self.assertNotIn("<Body>", review)
        self.assertIn("<Body> & مرحبًا", (dest / "captions.srt").read_text())

    def test_cli_works_without_model_or_cloud(self):
        dest = self.root / "via-cli"
        cmd = [sys.executable, str(ROOT / "render_video_timeline.py"),
               "--storyboard", str(self.board_path), "--media", str(self.media),
               "--output", str(dest), "--profile", "landscape"]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        printed = json.loads(proc.stdout)
        self.assertEqual(printed["frames"], 32)
        self.assertEqual(printed["video_sha256"], self.digest(dest / "video.mp4"))
        self.assertFalse(printed["audio"])


if __name__ == "__main__":
    unittest.main()
