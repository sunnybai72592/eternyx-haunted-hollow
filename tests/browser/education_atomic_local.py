"""Atomic Education UI acceptance against 100% intercepted, synthetic local REST/RPC.

This does not connect to Supabase or use any credential. It does not certify
a deployed backend. The temporary CI build enables staging RPC frontend flags.
"""
import base64
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

from playwright.sync_api import expect, sync_playwright

BASE = "http://127.0.0.1:4173"
REMOTE = "offline-education.invalid"
USER = "00000000-0000-4000-8000-000000000041"
TEST = "10000000-0000-4000-8000-000000000041"
ATTEMPT = "10000000-0000-4000-8000-000000000042"
CHOICE_Q = "10000000-0000-4000-8000-000000000043"
WRITTEN_Q = "10000000-0000-4000-8000-000000000044"
CHOOSE_A = "10000000-0000-4000-8000-000000000045"
CHOOSE_B = "10000000-0000-4000-8000-000000000046"
REPORT = Path("test-results/education-atomic-local-browser.json")
CASES = (
    "atomic_attempt_starts_once",
    "real_choice_and_written_autosave",
    "reload_restores_owned_answers",
    "failed_latest_save_remains_retryable",
    "confirm_submit_uses_single_atomic_rpc",
    "verified_pending_result_never_exposes_legacy_score",
    "invalid_exam_metadata_blocks_start",
    "malformed_restored_answers_block_editor",
)

def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

def token():
    return ".".join((encode({"alg": "HS256", "typ": "JWT"}),
                     encode({"sub": USER, "role": "authenticated",
                             "exp": int(time.time()) + 3600}), "synthetic"))

class Fixture:
    def __init__(self, *, invalid_exam=False, invalid_restore=False, lose_submit_reply=False):
        self.user = {"id": USER, "email": "rls-student@example.invalid", "aud": "authenticated",
                     "role": "authenticated", "app_metadata": {}, "user_metadata": {}}
        self.now = datetime.now(timezone.utc).isoformat()
        self.answers = {}
        self.started = 0
        self.saved = []
        self.submitted = 0
        self.unexpected_mutations = []
        self.invalid_exam = invalid_exam
        self.invalid_restore = invalid_restore
        self.lose_submit_reply = lose_submit_reply
        self.fail_next_written_save = False
        self.status = "in_progress"

    def attempt(self):
        return {"id": ATTEMPT, "user_id": USER, "test_id": TEST,
                "start_time": self.now, "end_time": self.now if self.status != "in_progress" else None,
                "status": self.status, "score": 999, "max_score": 1000, "is_mobile_locked": False}

    def response_rows(self):
        if self.invalid_restore:
            return [{"question_id": "10000000-0000-4000-8000-000000000099",
                     "selected_option_id": CHOOSE_A, "short_answer_text": None}]
        rows = []
        for q, answer in self.answers.items():
            rows.append({"question_id": q,
                         "selected_option_id": answer.get("p_selected_option_id"),
                         "short_answer_text": answer.get("p_short_answer_text"),
                         "questions": {"id": q, "test_id": TEST,
                                       "question_text": "Local synthetic response",
                                       "points": 4}})
        return rows

    def handle(self, route):
        req = route.request
        url = urlsplit(req.url)
        if url.hostname == "127.0.0.1" and url.port == 4173:
            route.continue_()
            return
        if url.hostname != REMOTE:
            raise AssertionError("Unexpected nonlocal browser host")
        path = url.path
        method = req.method.upper()
        params = parse_qs(url.query)
        if path == "/auth/v1/token" and method == "POST":
            route.fulfill(json={"user": self.user, "access_token": token(),
                                "refresh_token": "local-only", "token_type": "bearer",
                                "expires_in": 3600})
        elif path == "/auth/v1/user" and method == "GET":
            route.fulfill(json=self.user)
        elif path == "/rest/v1/profiles" and method == "GET":
            route.fulfill(json={"id": USER, "user_id": USER, "role": "user",
                                "username": "fixture-learner", "full_name": "Local Learner"})
        elif path == "/rest/v1/tests" and method == "GET":
            route.fulfill(json={"id": TEST, "title": "Synthetic atomic assessment",
                                "is_active": True, "duration_minutes": 30,
                                "description": "Browser fixture only"})
        elif path == "/rest/v1/questions" and method == "GET":
            rows = [
                {"id": CHOICE_Q, "question_text": "Choose the synthetic option",
                 "question_type": "multiple_choice", "points": 4, "order_index": 1},
                {"id": CHOICE_Q if self.invalid_exam else WRITTEN_Q,
                 "question_text": "Describe a sample response", "question_type": "short_answer",
                 "points": 3, "order_index": 2},
            ]
            route.fulfill(json=rows)
        elif path == "/rest/v1/options" and method == "GET":
            route.fulfill(json=[{"id": CHOOSE_A, "option_text": "Alpha synthetic"},
                                {"id": CHOOSE_B, "option_text": "Beta synthetic"}])
        elif path == "/rest/v1/user_answers" and method == "GET":
            route.fulfill(json=self.response_rows())
        elif path == "/rest/v1/user_attempts" and method == "GET":
            is_single = "application/vnd.pgrst.object+json" in req.headers.get("accept", "")
            route.fulfill(json=self.attempt() if is_single else [self.attempt()])
        elif path == "/rest/v1/rpc/start_cbt_attempt" and method == "POST":
            self.started += 1
            route.fulfill(json={"id": ATTEMPT, "status": self.status, "start_time": self.now})
        elif path == "/rest/v1/rpc/save_cbt_answer" and method == "POST":
            payload = req.post_data_json
            assert payload["p_attempt_id"] == ATTEMPT
            assert payload["p_question_id"] in (CHOICE_Q, WRITTEN_Q)
            if self.fail_next_written_save and payload["p_question_id"] == WRITTEN_Q:
                self.fail_next_written_save = False
                route.fulfill(status=503, json={"message": "Synthetic transient save error"})
                return
            self.answers[payload["p_question_id"]] = payload
            self.saved.append(payload.copy())
            route.fulfill(json={"status": "saved"})
        elif path == "/rest/v1/rpc/submit_cbt_attempt" and method == "POST":
            assert req.post_data_json == {"p_attempt_id": ATTEMPT}
            self.submitted += 1
            self.status = "submitted"
            if self.lose_submit_reply:
                route.fulfill(status=503, json={"message": "Synthetic response lost"})
            else:
                route.fulfill(json={"id": ATTEMPT, "status": "submitted"})
        elif path == "/rest/v1/rpc/is_admin" and method == "POST":
            # Read-only role check, not a privileged operation.
            route.fulfill(json=False)
        elif path == "/rest/v1/rpc/education_student_verified_result" and method == "POST":
            route.fulfill(json={"attempt_id": ATTEMPT, "grade_status": "pending_review",
                                "score": None, "max_score": None, "finalized_at": None})
        else:
            if method not in ("GET", "HEAD", "OPTIONS"):
                self.unexpected_mutations.append(path.split("/")[-1][:35])
            route.fulfill(status=403, json={"message": "Blocked unrecognized synthetic call"})

