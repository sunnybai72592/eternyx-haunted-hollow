"""Compare two saved indexed-checkpoint evaluation reports locally."""
import argparse
import json
import math
from pathlib import Path
from statistics import fmean


def indexed_cases(report):
    cases = {}
    for row in report["cases"]:
        key = row["source_sha256"], row["seed"]
        if key in cases:
            raise ValueError("Duplicate clip and seed")
        for field in ("adapter_flow_mse", "baseline_flow_mse"):
            scores = row[field]
            if len(scores) != len(report["noise_levels"]) or not all(
                type(v) in (int, float) and math.isfinite(v) and v >= 0 for v in scores
            ):
                raise ValueError("Invalid flow error scores")
        cases[key] = row
    if not cases:
        raise ValueError("Empty evaluation")
    return cases


def compare(earlier, later):
    for field in ("version", "metric", "manifest_sha256", "training_dataset", "noise_levels"):
        if earlier[field] != later[field]:
            raise ValueError(f"Different evaluation field: {field}")
    if (earlier["version"] != 1 or earlier["metric"] != "flow velocity mean squared error"
            or not earlier["noise_levels"] or not earlier["training_dataset"]):
        raise ValueError("Expected indexed flow evaluation reports")
    steps = [report["training_step"] for report in (earlier, later)]
    if any(type(step) is not int or step < 1 for step in steps) or steps[0] >= steps[1]:
        raise ValueError("Supply the earlier checkpoint first")
    first, second = indexed_cases(earlier), indexed_cases(later)
    if first.keys() != second.keys():
        raise ValueError("Different evaluation clips or seeds")
    cases = []
    for key in sorted(first):
        a, b = first[key], second[key]
        if a["baseline_flow_mse"] != b["baseline_flow_mse"] or a["scene"] != b["scene"]:
            raise ValueError("Unmatched baseline or scene")
        changes = [y - x for x, y in zip(a["adapter_flow_mse"], b["adapter_flow_mse"])]
        cases.append({"source_sha256": key[0], "seed": key[1], "scene": a["scene"],
                      "delta_by_noise_level": changes, "mean_mse_delta": fmean(changes)})
    deltas = [case["mean_mse_delta"] for case in cases]
    return {"version": 1, "metric": earlier["metric"], "training_dataset": earlier["training_dataset"],
            "noise_levels": earlier["noise_levels"], "checkpoints": [
                {"step": report["training_step"], "sha256": report["adapter_sha256"]} for report in (earlier, later)],
            "cases": cases, "summary": {"pairs": len(cases), "lower_error": sum(d < 0 for d in deltas),
                                        "higher_error": sum(d > 0 for d in deltas), "equal_error": deltas.count(0),
                                        "mean_mse_delta": fmean(deltas)}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("earlier", "later", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    result = compare(json.loads(args.earlier.read_bytes()), json.loads(args.later.read_bytes()))
    payload = json.dumps(result, indent=2, allow_nan=False) + "\n"
    with args.output.open("x", encoding="utf-8") as stream:
        stream.write(payload)
    print(json.dumps(result["summary"]))
