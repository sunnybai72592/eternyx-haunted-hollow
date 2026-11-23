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
})
CASES = (
    "desktop_student_a_authenticated_history",
    "desktop_student_a_verified_final",
    "desktop_student_b_denied_a_result",
    "desktop_instructor_verified_private_workspace",
    "mobile_student_a_authenticated_history",
    "mobile_student_a_verified_final",
    "mobile_student_b_denied_a_result",
    "mobile_instructor_verified_private_workspace",
    "no_unapproved_remote_writes",
)
EVIDENCE = Path("test-results/education-hosted-browser-readonly.json")


def guard_request(route, staging_host, violations):
    request = route.request
    url = urlsplit(request.url)
    host = (url.hostname or "").lower()
    method = request.method.upper()
    if host.endswith(".supabase.co") and host != staging_host:
        violations.append("foreign_supabase_host")
        route.abort()
        return
    # Never send unintended writes to ANY host. In addition to the staging
    # Supabase API, this blocks hidden third-party and preview backend writes.
    if method not in ("GET", "HEAD", "OPTIONS"):
        path = url.path
        allowed_auth = (host == staging_host and
                        method == "POST" and path == "/auth/v1/token")
        allowed_rpc = (host == staging_host and method == "POST" and
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


def exercise(browser, label, viewport, env, staging_host, outcomes, violations):
    identities = (
        ("student_a", env["ETERNYX_RLS_TEST_A_EMAIL"], env["ETERNYX_RLS_TEST_A_PASSWORD"]),
        ("student_b", env["ETERNYX_RLS_TEST_B_EMAIL"], env["ETERNYX_RLS_TEST_B_PASSWORD"]),
        ("instructor", env["ETERNYX_RLS_INSTRUCTOR_EMAIL"], env["ETERNYX_RLS_INSTRUCTOR_PASSWORD"]),
    )
    for identity, email, password in identities:
        # Independent incognito browser contexts enforce account boundaries.
        context = browser.new_context(viewport=viewport, reduced_motion="reduce")
        page = context.new_page()
        page.set_default_timeout(15000)
        page.route("**/*", lambda route: guard_request(route, staging_host, violations))
        try:
            login(page, email, password)
            if identity == "student_a":
                outcomes[label + "_student_a_authenticated_history"] = True
                page.goto(ORIGIN + "/test-results/" + env["ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT"],
                          wait_until="domcontentloaded")
                expect(page.get_by_role("heading", name="Assessment results")).to_be_visible()
                expect(page.get_by_text("Verified final grade", exact=False)).to_be_visible(timeout=20000)
                outcomes[label + "_student_a_verified_final"] = True
            elif identity == "student_b":
                page.goto(ORIGIN + "/test-results/" + env["ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT"],
                          wait_until="domcontentloaded")
                expect(page.get_by_text(
                    "The attempt could not be loaded. Check your access or retry.",
                    exact=False
                )).to_be_visible(timeout=20000)
                assert page.get_by_text("Verified final grade", exact=False).count() == 0
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
    assert env.get("ETERNYX_EDU_BROWSER_READ_APPROVAL") == "I_APPROVE_EDUCATION_STAGING_BROWSER_READ_ONLY"
    required = (
        "ETERNYX_RLS_TEST_A_EMAIL", "ETERNYX_RLS_TEST_A_PASSWORD",
        "ETERNYX_RLS_TEST_B_EMAIL", "ETERNYX_RLS_TEST_B_PASSWORD",
        "ETERNYX_RLS_INSTRUCTOR_EMAIL", "ETERNYX_RLS_INSTRUCTOR_PASSWORD",
        "ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT",
    )
    assert all(env.get(key) for key in required)
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
        outcomes["no_unapproved_remote_writes"] = not violations
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
        print("PASS: Eight authenticated desktop/mobile staging Education browser checks; no remote writes.")
    except Exception:
        print("BLOCKED: staging Education browser read-only acceptance. See sanitized check-name artifact.")
        raise SystemExit(1)
