"""Run directly with Python, NumPy and FFmpeg."""
import hashlib
from pathlib import Path
import subprocess
import tempfile
import unittest

from prepare_training_frames import prepare_evaluation_frames, prepare_frames


class FrameWindowTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.path = self.root / "scene.mp4"
        self.make_clip("2")
        self.row = {"file": "scene.mp4", "split": "train", "scene": "Workshop",
                    "rights": "original", "rights_ref": "test", "caption": "Red frame",
                    "sha256": hashlib.sha256(self.path.read_bytes()).hexdigest()}
        self.manifest = {"version": 1, "clips": [self.row]}

    def make_clip(self, duration):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                        f"color=red:size=80x120:rate=16:duration={duration}",
                        "-c:v", "mpeg4", str(self.path)], check=True)

    def test_real_decode(self):
        frames = prepare_frames(self.root, self.manifest, "scene.mp4")["frames"]
        self.assertEqual(frames.shape, (17, 224, 384, 3))
        self.assertLess(frames[:, :, 0].max(), 8)
        self.assertGreater(frames[:, 112, 192, 0].min(), 240)

    def test_offset_matches_overlapping_decoded_frames(self):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                        "testsrc2=size=80x120:rate=16:duration=2", "-c:v", "mpeg4", str(self.path)], check=True)
        self.row["sha256"] = hashlib.sha256(self.path.read_bytes()).hexdigest()
        first = prepare_frames(self.root, self.manifest, self.path.name)["frames"]
        self.row["start_frame"] = 8
        shifted = prepare_frames(self.root, self.manifest, self.path.name)
        self.assertEqual(shifted["start_frame"], 8)
        self.assertTrue((first[8:] == shifted["frames"][:9]).all())
        self.assertFalse((first == shifted["frames"]).all())
        self.row["start_frame"] = 16
        with self.assertRaisesRegex(ValueError, "too short"):
            prepare_frames(self.root, self.manifest, self.path.name)

    def test_changed_or_short(self):
        self.make_clip("0.25")
        with self.assertRaisesRegex(ValueError, "changed"):
            prepare_frames(self.root, self.manifest, "scene.mp4")
        self.row["sha256"] = hashlib.sha256(self.path.read_bytes()).hexdigest()
        with self.assertRaisesRegex(ValueError, "too short"):
            prepare_frames(self.root, self.manifest, "scene.mp4")

    def test_holdout(self):
        self.manifest["clips"].append({**self.row, "file": "other.mp4", "split": "eval"})
        with self.assertRaisesRegex(ValueError, "evaluation"):
            prepare_frames(self.root, self.manifest, "scene.mp4")
        with self.assertRaisesRegex(ValueError, "evaluation"):
            prepare_evaluation_frames(self.root, self.manifest, "other.mp4")
        with self.assertRaisesRegex(ValueError, "eval-split"):
            prepare_evaluation_frames(self.root, self.manifest, "scene.mp4")
        with self.assertRaisesRegex(ValueError, "train-split"):
            prepare_frames(self.root, self.manifest, "other.mp4")


if __name__ == "__main__":
    unittest.main()
