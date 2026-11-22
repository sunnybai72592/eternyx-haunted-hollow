"""Offline regression tests for saved, independently measured CPU video evaluations."""
import copy
import csv
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_video_evaluations import compare, read_report, render_csv, render_html, save_outputs


ROOT = Path(__file__).resolve().parents[1]


def fixture(weights=None, adapter="d", scene="<turbine>"):
    if weights is None:
        weights = [[1.1, 1.8], [1.0, 2.0]]
    rows = []
    for idx, (seed, source, change) in enumerate(zip(
            (7, 8), ("a" * 64, "b" * 64), weights)):
        base = [1., 2.]
        rows.append({"scene": scene if idx == 0 else "shelter", "start_frame": 4,
                     "source_sha256": source, "seed": seed,
                     "baseline_flow_mse": base, "adapter_flow_mse": change,
                     "mean_mse_delta": sum(a - b for a, b in zip(change, base)) / 2})
    return {"version": 1, "metric": "flow velocity mean squared error",
            "noise_levels": [0.25, 0.75], "manifest_sha256": "c" * 64,
            "adapter_sha256": adapter * 64, "training_step": 3,
            "training_dataset": {"manifest_sha256": "c" * 64, "index_sha256": "e" * 64},
            "cases": rows}


class EvaluationComparatorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.ref = self.write("ref.json", fixture())
        self.best = self.write("best.json", fixture([[0.8, 1.5], [0.7, 1.7]], adapter="f"))
        self.worse = self.write("worse.json", fixture([[1.2, 2.2], [1.1, 2.1]], adapter="9"))

    def write(self, filename, payload):
        path = self.root / filename
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def load(self, path):
        return read_report(path)

    def test_rank_candidates_and_export_local_evidence(self):
        summary, rows = compare(self.load(self.ref), [
            ("worse", self.load(self.worse)), ("best", self.load(self.best))])
        self.assertEqual([c["name"] for c in summary["candidates"]], ["best", "worse"])
        self.assertEqual(len(rows), 8)
        self.assertTrue(summary["candidates"][0]["passes_regression_gates"])
        self.assertFalse(summary["candidates"][1]["passes_regression_gates"])
        self.assertFalse(summary["all_candidates_pass"])
        self.assertEqual(summary["candidates"][0]["paired_cases"], 2)
        self.assertEqual(summary["candidates"][0]["improved_pairs"], 2)
        self.assertLess(summary["candidates"][0]["mean_mse_change"], 0)
        self.assertEqual(len(summary["candidates"][0]["noise_means"]), 2)
        self.assertEqual(len(summary["candidates"][0]["scene_means"]), 2)
        self.assertEqual(len(summary["candidates"][0]["report_sha256"]), 64)
        csv_rows = list(csv.DictReader(io.StringIO(render_csv(rows))))
        self.assertEqual(csv_rows[0]["candidate"], "worse")
        self.assertEqual(csv_rows[0]["scene"], "<turbine>")
        html = render_html(summary)
        self.assertIn("&lt;turbine&gt;", html)
        self.assertNotIn("<turbine>", html)
        self.assertIn("not proof of video quality", summary["interpretation"])
        self.assertIn("not certify video quality", html)
        destination = self.root / "review"
        save_outputs(destination, summary, rows)
        self.assertEqual(json.loads((destination / "summary.json").read_text()), summary)
        self.assertEqual((destination / "pairs.csv").read_text(), render_csv(rows))
        self.assertTrue((destination / "review.html").read_text().startswith("<!doctype html>"))
        with self.assertRaisesRegex(ValueError, "no overwrites"):
            save_outputs(destination, summary, rows)

    def test_strict_compare_requires_identical_held_out_corpus(self):
        valid_ref = self.load(self.ref)
        baseline = fixture([[0.8, 1.5], [0.7, 1.7]], adapter="f")
        for key, value in (
            ("manifest_sha256", "f" * 64),
            ("noise_levels", [0.2, 0.8]),
            ("training_dataset", None),
        ):
            with self.subTest(key=key):
                candidate = copy.deepcopy(baseline)
                candidate[key] = value
                path = self.write("changed.json", candidate)
                with self.assertRaises(ValueError):
                    compare(valid_ref, [("changed", self.load(path))])
        for variant in ("missing", "offset", "drift", "scene"):
            with self.subTest(variant=variant):
                candidate = copy.deepcopy(baseline)
                if variant == "missing":
                    candidate["cases"].pop()
                if variant == "offset":
                    candidate["cases"][0]["start_frame"] = 8
                if variant == "scene":
                    candidate["cases"][0]["scene"] = "different"
                if variant == "drift":
                    candidate["cases"][0]["baseline_flow_mse"][0] = 1.1
                    candidate["cases"][0]["mean_mse_delta"] -= .05
                path = self.write("changed.json", candidate)
                with self.assertRaises(ValueError):
                    compare(valid_ref, [("changed", self.load(path))])

    def test_reject_corrupt_receipts_and_duplicate_source_seeds(self):
        base = fixture()
        edits = [
            lambda r: r.update(version=True),
            lambda r: r.update(metric="visual quality"),
            lambda r: r.update(manifest_sha256="invalid"),
            lambda r: r.update(adapter_sha256="invalid"),
            lambda r: r.update(training_step=-1),
            lambda r: r.update(noise_levels=[0.25, 0.25]),
            lambda r: r.update(noise_levels=[0.25, 2]),
            lambda r: r.update(noise_levels=[0.25, float("nan")]),
            lambda r: r["cases"].append(copy.deepcopy(r["cases"][0])),
            lambda r: r["cases"][0].update(seed=True),
            lambda r: r["cases"][0].update(start_frame=True),
            lambda r: r["cases"][0].update(source_sha256="z" * 64),
            lambda r: r["cases"][0].update(mean_mse_delta=100),
            lambda r: r["cases"][0].update(adapter_flow_mse=[float("inf"), 1]),
            lambda r: r["cases"][0].update(adapter_flow_mse=[1]),
            lambda r: r["cases"][0].update(scene=""),
            lambda r: r.update(cases=[]),
        ]
        for idx, edit in enumerate(edits):
            candidate = copy.deepcopy(base)
            edit(candidate)
            with self.subTest(idx=idx), self.assertRaises(ValueError):
                self.load(self.write("invalid.json", candidate))

    def test_source_metadata_consistent_across_seeds(self):
        report = fixture()
        report["cases"][1]["source_sha256"] = report["cases"][0]["source_sha256"]
        report["cases"][1]["start_frame"] = 5
        with self.assertRaisesRegex(ValueError, "offset"):
            self.load(self.write("changed.json", report))

    def test_reject_invalid_candidate_labels_and_repeat_receipts(self):
        reference = self.load(self.ref)
        other = self.load(self.best)
        for candidates in ([], [("no spaces", other)], [("same", other), ("same", self.load(self.worse))],
                           [("same", other), ("another", other)],
                           [("self", reference)]):
            with self.subTest(candidates=[v[0] for v in candidates]), self.assertRaises(ValueError):
                compare(reference, candidates)

    def test_gate_is_per_pair_scene_and_mean_not_just_average(self):
        reference = self.load(self.ref)
        candidate = fixture([[0.8, 1.6], [1.3, 2.0]], adapter="f")
        path = self.write("candidate.json", candidate)
        report, _ = compare(reference, [("mixed", self.load(path))], max_mean_regression=0)
        one = report["candidates"][0]
        self.assertTrue(one["gates"]["mean"])
        self.assertFalse(one["gates"]["worst_pair"])
        self.assertFalse(one["gates"]["worst_scene"])
        accepted, _ = compare(reference, [("mixed", self.load(path))],
                              max_pair_regression=.16, max_scene_regression=.16)
        self.assertTrue(accepted["all_candidates_pass"])

    def test_invalid_thresholds_are_refused(self):
        for choice in (-1, float("nan"), float("inf"), True):
            with self.subTest(choice=choice), self.assertRaises(ValueError):
                compare(self.load(self.ref), [("best", self.load(self.best))],
                        max_mean_regression=choice)

    def test_oversized_or_symlink_reports_rejected(self):
        too_big = self.root / "large.json"
        too_big.write_bytes(b" " * (4 * 1024 * 1024 + 1))
        with self.assertRaisesRegex(ValueError, "4 MiB"):
            self.load(too_big)
        alias = self.root / "alias.json"
        alias.symlink_to(self.ref)
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.load(alias)

    def test_command_line_export_and_fail_on_regression(self):
        dest = self.root / "regression-output"
        cmd = [sys.executable, str(ROOT / "compare_video_evaluations.py"),
               "--reference", str(self.ref), "--candidate", f"worse={self.worse}",
               "--output", str(dest), "--fail-on-regression"]
        result = subprocess.run(cmd, text=True, capture_output=True)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertFalse(json.loads(result.stdout)["all_candidates_pass"])
        self.assertTrue((dest / "summary.json").exists())
        repeat = subprocess.run(cmd, text=True, capture_output=True)
        self.assertNotEqual(repeat.returncode, 0)
        self.assertIn("new output directory", repeat.stderr)
        better = subprocess.run([sys.executable, str(ROOT / "compare_video_evaluations.py"),
                                 "--reference", str(self.ref), "--candidate", f"best={self.best}",
                                 "--output", str(self.root / "better-output"), "--fail-on-regression"],
                                text=True, capture_output=True)
        self.assertEqual(better.returncode, 0, better.stderr)
        self.assertTrue(json.loads(better.stdout)["all_candidates_pass"])


if __name__ == "__main__":
    unittest.main()
