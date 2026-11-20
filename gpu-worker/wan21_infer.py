#!/usr/bin/env python3
"""Offline, operator-approved Wan 2.1 1.3B text-to-video executable.

Reads one validated job JSON on stdin, generates MP4 using a locally provisioned
Diffusers model, moves media to private operator-owned storage, prints only an
opaque asset reference. Never downloads a model or enables GPU usage by itself.
"""
import json
import os
import re
import secrets
import sys
import tempfile
from pathlib import Path

MODEL_NAME = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
FPS = 16
MAX_JOB_BYTES = 12000
MAX_VIDEO_BYTES = 200 * 1024 * 1024

def parse_job(raw):
    if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_JOB_BYTES:
        raise ValueError("invalid job size")
    request = json.loads(raw)
    if not isinstance(request, dict):
        raise ValueError("invalid job")
    allowed = {"featureKey", "prompt", "durationSeconds", "aspectRatio",
               "negativePrompt", "version"}
    if set(request) - allowed or request.get("featureKey") != "ai.video.text_to_video":
        raise ValueError("unsupported feature or fields")
    prompt = request.get("prompt")
    duration = request.get("durationSeconds")
    if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 4000:
        raise ValueError("invalid prompt")
    if type(duration) is not int or not 1 <= duration <= 5:
        raise ValueError("staging supports only 1 to 5 seconds")
    if request.get("aspectRatio", "16:9") != "16:9":
        raise ValueError("only 16:9 staging output supported")
    negative = request.get("negativePrompt", "")
    if not isinstance(negative, str) or len(negative) > 2000:
        raise ValueError("invalid negative prompt")
    if type(request.get("version", 1)) is not int or request.get("version", 1) != 1:
        raise ValueError("unsupported request version")
    # Wan requires (num_frames - 1) divisible by 4.
    frame_count = FPS * duration + 1
    return {"prompt": prompt.strip(), "negative_prompt": negative.strip(),
            "num_frames": frame_count}

def validated_storage_path():
    root = os.environ.get("ETERNYX_PRIVATE_VIDEO_DIR", "")
    if not root or not os.path.isabs(root):
        raise ValueError("absolute private video directory is required")
    supplied = Path(root)
    if supplied.is_symlink():
        raise ValueError("symlink storage directory not permitted")
    path = supplied.resolve(strict=True)
    if not path.is_dir():
        raise ValueError("private video directory is invalid")
    if path.stat().st_mode & 0o077:
        raise ValueError("private video directory must not grant group/other permissions")
    return path

def validated_model_path():
    value = os.environ.get("ETERNYX_WAN21_MODEL_DIR", "")
    if not value or not os.path.isabs(value):
        raise ValueError("absolute local model snapshot directory is required")
    supplied = Path(value)
    if supplied.is_symlink():
        raise ValueError("model symlink not permitted")
    path = supplied.resolve(strict=True)
    if not path.is_dir() or not (path / "model_index.json").is_file():
        raise ValueError("Diffusers model snapshot not installed")
    return path

def check_mp4(path):
    if not path.is_file() or path.is_symlink():
        raise ValueError("output file missing")
    length = path.stat().st_size
    if length < 12 or length > MAX_VIDEO_BYTES:
        raise ValueError("output size invalid")
    with path.open("rb") as stream:
        header = stream.read(12)
    if header[4:8] != b"ftyp":
        raise ValueError("not an MP4 file")

def persist_private_video(temp_file, private_root):
    """Atomic local artifact storage; future Supabase handoff requires owner checks."""
    check_mp4(temp_file)
    asset_id = "asset_" + secrets.token_hex(16)
    destination = private_root / (asset_id + ".mp4")
    # Create-only prevents overwriting any existing media, including symlinks.
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as sink, temp_file.open("rb") as source:
            while block := source.read(1024 * 1024):
                sink.write(block)
            sink.flush()
            os.fsync(sink.fileno())
        check_mp4(destination)
        return asset_id
    except Exception:
        destination.unlink(missing_ok=True)
        raise

def generate_with_wan(job, snapshot, output):
    # Import heavyweight dependencies only after all offline validation.
    # CUDA and a locally provisioned, operator-reviewed model are mandatory.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import torch
    from diffusers import WanPipeline, AutoencoderKLWan
    from diffusers.utils import export_to_video

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU unavailable")
    if not torch.cuda.is_bf16_supported():
        raise RuntimeError("CUDA BF16 support unavailable")
    vae = AutoencoderKLWan.from_pretrained(
        str(snapshot), subfolder="vae", torch_dtype=torch.float32,
        local_files_only=True)
    pipe = WanPipeline.from_pretrained(
        str(snapshot), vae=vae, torch_dtype=torch.bfloat16,
        local_files_only=True)
    pipe.enable_model_cpu_offload()
    with torch.inference_mode():
        frames = pipe(
            prompt=job["prompt"],
            negative_prompt=job["negative_prompt"],
            num_frames=job["num_frames"],
        ).frames[0]
    export_to_video(frames, str(output), fps=FPS)
    check_mp4(output)

def run(raw, generator=generate_with_wan):
    job = parse_job(raw)
    snapshot = validated_model_path()
    output_root = validated_storage_path()
    with tempfile.TemporaryDirectory(prefix="eternyx-video-", dir=str(output_root)) as work:
        temp_path = Path(work) / "render.mp4"
        generator(job, snapshot, temp_path)
        asset_id = persist_private_video(temp_path, output_root)
    return {"outputReference": asset_id}

def main():
    try:
        result = run(sys.stdin.read(MAX_JOB_BYTES + 1))
        print(json.dumps(result, separators=(",", ":")))
    except Exception:
        # Keep file paths, private prompts, model internals and secrets out of logs.
        print("Video inference unavailable or failed", file=sys.stderr)
        raise SystemExit(1)

if __name__ == "__main__":
    main()
