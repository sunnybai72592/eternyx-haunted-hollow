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

    return {"optimizer_steps": steps, "sample_count": len(samples),
            "median_seconds_per_step": statistics.median(samples),
            "overhead_minutes": overhead_minutes,
            "projected_hours": hours(statistics.mean(samples)),
            "hours_at_fastest_sample": hours(min(samples)),
            "hours_at_slowest_sample": hours(max(samples))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steps", type=int, required=True, help="Total planned optimizer updates")
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--pilot", type=Path, help="Completed pilot.json with measured optimizer steps")
    inputs.add_argument("--step-seconds", type=float, nargs="+",
                        help="Measured wall time per complete optimizer update after warm-up")
    parser.add_argument("--overhead-minutes", type=float, default=0,
                        help="Combined loading, warm-up, checkpoint and evaluation time")
    args = parser.parse_args()
    try:
        samples = args.step_seconds
        if args.pilot:
            receipt = json.loads(args.pilot.read_bytes())
            samples = receipt.get("step_seconds") if isinstance(receipt, dict) else None
            if not isinstance(samples, list) or len(samples) < 3:
                raise ValueError("A timed pilot needs at least three steps to exclude warm-up and retain two samples")
            samples = samples[1:]
        print(json.dumps(estimate(args.steps, samples, args.overhead_minutes), indent=2))
    except (ValueError, OverflowError, TypeError, OSError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
