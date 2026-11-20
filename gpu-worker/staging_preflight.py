#!/usr/bin/env python3
"""Zero-spend readiness report for an ALREADY installed Wan CUDA environment.

Never downloads, installs, provisions or executes video inference. Returns a
sanitized JSON report to help operators identify blockers before paid tests.
"""
import argparse
import importlib.metadata
import json
import os
import shutil
from pathlib import Path

from staging_gpu_canary import verify_manifest

DEPENDENCIES = ("torch", "diffusers", "transformers", "accelerate", "imageio",
                "imageio-ffmpeg")
REQUIRED_EXECUTABLES = ("ffmpeg", "ffprobe", "nvidia-smi")

def inspect_readiness(model_dir="", manifest="", private_dir="", *, versions=None,
                      executable_locator=None, gpu_enabled=None, verifier=None):
    # Dependencies injected for deterministic offline tests.
    versions = versions if versions is not None else importlib.metadata.version
    executable_locator = executable_locator if executable_locator is not None else shutil.which
    verifier = verifier if verifier is not None else verify_manifest
    checks = {}
    for package in DEPENDENCIES:
        try:
            value = versions(package)
            checks["python:" + package] = bool(value and isinstance(value, str))
        except (importlib.metadata.PackageNotFoundError, ValueError):
            checks["python:" + package] = False
    for name in REQUIRED_EXECUTABLES:
        checks["executable:" + name] = bool(executable_locator(name))
    # Presence is not proof of a sufficiently powerful CUDA device or compatible
    # drivers. Do not load GPU libraries merely to report free readiness.
    checks["gpu_hardware_declared"] = bool(gpu_enabled) if gpu_enabled is not None else False
    try:
        checks["model_snapshot_pinned"] = bool(
            model_dir and manifest and verifier(model_dir, manifest))
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        checks["model_snapshot_pinned"] = False
    try:
        folder = Path(private_dir)
        checks["private_media_directory"] = bool(
            private_dir and folder.is_absolute() and not folder.is_symlink() and
            folder.is_dir() and folder.stat().st_mode & 0o077 == 0)
    except (OSError, ValueError):
        checks["private_media_directory"] = False
    return {"status": "ready_for_manual_review" if all(checks.values()) else "blocked",
            "checks": checks, "safeToStartPaidGpu": False,
            "modelExecuted": False, "providerBillingConfigured": False}

def main():
    parser = argparse.ArgumentParser(description="Zero-spend local Wan GPU readiness inspection")
    parser.add_argument("--model-dir", default="")
    parser.add_argument("--manifest", default="")
    parser.add_argument("--private-dir", default="")
    parser.add_argument("--gpu-confirmed", action="store_true",
                        help="operator confirms locally provisioned NVIDIA CUDA GPU; not independently verified")
    args = parser.parse_args()
    result = inspect_readiness(
        args.model_dir, args.manifest, args.private_dir, gpu_enabled=args.gpu_confirmed)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "ready_for_manual_review" else 2

if __name__ == "__main__":
    raise SystemExit(main())
