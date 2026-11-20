"""Offline tests: no GPU, network provider, paid job, or model weights required."""
import importlib.util
import json
import os
import sys
import time
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "server.py"
sys.path.insert(0, str(MODULE.parent))
spec = importlib.util.spec_from_file_location("eternyx_gpu_worker", MODULE)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
SECRET = "eternyx-test-secret-only-32-bytes-00000000"
PAYLOAD = {"featureKey": "ai.video.text_to_video", "prompt": "Ocean waves", "durationSeconds": 5}

class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = worker.JobStore(str(Path(self.temp.name) / "worker.sqlite"))

    def tearDown(self):
        self.store.db.close()
        self.temp.cleanup()

    def test_idempotent_submission_and_conflict(self):
        first = self.store.submit("job-00000001", PAYLOAD)
        again = self.store.submit("job-00000001", dict(PAYLOAD))
        self.assertEqual(first, again)
        with self.assertRaises(ValueError):
            self.store.submit("job-00000001", {**PAYLOAD, "prompt": "Different"})

    def test_claim_processing_and_fail_closed_without_model(self):
        job = self.store.submit("job-00000002", PAYLOAD)
        claimed = self.store.claim()
        self.assertEqual(claimed[0], job["taskId"])
        self.assertEqual(self.store.get(job["taskId"])["state"], "processing")
        with self.assertRaises(RuntimeError):
            worker.execute_job(None, PAYLOAD, 10)
        self.store.finalize(job["taskId"])
        self.assertEqual(self.store.get(job["taskId"])["failureCode"], "INFERENCE_FAILED")

    def test_real_worker_subprocess_contract_succeeds_without_gpu(self):
        # A real local executable returns only a JSON asset reference.
        # It is NOT a video renderer and never produces media.
        script = Path(self.temp.name) / "valid_runner.py"
        asset = "asset_" + "e" * 32
        script.write_text(
            "#!" + sys.executable + "\n"
            "import json,sys\n"
            "data=json.load(sys.stdin)\n"
            "assert data['featureKey']=='ai.video.text_to_video'\n"
            "print(json.dumps({'outputReference':'" + asset + "'}))\n"
        )
        script.chmod(0o700)
        self.assertEqual(worker.execute_job(str(script), PAYLOAD, 3), asset)

    def test_real_worker_rejects_unbounded_stdout_before_timeout(self):
        script = Path(self.temp.name) / "flood_runner.py"
        script.write_text(
            "#!" + sys.executable + "\n"
            "import sys,time\n"
            "sys.stdout.write('A' * 300000)\n"
            "sys.stdout.flush()\n"
            "time.sleep(10)\n"
        )
        script.chmod(0o700)
        started = time.monotonic()
        with self.assertRaises(RuntimeError):
            worker.execute_job(str(script), PAYLOAD, 4)
        self.assertLess(time.monotonic() - started, 4)

    def test_real_worker_kills_stalled_inference_before_next_job(self):
        script = Path(self.temp.name) / "stalled_runner.py"
        script.write_text(
            "#!" + sys.executable + "\n"
            "import time\n"
            "time.sleep(15)\n"
        )
        script.chmod(0o700)
        started = time.monotonic()
        with self.assertRaises(RuntimeError):
            worker.execute_job(str(script), PAYLOAD, 1)
        self.assertLess(time.monotonic() - started, 4)

    def test_version_bool_is_not_accepted_by_real_worker(self):
        with self.assertRaises(ValueError):
            worker.validate_payload({**PAYLOAD, "version": True})

    def test_queued_cancel_and_no_cancel_after_processing(self):
        job = self.store.submit("job-00000003", PAYLOAD)
        self.assertTrue(self.store.cancel(job["taskId"]))
        self.assertEqual(self.store.get(job["taskId"])["state"], "cancelled")
        self.assertIsNone(self.store.claim())
        job2 = self.store.submit("job-00000004", PAYLOAD)
        self.store.claim()
        self.assertFalse(self.store.cancel(job2["taskId"]))

    def test_rejects_unverified_image_and_injected_fields(self):
        for payload in [
            {**PAYLOAD, "durationSeconds": 300},
            {**PAYLOAD, "durationSeconds": True},
            {**PAYLOAD, "providerUrl": "https://untrusted.example"},
            {**PAYLOAD, "featureKey": "ai.video.image_to_video", "imageAssetId": "bad"},
        ]:
            with self.assertRaises(ValueError):
                self.store.submit("job-00000005", payload)

    def test_bounded_queue_and_cancel_frees_capacity(self):
        self.store.db.close()
        self.store = worker.JobStore(str(Path(self.temp.name) / "worker.sqlite"), max_pending=1)
        first = self.store.submit("job-capacity-01", PAYLOAD)
        with self.assertRaises(OverflowError):
            self.store.submit("job-capacity-02", PAYLOAD)
        self.assertEqual(self.store.submit("job-capacity-01", PAYLOAD), first)
        self.assertTrue(self.store.cancel(first["taskId"]))
        self.assertEqual(self.store.submit("job-capacity-02", PAYLOAD)["state"], "queued")

    def test_restart_marks_processing_failed_without_resubmission(self):
        task = self.store.submit("job-restart-01", PAYLOAD)["taskId"]
        self.store.claim()
        self.assertEqual(self.store.recover_interrupted_jobs(), 1)
        self.assertEqual(self.store.get(task)["state"], "failed")
        self.assertEqual(self.store.get(task)["failureCode"], "WORKER_INTERRUPTED")
        self.assertEqual(self.store.recover_interrupted_jobs(), 0)
        self.assertIsNone(self.store.claim())

    def test_pending_capacity_parameter_bounds(self):
        for value in (0, -1, 1001, True, 1.5):
            with self.assertRaises(ValueError):
                worker.JobStore(str(Path(self.temp.name) / "invalid.sqlite"), max_pending=value)

    def test_completed_job_output_is_service_authenticated_and_job_bound(self):
        import os
        from unittest.mock import patch
        asset = "asset_" + "a" * 32
        output_root = Path(self.temp.name) / "private"
        output_root.mkdir(mode=0o700)
        media = bytes.fromhex("000000146674797069736f6d") + b"private-video-test-fixture"
        (output_root / (asset + ".mp4")).write_bytes(media)
        job = self.store.submit("job-output-01", PAYLOAD)
        self.store.claim()
        self.store.finalize(job["taskId"], asset)
        incomplete = self.store.submit("job-output-02", PAYLOAD)
        server = ThreadingHTTPServer(("127.0.0.1", 0), worker.handler_factory(self.store, SECRET))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:" + str(server.server_address[1])
        def fetch(task, token):
            req = urllib.request.Request(
                base + "/v1/jobs/" + task + "/output",
                headers={"Authorization": "Bearer " + token})
            try:
                with urllib.request.urlopen(req, timeout=2) as response:
                    return response.status, response.read()
            except urllib.error.HTTPError as error:
                return error.code, error.read()
        try:
            with patch.dict(os.environ, {"ETERNYX_PRIVATE_VIDEO_DIR": str(output_root)}):
                self.assertEqual(fetch(job["taskId"], "invalid")[0], 401)
                self.assertEqual(fetch(incomplete["taskId"], SECRET)[0], 404)
                code, body = fetch(job["taskId"], SECRET)
                self.assertEqual(code, 200)
                self.assertEqual(body, media)
                self.assertEqual(fetch("nonexistent", SECRET)[0], 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_private_output_rejects_symlink_and_world_readable_directory(self):
        import os
        from unittest.mock import patch
        asset = "asset_" + "b" * 32
        root = Path(self.temp.name) / "outputs"
        root.mkdir(mode=0o700)
        target = Path(self.temp.name) / "outside.mp4"
        target.write_bytes(bytes.fromhex("000000146674797069736f6d")+b"secret")
        (root / (asset + ".mp4")).symlink_to(target)
        job = self.store.submit("job-output-03", PAYLOAD)
        self.store.claim()
        self.store.finalize(job["taskId"], asset)
        server = ThreadingHTTPServer(("127.0.0.1", 0), worker.handler_factory(self.store, SECRET))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = "http://127.0.0.1:" + str(server.server_address[1]) + "/v1/jobs/" + job["taskId"] + "/output"
        try:
            with patch.dict(os.environ, {"ETERNYX_PRIVATE_VIDEO_DIR": str(root)}):
                req = urllib.request.Request(url, headers={"Authorization": "Bearer " + SECRET})
                with self.assertRaises(urllib.error.HTTPError) as err:
                    urllib.request.urlopen(req, timeout=2)
                self.assertEqual(err.exception.code, 404)
                (root / (asset + ".mp4")).unlink()
                (root / (asset + ".mp4")).write_bytes(target.read_bytes())
                root.chmod(0o755)
                with self.assertRaises(urllib.error.HTTPError) as err:
                    urllib.request.urlopen(req, timeout=2)
                self.assertEqual(err.exception.code, 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_process_to_private_http_output_full_offline_lifecycle(self):
        """A local fixture executable exercises the REAL queue/subprocess/HTTP path.
        Bytes are an MP4-shaped fixture, NOT model-generated video.
        """
        import os
        import sys
        import time
        from unittest.mock import patch
        media_dir = Path(self.temp.name) / "private"
        media_dir.mkdir(mode=0o700)
        fixture = Path(self.temp.name) / "fixture_renderer.py"
        asset_id = "asset_" + "c" * 32
        fixture.write_text(
            "#!" + sys.executable + "\n"
            "import json,os,sys\n"
            "request=json.load(sys.stdin)\n"
            "assert request['featureKey']=='ai.video.text_to_video'\n"
            "target=os.path.join(os.environ['ETERNYX_PRIVATE_VIDEO_DIR'],"
            "'asset_" + "c" * 32 + ".mp4')\n"
            "with open(target,'xb') as f: "
            "f.write(bytes.fromhex('000000146674797069736f6d')+b'offline-fixture')\n"
            "print(json.dumps({'outputReference':'asset_" + "c" * 32 + "'}))\n"
        )
        fixture.chmod(0o700)
        server = ThreadingHTTPServer(("127.0.0.1", 0), worker.handler_factory(self.store, SECRET))
        http_thread = threading.Thread(target=server.serve_forever, daemon=True)
        http_thread.start()
        stop = threading.Event()
        base = "http://127.0.0.1:" + str(server.server_address[1])
        try:
            with patch.dict(os.environ, {"ETERNYX_PRIVATE_VIDEO_DIR": str(media_dir)}):
                worker_thread = threading.Thread(
                    target=worker.run_worker, args=(self.store, str(fixture), 8, stop),
                    daemon=True)
                request = urllib.request.Request(
                    base + "/v1/jobs", method="POST",
                    data=json.dumps({"payload": PAYLOAD, "idempotencyKey": "job-e2e-001"}).encode(),
                    headers={"Authorization": "Bearer " + SECRET,
                             "Content-Type": "application/json"})
                with urllib.request.urlopen(request, timeout=3) as response:
                    receipt = json.load(response)
                worker_thread.start()
                status = None
                for _ in range(40):
                    query = urllib.request.Request(
                        base + "/v1/jobs/" + receipt["taskId"],
                        headers={"Authorization": "Bearer " + SECRET})
                    with urllib.request.urlopen(query, timeout=3) as response:
                        status = json.load(response)
                    if status["state"] in ("succeeded", "failed"):
                        break
                    time.sleep(0.05)
                self.assertEqual(status["state"], "succeeded", status)
                self.assertEqual(status["outputReference"], asset_id)
                download = urllib.request.Request(
                    base + "/v1/jobs/" + receipt["taskId"] + "/output",
                    headers={"Authorization": "Bearer " + SECRET})
                with urllib.request.urlopen(download, timeout=3) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.headers["Content-Type"], "video/mp4")
                    self.assertEqual(response.read(),
                        bytes.fromhex("000000146674797069736f6d") + b"offline-fixture")
                repeat = urllib.request.Request(
                    base + "/v1/jobs", method="POST",
                    data=json.dumps({"payload": PAYLOAD, "idempotencyKey": "job-e2e-001"}).encode(),
                    headers={"Authorization": "Bearer " + SECRET,
                             "Content-Type": "application/json"})
                with urllib.request.urlopen(repeat, timeout=3) as response:
                    same = json.load(response)
                self.assertEqual(same["taskId"], receipt["taskId"])
                self.assertEqual(self.store.claim(), None)
        finally:
            stop.set()
            server.shutdown()
            server.server_close()
            http_thread.join(timeout=3)
            if "worker_thread" in locals() and worker_thread.is_alive():
                worker_thread.join(timeout=3)

    def test_http_auth_submit_status_and_cancel(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), worker.handler_factory(self.store, SECRET))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:" + str(server.server_address[1])
        def send(path, method="GET", data=None, authorized=True):
            request = urllib.request.Request(
                base + path, method=method,
                data=None if data is None else json.dumps(data).encode(),
                headers={"Authorization": ("Bearer " + SECRET) if authorized else "Bearer invalid",
                         "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=2) as response:
                    return response.status, json.load(response)
            except urllib.error.HTTPError as error:
                return error.code, json.load(error)
        try:
            self.assertEqual(send("/v1/jobs", "POST",
                {"payload": PAYLOAD, "idempotencyKey": "job-00000006"}, False)[0], 401)
            status, value = send("/v1/jobs", "POST",
                {"payload": PAYLOAD, "idempotencyKey": "job-00000006"})
            self.assertEqual(status, 202)
            self.assertEqual(send("/v1/jobs/" + value["taskId"])[1]["state"], "queued")
            self.assertEqual(send("/v1/jobs/" + value["taskId"] + "/cancel", "POST")[1], {"accepted": True})
            self.assertEqual(send("/v1/jobs/" + value["taskId"])[1]["state"], "cancelled")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

if __name__ == "__main__":
    unittest.main()
