import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from estimate_training_time import estimate, budget_capacity


class TrainingEstimateTests(unittest.TestCase):
    def test_sample_and_overhead_projection(self):
        result = estimate(500, [18, 20, 22], 30)
        self.assertEqual(result["projected_hours"], 3.2778)
        self.assertEqual(result["hours_at_fastest_sample"], 3)
        self.assertEqual(result["hours_at_slowest_sample"], 3.5556)

    def test_budget_reserves_overhead_and_rounds_down(self):
        result = budget_capacity(2, [7, 13], .25)
        self.assertEqual(result["steps_at_mean"], 10)
        self.assertEqual(result["steps_at_slowest_sample"], 8)
        self.assertEqual(budget_capacity(1, [7, 13], 2)["steps_at_mean"], 0)
        with self.assertRaises(ValueError):
            budget_capacity(float("nan"), [1, 2], 0)

    def test_invalid_measurements(self):
        for args in [(0, [1, 2], 0), (1, [1], 0), (1, [0, 2], 0),
                     (1, [1, math.nan], 0), (1, [1, 2], -1)]:
            with self.subTest(args=args), self.assertRaises(ValueError):
                estimate(*args)
