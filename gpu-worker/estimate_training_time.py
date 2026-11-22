"""Project CPU adapter-training wall time from measured optimizer-step timings."""
import argparse
import hashlib
import json
import math
import statistics
from pathlib import Path


def valid_seconds(samples):
    if not isinstance(samples, (list, tuple)) or len(samples) < 2:
        raise ValueError("Supply at least two measured optimizer-step timings.")
    if any(type(value) not in (float, int) or not math.isfinite(value) or value <= 0 for value in samples):
        raise ValueError("Step timings must be positive finite numbers (not booleans).")
    return samples


def nonnegative(value, name):
    if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} must be finite and nonnegative.")
    return value


def p90_seconds(samples):
    """Descriptive nearest-rank p90, NOT a confidence or guaranteed upper bound."""
    return sorted(samples)[math.ceil(0.9 * len(samples)) - 1]


def estimate(steps, samples, overhead_minutes=0):
    if type(steps) is not int or steps < 1:
        raise ValueError("Optimizer steps must be a positive integer.")
    valid_seconds(samples)
    nonnegative(overhead_minutes, "Overhead minutes")
    mean = statistics.mean(samples)
    tail = p90_seconds(samples)

    def hours(seconds):
        value = steps * seconds / 3600 + overhead_minutes / 60
        if not math.isfinite(value):
            raise ValueError("Estimate exceeds the supported numeric range.")
        return round(value, 4)

    return {
        "mean_seconds_per_step": mean,
        "fastest_seconds_per_step": min(samples),
        "slowest_seconds_per_step": max(samples),
        "optimizer_steps": steps,
        "sample_count": len(samples),
        "median_seconds_per_step": statistics.median(samples),
        "p90_seconds_per_step": tail,
        "coefficient_of_variation_percent": round(statistics.pstdev(samples) / mean * 100, 2),
        "overhead_minutes": overhead_minutes,
        "projected_hours": hours(mean),
        "hours_at_fastest_sample": hours(min(samples)),
        "hours_at_slowest_sample": hours(max(samples)),
        "hours_at_p90_sample": hours(tail),
    }


def budget_capacity(minutes, samples, overhead_minutes):
    nonnegative(minutes, "Time budget")
    nonnegative(overhead_minutes, "Overhead minutes")
    valid_seconds(samples)
    seconds = max(0.0, (minutes - overhead_minutes) * 60)
    if not math.isfinite(seconds):
        raise ValueError("Time budget exceeds the supported numeric range.")
    return {
        "minutes": minutes,
        "steps_at_mean": math.floor(seconds / statistics.mean(samples)),
        "steps_at_slowest_sample": math.floor(seconds / max(samples)),
        "steps_at_p90_sample": math.floor(seconds / p90_seconds(samples)),
    }


def budget_fit(steps, samples, minutes, overhead_minutes):
    """Compare unrounded times, never four-decimal display hours."""
    nonnegative(minutes, "Time budget")
    available = max(0.0, (minutes - overhead_minutes) * 60)
    if not math.isfinite(available):
        raise ValueError("Time budget exceeds the supported numeric range.")
    # Even zero optimizer updates cannot fit when overhead alone exceeds the budget.
    overhead_fits = overhead_minutes <= minutes
    return {
        "fits_at_mean": overhead_fits and steps * statistics.mean(samples) <= available,
        "fits_at_p90": overhead_fits and steps * p90_seconds(samples) <= available,
        "fits_at_slowest": overhead_fits and steps * max(samples) <= available,
    }


def read_pilot(path, warmup_steps):
    raw = path.read_bytes()
    receipt = json.loads(raw)
    if not isinstance(receipt, dict) or type(receipt.get("version")) is not int or receipt["version"] != 1:
        raise ValueError("Expected a version 1 pilot receipt.")
    samples = receipt.get("step_seconds")
    if not isinstance(samples, list) or len(samples) < 2:
        raise ValueError("Pilot receipt requires measured optimizer steps.")
    valid_seconds(samples)
    if type(warmup_steps) is not int or warmup_steps < 0 or len(samples) - warmup_steps < 2:
        raise ValueError("Choose nonnegative warm-up steps leaving at least two measured updates.")
    if "training_step" in receipt and (type(receipt["training_step"]) is not int
                                       or receipt["training_step"] != len(samples)):
        raise ValueError("Pilot training step does not match the recorded optimizer updates.")
    context = receipt.get("benchmark_context")
    if context is not None and (not isinstance(context, dict) or
                                (context.get("device") is not None and context["device"] != "cpu")):
        raise ValueError("Only CPU pilot benchmark receipts are supported.")
    if "elapsed_seconds" in receipt:
        nonnegative(receipt["elapsed_seconds"], "Pilot elapsed seconds")
    return receipt, samples, hashlib.sha256(raw).hexdigest()


