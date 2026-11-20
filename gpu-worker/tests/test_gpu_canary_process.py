"""Offline regression suite for actual GPU canary process safety.

Tests use local child processes and explicit fake probe outputs, NOT model
inference and NOT paid cloud/GPU resources.
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "gpu_canary_process.py"
spec = importlib.util.spec_from_file_location("eternyx_canary_process", MODULE)
process = importlib.util.module_from_spec(spec)
spec.loader.exec_module(process)

class GPUCanaryProcessTests(unittest.TestCase):
    def test_bounded_subprocess_reads_real_stdout(self):
        answer = process.bounded_subprocess(
            [sys.executable, "-c", "print('ok')"], timeout_seconds=3)
        self.assertEqual(answer.strip(), "ok")

    @unittest.skipUnless(os.name == "posix", "process groups require POSIX")
    def test_timeout_kills_child_and_entire_subprocess_group(self):
        with tempfile.TemporaryDirectory() as temp:
            # The grandchild inherits process group and delays writing evidence.
            # Killing only the immediate Python process would leave this marker.
            marker = Path(temp) / "late.txt"
            script = (
                "import subprocess,sys,time;"
                "subprocess.Popen([sys.executable,'-c',"
                " 'import time;time.sleep(3);open(' + repr(str(marker)) + ',\\\"w\\\").write(\\\"late\\\")']);"
                "time.sleep(8)"
            )
            with self.assertRaises(process.CanaryExecutionError):
                process.bounded_subprocess(
                    [sys.executable, "-c", script], timeout_seconds=1)
            # We check that process group cancellation returned promptly.
            self.assertFalse(marker.exists())

    def test_mp4_inspector_requires_actual_frame_count_and_decoder_success(self):
        with tempfile.TemporaryDirectory() as temp:
            clip = Path(temp) / "video.mp4"
            clip.write_bytes(bytes.fromhex("000000146674797069736f6d") + b"x" * 1200)
            called = []
            def runner(args, **kwargs):
                called.append(args[0])
                if args[0] == "ffprobe":
                    return json.dumps({"streams": [{"width": 832, "height": 480,
                        "nb_read_frames": "17"}]})
                return ""
            result = process.inspect_mp4_decode(clip, runner=runner)
            self.assertEqual(result, {"width": 832, "height": 480, "decodedFrames": 17})
            self.assertEqual(called, ["ffprobe", "ffmpeg"])

    def test_mp4_inspector_rejects_missing_or_zero_frames(self):
        with tempfile.TemporaryDirectory() as temp:
            clip = Path(temp) / "video.mp4"
            clip.write_bytes(bytes.fromhex("000000146674797069736f6d") + b"x" * 1200)
            for count in ("0", "N/A"):
                def runner(args, **kwargs):
                    return json.dumps({"streams": [{"width": 832, "height": 480,
                        "nb_read_frames": count}]})
                with self.assertRaises(process.CanaryExecutionError):
                    process.inspect_mp4_decode(clip, runner=runner)

    def test_ffmpeg_decode_error_aborts_canary(self):
        with tempfile.TemporaryDirectory() as temp:
            clip = Path(temp) / "video.mp4"
            clip.write_bytes(bytes.fromhex("000000146674797069736f6d") + b"x" * 1200)
            def runner(args, **kwargs):
                if args[0] == "ffprobe":
                    return json.dumps({"streams": [{"width": 832, "height": 480,
                        "nb_read_frames": "17"}]})
                raise process.CanaryExecutionError("decode failed")
            with self.assertRaises(process.CanaryExecutionError):
                process.inspect_mp4_decode(clip, runner=runner)

    def test_rejects_unbounded_timeout_and_excessive_probe_stdout(self):
        self.assertRaises(process.CanaryExecutionError,
            process.bounded_subprocess, [sys.executable, "-c", "print('ok')"],
            timeout_seconds=3601)
        self.assertRaises(process.CanaryExecutionError,
            process.bounded_subprocess, [sys.executable, "-c", "print('A' * 300)"],
            timeout_seconds=3, max_stdout=20)

if __name__ == "__main__":
    unittest.main()
