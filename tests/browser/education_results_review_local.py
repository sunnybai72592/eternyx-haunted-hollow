"""Verify the actual learner-result and instructor-review React pages in Chrome.

All Auth/REST/RPC calls are intercepted using synthetic local fixtures.
No Supabase project, production server, user credentials, or remote exam is used.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

from playwright.sync_api import expect, sync_playwright

from education_atomic_local import (
    BASE, REMOTE, USER, TEST, ATTEMPT, CHOICE_Q, WRITTEN_Q,
    CHOOSE_A, Fixture, signin, assert_equal,
)

OUTPUT = Path("test-results/education-results-review-local-browser.json")
STUDENT_B = "00000000-0000-4000-8000-000000000052"
INSTRUCTOR = "00000000-0000-4000-8000-000000000053"
WRITTEN_ID = "10000000-0000-4000-8000-000000000051"
CHECKS = (
    "pending_grade_hides_forged_legacy_score",
    "pending_grade_never_requests_correctness",
    "finalized_grade_requires_matching_ledger_receipt",
    "finalized_private_csv_is_owner_scoped",
    "malformed_receipt_fails_closed",
    "different_account_denied_private_attempt",
    "unapproved_instructor_sees_no_queue",
    "approved_instructor_sees_private_authorized_queue",
    "invalid_written_mark_cannot_be_sent",
    "explicit_provisional_review_does_not_finalize_grade",
    "malformed_review_queue_fails_closed",
)

class ResultFixture(Fixture):
    def __init__(self, *, grade="pending", unauthorized=False):
        super().__init__()
        self.status = "submitted"
        self.grade = grade
        self.unauthorized = unauthorized
        self.result_selects = []
        self.forbidden = []
        if unauthorized:
            self.user = {**self.user, "id": STUDENT_B,
                         "email": "rls-student-b@example.invalid"}

    def answer_rows(self, reveal):
        rows = [
            {"question_id": CHOICE_Q, "selected_option_id": CHOOSE_A,
             "short_answer_text": None,
             "questions": {"id": CHOICE_Q, "test_id": TEST,
                           "question_text": "Synthetic selection", "points": 4}},
            {"question_id": WRITTEN_Q, "selected_option_id": None,
             "short_answer_text": "=SUM(1,2) synthetic private text",
             "questions": {"id": WRITTEN_Q, "test_id": TEST,
                           "question_text": "Synthetic written response", "points": 6}},
        ]
        if reveal:
            rows[0].update(is_correct=True, points_awarded=4)
            rows[1].update(is_correct=None, points_awarded=3)
        return rows

    def handle(self, route):
        request = route.request
        url = urlsplit(request.url)
        path = url.path
        if url.hostname == REMOTE and path == "/rest/v1/user_attempts" and request.method == "GET":
            if self.unauthorized:
                route.fulfill(status=406, json={"message": "No owned attempt exists"})
            else:
                row = self.attempt()
                row.update(score=999, max_score=1000)
                route.fulfill(json=row)
            return
        if url.hostname == REMOTE and path == "/rest/v1/user_answers" and request.method == "GET":
            selected = parse_qs(url.query).get("select", [""])[0]
            reveal = "is_correct" in selected or "points_awarded" in selected
            self.result_selects.append(reveal)
            if self.grade != "finalized" and reveal:
                self.forbidden.append("premature_correctness_query")
                route.fulfill(status=403, json={"message": "Unverified grade blocked"})
                return
            route.fulfill(json=self.answer_rows(reveal))
            return
        if url.hostname == REMOTE and path == "/rest/v1/rpc/education_student_verified_result" and request.method == "POST":
            assert request.post_data_json == {"p_attempt_id": ATTEMPT}
            if self.grade == "finalized":
                reply = {"attempt_id": ATTEMPT, "grade_status": "finalized",
                         "score": 7, "max_score": 10,
                         "finalized_at": self.now}
            elif self.grade == "malformed":
                reply = {"attempt_id": ATTEMPT, "grade_status": "finalized",
                         "score": 70, "max_score": 10,
                         "finalized_at": self.now}
            else:
                reply = {"attempt_id": ATTEMPT, "grade_status": "pending_review",
                         "score": None, "max_score": None, "finalized_at": None}
            route.fulfill(json=reply)
            return
        super().handle(route)


class InstructorFixture(Fixture):
    def __init__(self, *, approved=True, malformed=False):
        super().__init__()
        self.user = {**self.user, "id": INSTRUCTOR if approved else STUDENT_B,
                     "email": "rls-instructor@example.invalid" if approved
                     else "rls-unapproved@example.invalid"}
        self.approved = approved
        self.malformed = malformed
        self.review_writes = []
        self.queue_reads = 0
        self.grade_finalizations = 0
        self.reviewed = None

    def review_row(self):
        return {
            "answer_id": "bad-row" if self.malformed else WRITTEN_ID,
            "attempt_id": ATTEMPT, "test_id": TEST,
            "test_title": "Synthetic private exam", "question_text": "Review synthetic answer",
            "response_text": "Only this authorized instructor can review this text.",
            "points_possible": 5, "reviewed_points": self.reviewed,
            "reviewed_at": self.now if self.reviewed is not None else None,
        }

    def handle(self, route):
        request = route.request
        url = urlsplit(request.url)
        path = url.path
        if url.hostname == REMOTE and path == "/rest/v1/rpc/education_instructor_access":
            assert request.method == "POST"
            route.fulfill(json={"approved": self.approved})
            return
        if url.hostname == REMOTE and path == "/rest/v1/rpc/education_instructor_list_drafts":
            assert self.approved
            route.fulfill(json=[])
            return
        if url.hostname == REMOTE and path == "/rest/v1/rpc/education_instructor_written_review_queue":
            self.queue_reads += 1
            if not self.approved:
                self.grade_finalizations += 1
                route.fulfill(status=403, json={"message": "Not authorized"})
                return
            route.fulfill(json=[self.review_row()])
            return
        if url.hostname == REMOTE and path == "/rest/v1/rpc/education_instructor_review_written_answer":
            assert self.approved
            payload = request.post_data_json
            self.review_writes.append(payload)
            assert payload == {"p_answer_id": WRITTEN_ID, "p_points": 3}
            self.reviewed = 3
            route.fulfill(json={"answer_id": WRITTEN_ID, "points_awarded": 3,
                                "status": "review_recorded",
                                "official_score_updated": False})
            return
        if url.hostname == REMOTE and "finaliz" in path:
            self.grade_finalizations += 1
            route.fulfill(status=403, json={"message": "Not permitted"})
            return
        super().handle(route)


def record(check, viewport, checks, fn):
    try:
        fn()
        checks.append({"check": check, "viewport": viewport, "result": "passed"})
    except Exception:
        checks.append({"check": check, "viewport": viewport, "result": "blocked"})
        raise


def result_case(browser, viewport, label, checks, grade, unauthorized=False):
    fixture = ResultFixture(grade=grade, unauthorized=unauthorized)
    context = browser.new_context(viewport=viewport, reduced_motion="reduce", accept_downloads=True)
    page = context.new_page()
    page.set_default_timeout(15000)
    try:
        signin(page, fixture, "/test-results/" + ATTEMPT)
        if unauthorized:
            expect(page.get_by_text(
                "The attempt could not be loaded. Check your access or retry.",
                exact=False)).to_be_visible(timeout=15000)
            record("different_account_denied_private_attempt", label, checks,
                   lambda: (assert_equal(fixture.result_selects, []),
                            assert_equal(page.get_by_text("999 / 1000", exact=False).count(), 0),
                            assert_equal(fixture.unexpected_mutations, [])))
        elif grade == "finalized":
            expect(page.get_by_text("Verified final grade", exact=False)).to_be_visible(timeout=15000)
            expect(page.get_by_text("7 / 10", exact=True)).to_be_visible()
            # Grade receipt and owner answer evidence are independent queries;
            # wait for the *graded* answer projection before inspecting select.
            expect(page.locator("p").filter(has_text="Marked correct")).to_be_visible(timeout=15000)
            record("finalized_grade_requires_matching_ledger_receipt", label, checks,
                   lambda: (assert_equal(any(fixture.result_selects), True),
                            assert_equal(page.get_by_text("999 / 1000", exact=False).count(), 0)))
            with page.expect_download() as pending:
                page.get_by_role("button", name="Download my answers (.csv)").click()
            content = Path(pending.value.path()).read_text(encoding="utf8")
            record("finalized_private_csv_is_owner_scoped", label, checks,
                   lambda: (assert_equal("=SUM(1,2) synthetic private text" in content, True),
                            assert_equal("7 / 10" in page.locator("body").inner_text(), True),
                            assert_equal(fixture.unexpected_mutations, [])))
        elif grade == "malformed":
            expect(page.get_by_text("Official grade verification is unavailable.",
                                    exact=False)).to_be_visible(timeout=15000)
            expect(page.get_by_text("Returned response evidence:", exact=False)).to_be_visible(timeout=15000)
            record("malformed_receipt_fails_closed", label, checks,
                   lambda: (assert_equal(page.get_by_text("999 / 1000", exact=False).count(), 0),
                            assert_equal(page.get_by_role("button", name="Download my answers (.csv)").is_disabled(), True),
                            assert_equal(fixture.result_selects[-1], False)))
        else:
            expect(page.get_by_text("The attempt has been submitted, but an official score has not been recorded yet.",
                                    exact=False)).to_be_visible(timeout=15000)
            expect(page.get_by_text("Returned response evidence:", exact=False)).to_be_visible(timeout=15000)
            record("pending_grade_hides_forged_legacy_score", label, checks,
                   lambda: (assert_equal(page.get_by_text("999 / 1000", exact=False).count(), 0),
                            assert_equal(page.get_by_text("Verified final grade", exact=False).count(), 0)))
            record("pending_grade_never_requests_correctness", label, checks,
                   lambda: (assert_equal(bool(fixture.result_selects), True),
                            assert_equal(any(fixture.result_selects), False),
                            assert_equal(fixture.forbidden, [])))
    finally:
        context.close()


def instructor_case(browser, viewport, label, checks, approved=True, malformed=False):
    fixture = InstructorFixture(approved=approved, malformed=malformed)
    context = browser.new_context(viewport=viewport, reduced_motion="reduce")
    page = context.new_page()
    page.set_default_timeout(15000)
    try:
        signin(page, fixture, "/education/question-bank")
        if not approved:
            expect(page.get_by_text("Your account is not approved for server-side instructor authoring.",
                                    exact=False)).to_be_visible(timeout=15000)
            record("unapproved_instructor_sees_no_queue", label, checks,
                   lambda: (assert_equal(fixture.queue_reads, 0),
                            assert_equal(page.get_by_role("region", name="Verified instructor written response review").count(), 0),
                            assert_equal(fixture.review_writes, [])))
        elif malformed:
            expect(page.get_by_text("Reviews could not be loaded or instructor access was revoked.",
                                    exact=False)).to_be_visible(timeout=15000)
            record("malformed_review_queue_fails_closed", label, checks,
                   lambda: (assert_equal(fixture.review_writes, []),
                            assert_equal(page.get_by_label("Points for written response " + WRITTEN_ID).count(), 0)))
        else:
            expect(page.get_by_text("Only this authorized instructor can review this text.",
                                    exact=True)).to_be_visible(timeout=15000)
            record("approved_instructor_sees_private_authorized_queue", label, checks,
                   lambda: (assert_equal(fixture.queue_reads > 0, True),
                            assert_equal(fixture.review_writes, []),
                            assert_equal(fixture.grade_finalizations, 0)))
            mark = page.get_by_label("Points for written response " + WRITTEN_ID)
            mark.fill("99")
            record("invalid_written_mark_cannot_be_sent", label, checks,
                   lambda: (assert_equal(page.get_by_role("button", name="Record review").is_disabled(), True),
                            assert_equal(fixture.review_writes, [])))
            mark.fill("3")
            page.get_by_role("button", name="Record review").click()
            # The default Pending filter removes an item when its provisional
            # review succeeds. Switch to Reviewed to inspect the saved record.
            expect(page.get_by_text("0 pending · 1 reviewed in this queue",
                                    exact=False)).to_be_visible(timeout=15000)
            page.get_by_role("button", name="Reviewed", exact=True).click()
            expect(page.get_by_text("Saved provisional review: 3 / 5",
                                    exact=False)).to_be_visible(timeout=15000)
            record("explicit_provisional_review_does_not_finalize_grade", label, checks,
                   lambda: (assert_equal(fixture.review_writes,
                            [{"p_answer_id": WRITTEN_ID, "p_points": 3}]),
                            assert_equal(fixture.grade_finalizations, 0)))
    finally:
        context.close()


def main():
    OUTPUT.unlink(missing_ok=True)
    results = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="chrome")
            try:
                for label, viewport in (
                    ("desktop", {"width": 1440, "height": 900}),
                    ("mobile", {"width": 390, "height": 844}),
                ):
                    result_case(browser, viewport, label, results, grade="pending")
                    result_case(browser, viewport, label, results, grade="finalized")
                    result_case(browser, viewport, label, results, grade="malformed")
                    result_case(browser, viewport, label, results, grade="pending", unauthorized=True)
                    instructor_case(browser, viewport, label, results, approved=False)
                    instructor_case(browser, viewport, label, results, approved=True)
                    instructor_case(browser, viewport, label, results, approved=True, malformed=True)
            finally:
                browser.close()
        assert len(results) == len(CHECKS)*2
        assert all(item["result"] == "passed" for item in results)
        print("PASS: 22 synthetic real-browser results/instructor review checks (desktop + mobile).")
    finally:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps({
            "schema": 1, "suite": "education-private-result-instructor-browser",
            "environment": "local synthetic fixture; no hosted backend",
            "staging_verified": False, "production_verified": False,
            "checks": results,
        }, indent=2)+"\n", encoding="utf8")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("BLOCKED: offline Education results/instructor browser verification. See sanitized check outcomes.")
        raise SystemExit(1)
