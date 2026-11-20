"""Strict process termination and actual MP4 decode checks for approved GPU canaries.

Every command here runs ONLY on an operator-provisioned local GPU. This module
does not rent GPUs, download weights, install packages or trigger a canary.
"""
import json
import os
import signal
import subprocess
import time
from pathlib import Path

class CanaryExecutionError(RuntimeError):
    pass

def bounded_subprocess(command, *, stdin=None, timeout_seconds=60, env=None, max_stdout=16384):
    """Terminate the entire child process group on timeout (POSIX/Linux only).

    A subprocess.run timeout usually kills the direct child but leaves any
    grandchildren behind; leftover inference workers may continue using GPU.
    This implementation starts a new session and kills its process group.
    """
    if os.name != "posix":
        raise CanaryExecutionError("POSIX worker required")
    if type(timeout_seconds) not in (int, float) or not 1 <= timeout_seconds <= 3600:
        raise CanaryExecutionError("invalid command timeout")
    if not isinstance(command, (list, tuple)) or not command or any(
        not isinstance(arg, str) or not arg for arg in command
    ):
        raise CanaryExecutionError("invalid command")
    process = subprocess.Popen(
        command, stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        env=env, start_new_session=True, close_fds=True,
    )
    try:
        stdout, stderr = process.communicate(input=stdin, timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()
        raise CanaryExecutionError("command exceeded bounded runtime") from None
    if process.returncode != 0:
        raise CanaryExecutionError("command failed")
    if len(stdout.encode("utf-8")) > max_stdout:
        raise CanaryExecutionError("command response exceeds limit")
    # Do not include stderr in error messages: it may contain prompts or paths.
    return stdout

def inspect_mp4_decode(path, *, timeout_seconds=45, runner=bounded_subprocess):
    """Read full video stream with ffmpeg and count decoded frames.

    ffprobe stream metadata alone does not guarantee that media can decode.
    Avoid writing any decoded frames to disk; ffmpeg sends them to a null sink.
    """
    file_path = Path(path)
    if file_path.is_symlink() or not file_path.is_file():
        raise CanaryExecutionError("invalid media file")
    if not 1024 <= file_path.stat().st_size <= 200 * 1024 * 1024:
        raise CanaryExecutionError("invalid media size")
    stdout = runner([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-count_frames", "-show_entries",
        "stream=codec_type,width,height,nb_read_frames",
        "-of", "json", str(file_path),
    ], timeout_seconds=timeout_seconds)
    try:
        parsed = json.loads(stdout)
        streams = parsed["streams"]
        if not isinstance(streams, list) or len(streams) != 1:
            raise ValueError("invalid stream data")
        stream = streams[0]
        width = int(stream["width"])
        height = int(stream["height"])
        frames = int(stream["nb_read_frames"])
    except (KeyError, IndexError, TypeError, ValueError):
        raise CanaryExecutionError("invalid decoded media metadata") from None
    if not (64 <= width <= 8192 and 64 <= height <= 8192 and 1 <= frames <= 1000):
        raise CanaryExecutionError("unexpected video dimensions or frames")
    # FFmpeg decodes the full selected stream: any decode failure aborts the test.
    runner([
        "ffmpeg", "-nostdin", "-hide_banner", "-v", "error",
        "-xerror", "-i", str(file_path), "-map", "0:v:0",
        "-an", "-sn", "-f", "null", "-",
    ], timeout_seconds=timeout_seconds)
    return {"width": width, "height": height, "decodedFrames": frames}
