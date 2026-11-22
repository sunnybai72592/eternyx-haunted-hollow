import base64
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from review_video_evaluation import review


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.case = {"scene": "<moving>", "source_sha256": "a" * 64, "seed": 7,
                     "baseline_flow_mse": [1, 2], "adapter_flow_mse": [2, 3]}
        self.report = {"version": 1, "metric": "flow velocity mean squared error",
                       "noise_levels": [0.25, 0.75], "cases": [self.case], "adapter_sha256": "b" * 64}

    def test_mixed_results_and_csv(self):
        self.report["cases"].append({**self.case, "seed": 8, "adapter_flow_mse": [0, 1]})
        page = review(self.report)
        self.assertIn("&lt;moving&gt;", page)
        self.assertNotIn("<moving>", page)
        self.assertIn("<td>2</td><td>1</td><td>1</td><td>0</td><td>+0</td>", page)
        self.assertIn("<td>7</td>", page)
        self.assertNotIn("<td>8</td>", page)
        csv = base64.b64decode(re.search(r"base64,([^\"]+)", page)[1]).decode()
        self.assertEqual(len(csv.splitlines()), 5)
        self.assertIn(",8,0.75,2,1,-1", csv)

    def test_refuses_duplicate_or_incomplete_pairs(self):
        self.report["cases"].append(self.case)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            review(self.report)
        self.report["cases"].pop()
        self.case["adapter_flow_mse"].pop()
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            review(self.report)
