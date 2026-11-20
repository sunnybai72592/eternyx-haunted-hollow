"""Private, stdlib-only ETERNYX GPU job ingress.

No model bundled or executed until an operator configures an approved executable.
Never expose this server directly to the public Internet: put it behind private
networking, TLS termination, and a trusted proxy that strips untrusted headers.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MAX_REQUEST = 12000
MAX_OUTPUT = 16384
KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$")
TASK_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$")
FEATURES = {"ai.video.text_to_video", "ai.video.image_to_video"}
STATUSES = {"queued", "processing", "succeeded", "failed", "cancelled"}

def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("bad payload")
    if payload.get("featureKey") not in FEATURES:
        raise ValueError("unsupported feature")
    if not isinstance(payload.get("prompt"), str) or not 1 <= len(payload["prompt"].strip()) <= 4000:
        raise ValueError("invalid prompt")
    duration = payload.get("durationSeconds")
    if type(duration) is not int or not 1 <= duration <= 60:
        raise ValueError("invalid video duration")
    if set(payload) - {"featureKey", "prompt", "durationSeconds", "aspectRatio", "negativePrompt", "imageAssetId", "version"}:
        raise ValueError("unexpected fields")
    if payload.get("aspectRatio", "16:9") not in {"16:9", "9:16", "1:1"}:
        raise ValueError("aspect ratio unsupported")
    if "negativePrompt" in payload and (not isinstance(payload["negativePrompt"], str) or len(payload["negativePrompt"]) > 2000):
        raise ValueError("bad negative prompt")
    if payload["featureKey"] == "ai.video.image_to_video":
        if not isinstance(payload.get("imageAssetId"), str) or not re.fullmatch(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", payload["imageAssetId"], re.I
        ):
            raise ValueError("verified image asset id required")
        # No image resolver is installed: prevent unsupported image-to-video work.
        raise ValueError("image asset resolver not configured")
    if "imageAssetId" in payload:
        raise ValueError("unexpected image")
    if payload.get("version", 1) != 1:
        raise ValueError("unsupported version")
    return payload

class JobStore:
    def __init__(self, filename, max_pending=32):
        if type(max_pending) is not int or not 1 <= max_pending <= 1000:
            raise ValueError("invalid maximum pending jobs")
        self.max_pending = max_pending
        self.db = sqlite3.connect(filename, check_same_thread=False, isolation_level=None)
        self.lock = threading.RLock()
        with self.lock:
            self.db.execute("PRAGMA journal_mode=WAL")
            self.db.execute("""CREATE TABLE IF NOT EXISTS jobs (
                task_id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL,
                digest TEXT NOT NULL, payload TEXT NOT NULL,
                state TEXT NOT NULL, output_ref TEXT, failure_code TEXT,
                created_at INTEGER NOT NULL)""")

    def submit(self, key, payload):
        if not isinstance(key, str) or not KEY_PATTERN.fullmatch(key):
            raise ValueError("invalid idempotency key")
        payload = validate_payload(payload)
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(raw.encode()).hexdigest()
        with self.lock:
            row = self.db.execute("SELECT task_id,digest,state FROM jobs WHERE idem=?", (key,)).fetchone()
            if row:
                if row[1] != digest:
                    raise ValueError("idempotency conflict")
                return {"taskId": row[0], "state": row[2]}
            pending = self.db.execute("SELECT count(*) FROM jobs WHERE state IN ('queued', 'processing')").fetchone()[0]
            if pending >= self.max_pending:
                raise OverflowError("GPU queue capacity reached")
            task_id = "job_" + uuid.uuid4().hex
            self.db.execute("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)",
                            (task_id, key, digest, raw, "queued", None, None, int(time.time())))
            return {"taskId": task_id, "state": "queued"}

    def get(self, task_id):
        if not TASK_PATTERN.fullmatch(task_id):
            raise ValueError("invalid task")
        with self.lock:
            row = self.db.execute("SELECT state,output_ref,failure_code FROM jobs WHERE task_id=?", (task_id,)).fetchone()
        if row is None:
            return None
        result = {"taskId": task_id, "state": row[0]}
        if row[1] is not None:
            result["outputReference"] = row[1]
        if row[2] is not None:
            result["failureCode"] = row[2]
        return result

    def cancel(self, task_id):
        if not TASK_PATTERN.fullmatch(task_id):
            raise ValueError("invalid task")
        with self.lock:
            row = self.db.execute("SELECT state FROM jobs WHERE task_id=?", (task_id,)).fetchone()
            if not row:
                return None
            if row[0] == "queued":
                self.db.execute("UPDATE jobs SET state='cancelled' WHERE task_id=? AND state='queued'", (task_id,))
                return True
            return False

    def recover_interrupted_jobs(self):
        """Single-process startup: do not silently re-run potentially billed jobs."""
        with self.lock:
            return self.db.execute(
                "UPDATE jobs SET state='failed', failure_code='WORKER_INTERRUPTED' "
                "WHERE state='processing'"
            ).rowcount

    def claim(self):
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                row = self.db.execute("SELECT task_id,payload FROM jobs WHERE state='queued' ORDER BY created_at, rowid LIMIT 1").fetchone()
                if row:
                    self.db.execute("UPDATE jobs SET state='processing' WHERE task_id=? AND state='queued'", (row[0],))
                self.db.execute("COMMIT")
                return row
            except Exception:
                self.db.execute("ROLLBACK")
                raise

    def finalize(self, task_id, reference=None):
        with self.lock:
            if reference is not None:
                if not re.fullmatch(r"asset_[a-zA-Z0-9_-]{8,200}", reference):
                    raise ValueError("invalid private output reference")
                self.db.execute("UPDATE jobs SET state='succeeded',output_ref=? WHERE task_id=? AND state='processing'", (reference, task_id))
            else:
                self.db.execute("UPDATE jobs SET state='failed',failure_code='INFERENCE_FAILED' WHERE task_id=? AND state='processing'", (task_id,))

def execute_job(command, payload, timeout_seconds):
    """Approved executable accepts JSON on stdin and emits {outputReference} on stdout.
    That executable must upload to private storage and return an authorized reference.
    """
    if not command or not Path(command).is_file() or not os.access(command, os.X_OK):
        raise RuntimeError("model executable unavailable")
    result = subprocess.run([command], input=json.dumps(payload), text=True,
                            capture_output=True, timeout=timeout_seconds, check=True)
    if len(result.stdout.encode()) > MAX_OUTPUT:
        raise RuntimeError("oversized inference result")
    manifest = json.loads(result.stdout)
    if not isinstance(manifest, dict) or set(manifest) != {"outputReference"}:
        raise RuntimeError("invalid inference manifest")
    return manifest["outputReference"]

def run_worker(store, command, timeout_seconds, stop):
    while not stop.is_set():
        job = store.claim()
        if job is None:
            stop.wait(0.3)
            continue
        try:
            ref = execute_job(command, json.loads(job[1]), timeout_seconds)
            store.finalize(job[0], ref)
        except Exception:
            store.finalize(job[0])

def handler_factory(store, secret):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Do not log tokens, prompts or customer records.

        def reply(self, status, data):
            body = json.dumps(data, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            value = self.headers.get("Authorization", "")
            expected = "Bearer " + secret
            if not hmac.compare_digest(value.encode(), expected.encode()):
                self.reply(401, {"error": "unauthorized"})
                return False
            return True

        def do_POST(self):
            if not self.authorized():
                return
            path = urlsplit(self.path)
            if path.query or path.fragment:
                return self.reply(404, {"error": "not_found"})
            if path.path == "/v1/jobs":
                try:
                    size = int(self.headers.get("Content-Length", "-1"))
                    if size < 1 or size > MAX_REQUEST:
                        return self.reply(413, {"error": "invalid_size"})
                    data = json.loads(self.rfile.read(size))
                    if not isinstance(data, dict) or set(data) != {"payload", "idempotencyKey"}:
                        raise ValueError("invalid request")
                    outcome = store.submit(data["idempotencyKey"], data["payload"])
                    return self.reply(202 if outcome["state"] in ("queued", "processing") else 200, outcome)
                except OverflowError:
                    return self.reply(429, {"error": "queue_full"})
                except (ValueError, TypeError, json.JSONDecodeError):
                    return self.reply(422, {"error": "invalid_request"})
            m = re.fullmatch(r"/v1/jobs/([A-Za-z0-9._:-]+)/cancel", path.path)
            if m:
                try: answer = store.cancel(m[1])
                except ValueError: return self.reply(422, {"error": "invalid_task"})
                if answer is None:
                    return self.reply(404, {"error": "not_found"})
                if answer is False:
                    return self.reply(409, {"error": "already_running_or_terminal"})
                return self.reply(200, {"accepted": True})
            return self.reply(404, {"error": "not_found"})

        def do_GET(self):
            if not self.authorized():
                return
            path = urlsplit(self.path)
            m = re.fullmatch(r"/v1/jobs/([A-Za-z0-9._:-]+)", path.path)
            if not m or path.query:
                return self.reply(404, {"error": "not_found"})
            try: result = store.get(m[1])
            except ValueError: return self.reply(422, {"error": "invalid_task"})
            return self.reply(200, result) if result else self.reply(404, {"error": "not_found"})
    return Handler

def main():
    secret = os.environ.get("ETERNYX_GPU_WORKER_SECRET", "")
    if len(secret) < 32 or len(secret) > 4096 or "\n" in secret or "\r" in secret:
        raise SystemExit("server secret is required")
    command = os.environ.get("ETERNYX_APPROVED_INFERENCE_EXECUTABLE", "")
    if not command or not os.path.isabs(command) or not os.path.isfile(command):
        raise SystemExit("approved inference executable is required")
    db_path = os.environ.get("ETERNYX_GPU_WORKER_DB", "")
    if not db_path or not os.path.isabs(db_path):
        raise SystemExit("absolute persistent SQLite database path required")
    timeout = int(os.environ.get("ETERNYX_GPU_JOB_TIMEOUT_SECONDS", "900"))
    if not 5 <= timeout <= 3600:
        raise SystemExit("job timeout out of bounds")
    max_pending = int(os.environ.get("ETERNYX_GPU_MAX_PENDING_JOBS", "32"))
    store = JobStore(db_path, max_pending=max_pending)
    store.recover_interrupted_jobs()
    stop = threading.Event()
    threading.Thread(target=run_worker, args=(store, command, timeout, stop), daemon=True).start()
    # Local/private only. TLS is mandatory at trusted ingress.
    server = ThreadingHTTPServer(("127.0.0.1", 8765), handler_factory(store, secret))
    try: server.serve_forever()
    finally: stop.set(); server.server_close()

if __name__ == "__main__":
    main()