def signin(page, fixture, path):
    page.route("**/*", fixture.handle)
    page.goto(BASE + "/auth?redirect=" + path.replace("/", "%2F"),
              wait_until="domcontentloaded")
    page.get_by_label("Email address", exact=True).fill("rls-student@example.invalid")
    page.get_by_label("Password", exact=True).fill("local-only-fixture")
    page.get_by_role("button", name="Sign in to ETERNYX", exact=True).click()
    page.wait_for_url(BASE + path, timeout=20000)
    # Ignore optional anonymous visitor traffic on the public sign-in page.
    # From this point onward, private assessment routes must be silent.
    fixture.unexpected_mutations.clear()

def case(case_name, action, records, viewport):
    try:
        action()
        records.append({"check": case_name, "viewport": viewport, "result": "passed"})
    except Exception:
        records.append({"check": case_name, "viewport": viewport, "result": "blocked"})
        raise

def exercise(browser, label, viewport, records):
    context = browser.new_context(viewport=viewport, reduced_motion="reduce")
    fixture = Fixture()
    page = context.new_page()
    page.set_default_timeout(15000)
    try:
        signin(page, fixture, "/test/" + TEST)
        expect(page.get_by_role("heading", name="Synthetic atomic assessment")).to_be_visible(timeout=20000)
        case("atomic_attempt_starts_once", lambda: (
            expect(page.get_by_role("timer")).to_be_visible(),
            assert_equal(fixture.started, 1),
        ), records, label)

        # Real radio selection triggers the atomic save RPC.
        page.get_by_label("Alpha synthetic", exact=True).click()
        expect(page.get_by_text("All latest answers saved to the server.")).to_be_visible()
        page.get_by_role("button", name="Next", exact=True).click()
        response = page.get_by_label("Your short answer", exact=True)
        response.fill("A verified synthetic explanation.")
        expect(page.get_by_text("All latest answers saved to the server.")).to_be_visible()
        case("real_choice_and_written_autosave", lambda: (
            assert_equal(fixture.answers[CHOICE_Q]["p_selected_option_id"], CHOOSE_A),
            assert_equal(fixture.answers[WRITTEN_Q]["p_short_answer_text"],
                         "A verified synthetic explanation."),
        ), records, label)

        page.reload()
        expect(page.get_by_role("heading", name="Synthetic atomic assessment")).to_be_visible()
        expect(page.get_by_label("Alpha synthetic", exact=True)).to_be_checked()
        page.get_by_role("button", name="Next", exact=True).click()
        expect(page.get_by_label("Your short answer", exact=True)).to_have_value(
            "A verified synthetic explanation.")
        case("reload_restores_owned_answers", lambda: assert_equal(fixture.started, 2),
             records, label)

        fixture.fail_next_written_save = True
        textarea = page.get_by_label("Your short answer", exact=True)
        textarea.fill("Latest final synthetic explanation.")
        expect(page.get_by_text("Unsaved answers: the server did not confirm your latest changes.",
                                exact=False)).to_be_visible(timeout=15000)
        page.get_by_role("button", name="Retry saving", exact=True).click()
        expect(page.get_by_text("All latest answers saved to the server.")).to_be_visible()
        case("failed_latest_save_remains_retryable", lambda:
             assert_equal(fixture.answers[WRITTEN_Q]["p_short_answer_text"],
                          "Latest final synthetic explanation."),
             records, label)

        page.get_by_role("button", name="Submit assessment").click()
        page.get_by_role("button", name="Confirm submission").click()
        page.wait_for_url(BASE + "/test-results/" + ATTEMPT, timeout=20000)
        case("confirm_submit_uses_single_atomic_rpc", lambda:
             assert_equal(fixture.submitted, 1), records, label)
        expect(page.get_by_text("Grading pending", exact=False).first).to_be_visible(timeout=20000)
        expect(page.get_by_text("999 / 1000", exact=False)).to_have_count(0)
        if fixture.unexpected_mutations:
            # Only fixed API operation tail labels, never request bodies or URLs.
            print("Synthetic UI unexpected operation types: " +
                  ",".join(fixture.unexpected_mutations), flush=True)
        case("verified_pending_result_never_exposes_legacy_score", lambda:
             assert_equal(fixture.unexpected_mutations, []), records, label)
    finally:
        context.close()

    # Separate browser identities/fixtures prove invalid server data blocks
    # attempt creation before the write RPC, rather than fabricating a retry.
    for bad_mode, check_name, expected in [
        ("invalid_exam", "invalid_exam_metadata_blocks_start",
         "Assessment or attempt could not be loaded"),
        ("invalid_restore", "malformed_restored_answers_block_editor",
         "Assessment or attempt could not be loaded"),
    ]:
        context = browser.new_context(viewport=viewport, reduced_motion="reduce")
        bad = Fixture(**{bad_mode: True})
        page = context.new_page()
        page.set_default_timeout(15000)
        try:
            signin(page, bad, "/test/" + TEST)
            expect(page.get_by_text(expected, exact=False)).to_be_visible(timeout=20000)
            if bad_mode == "invalid_exam":
                assert_equal(bad.started, 0)
            else:
                assert_equal(bad.started, 1)
            assert_equal(bad.saved, [])
            case(check_name, lambda: assert_equal(bad.unexpected_mutations, []),
                 records, label)
        finally:
            context.close()

def assert_equal(a,b):
    assert a==b, "Synthetic browser acceptance condition failed"

def main():
    REPORT.unlink(missing_ok=True)
    records = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="chrome")
            try:
                for name, viewport in (
                    ("desktop", {"width": 1440, "height": 900}),
                    ("mobile", {"width": 390, "height": 844}),
                ):
                    exercise(browser, name, viewport, records)
            finally:
                browser.close()
        assert len(records) == len(CASES)*2
        assert all(r["result"] == "passed" for r in records)
        print("PASS: 16 synthetic atomic Education UI browser checks, zero remote API access.")
    finally:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps({
            "schema": 1, "suite": "education-local-atomic-browser",
            "environment": "local preview with intercepted synthetic API only",
            "production_tested": False,
            "staging_hosted_tested": False,
            "checks": records,
        }, indent=2) + "\n")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Do not print account, request, answer or browser traces.
        print("BLOCKED: synthetic Education atomic browser acceptance.")
        raise SystemExit(1)
