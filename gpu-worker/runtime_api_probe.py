#!/usr/bin/env python3
"""No-render runtime compatibility checks for the ETERNYX Wan 2.1 GPU runner.

Never downloads weights, creates models, provisions GPUs, or submits jobs.
Importing CUDA-enabled libraries on an already rented host can still incur
the host's ongoing infrastructure costs.
"""
import argparse
import importlib
import json
import os
import sys
from pathlib import Path

REQUIRED = {
    "torch": ("cuda", "bfloat16", "float32"),
    "diffusers": ("WanPipeline", "AutoencoderKLWan"),
    "diffusers.utils": ("export_to_video",),
}
MAX_CHECKPOINT_INDEX = 65536

def check_runtime(*, importer=None, cuda_available=None, bf16_supported=None):
    importer = importer if importer is not None else importlib.import_module
    result = {}
    modules = {}
    for name, symbols in REQUIRED.items():
        try:
            module = importer(name)
            modules[name] = module
            result["api:" + name] = all(
                hasattr(module, symbol) and
                (callable(getattr(module, symbol)) if symbol in (
                    "WanPipeline", "AutoencoderKLWan", "export_to_video"
                ) else True)
                for symbol in symbols
            )
        except (ImportError, ModuleNotFoundError, OSError, AttributeError):
            result["api:" + name] = False
    torch = modules.get("torch")
    if torch is None or not result.get("api:torch", False):
        result["cuda_detected"] = False
        result["cuda_bfloat16_supported"] = False
    else:
        try:
            cuda = (bool(cuda_available()) if cuda_available is not None
                    else bool(torch.cuda.is_available()))
            bf16 = (bool(bf16_supported()) if bf16_supported is not None
                    else bool(torch.cuda.is_bf16_supported())) if cuda else False
        except (RuntimeError, OSError, AssertionError, AttributeError):
            cuda, bf16 = False, False
        result["cuda_detected"] = cuda
        result["cuda_bfloat16_supported"] = bf16
    return {
        "status": "runtime_api_compatible" if all(result.values()) else "blocked",
        "checks": result,
        "modelLoaded": False,
        "videoGenerated": False,
        "safeToActivatePaidGpu": False,
    }

def check_local_model_index(model_dir):
    """Small JSON structural check, never deserializes model weights."""
    if not isinstance(model_dir, str) or not os.path.isabs(model_dir):
        return False
    root = Path(model_dir)
    if root.is_symlink() or not root.is_dir():
        return False
    index = root / "model_index.json"
    try:
        if index.is_symlink() or not index.is_file() or index.stat().st_size > MAX_CHECKPOINT_INDEX:
            return False
        obj = json.loads(index.read_text(encoding="utf-8"))
        return isinstance(obj, dict) and obj.get("_class_name") == "WanPipeline" and (
            isinstance(obj.get("vae"), list) and
            isinstance(obj.get("transformer"), list)
        )
    except (OSError, ValueError, TypeError, UnicodeError):
        return False

def main():
    parser = argparse.ArgumentParser(description="No-render, no-download Wan API/CUDA check")
    parser.add_argument("--model-dir", default="")
    parser.add_argument("--operator-confirmed-existing-gpu", action="store_true",
        help="Confirms the host GPU is already provisioned; does not authorize billing")
    args = parser.parse_args()
    if not args.operator_confirmed_existing_gpu:
        print(json.dumps({"status": "blocked",
                          "reason": "existing_gpu_not_confirmed",
                          "modelLoaded": False, "videoGenerated": False}))
        return 2
    report = check_runtime()
    report["checks"]["wan_model_index"] = check_local_model_index(args.model_dir)
    if not report["checks"]["wan_model_index"]:
        report["status"] = "blocked"
    print(json.dumps(report, sort_keys=True))
    return 0 if report["status"] == "runtime_api_compatible" else 2

if __name__ == "__main__":
    raise SystemExit(main())
