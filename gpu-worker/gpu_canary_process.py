"""Strict process termination and actual MP4 decode checks for approved GPU canaries.

Every command here runs ONLY on an operator-provisioned local GPU. This module
does not rent GPUs, download weights, install packages or trigger a canary.
"""
import json
import os
import signal
import selectors
import tempfile
import subprocess
import time
from pathlib import Path

class CanaryExecutionError(RuntimeError):
    pass

def bounded_subprocess(command, *, stdin=None, timeout_seconds=60, env=None, max_stdout=16384):
    """Capture bounded stdout and forcibly stop a whole POSIX process group.

    The previous communicate() implementation accumulated stdout and stderr
    without limits. A compromised inference helper could exhaust RAM before
    reaching the post-execution size check.
    """
    if os.name != "posix":
        raise CanaryExecutionError("POSIX worker required")
    if type(timeout_seconds) not in (int, float) or not 1 <= timeout_seconds <= 3600:
        raise CanaryExecutionError("invalid command timeout")
    if type(max_stdout) is not int or not 1 <= max_stdout <= 65536:
        raise CanaryExecutionError("invalid output limit")
    if not isinstance(command, (list, tuple)) or not command or any(
        not isinstance(arg, str) or not arg for arg in command
    ):
        raise CanaryExecutionError("invalid command")
    if stdin is not None and (not isinstance(stdin, str) or len(stdin.encode()) > 12000):
        raise CanaryExecutionError("invalid bounded input")
    deadline = time.monotonic() + timeout_seconds
    # Use a private input file: child processes can output before reading stdin,
    # and a pipe-based stdin write could otherwise block behind its stdout.
    input_file = tempfile.TemporaryFile(mode="w+b") if stdin is not None else None
    if input_file is not None:
        input_file.write(stdin.encode("utf-8"))
        input_file.seek(0)
    try:
        process = subprocess.Popen(
            command, stdin=input_file if input_file is not None else subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env=env, start_new_session=True, close_fds=True,
        )
    except BaseException:
        if input_file is not None:
            input_file.close()
        raise
    try:
        parts = []
        received = 0
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise CanaryExecutionError("command exceeded bounded runtime")
                events = selector.select(timeout=remaining)
                if not events:
                    raise CanaryExecutionError("command exceeded bounded runtime")
                for key, _mask in events:
                    chunk = os.read(key.fd, min(65536, max_stdout - received + 1))
                    if not chunk:
                        selector.unregister(key.fileobj)
                    else:
                        received += len(chunk)
                        if received > max_stdout:
                            raise CanaryExecutionError("command response exceeds limit")
                        parts.append(chunk)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise CanaryExecutionError("command exceeded bounded runtime")
        try:
            process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            raise CanaryExecutionError("command exceeded bounded runtime") from None
        if process.returncode != 0:
            raise CanaryExecutionError("command failed")
        try:
            return b"".join(parts).decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            raise CanaryExecutionError("command response invalid UTF-8") from None
    except BaseException:
        # Abort descendants even if the parent already exited.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        raise
    finally:
        if process.stdout:
            process.stdout.close()
        if input_file is not None:
            input_file.close()

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
