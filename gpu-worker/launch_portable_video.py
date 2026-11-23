"""ETERNYX portable CPU editor: secure local preflight, run, cancel, and desktop UI.

No remote server, shell execution, GPU, paid API, data upload, or external Python
packages. Use a fully extracted, original ETERNYX portable project ZIP.

CLI: python launch_portable_video.py --check | --run
GUI: python launch_portable_video.py --gui  (requires standard Tkinter)

The local renderer is executed in an isolated, fresh staging directory. A
successful, verified MP4 folder is atomically promoted. Cancelling or failing
removes the staging directory, even if the original renderer is interrupted.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import signal
import subprocess
import sys
import tempfile
import threading

import render_video_timeline as renderer

ROOT = Path(__file__).resolve().parent
BOARD = "eternyx-video-v2.json"
BUNDLE = "bundle-manifest.json"
OUTPUT = "eternyx-video-output"
MAX_BUNDLE_BYTES = 64 * 1024
ENCODERS_TIMEOUT = 12
RUN_SECONDS = 240
SHA = set("0123456789abcdef")


def safe_json(path, maximum=MAX_BUNDLE_BYTES):
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= maximum:
        raise ValueError("Local project metadata missing, symlinked or too large")
    try:
        return json.loads(path.read_text(encoding="utf8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("Invalid local portable project metadata JSON") from error


def sha256(path):
    result = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def check_program(executable, args, expected):
    resolved = shutil.which(executable)
    if not resolved:
        raise ValueError(executable+" is missing. Install FFmpeg/FFprobe on your PATH.")
    try:
        done = subprocess.run([resolved, *args], stdin=subprocess.DEVNULL,
                              capture_output=True, timeout=ENCODERS_TIMEOUT,
                              check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Could not inspect local "+executable+" installation") from error
    if done.returncode != 0 or expected not in done.stdout+done.stderr:
        raise ValueError(executable+" is unavailable or missing required H264 capability")


def preflight(root=ROOT):
    """Read-only validation. No subprocess is started to render any output."""
    if not isinstance(root, Path) or root.is_symlink() or not root.is_dir():
        raise ValueError("Portable video project must be a real extracted local folder")
    if sys.version_info < (3, 11):
        raise ValueError("Python 3.11 or newer is required for offline rendering")
    if (root / OUTPUT).exists() or (root / OUTPUT).is_symlink():
        raise ValueError("Rendered output already exists: move or rename it before another run")
    if root.joinpath("render_video_timeline.py").is_symlink():
        raise ValueError("Refuse symlinked portable renderer")
    check_program("ffmpeg", ["-hide_banner", "-encoders"], b"libx264")
    check_program("ffprobe", ["-version"], b"ffprobe")
    board,board_sha = renderer.read_board(root / BOARD)
    manifest = safe_json(root / BUNDLE)
    if (not isinstance(manifest, dict) or manifest.get("format") != "eternyx-portable-cpu-video"
            or type(manifest.get("version")) is not int or manifest["version"] != 1
            or manifest.get("private_original_media") is not True
            or manifest.get("fps") != 16
            or manifest.get("profile") not in renderer.PROFILES
            or manifest.get("quality") not in ("standard", "high")
            or type(manifest.get("frames")) is not int
            or not 1 <= manifest["frames"] <= 480
            or type(manifest.get("shots")) is not int
            or not 1 <= manifest["shots"] <= 8):
        raise ValueError("Unsupported or invalid private ETERNYX CPU project manifest")
    if manifest["shots"] != len(board["shots"]):
        raise ValueError("Portable manifest shot count and storyboard disagree")
    media = root / "media"
    shots,total = renderer.check_shots(board, media)
    audio = renderer.check_soundtrack(board, media)
    if total != manifest["frames"]:
        raise ValueError("Storyboard duration differs from portable project receipt")
    source_hashes = {}
    for shot in shots:
        source_hashes[shot["file"]] = shot["source_sha256"]
    if audio is not None:
        source_hashes[audio["file"]] = audio["source_sha256"]
    members = manifest.get("sources")
    if not isinstance(members, list) or len(members) != len(source_hashes):
        raise ValueError("Portable media inventory must exactly match referenced project clips")
    seen = set()
    total_bytes = 0
    for member in members:
        if not isinstance(member, dict) or set(member) != {"path", "sha256", "bytes", "kind"}:
            raise ValueError("Portable media inventory contains an invalid record")
        path = member["path"]
        if not isinstance(path, str) or not path.startswith("media/"):
            raise ValueError("Private media inventory contains unsafe path")
        filename = path[len("media/"):]
        if (not filename or "/" in filename or "\\" in filename or
                filename.startswith(".") or filename.startswith("~") or ":" in filename):
            raise ValueError("Private portable media must use direct safe filenames")
        key = filename.casefold()
        if key in seen or filename not in source_hashes:
            raise ValueError("Private source inventory has extras, duplicates or missing references")
        seen.add(key)
        digest = member["sha256"]
        if (not isinstance(digest, str) or len(digest) != 64 or
                any(character not in SHA for character in digest) or
                digest != source_hashes[filename]):
            raise ValueError("Portable source SHA-256 differs from original footage")
        kind = ("audio" if audio is not None and filename == audio["file"] else "video")
        if member["kind"] != kind:
            raise ValueError("Private media source kind differs from the original storyboard")
        source_path = renderer.safe_path(media, filename,
                                         {".wav", ".mp3", ".m4a"} if kind=="audio" else {".mp4"},
                                         renderer.MAX_AUDIO_BYTES if kind=="audio" else
                                         renderer.MAX_SOURCE_BYTES)
        file_size = source_path.stat().st_size
        if type(member["bytes"]) is not int or member["bytes"] != file_size:
            raise ValueError("Portable media size changed after export")
        if sha256(source_path) != digest:
            raise ValueError("Original private footage changed after ZIP export")
        total_bytes += file_size
    if seen != {x.casefold() for x in source_hashes}:
        raise ValueError("Portable package is missing some edited timeline sources")
    return {
        "result": "ready", "board_sha256": board_sha, "frames": total,
        "seconds": total/16, "shots": len(shots), "source_count": len(source_hashes),
        "private_media_bytes": total_bytes,
        "profile": manifest["profile"], "quality": manifest["quality"],
        "local_only": True, "output": OUTPUT,
    }


def stop_group(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        # A child FFmpeg process might outlive Python unless its process tree is stopped.
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       capture_output=True, timeout=12, check=False)
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=12)
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        else:
            process.kill()
        process.wait(timeout=12)


def run(root=ROOT, on_stage=None, cancel=None):
    if on_stage is None:
        on_stage=lambda _:None
    if cancel is None:
        cancel=threading.Event()
    if not isinstance(cancel, threading.Event):
        raise ValueError("Cancellation token must be a threading.Event")
    on_stage("Checking local Python, FFmpeg, original media and license references...")
    checked=preflight(root)
    if cancel.is_set():
        raise ValueError("Video rendering cancelled before start")
    workspace=Path(tempfile.mkdtemp(prefix=".eternyx-local-video-", dir=root))
    process=None
    try:
        if cancel.is_set():
            raise ValueError("Video rendering cancelled before encoding")
        command=[
            sys.executable, str(root/"render_video_timeline.py"),
            "--storyboard", str(root/BOARD), "--media", str(root/"media"),
            "--output", str(workspace/"rendered"),
            "--profile", checked["profile"], "--quality", checked["quality"],
        ]
        flags=getattr(subprocess,"CREATE_NEW_PROCESS_GROUP",0) if os.name=="nt" else 0
        on_stage("Rendering actual H264 video with local FFmpeg (this stage has no estimated percentage)...")
        process=subprocess.Popen(
            command, cwd=root, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            start_new_session=os.name!="nt", creationflags=flags,
        )
        from time import monotonic,sleep
        started=monotonic()
        while process.poll() is None:
            if cancel.is_set():
                stop_group(process)
                raise ValueError("Video rendering cancelled; temporary output cleaned")
            if monotonic()-started > RUN_SECONDS:
                stop_group(process)
                raise ValueError("Offline renderer exceeded the bounded 240-second CPU budget")
            sleep(.10)
        out,err=process.communicate(timeout=5)
        if process.returncode != 0:
            raise ValueError("Local CPU render failed: "+
                             err.decode("utf8","replace")[-700:].strip())
        on_stage("Verifying actual completed MP4, manifest, captions and preview...")
        folder=workspace/"rendered"
        receipt=safe_json(folder/"manifest.json",256*1024)
        if (receipt.get("version")!=2 or receipt.get("type")!="local CPU video editing" or
                receipt.get("model_generation") is not False or
                receipt.get("storyboard_sha256")!=checked["board_sha256"] or
                receipt.get("total_frames")!=checked["frames"] or
                receipt.get("profile")!=checked["profile"] or
                receipt.get("quality")!=checked["quality"]):
            raise ValueError("Actual local renderer receipt conflicts with original validated project")
        file=folder/"video.mp4"
        video=receipt.get("video",{})
        if (not file.is_file() or file.is_symlink() or
                not isinstance(video,dict) or video.get("sha256")!=sha256(file) or
                type(video.get("frame_count")) is not int or
                video["frame_count"]!=checked["frames"]):
            raise ValueError("Finished MP4 SHA-256 or frames do not match renderer receipt")
        for filename in ("captions.srt","preview.html"):
            candidate=folder/filename
            if candidate.is_symlink() or not candidate.is_file() or candidate.stat().st_size<=0:
                raise ValueError("Missing genuine rendered preview or SRT captions")
        if cancel.is_set():
            raise ValueError("Video rendering cancelled before final promotion")
        target=root/OUTPUT
        if target.exists() or target.is_symlink():
            raise ValueError("Output appeared during render. Refusing to overwrite")
        folder.rename(target)
        on_stage("Complete: real verified video.mp4, captions, preview and manifest saved locally.")
        return {
            "result":"completed","output":str(target),"video_sha256":video["sha256"],
            "frames":checked["frames"],"audio":video.get("audio"),
            "local_only":True,
        }
    except KeyboardInterrupt:
        cancel.set()
        if process and process.poll() is None:
            stop_group(process)
        raise ValueError("Video rendering interrupted; temporary output cleaned") from None
    finally:
        if process and process.poll() is None:
            stop_group(process)
        shutil.rmtree(workspace, ignore_errors=False)


def gui(root=ROOT):
    try:
        import tkinter as tk
        from tkinter import messagebox
    except ImportError as error:
        raise ValueError("Tkinter desktop UI is unavailable. Use python launch_portable_video.py --run") from error
    try:
        window=tk.Tk()
    except tk.TclError as error:
        raise ValueError("No graphical desktop detected. Use python launch_portable_video.py --run") from error
    window.title("ETERNYX · Local CPU Video Renderer")
    window.geometry("660x340")
    window.minsize(520,300)
    window.configure(bg="#101727")
    status=tk.StringVar(value="No media leaves this computer. Press Render to check dependencies and source files.")
    output=tk.StringVar(value="Python 3.11+ · FFmpeg/FFprobe · libx264 required.")
    cancelled=threading.Event()
    updates=queue.Queue()
    running=[False]
    def stage(message):updates.put(("stage",message))
    def worker():
        try:
            finished=run(root,on_stage=stage,cancel=cancelled)
            updates.put(("done",finished))
        except Exception as error:
            updates.put(("error",str(error)))
    def start():
        if running[0]:
            return
        if (root/OUTPUT).exists():
            messagebox.showinfo("Existing output","Move or rename the last video output folder before running again.")
            return
        running[0]=True
        cancelled.clear()
        start_button.configure(state="disabled")
        stop_button.configure(state="normal")
        status.set("Checking offline dependencies and exact private media hashes...")
        output.set("Rendering locally; no approximate progress percent is shown.")
        threading.Thread(target=worker,daemon=True).start()
    def stop():
        if running[0]:
            cancelled.set()
            status.set("Cancellation requested; stopping the CPU renderer and cleaning staging...")
    def tick():
        try:
            while True:
                kind,payload=updates.get_nowait()
                if kind=="stage":
                    status.set(payload)
                else:
                    running[0]=False
                    start_button.configure(state="normal")
                    stop_button.configure(state="disabled")
                    if kind=="done":
                        status.set("Completed: actual MP4 checked against local SHA-256!")
                        output.set(str(payload["output"]))
                    else:
                        status.set("No new video was published. Check the error below.")
                        output.set(payload)
        except queue.Empty:
            pass
        window.after(120,tick)
    def close():
        if running[0]:
            stop()
            status.set("Please close after the local renderer stops.")
        else:
            window.destroy()
    tk.Label(window,text="ETERNYX · CPU Video Studio",font=("Arial",20,"bold"),
             bg="#101727",fg="#d1fae5").pack(anchor="w",padx=22,pady=(24,10))
    tk.Label(window,text="Verified offline video project · no uploads or paid AI APIs",
             bg="#101727",fg="#b7c5d7").pack(anchor="w",padx=22)
    tk.Label(window,textvariable=status,wraplength=600,justify="left",
             bg="#101727",fg="#d6ecfb").pack(anchor="w",padx=22,pady=(26,12))
    tk.Label(window,textvariable=output,wraplength=600,justify="left",
             bg="#101727",fg="#b7c5d7").pack(anchor="w",padx=22,pady=(0,25))
    buttons=tk.Frame(window,bg="#101727")
    buttons.pack(anchor="w",padx=22)
    start_button=tk.Button(buttons,text="Render verified MP4",command=start,
                           padx=16,pady=9,bg="#96f0cf")
    start_button.pack(side="left",padx=(0,10))
    stop_button=tk.Button(buttons,text="Cancel and clean",command=stop,
                          padx=12,pady=9,state="disabled")
    stop_button.pack(side="left")
    tk.Label(window,text="Progress shows real stages, not fabricated percentages. Results stay local.",
             bg="#101727",fg="#9ca3af").pack(anchor="w",padx=22,pady=(28,0))
    window.protocol("WM_DELETE_WINDOW",close)
    window.after(120,tick)
    window.mainloop()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    modes=parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--check",action="store_true",help="Read-only actual source/dependency preflight")
    modes.add_argument("--run",action="store_true",help="Render local verified H264 output")
    modes.add_argument("--gui",action="store_true",help="Open optional desktop UI with cancellation")
    args=parser.parse_args()
    try:
        if args.check:
            print(json.dumps(preflight(),sort_keys=True))
        elif args.run:
            print(json.dumps(run(on_stage=lambda step:print(step,file=sys.stderr,flush=True)),
                             sort_keys=True))
        else:
            gui()
    except (ValueError,OSError,TypeError,KeyError) as error:
        parser.exit(2,"ETERNYX local CPU video: "+str(error)+"\n")


if __name__=="__main__":
    main()
