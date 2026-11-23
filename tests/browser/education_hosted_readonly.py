"""Manual, staging-only real-browser Education acceptance. No exam writes.

No URL, token, email, password, grade, user response, or screenshot enters evidence.
The browser uses live staging Auth but blocks all non-read-only database calls.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ORIGIN = "http://127.0.0.1:4173"
READ_RPCS = frozenset({
    "education_student_enrolled_catalog",
    "education_student_verified_result",
    "education_instructor_access",
    "education_instructor_list_drafts",
    "education_instructor_written_review_queue",
    "is_admin",  # authorization lookup is a read-only RPC, not a grade write
})
CASES = (
    "desktop_student_a_authenticated_history",
    "desktop_student_a_verified_final",
    "desktop_student_a_pending_no_score",
    "desktop_student_a_running_no_score",
    "desktop_student_a_legacy_no_score",
    "desktop_student_a_denied_b_result",
    "desktop_student_b_authenticated_history",
    "desktop_student_b_owned_final",
    "desktop_student_b_denied_a_result",
    "desktop_instructor_verified_private_workspace",
    "mobile_student_a_authenticated_history",
    "mobile_student_a_verified_final",
    "mobile_student_a_pending_no_score",
    "mobile_student_a_running_no_score",
    "mobile_student_a_legacy_no_score",
    "mobile_student_a_denied_b_result",
    "mobile_student_b_authenticated_history",
    "mobile_student_b_owned_final",
    "mobile_student_b_denied_a_result",
    "mobile_instructor_verified_private_workspace",
    "no_unapproved_remote_writes",
    "no_unapproved_network_egress",
)
EVIDENCE = Path("test-results/education-hosted-browser-readonly.json")


def guard_request(route, staging_host, violations):
    """Allow only loopback preview and exact TLS staging host.

    All other egress (even GET with private data in the URL) is blocked.
    Only password Auth and narrowly enumerated read-only RPC POSTs are sent.
    The optional public sign-in visitor RPC is aborted without reaching the
    network; its appearance on a private page is a security violation.
    """
    request = route.request
    url = urlsplit(request.url)
    host = (url.hostname or "").lower()
    method = request.method.upper()
    try:
        port = url.port
    except ValueError:
        port = -1
    local = url.scheme == "http" and host == "127.0.0.1" and port == 4173
    staging = (url.scheme == "https" and host == staging_host and
               port in (None, 443))
    if not (local or staging):
        violations.append("unapproved_network_egress")
        if method not in ("GET", "HEAD", "OPTIONS"):
            violations.append("unexpected_remote_write")
        route.abort()
        return
    path = url.path
    if staging and method == "POST" and path == "/rest/v1/rpc/visitor_presence":
        try:
            initiator_path = urlsplit(request.frame.url).path
        except Exception:
            initiator_path = ""
        # A public login page may have started a presence poll. Abort it.
        # The application must never poll visitor presence on private pages.
        if initiator_path != "/auth":
            violations.append("unexpected_remote_write")
        route.abort()
        return
    if method not in ("GET", "HEAD", "OPTIONS"):
        allowed_auth = staging and method == "POST" and path == "/auth/v1/token"
        allowed_rpc = (staging and method == "POST" and
                       path.startswith("/rest/v1/rpc/") and
                       path[len("/rest/v1/rpc/"):] in READ_RPCS)
        if not (allowed_auth or allowed_rpc):
            violations.append("unexpected_remote_write")
            route.abort()
            return
    route.continue_()

def login(page, email, password):
    page.goto(ORIGIN + "/auth?redirect=%2Feducation", wait_until="domcontentloaded")
    page.get_by_label("Email address", exact=True).fill(email)
    page.get_by_label("Password", exact=True).fill(password)
    page.get_by_role("button", name="Sign in to ETERNYX", exact=True).click()
    # Never navigate away while the actual password-login promise is pending.
    # React Router changes the URL only once the staging Auth session succeeds.
    page.wait_for_url(ORIGIN + "/education", timeout=20000)
    page.goto(ORIGIN + "/education/history", wait_until="domcontentloaded")
    expect(page.get_by_role("heading", name="My assessments", exact=True)).to_be_visible(timeout=20000)
    # Require a protected-route session, not a public Education landing page.
    assert "/auth" not in page.url, "protected history redirected to sign-in"


def open_result(page, attempt_id):
    page.goto(ORIGIN + "/test-results/" + attempt_id, wait_until="domcontentloaded")
    expect(page.get_by_role("heading", name="Assessment results")).to_be_visible(timeout=20000)


def expect_ledger_grade(page, attempt_id, score, max_score):
    open_result(page, attempt_id)
    expect(page.get_by_text("Verified final grade", exact=False)).to_be_visible(timeout=20000)
    # Only the real verified receipt may supply this exact approved value.
    expect(page.get_by_text(f"{score} / {max_score}", exact=True)).to_be_visible(timeout=20000)


def expect_no_grade(page, attempt_id, completed=True):
    open_result(page, attempt_id)
    message = ("The attempt has been submitted, but an official score has not been recorded yet."
               if completed else
               "The attempt is still in progress. Results are not yet available.")
    expect(page.get_by_text(message, exact=False)).to_be_visible(timeout=20000)
    assert page.get_by_text("Verified final grade", exact=False).count() == 0
    assert page.get_by_role("progressbar").count() == 0


def expect_denied(page, attempt_id):
    open_result(page, attempt_id)
    expect(page.get_by_text(
        "The attempt could not be loaded. Check your access or retry.",
        exact=False
    )).to_be_visible(timeout=20000)
    assert page.get_by_text("Verified final grade", exact=False).count() == 0
    assert page.get_by_role("progressbar").count() == 0


def exercise(browser, label, viewport, env, staging_host, outcomes, violations):
    identities = (
        ("student_a", env["ETERNYX_RLS_TEST_A_EMAIL"], env["ETERNYX_RLS_TEST_A_PASSWORD"]),
        ("student_b", env["ETERNYX_RLS_TEST_B_EMAIL"], env["ETERNYX_RLS_TEST_B_PASSWORD"]),
        ("instructor", env["ETERNYX_RLS_INSTRUCTOR_EMAIL"], env["ETERNYX_RLS_INSTRUCTOR_PASSWORD"]),
    )
    final_a = env["ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT"]
    final_b = env["ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT"]
    expected_a = (int(env["ETERNYX_EDU_RESULT_A_SCORE"]), int(env["ETERNYX_EDU_RESULT_A_MAX"]))
    expected_b = (int(env["ETERNYX_EDU_RESULT_B_SCORE"]), int(env["ETERNYX_EDU_RESULT_B_MAX"]))
    for identity, email, password in identities:
        # Separate incognito contexts: no session, grading or answer cache reuse.
        context = browser.new_context(viewport=viewport, reduced_motion="reduce")
        page = context.new_page()
        page.set_default_timeout(15000)
        page.route("**/*", lambda route: guard_request(route, staging_host, violations))
        try:
            login(page, email, password)
            if identity == "student_a":
                outcomes[label + "_student_a_authenticated_history"] = True
                expect_ledger_grade(page, final_a, *expected_a)
                outcomes[label + "_student_a_verified_final"] = True
                expect_no_grade(page, env["ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT"])
                outcomes[label + "_student_a_pending_no_score"] = True
                expect_no_grade(page, env["ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT"], completed=False)
                outcomes[label + "_student_a_running_no_score"] = True
                expect_no_grade(page, env["ETERNYX_EDU_RESULT_LEGACY_A_ATTEMPT"])
                outcomes[label + "_student_a_legacy_no_score"] = True
                expect_denied(page, final_b)
                outcomes[label + "_student_a_denied_b_result"] = True
            elif identity == "student_b":
                outcomes[label + "_student_b_authenticated_history"] = True
                expect_ledger_grade(page, final_b, *expected_b)
                outcomes[label + "_student_b_owned_final"] = True
                expect_denied(page, final_a)
                outcomes[label + "_student_b_denied_a_result"] = True
            else:
                page.goto(ORIGIN + "/education/question-bank", wait_until="domcontentloaded")
                expect(page.get_by_role("heading", name="Verified instructor workspace")).to_be_visible()
                expect(page.get_by_text("Approved instructor access verified.", exact=False)).to_be_visible(
                    timeout=20000
                )
                outcomes[label + "_instructor_verified_private_workspace"] = True
        finally:
            context.close()

def run():
    EVIDENCE.unlink(missing_ok=True)
    outcomes = {case: False for case in CASES}
    violations = []
    env = os.environ
    sha = env.get("GITHUB_SHA", "")
    run_id = env.get("GITHUB_RUN_ID", "")
    attempt = env.get("GITHUB_RUN_ATTEMPT", "")
    ref = env.get("ETERNYX_RLS_STAGING_REF", "")
    assert len(sha) == 40 and all(c in "0123456789abcdef" for c in sha)
    assert run_id.isdecimal() and int(run_id) > 0
    assert attempt.isdecimal() and int(attempt) > 0
    assert len(ref) == 20 and ref.isalnum()
    assert ref.lower() != env.get("ETERNYX_RLS_PRODUCTION_REF", "").lower()
    assert env.get("GITHUB_REF") == "refs/heads/main"
    assert env.get("GITHUB_REPOSITORY") == "sunnybai72592/eternyx-haunted-hollow"
    assert env.get("ETERNYX_EDU_BROWSER_READ_APPROVAL") == "I_APPROVE_EDUCATION_STAGING_BROWSER_READ_ONLY"
    required = (
        "ETERNYX_RLS_TEST_A_EMAIL", "ETERNYX_RLS_TEST_A_PASSWORD",
        "ETERNYX_RLS_TEST_B_EMAIL", "ETERNYX_RLS_TEST_B_PASSWORD",
        "ETERNYX_RLS_INSTRUCTOR_EMAIL", "ETERNYX_RLS_INSTRUCTOR_PASSWORD",
        "ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT",
        "ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT",
        "ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT",
        "ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT",
        "ETERNYX_EDU_RESULT_LEGACY_A_ATTEMPT",
        "ETERNYX_EDU_RESULT_A_SCORE", "ETERNYX_EDU_RESULT_A_MAX",
        "ETERNYX_EDU_RESULT_B_SCORE", "ETERNYX_EDU_RESULT_B_MAX",
    )
    assert all(env.get(key) for key in required)
    marks = [env[key] for key in ("ETERNYX_EDU_RESULT_A_SCORE",
                                  "ETERNYX_EDU_RESULT_A_MAX",
                                  "ETERNYX_EDU_RESULT_B_SCORE",
                                  "ETERNYX_EDU_RESULT_B_MAX")]
    assert all(m.isdecimal() and len(m) <= 6 for m in marks)
    a, a_max, b, b_max = map(int, marks)
    assert 0 <= a <= a_max <= 100000 and 0 <= b <= b_max <= 100000
    assert a_max > 0 and b_max > 0
    staging_host = ref + ".supabase.co"
    failed_phase = "startup"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                for label, viewport in (
                    ("desktop", {"width": 1440, "height": 900}),
                    ("mobile", {"width": 390, "height": 844}),
                ):
                    failed_phase = label + "_read_only_journey"
                    exercise(browser, label, viewport, env, staging_host, outcomes, violations)
            finally:
                browser.close()
        outcomes["no_unapproved_remote_writes"] = "unexpected_remote_write" not in violations
        outcomes["no_unapproved_network_egress"] = "unapproved_network_egress" not in violations
        if not all(outcomes.values()):
            failed_phase = "unexpected_remote_write" if violations else "incomplete_journey"
            raise RuntimeError("blocked")
    except Exception:
        # Deliberately no Playwright exception content: may expose account/email/URLs.
        failed_phase = failed_phase if failed_phase in (
            "desktop_read_only_journey", "mobile_read_only_journey",
            "unexpected_remote_write", "incomplete_journey"
        ) else "startup"
        raise RuntimeError(failed_phase) from None
    finally:
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "schema": 1,
            "suite": "education-real-staging-browser-readonly",
            "source_sha": sha,
            "github_run_id": run_id,
            "github_run_attempt": attempt,
            "environment": "isolated-supabase-staging",
            "read_only": True,
            "production_tested": False,
            "production_release_approved": False,
            "result": "passed" if all(outcomes.values()) else "blocked",
            "checks": [
                {"check": case, "result": "passed" if outcomes[case] else "blocked"}
                for case in CASES
            ],
        }
        EVIDENCE.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    try:
        run()
        print("PASS: 22 real staging browser boundary checks, no unauthorized requests.")
    except Exception:
        print("BLOCKED: staging Education browser read-only acceptance. See sanitized check-name artifact.")
        raise SystemExit(1)
