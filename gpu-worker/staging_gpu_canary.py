#!/usr/bin/env python3
"""Owner-approved, cost-bounded REAL Wan GPU smoke runner.

This script never rents a GPU, downloads a model, installs dependencies, or
enables ETERNYX subscriptions. Running this on an already provisioned GPU can
incur infrastructure charges, so explicit approval and budget are mandatory.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from gpu_canary_process import bounded_subprocess, inspect_mp4_decode

APPROVAL = "I_APPROVE_ONE_STAGING_WAN_GPU_TEST"
MAX_GPU_SECONDS = 1800
MAX_GPU_HOURLY_CENTS = 2000
MAX_ALLOWANCE_CENTS = 10000
MAX_MODEL_MANIFEST = 2 * 1024 * 1024
MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
DEFAULT_PROMPT = "A peaceful coastline at sunrise, cinematic movement of the water"

def require_integer(value, name, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(name + " is outside approved bounds")
    return value

def authorize(approval, max_seconds, hourly_cents, allowance_cents):
    if approval != APPROVAL:
        raise ValueError("explicit single-run approval is required")
    require_integer(max_seconds, "maximum GPU seconds", 30, MAX_GPU_SECONDS)
    require_integer(hourly_cents, "GPU hourly rate cents", 1, MAX_GPU_HOURLY_CENTS)
    require_integer(allowance_cents, "spend allowance cents", 1, MAX_ALLOWANCE_CENTS)
    # Worst case includes the full test timeout plus a 20% startup/teardown buffer.
    estimated = (hourly_cents * max_seconds * 12 + 35999) // 36000
    if estimated > allowance_cents:
        raise ValueError("worst-case test runtime exceeds spending allowance")
    return estimated

def verify_manifest(model_dir, manifest_path):
    """Pinned operator-reviewed file hashes. All files verified before model import."""
    root = Path(model_dir)
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise ValueError("trusted absolute model directory required")
    manifest = Path(manifest_path)
    if not manifest.is_absolute() or manifest.is_symlink() or not manifest.is_file():
        raise ValueError("trusted absolute model manifest required")
    if manifest.stat().st_size > MAX_MODEL_MANIFEST:
        raise ValueError("manifest exceeds size limit")
    value = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or set(value) != {"modelId", "revision", "files"}:
        raise ValueError("invalid pinned manifest")
    if value["modelId"] != MODEL_ID:
        raise ValueError("model mismatch")
    if not isinstance(value["revision"], str) or len(value["revision"]) != 40 or any(
        ch not in "0123456789abcdef" for ch in value["revision"]
    ):
        raise ValueError("immutable 40-character git revision required")
    files = value["files"]
    if not isinstance(files, dict) or not files or "model_index.json" not in files or len(files) > 2000:
        raise ValueError("missing model hash inventory")
    root = root.resolve(strict=True)
    for rel, digest in files.items():
        if not isinstance(rel, str) or not rel or len(rel) > 300 or rel.startswith("/") or "\\" in rel or "\x00" in rel:
            raise ValueError("unsafe model relative filename")
        parts = Path(rel).parts
        if any(part in (".", "..") for part in parts):
            raise ValueError("path traversal not allowed")
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("invalid SHA-256")
        target = root / rel
        if target.is_symlink() or not target.is_file() or not target.resolve(strict=True).is_relative_to(root):
            raise ValueError("model file missing or unsafe")
        h = hashlib.sha256()
        with target.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                h.update(chunk)
        if h.hexdigest() != digest:
            raise ValueError("model hash mismatch")
    # Require the manifest to inventory every file: no untrusted extra weight files.
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    if actual != set(files):
        raise ValueError("model directory contents differ from reviewed manifest")
    return value["revision"]

def validate_mp4_with_ffprobe(path, timeout=15):
    """Ensure actual video streams exist; unlike ftyp, this checks decodability metadata."""
    if not path.is_file() or path.is_symlink() or not 1024 <= path.stat().st_size <= 200 * 1024 * 1024:
        raise ValueError("generated video missing or invalid size")
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "stream=codec_type,width,height,nb_frames,duration",
        "-of", "json", str(path)
    ], capture_output=True, text=True, timeout=timeout, check=True)
    if len(result.stdout) > 16384:
        raise ValueError("probe output too large")
    info = json.loads(result.stdout)
    streams = info.get("streams", []) if isinstance(info, dict) else []
    video = [s for s in streams if isinstance(s, dict) and s.get("codec_type") == "video"]
    if len(video) != 1 or not (int(video[0].get("width", 0)) > 0 and int(video[0].get("height", 0)) > 0):
        raise ValueError("no decodable video stream metadata")
    # Decoding every frame is a separate staging acceptance task.
    return {"width": int(video[0]["width"]), "height": int(video[0]["height"])}

def inspect_gpu():
    """Confirm CUDA is already present; never attempts provider provisioning."""
    command = ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"]
    result = subprocess.run(command, capture_output=True, text=True, timeout=10, check=True)
    if not result.stdout.strip() or len(result.stdout) > 2048:
        raise ValueError("CUDA GPU information unavailable")
    return result.stdout.strip().splitlines()[0]

def run_once(args):
    if os.environ.get("ETERNYX_GPU_STAGING_ENV") != "isolated_staging":
        raise ValueError("separately isolated staging environment required")
    if args.dry_run:
        raise ValueError("dry-run is not a GPU execution mode; use offline tests")
    estimated_cents = authorize(
        args.approval, args.max_seconds, args.hourly_cents, args.allowance_cents)
    if not args.model_dir or not args.manifest or not args.private_dir:
        raise ValueError("trusted local model, manifest and media directory required")
    model_revision = verify_manifest(args.model_dir, args.manifest)
    import importlib.util
    inference_path = Path(__file__).resolve().with_name("wan21_infer.py")
    spec = importlib.util.spec_from_file_location("eternyx_real_wan", inference_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    env = dict(os.environ)
    env["ETERNYX_WAN21_MODEL_DIR"] = str(Path(args.model_dir).resolve())
    env["ETERNYX_PRIVATE_VIDEO_DIR"] = str(Path(args.private_dir).resolve())
    # Verify directory permissions and no links using the exact production runner.
    original = dict(os.environ)
    try:
        os.environ.update({"ETERNYX_WAN21_MODEL_DIR": env["ETERNYX_WAN21_MODEL_DIR"],
                           "ETERNYX_PRIVATE_VIDEO_DIR": env["ETERNYX_PRIVATE_VIDEO_DIR"]})
        module.validated_storage_path()
        module.validated_model_path()
    finally:
        os.environ.clear()
        os.environ.update(original)
    gpu = inspect_gpu()
    payload = {"featureKey": "ai.video.text_to_video", "prompt": DEFAULT_PROMPT,
               "durationSeconds": 1, "aspectRatio": "16:9", "version": 1}
    started = time.monotonic()
    stdout = bounded_subprocess(
        [sys.executable, str(inference_path)], stdin=json.dumps(payload),
        timeout_seconds=args.max_seconds, env=env, max_stdout=4096)
    elapsed = time.monotonic() - started
    receipt = json.loads(stdout)
    if not isinstance(receipt, dict) or set(receipt) != {"outputReference"}:
        raise ValueError("invalid output receipt")
    asset = receipt["outputReference"]
    if not isinstance(asset, str) or not re.fullmatch(r"asset_[0-9a-f]{32}", asset):
        raise ValueError("unexpected output reference")
    output = Path(args.private_dir) / (asset + ".mp4")
    media_info = inspect_mp4_decode(output, timeout_seconds=min(120, args.max_seconds))
    evidence = {"status": "gpu_inference_success", "modelId": MODEL_ID,
                "pinnedRevision": model_revision,
                "gpu": gpu[:128], "durationSecondsRequested": 1,
                "wallSeconds": round(elapsed, 2), "budgetUpperBoundCents": estimated_cents,
                "mp4Bytes": output.stat().st_size, **media_info,
                "timestamp": datetime.now(timezone.utc).isoformat()}
    return evidence

def main():
    parser = argparse.ArgumentParser(description="Owner-approved one-video Wan GPU canary")
    parser.add_argument("--approval", default="")
    parser.add_argument("--max-seconds", type=int, default=300)
    parser.add_argument("--hourly-cents", type=int, default=0)
    parser.add_argument("--allowance-cents", type=int, default=0)
    parser.add_argument("--model-dir", default="")
    parser.add_argument("--manifest", default="")
    parser.add_argument("--private-dir", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        evidence = run_once(args)
    except Exception:
        print(json.dumps({"status": "blocked_or_failed"}))
        return 1
    print(json.dumps(evidence, sort_keys=True))
    return 0

if __name__ == "__main__":
    sys.exit(main())
