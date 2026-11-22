"""Compare completed, held-out CPU video adapter evaluations without inference or APIs."""
import argparse
import csv
import hashlib
from html import escape
import io
import json
import math
from pathlib import Path
import re
import shutil

DIGEST = re.compile(r"[0-9a-f]{64}\\Z")
LABEL = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,39}\\Z")
METRIC = "flow velocity mean squared error"
MAX_REPORT_BYTES = 4 * 1024 * 1024
MAX_CASES = 5000
MAX_CANDIDATES = 12


def number(value, label, minimum=None):
    if type(value) not in (float, int) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number")
    if minimum is not None and value < minimum:
        raise ValueError(f"{label} must be >= {minimum}")
    return value


def digest(value, label):
    if not isinstance(value, str) or not DIGEST.fullmatch(value):
        raise ValueError(f"Invalid {label}")
    return value


def read_report(path):
    """Strictly validate a saved local evaluation, without loading any ML dependencies."""
    if path.is_symlink() or not path.is_file():
        raise ValueError("Evaluation path must be a regular local file, not a symlink")
    with path.open("rb") as stream:
        raw = stream.read(MAX_REPORT_BYTES + 1)
    if len(raw) > MAX_REPORT_BYTES:
        raise ValueError("Evaluation report exceeds the 4 MiB limit")
    payload = json.loads(raw)
    if not isinstance(payload, dict) or type(payload.get("version")) is not int or payload["version"] != 1:
        raise ValueError("Expected a version 1 evaluation")
    if payload.get("metric") != METRIC:
        raise ValueError("Expected flow velocity MSE evaluations")
    digest(payload.get("manifest_sha256"), "manifest SHA-256")
    digest(payload.get("adapter_sha256"), "adapter SHA-256")
    dataset = payload.get("training_dataset")
    if dataset is not None:
        if not isinstance(dataset, dict):
            raise ValueError("Invalid training dataset provenance")
        if dataset.get("manifest_sha256") != payload["manifest_sha256"]:
            raise ValueError("Training dataset manifest disagrees with evaluation")
    step = payload.get("training_step")
    if step is not None and (type(step) is not int or step < 0):
        raise ValueError("Invalid training step")
    levels = payload.get("noise_levels")
    if not isinstance(levels, (list, tuple)) or not 1 <= len(levels) <= 16:
        raise ValueError("Expected between 1 and 16 noise levels")
    for level in levels:
        number(level, "Noise level", 0)
        if level > 1:
            raise ValueError("Noise levels must be <= 1")
    if len(set(levels)) != len(levels):
        raise ValueError("Duplicate noise levels")
    cases = payload.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= MAX_CASES:
        raise ValueError("Evaluation must contain 1-5000 matched cases")

    pairs, scenes = {}, {}
    for case in cases:
        if not isinstance(case, dict):
            raise ValueError("Invalid evaluation case")
        source = digest(case.get("source_sha256"), "source SHA-256")
        scene = case.get("scene")
        if not isinstance(scene, str) or not scene.strip() or len(scene) > 160:
            raise ValueError("Invalid scene label")
        start = case.get("start_frame")
        seed = case.get("seed")
        if type(start) is not int or not 0 <= start <= 2**31 - 1:
            raise ValueError("Invalid start frame")
        if type(seed) is not int or not 0 <= seed < 2**32:
            raise ValueError("Invalid evaluation seed")
        if source in scenes and scenes[source] != (scene, start):
            raise ValueError("Source clip scene/offset changed across seeds")
        scenes[source] = (scene, start)
        key = (source, seed)
        if key in pairs:
            raise ValueError("Duplicate evaluation source/seed pair")
        baseline = case.get("baseline_flow_mse")
        adapter = case.get("adapter_flow_mse")
        if (not isinstance(baseline, list) or not isinstance(adapter, list)
                or len(baseline) != len(levels) or len(adapter) != len(levels)):
            raise ValueError("Incomplete noise measurements")
        for score in baseline + adapter:
            number(score, "Prediction error", 0)
        changes = [after - before for before, after in zip(baseline, adapter)]
        derived = math.fsum(changes) / len(changes)
        number(derived, "Derived evaluation delta")
        saved_delta = case.get("mean_mse_delta")
        if saved_delta is not None:
            number(saved_delta, "Saved evaluation delta")
            if not math.isclose(saved_delta, derived, abs_tol=1e-7, rel_tol=1e-7):
                raise ValueError("Saved mean MSE delta does not match measurements")
        pairs[key] = {"scene": scene, "start_frame": start, "baseline": baseline,
                      "adapter": adapter, "delta": derived}
    return {"sha256": hashlib.sha256(raw).hexdigest(), "payload": payload, "pairs": pairs}


def mean(values):
    return math.fsum(values) / len(values)


