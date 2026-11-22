"""Convert a local evaluate_video_adapter.py report to a self-contained HTML review."""
import argparse
import base64
from collections import defaultdict
import csv
from html import escape
import io
import json
import math
from pathlib import Path
from statistics import fmean


def table(headers, rows):
    headings = "".join(f"<th scope='col'>{escape(str(h))}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{escape(str(v))}</td>" for v in row) + "</tr>" for row in rows)
    return f"<div class='scroll'><table><thead><tr>{headings}</tr></thead><tbody>{body}</tbody></table></div>"


def review(report):
    levels = report["noise_levels"]
    if (report["version"] != 1 or report["metric"] != "flow velocity mean squared error"
            or not levels or not report["cases"]):
        raise ValueError("Expected a nonempty video flow evaluation")
    scores = []
    scenes = defaultdict(list)
    by_level = [[] for _ in levels]
    seen = set()
    raw = io.StringIO(newline="")
    writer = csv.writer(raw)
    writer.writerow(["source_sha256", "seed", "noise_level", "base_mse", "adapter_mse", "delta"])
    for case in report["cases"]:
        source, seed = case["source_sha256"], case["seed"]
        if (source, seed) in seen:
            raise ValueError("Duplicate clip and seed")
        seen.add((source, seed))
        baseline, adapter = case["baseline_flow_mse"], case["adapter_flow_mse"]
        if len(baseline) != len(levels) or len(adapter) != len(levels):
            raise ValueError("Incomplete noise measurements")
        if not all(type(x) in (float, int) and math.isfinite(x) and x >= 0 for x in baseline + adapter):
            raise ValueError("Invalid prediction error")
        if (not isinstance(source, str) or len(source) != 64 or any(c not in "0123456789abcdef" for c in source)
                or type(seed) is not int or not 0 <= seed < 2**32):
            raise ValueError("Invalid source digest or seed")
        changes = []
        for i, (before, after) in enumerate(zip(baseline, adapter)):
            level = levels[i]
            if type(level) not in (float, int) or not 0 <= level <= 1:
                raise ValueError("Invalid noise level")
            delta = after - before
            changes.append(delta)
            by_level[i].append(delta)
            writer.writerow([source, seed, level, before, after, delta])
        avg = fmean(changes)
        scenes[case["scene"]].append(avg)
        scores.append((avg, case["scene"], seed, source))
    deltas = [row[0] for row in scores]
    summary = table(["Pairs", "Lower error", "Higher error", "Equal error", "Mean change"], [[
        len(scores), sum(d < 0 for d in deltas), sum(d > 0 for d in deltas), deltas.count(0), f"{fmean(deltas):+.6g}"]])
    scene_table = table(["Scene", "Pairs", "Mean change"], [
        [scene, len(values), f"{fmean(values):+.6g}"] for scene, values in sorted(scenes.items())])
    level_table = table(["Noise level", "Mean change"], [
        [level, f"{fmean(values):+.6g}"] for level, values in zip(levels, by_level)])
    regressions = [[scene, seed, source, f"{delta:+.6g}"] for delta, scene, seed, source in sorted(scores, reverse=True)
                   if delta > 0]
    regression_table = table(["Scene", "Seed", "Source SHA-256", "Mean increase"], regressions) if regressions else "<p>No pair had higher mean error.</p>"
    data = base64.b64encode(raw.getvalue().encode()).decode()
    step = report.get("training_step")
    return f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Eternyx video evaluation</title><style>
:root{{color-scheme:light dark}}body{{font:1rem/1.55 system-ui;margin:2rem auto;padding:0 1rem;max-width:64rem}}
h1,h2{{line-height:1.2}}.scroll{{overflow:auto}}table{{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}}
th,td{{padding:.6rem;text-align:left;border-bottom:1px solid #888}}code{{overflow-wrap:anywhere}}
</style><main><h1>Video adapter evaluation</h1><p>Training step {escape(str(step if step is not None else "unrecorded"))}
 · Adapter <code>{escape(str(report["adapter_sha256"]))}</code></p>
<p>Change is adapter error minus base error. Lower values favor the adapter on the evaluated clips.</p>
{summary}<h2>Scenes</h2>{scene_table}<h2>Noise levels</h2>{level_table}
<h2>Pairs with increased error</h2>{regression_table}
<p><a download="video-evaluation.csv" href="data:text/csv;base64,{data}">Download all measurements (CSV)</a></p>
</main></html>"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    page = review(json.loads(args.report.read_bytes()))
    with args.output.open("x", encoding="utf-8") as stream:
        stream.write(page)
