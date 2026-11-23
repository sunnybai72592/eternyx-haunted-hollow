"""Offline regression tests for hosted Education browser's actual request guard.

Runs without Playwright, staging credentials, network, or a browser binary.
"""
from pathlib import Path
import sys
import types
import unittest

playwright = types.ModuleType("playwright")
sync_api = types.ModuleType("playwright.sync_api")
sync_api.expect = None
sync_api.sync_playwright = None
playwright.sync_api = sync_api
sys.modules["playwright"] = playwright
sys.modules["playwright.sync_api"] = sync_api
sys.path.insert(0, str(Path(__file__).resolve().parent / "browser"))
from education_hosted_readonly import CASES, READ_RPCS, guard_request  # noqa: E402

HOST = "separatestaging12345.supabase.co"
BASE = "https://" + HOST


class Frame:
    def __init__(self, url):
        self.url = url


class Request:
    def __init__(self, url, method, initiator):
        self.url = url
        self.method = method
        self.frame = Frame(initiator)


class Route:
    def __init__(self, url, method, initiator):
        self.request = Request(url, method, initiator)
        self.action = None

    def continue_(self):
        assert self.action is None
        self.action = "forwarded"

    def abort(self):
        assert self.action is None
        self.action = "blocked"


class GuardTests(unittest.TestCase):
    def assert_request(self, name, url, method, expected, events=(),
                       initiator="http://127.0.0.1:4173/education/history"):
        with self.subTest(name):
            route = Route(url, method, initiator)
            violations = []
            guard_request(route, HOST, violations)
            self.assertEqual(route.action, expected)
            self.assertEqual(violations, list(events))

    def test_only_exact_local_preview_or_tls_staging_may_be_read(self):
        self.assert_request("local", "http://127.0.0.1:4173/education/history",
                            "GET", "forwarded")
        self.assert_request("staging", BASE + "/rest/v1/user_attempts",
                            "GET", "forwarded")
        self.assert_request("head", BASE + "/rest/v1/user_attempts",
                            "HEAD", "forwarded")
        for label, url in [
            ("external GET with secret-like query", "https://tracker.example.invalid/?token=private"),
            ("foreign Supabase", "https://differentstaging123.supabase.co/rest/v1/users"),
            ("lookalike staging host", "https://" + HOST + ".attacker.invalid/"),
            ("production-shaped host", "https://wcncuarekaofmfurbtbh.supabase.co/rest/v1/tests"),
            ("unencrypted staging", "http://" + HOST + "/rest/v1/tests"),
            ("non-default staging port", BASE + ":8443/rest/v1/tests"),
            ("different local port", "http://127.0.0.1:8123/private"),
            ("IPv6 loopback", "http://[::1]:4173/education/history"),
            ("file", "file:///etc/passwd"),
        ]:
            self.assert_request(label, url, "GET", "blocked",
                                ("unapproved_network_egress",))

    def test_allow_only_auth_and_readonly_rpc_posts_to_staging(self):
        self.assertIn("is_admin", READ_RPCS)
        self.assert_request("password Auth", BASE + "/auth/v1/token?grant_type=password",
                            "POST", "forwarded")
        self.assert_request("student ledger", BASE + "/rest/v1/rpc/education_student_verified_result",
                            "POST", "forwarded")
        self.assert_request("instructor access", BASE + "/rest/v1/rpc/education_instructor_access",
                            "POST", "forwarded")
        self.assert_request("admin check", BASE + "/rest/v1/rpc/is_admin",
                            "POST", "forwarded")
        for label, endpoint in [
            ("create profile", "/rest/v1/profiles"),
            ("start exam", "/rest/v1/rpc/start_cbt_attempt"),
            ("save answer", "/rest/v1/rpc/save_cbt_answer"),
            ("submit exam", "/rest/v1/rpc/submit_cbt_attempt"),
            ("provisional review", "/rest/v1/rpc/education_instructor_review_written_answer"),
            ("official grade finalization", "/rest/v1/rpc/education_finalize_cbt_grade"),
            ("admin publication", "/rest/v1/rpc/education_admin_review_publication"),
            ("Auth signout", "/auth/v1/logout"),
        ]:
            self.assert_request(label, BASE + endpoint, "POST", "blocked",
                                ("unexpected_remote_write",))
        self.assert_request("nonlocal POST", "https://tracker.example.invalid/ingest",
                            "POST", "blocked",
                            ("unapproved_network_egress", "unexpected_remote_write"))
        self.assert_request("local preview POST", "http://127.0.0.1:4173/api/upload",
                            "POST", "blocked", ("unexpected_remote_write",))
        self.assert_request("staging delete", BASE + "/rest/v1/user_answers",
                            "DELETE", "blocked", ("unexpected_remote_write",))
        self.assert_request("staging patch", BASE + "/rest/v1/user_attempts",
                            "PATCH", "blocked", ("unexpected_remote_write",))
        self.assert_request("staging put", BASE + "/storage/v1/object/records",
                            "PUT", "blocked", ("unexpected_remote_write",))

    def test_public_signin_analytics_is_blocked_without_masking_private_tracking(self):
        endpoint = BASE + "/rest/v1/rpc/visitor_presence"
        self.assert_request("public page poll", endpoint, "POST", "blocked", (),
                            initiator="http://127.0.0.1:4173/auth?redirect=%2Feducation")
        self.assert_request("private exam poll", endpoint, "POST", "blocked",
                            ("unexpected_remote_write",),
                            initiator="http://127.0.0.1:4173/test/10000000-0000-4000-8000-000000000041")
        self.assert_request("private result poll", endpoint, "POST", "blocked",
                            ("unexpected_remote_write",),
                            initiator="http://127.0.0.1:4173/test-results/10000000-0000-4000-8000-000000000042")
        self.assert_request("untrusted page poll", endpoint, "POST", "blocked",
                            ("unexpected_remote_write",),
                            initiator="https://thirdparty.example.invalid/auth")

    def test_complete_named_browser_acceptance_contract(self):
        self.assertEqual(len(CASES), 22)
        self.assertEqual(len(set(CASES)), len(CASES))
        for label in ("desktop", "mobile"):
            for check in (
                "student_a_authenticated_history", "student_a_verified_final",
                "student_a_pending_no_score", "student_a_running_no_score",
                "student_a_legacy_no_score", "student_a_denied_b_result",
                "student_b_authenticated_history", "student_b_owned_final",
                "student_b_denied_a_result", "instructor_verified_private_workspace",
            ):
                self.assertIn(label + "_" + check, CASES)
        self.assertIn("no_unapproved_remote_writes", CASES)
        self.assertIn("no_unapproved_network_egress", CASES)


if __name__ == "__main__":
    unittest.main(verbosity=1)