def measured_overhead(receipt, samples, warmup_steps):
    """Once-per-pilot wall time minus measured updates, plus excluded warm-up."""
    if "elapsed_seconds" not in receipt:
        raise ValueError("--auto-overhead requires pilot elapsed_seconds.")
    total = math.fsum(samples)
    elapsed = receipt["elapsed_seconds"]
    if elapsed + 0.001 < total:
        raise ValueError("Pilot elapsed time is shorter than the recorded optimizer updates.")
    nonstep = max(0.0, elapsed - total)
    warmup = math.fsum(samples[:warmup_steps])
    combined = nonstep + warmup
    if not math.isfinite(combined):
        raise ValueError("Measured overhead exceeds the supported numeric range.")
    return {
        "nonstep_seconds": round(nonstep, 6),
        "excluded_warmup_seconds": round(warmup, 6),
        "measured_overhead_minutes": combined / 60,
    }


def plan(args):
    if args.warmup_steps is not None and not args.pilot:
        raise ValueError("--warmup-steps requires a pilot receipt.")
    if args.auto_overhead and not args.pilot:
        raise ValueError("--auto-overhead requires --pilot.")
    nonnegative(args.overhead_minutes, "Overhead minutes")
    samples = args.step_seconds
    result_details = {}
    derived = None
    if args.pilot:
        skip = 1 if args.warmup_steps is None else args.warmup_steps
        receipt, recorded, digest = read_pilot(args.pilot, skip)
        samples = recorded[skip:]
        result_details.update({
            "warmup_steps_excluded": skip,
            "benchmark_context": receipt.get("benchmark_context"),
            "pilot_receipt_sha256": digest,
        })
        if args.auto_overhead:
            derived = measured_overhead(receipt, recorded, skip)
            result_details["observed_overhead"] = derived
            if any(value <= skip for value in [args.steps, *(args.also_steps or [])]):
                raise ValueError("Target steps must exceed excluded warm-up updates with auto overhead.")
    overhead = args.overhead_minutes + (derived["measured_overhead_minutes"] if derived else 0)
    nonnegative(overhead, "Total overhead minutes")
    result = estimate(args.steps, samples, overhead)
    result.update(result_details)
    result["planning_assumptions"] = {
        "cpu_only": bool(args.pilot),
        "timing_percentiles_are_descriptive_not_confidence_bounds": True,
        "pilot_overhead_included": bool(args.auto_overhead),
    }
    if args.also_steps:
        result["additional_scenarios"] = [estimate(n, samples, overhead) for n in args.also_steps]
    if args.budget_minutes is not None:
        result["time_budget"] = budget_capacity(args.budget_minutes, samples, overhead)
        result["time_budget"]["primary_fit"] = budget_fit(args.steps, samples, args.budget_minutes, overhead)
        for scenario in result.get("additional_scenarios", []):
            scenario["budget_fit"] = budget_fit(scenario["optimizer_steps"], samples, args.budget_minutes, overhead)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steps", type=int, required=True, help="Total planned optimizer updates")
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--pilot", type=Path, help="Completed local CPU pilot receipt")
    inputs.add_argument("--step-seconds", type=float, nargs="+", help="Measured full update seconds")
    parser.add_argument("--overhead-minutes", type=float, default=0, help="Additional fixed overhead minutes")
    parser.add_argument("--auto-overhead", action="store_true",
                        help="Charge measured nonstep pilot time and excluded warm-up once per planned run")
    parser.add_argument("--also-steps", type=int, nargs="+", help="Additional step counts to compare")
    parser.add_argument("--budget-minutes", type=float, help="Time budget including overhead")
    parser.add_argument("--warmup-steps", type=int, help="Pilot updates to exclude from steady-state (default 1)")
    parser.add_argument("--output", type=Path, help="Create a new local JSON plan; never overwrite an existing file")
    args = parser.parse_args()
    try:
        result = plan(args)
        rendered = json.dumps(result, indent=2, allow_nan=False) + "\n"
        if args.output:
            with args.output.open("x", encoding="utf-8") as stream:
                stream.write(rendered)
        print(rendered, end="")
    except (ValueError, OverflowError, TypeError, OSError, KeyError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
