"""Offline tests: no GPU, network provider, paid job, or model weights required."""
import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "gpu-worker" / "server.py"
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
