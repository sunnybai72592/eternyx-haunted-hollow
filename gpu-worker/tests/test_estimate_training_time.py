import argparse
import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from estimate_training_time import (
    budget_capacity, budget_fit, estimate, measured_overhead, plan, read_pilot,
)


class TrainingEstimateTests(unittest.TestCase):
    def test_sample_overhead_and_descriptive_variability(self):
        result = estimate(500, [18, 20, 22], 30)
        self.assertEqual(result["projected_hours"], 3.2778)
        self.assertEqual(result["hours_at_fastest_sample"], 3)
        self.assertEqual(result["hours_at_slowest_sample"], 3.5556)
        self.assertEqual(result["hours_at_p90_sample"], 3.5556)
        self.assertEqual(result["p90_seconds_per_step"], 22)
        self.assertEqual(result["coefficient_of_variation_percent"], 8.16)

    def test_budget_reserves_overhead_and_rounds_down(self):
        result = budget_capacity(2, [7, 13], .25)
        self.assertEqual(result["steps_at_mean"], 10)
        self.assertEqual(result["steps_at_slowest_sample"], 8)
        self.assertEqual(result["steps_at_p90_sample"], 8)
        self.assertEqual(budget_capacity(1, [7, 13], 2)["steps_at_mean"], 0)
        with self.assertRaises(ValueError):
            budget_capacity(float("nan"), [1, 2], 0)

    def test_budget_fit_uses_unrounded_times(self):
        self.assertEqual(budget_fit(6, [9, 11], 1, 0), {
            "fits_at_mean": True, "fits_at_p90": False, "fits_at_slowest": False,
        })
        self.assertFalse(budget_fit(1, [1, 2], 0.5, 1)["fits_at_mean"])
        self.assertTrue(budget_fit(5, [8, 10], 1, 0)["fits_at_slowest"])

    def test_invalid_measurements(self):
        for args in [(0, [1, 2], 0), (1, [1], 0), (1, [0, 2], 0),
                     (1, [1, math.nan], 0), (1, [1, 2], -1), (1, [True, 2], 0),
                     (True, [1, 2], 0), (1, [1, 2], math.inf)]:
            with self.subTest(args=args), self.assertRaises(ValueError):
                estimate(*args)
        with self.assertRaises(ValueError):
            budget_capacity(1e308, [1, 2], 0)

    def make_receipt(self, directory, **changes):
        receipt = {"version": 1, "training_step": 3, "step_seconds": [12, 6, 8],
                   "elapsed_seconds": 50, "benchmark_context": {"device": "cpu", "architecture": "x86_64"}}
        receipt.update(changes)
        path = directory / "pilot.json"
        path.write_text(json.dumps(receipt))
        return path

    def arguments(self, path, **changes):
        args = dict(steps=100, pilot=path, step_seconds=None, warmup_steps=1,
                    overhead_minutes=0.4, auto_overhead=True, also_steps=[200],
                    budget_minutes=30, output=None)
        args.update(changes)
        return argparse.Namespace(**args)

    def test_auto_overhead_charges_fixed_and_warmup_once(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.make_receipt(Path(folder))
            receipt, samples, digest = read_pilot(path, 1)
            self.assertEqual(len(digest), 64)
            measured = measured_overhead(receipt, samples, 1)
            self.assertEqual(measured["nonstep_seconds"], 24)
            self.assertEqual(measured["excluded_warmup_seconds"], 12)
            self.assertEqual(measured["measured_overhead_minutes"], 0.6)
            result = plan(self.arguments(path))
            self.assertEqual(result["overhead_minutes"], 1)
            self.assertEqual(result["sample_count"], 2)
            self.assertAlmostEqual(result["projected_hours"], round((100 * 7 + 60) / 3600, 4))
            self.assertEqual(result["pilot_receipt_sha256"], digest)
            self.assertTrue(result["time_budget"]["primary_fit"]["fits_at_slowest"])
            self.assertTrue(result["additional_scenarios"][0]["budget_fit"]["fits_at_slowest"])
            self.assertTrue(result["planning_assumptions"]["pilot_overhead_included"])

    def test_old_pilot_receipt_without_benchmark_context_still_works(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.make_receipt(Path(folder), benchmark_context=None)
            result = plan(self.arguments(path, auto_overhead=False))
            self.assertIsNone(result["benchmark_context"])
            self.assertEqual(result["overhead_minutes"], .4)
            self.assertNotIn("observed_overhead", result)

    def test_reject_inconsistent_untrusted_receipts(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for change in (
                {"version": 2},
                {"step_seconds": [12, 0, 8]},
                {"step_seconds": [12, "six", 8]},
                {"training_step": 100},
                {"benchmark_context": {"device": "cuda"}},
                {"benchmark_context": "cpu"},
            ):
                with self.subTest(change=change):
                    path = self.make_receipt(root, **change)
                    with self.assertRaises(ValueError):
                        read_pilot(path, 1)
            for change in (
                {"elapsed_seconds": 20},
                {"elapsed_seconds": float("inf")},
            ):
                with self.subTest(change=change):
                    path = self.make_receipt(root, **change)
                    with self.assertRaises(ValueError):
                        plan(self.arguments(path))
            path = self.make_receipt(root)
            with self.assertRaises(ValueError):
                plan(self.arguments(path, warmup_steps=2))
            with self.assertRaises(ValueError):
                plan(self.arguments(path, steps=0))
            with self.assertRaises(ValueError):
                plan(self.arguments(path, steps=0, warmup_steps=0))
            with self.assertRaises(ValueError):
                plan(self.arguments(path, steps=1))
            with self.assertRaises(ValueError):
                plan(self.arguments(path, also_steps=[0]))

    def test_cli_output_receipt_is_create_only(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            receipt = self.make_receipt(root)
            output = root / "benchmark-plan.json"
            command = [sys.executable, str(ROOT / "estimate_training_time.py"),
                       "--steps", "100", "--pilot", str(receipt), "--auto-overhead",
                       "--budget-minutes", "5", "--output", str(output)]
            first = subprocess.run(command, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(first.stdout), json.loads(output.read_text()))
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(second.returncode, 0)
            self.assertIn("File exists", second.stderr)
            self.assertEqual(json.loads(output.read_text()), json.loads(first.stdout))

    def test_cli_requires_pilot_for_auto_overhead(self):
        completed = subprocess.run([sys.executable, str(ROOT / "estimate_training_time.py"),
                                    "--steps", "20", "--step-seconds", "1", "2",
                                    "--auto-overhead"], capture_output=True, text=True)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("requires --pilot", completed.stderr)


if __name__ == "__main__":
    unittest.main()
