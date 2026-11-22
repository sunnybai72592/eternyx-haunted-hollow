import csv
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_video_dataset import FIELDS, prepare


class DatasetTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.rows = []
        for index, split in enumerate(("train", "eval")):
            name = f"{index}.mp4"
            (self.root / name).write_bytes(bytes([index]))
            self.rows.append([name, str(index), split, "A door opens", "original",
                              "Creator log 7", "Does the door open in the same direction?"])

    def run_check(self, fields=FIELDS):
        sheet = io.StringIO()
        writer = csv.writer(sheet)
        writer.writerows([fields, *self.rows])
        sheet.seek(0)
        return prepare(self.root, sheet, inspect=lambda path: {"width": 640})

    def test_stable_and_separate(self):
        first = self.run_check()
        self.rows.reverse()
        self.assertEqual(first, self.run_check())
        self.assertEqual(len(first["clips"][0]["sha256"]), 64)

    def test_optional_start_frame(self):
        fields = (*FIELDS, "start_frame")
        self.rows[0].append("12")
        self.rows[1].append("")
        manifest = self.run_check(fields)
        self.assertEqual(manifest["clips"][0]["start_frame"], 12)
        self.assertNotIn("start_frame", manifest["clips"][1])
        self.rows[0][-1] = "-1"
        with self.assertRaisesRegex(ValueError, "start_frame"):
            self.run_check(fields)

    def test_scene_leakage(self):
        self.rows[1][1] = self.rows[0][1]
        with self.assertRaisesRegex(ValueError, "both splits"):
            self.run_check()

    def test_duplicate_content(self):
        (self.root / "1.mp4").write_bytes((self.root / "0.mp4").read_bytes())
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self.run_check()

    def test_missing_rights(self):
        self.rows[0][5] = " "
        with self.assertRaisesRegex(ValueError, "required"):
            self.run_check()

    def test_no_holdout(self):
        self.rows.pop()
        with self.assertRaisesRegex(ValueError, "separate"):
            self.run_check()
