"""Unit tests for no-spend readiness checks and bounded local subprocess output."""
import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from staging_preflight import inspect_readiness, DEPENDENCIES, REQUIRED_EXECUTABLES
from gpu_canary_process import bounded_subprocess, CanaryExecutionError

class StagingReadinessTests(unittest.TestCase):
    def test_reports_all_prerequisites_without_running_any_model(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / "private"
            folder.mkdir(mode=0o700)
            result = inspect_readiness(
                "/trusted/model", "/trusted/manifest", str(folder),
                versions=lambda name: "1.0",
                executable_locator=lambda name: "/usr/bin/" + name,
                gpu_enabled=True, verifier=lambda model, manifest: "a" * 40)
        self.assertEqual(result["status"], "ready_for_manual_review")
        self.assertFalse(result["safeToStartPaidGpu"])
        self.assertFalse(result["modelExecuted"])
        self.assertFalse(result["providerBillingConfigured"])
        self.assertTrue(all(result["checks"].values()))

    def test_missing_dependencies_and_gpu_are_fail_closed(self):
        result = inspect_readiness(
            versions=lambda _: (_ for _ in ()).throw(ValueError("missing")),
            executable_locator=lambda _: None,
            gpu_enabled=False, verifier=lambda *_: True)
        self.assertEqual(result["status"], "blocked")
        self.assertFalse(result["checks"]["gpu_hardware_declared"])
        self.assertTrue(all(not result["checks"]["python:" + n] for n in DEPENDENCIES))
        self.assertTrue(all(not result["checks"]["executable:" + n] for n in REQUIRED_EXECUTABLES))

    def test_private_folder_requires_permissions_and_no_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / "private"
            folder.mkdir(mode=0o700)
            alias = Path(temp) / "linked"
            alias.symlink_to(folder, target_is_directory=True)
            args = dict(versions=lambda _: "1", executable_locator=lambda _: "/bin/true",
                        gpu_enabled=True, verifier=lambda *_: "a" * 40)
            self.assertFalse(inspect_readiness(private_dir=str(alias), **args)
                             ["checks"]["private_media_directory"])
            folder.chmod(0o755)
            self.assertFalse(inspect_readiness(private_dir=str(folder), **args)
                             ["checks"]["private_media_directory"])

    @unittest.skipUnless(os.name == "posix", "Linux process groups")
    def test_large_stdout_is_rejected_while_child_still_running(self):
        with self.assertRaises(CanaryExecutionError):
            bounded_subprocess(
                [sys.executable, "-c",
                 "import sys,time;sys.stdout.write('x'*400000);sys.stdout.flush();time.sleep(15)"],
                timeout_seconds=5, max_stdout=128)

    @unittest.skipUnless(os.name == "posix", "Linux process groups")
    def test_bounded_subprocess_accepts_stdin_without_pipe_deadlock(self):
        data = "a" * 11500
        answer = bounded_subprocess(
            [sys.executable, "-c",
             "import sys;sys.stdout.write(str(len(sys.stdin.read())))"],
            stdin=data, timeout_seconds=3, max_stdout=100)
        self.assertEqual(answer, str(len(data)))

    @unittest.skipUnless(os.name == "posix", "Linux process groups")
    def test_invalid_stdout_and_input_limits_fail_closed(self):
        with self.assertRaises(CanaryExecutionError):
            bounded_subprocess([sys.executable, "-c", "print('x')"], max_stdout=999999)
        with self.assertRaises(CanaryExecutionError):
            bounded_subprocess([sys.executable, "-c", "print('x')"],
                               stdin="x" * 12001)

if __name__ == "__main__":
    unittest.main()
