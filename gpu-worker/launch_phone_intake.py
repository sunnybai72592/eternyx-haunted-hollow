"""Run a bundled local phone-video conversion project without a repo clone.

Preflight checks real private input bytes, codec metadata, local FFmpeg/FFprobe,
and selected duration. --run makes genuine 16 FPS H264 MP4s and a WIP
ETERNYX edit draft. No network, GPU, downloads, external Python libraries.

Extract the portable ZIP then:
  python3 launch_phone_intake.py --check
  python3 launch_phone_intake.py --run
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from prepare_video_sources import prepare, source_path, inspect_input
from render_video_timeline import sha256

ROOT = Path(__file__).resolve().parent
MANIFEST = "phone-input-manifest.json"
OUTPUT = "local-video-media"
MAX_MANIFEST_BYTES = 16 * 1024
MAX_SOURCE_BYTES = 64 * 1024 * 1024
HASH = set("0123456789abcdef")


def read_manifest(root):
    path = root / MANIFEST
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_MANIFEST_BYTES:
        raise ValueError("Missing or unsafe private phone intake manifest")
    try:
        manifest = json.loads(path.read_text("utf8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("Invalid phone intake manifest JSON") from error
    if (not isinstance(manifest, dict) or set(manifest) !=
        {"kind", "version", "start_seconds", "seconds", "originals", "private_media"} or
        manifest["kind"] != "eternyx_offline_phone_intake" or
        type(manifest["version"]) is not int or manifest["version"] != 1 or
        manifest["private_media"] is not True or
        type(manifest["start_seconds"]) is not int or
        not 0 <= manifest["start_seconds"] <= 299 or
        type(manifest["seconds"]) is not int or not 1 <= manifest["seconds"] <= 60):
        raise ValueError("Unsupported safe offline phone intake settings")
    originals = manifest["originals"]
    if not isinstance(originals, list) or not 1 <= len(originals) <= 8:
        raise ValueError("Choose between 1 and 8 original phone clips")
    names = set()
    for row in originals:
        if not isinstance(row, dict) or set(row) != {"filename", "bytes", "sha256"}:
            raise ValueError("Malformed original phone footage record")
        name = row["filename"]
        if not isinstance(name, str):
            raise ValueError("Original phone filename must be text")
        lower = name.casefold()
        if lower in names:
            raise ValueError("Duplicate original phone filenames")
        names.add(lower)
        if (type(row["bytes"]) is not int or not 0 < row["bytes"] <= MAX_SOURCE_BYTES or
            not isinstance(row["sha256"], str) or len(row["sha256"]) != 64 or
            any(ch not in HASH for ch in row["sha256"])):
            raise ValueError("Original phone source bytes or SHA-256 invalid")
    return manifest


def check_tool(executable, arguments, needle):
    path = shutil.which(executable)
    if not path:
        raise ValueError("Install local FFmpeg and FFprobe with libx264 before converting")
    try:
        result = subprocess.run([path, *arguments], input=b"", capture_output=True,
                                check=False, timeout=15)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Could not inspect installed offline video dependencies") from error
    if result.returncode or needle not in result.stdout + result.stderr:
        raise ValueError("Missing local FFmpeg/FFprobe H264 capability")


def preflight(root=ROOT):
    if not isinstance(root, Path) or root.is_symlink() or not root.is_dir():
        raise ValueError("Extract your private conversion ZIP into a real local folder")
    if (root / OUTPUT).exists() or (root / OUTPUT).is_symlink():
        raise ValueError("Existing converted output must be moved; files are never overwritten")
    manifest = read_manifest(root)
    check_tool("ffmpeg", ["-hide_banner", "-encoders"], b"libx264")
    check_tool("ffprobe", ["-version"], b"ffprobe")
    originals = []
    folder = root / "phone-clips"
    for row in manifest["originals"]:
        path = source_path(folder, row["filename"])
        if path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError("Original phone source SHA-256 or byte count changed: "+row["filename"])
        info = inspect_input(path)
        if manifest["start_seconds"] >= info["reported_duration_seconds"]:
            raise ValueError("Selected start time exceeds source duration: "+row["filename"])
        originals.append({"filename":row["filename"], **info})
    return {
        "result":"ready", "source_count":len(originals),
        "originals":originals,
        "start_seconds":manifest["start_seconds"],
        "seconds":manifest["seconds"],
        "private_media_uploaded":False,
        "output":OUTPUT,
    }


def starter_draft(report):
    """The existing version-1 draft, without any original media bytes or
    fabricated license/captions. User completes metadata before export."""
    sources = []
    shots = []
    for row in report["clips"]:
        count = row["prepared_frames"]
        if type(count) is not int or not 1 <= count <= 960:
            raise ValueError("Actual converted MP4 frame count outside editor bounds")
        name = row["prepared_filename"]
        sources.append({
            "name":name,
            "size":row["prepared_bytes"],
            "sha256":row["prepared_sha256"],
        })
        shots.append({
            "sourceName":name,
            "startFrame":0,
            "frames":min(16,count),
            "caption":"",
            "rightsRef":"",
            "fadeInFrames":0,
            "fadeOutFrames":0,
        })
    draft={
        "format":"eternyx-local-video-edit-draft",
        "version":1,
        "name":"My prepared phone footage",
        "contains_private_media":False,
        "sources":sources,
        "soundtrack":None,
        "shots":shots,
        "profile":"landscape",
        "quality":"standard",
    }
    if len(json.dumps(draft).encode("utf8"))>32*1024:
        raise ValueError("Auto-generated local editor draft exceeds schema limit")
    return draft


def run(root=ROOT, on_stage=None, *, cinematic=False, limit_seconds=None):
    if on_stage is None:
        on_stage = lambda _: None
    on_stage("Checking local originals, codec support and SHA-256...")
    checked = preflight(root)
    manifest = read_manifest(root)
    if type(cinematic) is not bool:
        raise ValueError("Cinematic export flag must be boolean")
    if limit_seconds is None:
        limit_seconds = manifest["seconds"]
    if (type(limit_seconds) is not int or
            not 1 <= limit_seconds <= manifest["seconds"]):
        raise ValueError("Requested conversion cut exceeds verified source window")
    workspace = Path(tempfile.mkdtemp(prefix=".eternyx-phone-bundle-",dir=root))
    final = root/OUTPUT
    try:
        on_stage("Transcoding original phone footage with local FFmpeg...")
        output = workspace/"prepared"
        names = [x["filename"] for x in manifest["originals"]]
        report = prepare(root/"phone-clips",output,clips=names,
                         start_seconds=manifest["start_seconds"],
                         seconds=limit_seconds, cinematic=cinematic)
        on_stage("Checking actual converted H264 outputs and creating editable draft...")
        if report["source_count"] != checked["source_count"]:
            raise ValueError("Converted output differs from the verified source inventory")
        for original,row in zip(manifest["originals"],report["clips"]):
            name = row["prepared_filename"]
            file = output/name
            if row["source_filename"] != original["filename"] or \
                    row["source_sha256"] != original["sha256"] or \
                    not file.is_file() or file.is_symlink() or \
                    file.stat().st_size != row["prepared_bytes"] or \
                    sha256(file) != row["prepared_sha256"]:
                raise ValueError("Actual converted MP4 failed private SHA-256 validation")
        # The legacy editable draft is explicitly 16 FPS only; never hand it
        # 24 FPS sources that would fail its own verified 16 FPS contract.
        if not cinematic:
            draft=starter_draft(report)
            (output/"eternyx-video-edit-draft.json").write_text(
                json.dumps(draft,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
        if final.exists() or final.is_symlink():
            raise ValueError("Output appeared while preparing; refusing to overwrite")
        output.rename(final)
        on_stage("Complete: genuine normalized MP4s, report, and editable local draft ready.")
        return {
            "result":"completed",
            "source_count":checked["source_count"],
            "prepared_clips":[row["prepared_filename"] for row in report["clips"]],
            "editable_draft":None if cinematic else "eternyx-video-edit-draft.json",
            "output":OUTPUT,"private_media_uploaded":False,
        }
    finally:
        if workspace.exists():
            shutil.rmtree(workspace)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check",action="store_true")
    mode.add_argument("--run",action="store_true")
    args=parser.parse_args()
    try:
        if args.check:
            print(json.dumps(preflight(),sort_keys=True))
        else:
            print(json.dumps(run(on_stage=lambda s: print(s,flush=True)),sort_keys=True))
    except (OSError,ValueError,KeyError,TypeError) as error:
        parser.exit(2,"ETERNYX offline phone intake: "+str(error)+"\n")


if __name__=="__main__":
    main()
