"""Project adapter-training wall time from representative optimizer-step timings."""
import argparse
import json
import math
import statistics


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
    parser.add_argument("--step-seconds", type=float, nargs="+", required=True,
                        help="Measured wall time per complete optimizer update after warm-up")
    parser.add_argument("--overhead-minutes", type=float, default=0,
                        help="Combined loading, warm-up, checkpoint and evaluation time")
    args = parser.parse_args()
    try:
        print(json.dumps(estimate(args.steps, args.step_seconds, args.overhead_minutes), indent=2))
    except (ValueError, OverflowError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