def compare(reference, candidates, *, max_mean_regression=0, max_pair_regression=0,
            max_scene_regression=0):
    """Paired comparisons use adapter MSE on identical source/seed/noise cases."""
    for name, limit in (("mean regression", max_mean_regression),
                        ("pair regression", max_pair_regression),
                        ("scene regression", max_scene_regression)):
        number(limit, name, 0)
    if not 1 <= len(candidates) <= MAX_CANDIDATES:
        raise ValueError("Supply 1-12 candidate reports")
    base = reference["payload"]
    baseline_pairs = reference["pairs"]
    ref_keys = set(baseline_pairs)
    manifest = base["manifest_sha256"]
    levels = base["noise_levels"]
    output = {
        "version": 1, "metric": METRIC, "reference_report_sha256": reference["sha256"],
        "reference_adapter_sha256": base["adapter_sha256"], "manifest_sha256": manifest,
        "noise_levels": levels, "paired_cases": len(ref_keys),
        "thresholds": {"max_mean_regression": max_mean_regression,
                       "max_pair_regression": max_pair_regression,
                       "max_scene_regression": max_scene_regression},
        "candidates": [],
        "interpretation": "Negative MSE changes favor the candidate over the reference adapter. "
                          "Threshold gates are local regression checks, not proof of video quality.",
    }
    raw_rows = []
    names, seen_receipts = set(), {reference["sha256"]}
    for name, candidate in candidates:
        if not isinstance(name, str) or not LABEL.fullmatch(name) or name in names:
            raise ValueError("Use unique alphanumeric candidate names (up to 40 characters)")
        names.add(name)
        current = candidate["payload"]
        if candidate["sha256"] in seen_receipts:
            raise ValueError("Identical report supplied more than once")
        seen_receipts.add(candidate["sha256"])
        if current["manifest_sha256"] != manifest or current["noise_levels"] != levels:
            raise ValueError("Candidate manifest or noise levels differ from reference")
        if current.get("training_dataset") != base.get("training_dataset"):
            raise ValueError("Training dataset provenance differs from reference")
        if set(candidate["pairs"]) != ref_keys:
            raise ValueError("Missing or extra held-out source/seed pairs")
        by_scene, by_level, by_pair = {}, [[] for _ in levels], []
        for key in sorted(ref_keys):
            before = baseline_pairs[key]
            after = candidate["pairs"][key]
            if (before["scene"], before["start_frame"]) != (after["scene"], after["start_frame"]):
                raise ValueError("Scene labels or source window offsets differ")
            diffs = []
            for idx, level in enumerate(levels):
                if not math.isclose(before["baseline"][idx], after["baseline"][idx],
                                    rel_tol=1e-7, abs_tol=1e-7):
                    raise ValueError("Base-model MSE drift: these evaluations are not comparable")
                delta = after["adapter"][idx] - before["adapter"][idx]
                number(delta, "Paired MSE change")
                diffs.append(delta)
                by_level[idx].append(delta)
                raw_rows.append([name, key[0], before["scene"], before["start_frame"], key[1], level,
                                 before["adapter"][idx], after["adapter"][idx], delta])
            pair_delta = mean(diffs)
            by_pair.append(pair_delta)
            by_scene.setdefault(before["scene"], []).append(pair_delta)
        scene_means = [{"scene": label, "paired_cases": len(values), "mean_mse_change": mean(values)}
                       for label, values in sorted(by_scene.items())]
        noise_means = [{"noise_level": level, "mean_mse_change": mean(values)}
                       for level, values in zip(levels, by_level)]
        avg = mean(by_pair)
        worst = max(by_pair)
        worst_scene = max(row["mean_mse_change"] for row in scene_means)
        gates = {"mean": avg <= max_mean_regression,
                 "worst_pair": worst <= max_pair_regression,
                 "worst_scene": worst_scene <= max_scene_regression}
        output["candidates"].append({
            "name": name, "report_sha256": candidate["sha256"],
            "adapter_sha256": current["adapter_sha256"], "training_step": current.get("training_step"),
            "paired_cases": len(by_pair), "improved_pairs": sum(x < 0 for x in by_pair),
            "regressed_pairs": sum(x > 0 for x in by_pair), "equal_pairs": sum(x == 0 for x in by_pair),
            "mean_mse_change": avg, "worst_pair_mse_change": worst,
            "worst_scene_mse_change": worst_scene, "scene_means": scene_means,
            "noise_means": noise_means, "gates": gates, "passes_regression_gates": all(gates.values()),
        })
    output["candidates"].sort(key=lambda row: (row["mean_mse_change"], row["name"]))
    output["all_candidates_pass"] = all(row["passes_regression_gates"] for row in output["candidates"])
    return output, raw_rows


