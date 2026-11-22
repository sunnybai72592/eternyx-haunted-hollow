"""Audition 1–3 real tiny-neural CPU video samples with honest temporal diagnostics.

Creates the actual videos and independent MP4 SHA-256 receipts, and records measured
raw RGB delta rather than making fictional aesthetic/realism rankings. Every variant
is a real model run with a different seed or control settings.
"""
import argparse
import json
from pathlib import Path
import shutil
import tempfile

from render_video_timeline import probe, video_info, sha256, FPS
from train_tiny_neural_video import generate, read_model, MAX_SEED

MAX_VARIANTS = 3
MAX_AUDITION_SECONDS = 4


def audit(model_path, output, seeds, seconds=2, stability=45, variation=6,
          profile="landscape", quality="standard"):
    if output.exists() or output.is_symlink():
        raise ValueError("Audition output directory exists; no overwriting")
    if output.parent.is_symlink() or not output.parent.is_dir():
        raise ValueError("Audition parent must be an existing regular directory")
    if (not isinstance(seeds, list) or not 1 <= len(seeds) <= MAX_VARIANTS or
            any(type(seed) is not int or not 0 <= seed <= MAX_SEED for seed in seeds) or
            len(set(seeds)) != len(seeds)):
        raise ValueError("Provide one to three distinct 31-bit integer seeds")
    if type(seconds) is not int or not 1 <= seconds <= MAX_AUDITION_SECONDS:
        raise ValueError("Each audition candidate must be 1–4 seconds")
    # Check model before making a temporary work area.
    read_model(model_path)
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-neural-audition-", dir=output.parent))
    try:
        cases = []
        for index, seed in enumerate(seeds, start=1):
            name = f"candidate-{index:02d}"
            destination = stage / name
            result = generate(model_path, destination, seconds=seconds, seed=seed,
                              profile=profile, quality=quality,
                              stability=stability, variation=variation)
            video = destination / "render" / "video.mp4"
            renderer_receipt = destination / "render" / "manifest.json"
            if (not video.is_file() or not renderer_receipt.is_file() or
                    sha256(video) != result["video_sha256"]):
                raise ValueError("Audition generated video identity mismatch")
            details = json.loads(renderer_receipt.read_text(encoding="utf-8"))
            if (details["video"]["sha256"] != result["video_sha256"] or
                    details["video"]["frame_count"] != seconds * FPS):
                raise ValueError("Audition renderer claims unexpected output identity")
            size = video_info(probe(video, count_frames=True))
            if size != (details["video"]["width"], details["video"]["height"], seconds * FPS):
                raise ValueError("Audition actual MP4 frames/dimensions do not match receipt")
            cases.append({
                "candidate": name, "sample_seed": seed,
                "file": name + "/render/video.mp4",
                "video_sha256": result["video_sha256"],
                "video_bytes": video.stat().st_size,
                "model_sha256": result["model_sha256"],
                "renderer_manifest_sha256": sha256(renderer_receipt),
                "actual_decoded_frames": size[2], "width": size[0], "height": size[1],
                "raw_frames_sha256": result["raw_frames_sha256"],
                "temporal_frame_metrics": result["temporal_frame_metrics"],
            })
        report = {
            "version": 1, "kind": "cpu_tiny_neural_video_audition",
            "neural_network": True, "text_to_video": False,
            "model_sha256": sha256(model_path),
            "candidate_count": len(cases), "seconds": seconds, "fps": FPS,
            "profile": profile, "quality": quality,
            "stability_percent": stability, "variation_percent": variation,
            "candidates": cases,
            "interpretation": (
                "Actual decoded videos and raw RGB temporal deltas. "
                "No quality ranking, perceptual scoring, or prompt alignment is inferred."
            ),
        }
        (stage / "audition-report.json").write_text(
            json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        if output.exists() or output.is_symlink():
            raise ValueError("Audition directory appeared during generation; refusing overwrite")
        stage.rename(output)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seeds", type=int, nargs="+", default=[42, 43, 44])
    parser.add_argument("--seconds", type=int, default=2)
    parser.add_argument("--stability", type=int, default=45)
    parser.add_argument("--variation", type=int, default=6)
    parser.add_argument("--profile", choices=("landscape", "portrait", "square"),
                        default="landscape")
    parser.add_argument("--quality", choices=("standard", "high"), default="standard")
    args = parser.parse_args()
    try:
        report = audit(args.model, args.output, args.seeds, args.seconds,
                       args.stability, args.variation, args.profile, args.quality)
        print(json.dumps({
            "output": str(args.output), "candidates": report["candidate_count"],
            "model_sha256": report["model_sha256"],
            "videos": [row["file"] for row in report["candidates"]],
        }))
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
