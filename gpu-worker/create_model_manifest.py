#!/usr/bin/env python3
"""Build a SHA-256 inventory for an independently reviewed local Wan snapshot.

No model fetching, network access, GPU inference, cloud provisioning or billing.
An operator-provided revision is NOT verified against an upstream Git commit.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path

from staging_gpu_canary import MODEL_ID, MAX_MODEL_MANIFEST, verify_manifest

REVIEW_ACK = "I_REVIEWED_THE_LOCAL_MODEL_SNAPSHOT"
REVISION = re.compile(r"^[0-9a-f]{40}$")
MAX_FILES = 2000
MAX_REL_PATH = 300

def inventory(snapshot_dir, revision, acknowledgement, *, max_files=MAX_FILES):
    if acknowledgement != REVIEW_ACK:
        raise ValueError("operator source review acknowledgement is required")
    if not isinstance(revision, str) or not REVISION.fullmatch(revision):
        raise ValueError("immutable upstream revision required")
    if type(max_files) is not int or not 1 <= max_files <= MAX_FILES:
        raise ValueError("invalid file inventory ceiling")
    root = Path(snapshot_dir)
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise ValueError("absolute reviewed model directory required")
    root = root.resolve(strict=True)
    hashes = {}
    for current, directories, filenames in os.walk(root, topdown=True, followlinks=False):
        # Never silently skip a symlink to a nested model component.
        for item in directories + filenames:
            candidate = Path(current) / item
            if candidate.is_symlink():
                raise ValueError("model snapshot contains symbolic links")
        for name in filenames:
            candidate = Path(current) / name
            if not candidate.is_file():
                raise ValueError("non-regular snapshot file")
            rel = candidate.relative_to(root).as_posix()
            if len(rel) > MAX_REL_PATH or not rel or "\\" in rel or "\x00" in rel:
                raise ValueError("unsafe relative model filename")
            if len(hashes) >= max_files:
                raise ValueError("too many model files")
            digest = hashlib.sha256()
            with candidate.open("rb") as source:
                while data := source.read(1024 * 1024):
                    digest.update(data)
            hashes[rel] = digest.hexdigest()
    if "model_index.json" not in hashes:
        raise ValueError("Diffusers model index missing")
    result = {"modelId": MODEL_ID, "revision": revision, "files": dict(sorted(hashes.items()))}
    if len(json.dumps(result, sort_keys=True, separators=(",", ":")).encode()) > MAX_MODEL_MANIFEST:
        raise ValueError("model inventory too large")
    return result

def create_manifest(snapshot_dir, revision, output_file, acknowledgement):
    root = Path(snapshot_dir)
    destination = Path(output_file)
    if not destination.is_absolute() or destination.is_symlink() or destination.exists():
        raise ValueError("absolute new manifest path outside model directory required")
    if not destination.parent.is_dir() or destination.parent.is_symlink():
        raise ValueError("manifest parent directory unavailable")
    if destination.parent.resolve().is_relative_to(root.resolve(strict=True)):
        raise ValueError("manifest cannot be stored inside hashed model snapshot")
    manifest = inventory(snapshot_dir, revision, acknowledgement)
    # Create-only + no-follow protects existing operator-reviewed manifests.
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(destination, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(manifest, stream, sort_keys=True, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        # Verify newly created digest inventory before declaring success.
        if verify_manifest(str(root), str(destination)) != revision:
            raise ValueError("manifest validation failed")
        return {"status": "manifest_created", "fileCount": len(manifest["files"]),
                "revision": revision, "modelId": MODEL_ID}
    except BaseException:
        destination.unlink(missing_ok=True)
        raise

def main():
    parser = argparse.ArgumentParser(description="Offline operator-reviewed Wan SHA-256 manifest")
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--acknowledgement", default="")
    args = parser.parse_args()
    try:
        result = create_manifest(
            args.snapshot, args.revision, args.output, args.acknowledgement)
    except Exception:
        print(json.dumps({"status": "blocked_or_failed"}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