def render_csv(rows):
    buf = io.StringIO(newline="")
    writer = csv.writer(buf)
    writer.writerow(["candidate", "source_sha256", "scene", "start_frame", "seed",
                     "noise_level", "reference_adapter_mse", "candidate_adapter_mse", "mse_change"])
    writer.writerows(rows)
    return buf.getvalue()


def render_html(result):
    def rows(headers, records):
        head = "".join(f"<th scope='col'>{escape(h)}</th>" for h in headers)
        body = "".join("<tr>" + "".join(f"<td>{escape(str(x))}</td>" for x in row) + "</tr>"
                       for row in records)
        return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"
    summary = [[c["name"], c["training_step"], c["paired_cases"], f'{c["mean_mse_change"]:+.6g}',
                f'{c["worst_pair_mse_change"]:+.6g}', "PASS" if c["passes_regression_gates"] else "REVIEW"]
               for c in result["candidates"]]
    sections = []
    for c in result["candidates"]:
        label = escape(c["name"])
        per_scene = rows(["Scene", "Cases", "Mean MSE change"],
                         [[r["scene"], r["paired_cases"], f'{r["mean_mse_change"]:+.6g}']
                          for r in c["scene_means"]])
        per_level = rows(["Noise level", "Mean MSE change"],
                         [[r["noise_level"], f'{r["mean_mse_change"]:+.6g}'] for r in c["noise_means"]])
        sections.append(f"<section><h2>{label}</h2><h3>Held-out scenes</h3>{per_scene}"
                        f"<h3>Noise levels</h3>{per_level}</section>")
    table = rows(["Candidate", "Training step", "Paired cases", "Mean MSE change",
                  "Worst pair", "Regression gate"], summary)
    return ("""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Eternyx CPU video adapter comparisons</title><style>
:root{color-scheme:light dark}body{font:1rem/1.55 system-ui;margin:2rem auto;padding:0 1rem;max-width:68rem}
h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}
th,td{padding:.6rem;text-align:left;border-bottom:1px solid #888}code{overflow-wrap:anywhere}
</style><main><h1>Eternyx held-out adapter comparisons</h1>
<p>Negative change indicates lower flow-prediction error for the candidate than the reference adapter.
Every comparison pairs the same held-out source, seed, noise level and baseline model measurement.</p>
<p>Regression gates inspect the selected thresholds; they do not certify video quality, motion or prompt fidelity.
Review rendered clips separately. No network calls or model inference occurred during this report.</p>
"""+table+"".join(sections)+"""<p><a href="summary.json">Machine-readable summary (JSON)</a> ·
<a href="pairs.csv">Individual paired measurements (CSV)</a></p></main></html>
""")


def save_outputs(path, summary, rows):
    """Create-only directory with cleanup on failure; never replace prior evidence."""
    if path.exists() or path.is_symlink():
        raise ValueError("Choose a new output directory (no overwrites)")
    files = {"summary.json": json.dumps(summary, indent=2, allow_nan=False) + "\n",
             "pairs.csv": render_csv(rows), "review.html": render_html(summary)}
    path.mkdir(parents=False, exist_ok=False)
    try:
        for name, body in files.items():
            with (path / name).open("x", encoding="utf-8", newline="") as handle:
                handle.write(body)
    except Exception:
        shutil.rmtree(path)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True, help="Reference adapter evaluation JSON")
    parser.add_argument("--candidate", action="append", required=True, metavar="NAME=REPORT",
                        help="Repeated labelled candidate report paths")
    parser.add_argument("--output", type=Path, required=True, help="New output directory")
    parser.add_argument("--max-mean-regression", type=float, default=0)
    parser.add_argument("--max-pair-regression", type=float, default=0)
    parser.add_argument("--max-scene-regression", type=float, default=0)
    parser.add_argument("--fail-on-regression", action="store_true",
                        help="Return status 2 after saving output if a candidate fails any gate")
    args = parser.parse_args()
    try:
        parsed = []
        for spec in args.candidate:
            name, sep, file = spec.partition("=")
            if not sep or not file:
                raise ValueError("--candidate requires NAME=REPORT")
            parsed.append((name, read_report(Path(file))))
        summary, rows = compare(read_report(args.reference), parsed,
                                max_mean_regression=args.max_mean_regression,
                                max_pair_regression=args.max_pair_regression,
                                max_scene_regression=args.max_scene_regression)
        save_outputs(args.output, summary, rows)
        print(json.dumps({"output": str(args.output), "all_candidates_pass": summary["all_candidates_pass"],
                          "ranking": [r["name"] for r in summary["candidates"]]}, allow_nan=False))
        if args.fail_on_regression and not summary["all_candidates_pass"]:
            return 2
    except (OSError, ValueError, TypeError, OverflowError, KeyError, json.JSONDecodeError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
