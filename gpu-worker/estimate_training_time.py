"""Project adapter-training wall time from representative optimizer-step timings."""
import argparse
import json
import math
import statistics
from pathlib import Path


def estimate(steps, samples, overhead_minutes=0):
    if steps < 1 or len(samples) < 2:
        raise ValueError("Set a positive optimizer-step count and supply at least two step timings.")
    if not all(math.isfinite(s) and s > 0 for s in samples):
        raise ValueError("Step timings must be positive finite seconds.")
    if not math.isfinite(overhead_minutes) or overhead_minutes < 0:
        raise ValueError("Overhead minutes must be finite and nonnegative.")
    def hours(seconds):
        value = steps * seconds / 3600 + overhead_minutes / 60
        if not math.isfinite(value):
            raise ValueError("Estimate exceeds the supported numeric range.")
        return round(value, 4)

    return {"mean_seconds_per_step": statistics.mean(samples),
            "fastest_seconds_per_step": min(samples), "slowest_seconds_per_step": max(samples),
            "optimizer_steps": steps, "sample_count": len(samples),
            "median_seconds_per_step": statistics.median(samples),
            "overhead_minutes": overhead_minutes,
            "projected_hours": hours(statistics.mean(samples)),
            "hours_at_fastest_sample": hours(min(samples)),
            "hours_at_slowest_sample": hours(max(samples))}


def budget_capacity(minutes, samples, overhead_minutes):
    if not math.isfinite(minutes) or minutes < 0:
        raise ValueError("Time budget must be finite and nonnegative")
    seconds = max(0.0, (minutes - overhead_minutes) * 60)
    return {"minutes": minutes, "steps_at_mean": math.floor(seconds / statistics.mean(samples)),
            "steps_at_slowest_sample": math.floor(seconds / max(samples))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steps", type=int, required=True, help="Total planned optimizer updates")
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--pilot", type=Path, help="Completed pilot.json with measured optimizer steps")
    inputs.add_argument("--step-seconds", type=float, nargs="+",
                        help="Measured wall time per complete optimizer update after warm-up")
    parser.add_argument("--overhead-minutes", type=float, default=0,
                        help="Combined loading, warm-up, checkpoint and evaluation time")
    parser.add_argument("--also-steps", type=int, nargs="+", help="Additional step counts to compare")
    parser.add_argument("--budget-minutes", type=float, help="Estimate updates that fit within a time budget")
    parser.add_argument("--warmup-steps", type=int, help="Initial pilot updates to exclude (default 1)")
    args = parser.parse_args()
    try:
        samples = args.step_seconds
        if args.warmup_steps is not None and not args.pilot:
            raise ValueError("--warmup-steps requires a pilot receipt")
        if args.pilot:
            receipt = json.loads(args.pilot.read_bytes())
            samples = receipt.get("step_seconds") if isinstance(receipt, dict) else None
            skip = 1 if args.warmup_steps is None else args.warmup_steps
            if not isinstance(samples, list) or skip < 0 or len(samples) - skip < 2:
                raise ValueError("Choose a nonnegative warm-up count leaving at least two measured updates")
            samples = samples[skip:]
        result = estimate(args.steps, samples, args.overhead_minutes)
        if args.pilot:
            result["warmup_steps_excluded"] = skip
            result["benchmark_context"] = receipt.get("benchmark_context")
        if args.also_steps:
            result["additional_scenarios"] = [estimate(n, samples, args.overhead_minutes) for n in args.also_steps]
        if args.budget_minutes is not None:
            result["time_budget"] = budget_capacity(args.budget_minutes, samples, args.overhead_minutes)
        print(json.dumps(result, indent=2, allow_nan=False))
    except (ValueError, OverflowError, TypeError, OSError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
