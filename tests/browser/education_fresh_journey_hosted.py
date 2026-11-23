"""Manual staging-only browser proof of the SAME fresh submitted and finalized CBT.

Reads a private mode-0600 handoff written only after a successful backend
journey. Never uploads attempt IDs, grades, Auth credentials, or answer text.
"""
import json
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright
from education_hosted_readonly import (
    guard_request, login, expect_ledger_grade, expect_denied,
)

PRIVATE=Path("test-results/education-journey-ui-target-private.json")
REPORT=Path("test-results/education-hosted-fresh-journey-browser.json")
CASES=(
    "desktop_student_a_new_final_grade",
    "desktop_student_b_cannot_read_new_attempt",
    "mobile_student_a_new_final_grade",
    "mobile_student_b_cannot_read_new_attempt",
    "no_unapproved_network_writes",
    "no_external_browser_egress",
)
KEYS=frozenset((
    "schema","source_sha","github_run_id","github_run_attempt",
    "fresh_attempt_id","expected_score","expected_max",
))
UUID=re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",re.I)


def validate(env,target):
    assert isinstance(target,dict) and set(target)==KEYS
    assert target["schema"]==1
    assert UUID.fullmatch(target["fresh_attempt_id"])
    assert target["source_sha"]==env.get("GITHUB_SHA")
    assert target["github_run_id"]==env.get("GITHUB_RUN_ID")
    assert target["github_run_attempt"]==env.get("GITHUB_RUN_ATTEMPT")
    assert env.get("GITHUB_REF")=="refs/heads/main"
    assert env.get("GITHUB_REPOSITORY")=="sunnybai72592/eternyx-haunted-hollow"
    assert env.get("ETERNYX_EDU_RELEASE_MODE")=="journey"
    assert env.get("ETERNYX_EDU_JOURNEY_APPROVAL")=="I_APPROVE_SINGLE_STAGING_EXAM_FULL_JOURNEY"
    assert env.get("ETERNYX_EDU_JOURNEY_BROWSER_READ_APPROVAL")=="I_APPROVE_READ_ONLY_FRESH_STAGING_RESULT"
    ref=env.get("ETERNYX_RLS_STAGING_REF","")
    assert re.fullmatch(r"[a-z0-9]{20}",ref,re.I)
    assert ref.lower()!=env.get("ETERNYX_RLS_PRODUCTION_REF","").lower()
    assert re.fullmatch(r"[0-9a-f]{40}",env.get("GITHUB_SHA",""))
    assert all(re.fullmatch(r"[1-9][0-9]*",env.get(k,"")) for k in
               ("GITHUB_RUN_ID","GITHUB_RUN_ATTEMPT"))
    for k in ("ETERNYX_RLS_TEST_A_EMAIL","ETERNYX_RLS_TEST_A_PASSWORD",
              "ETERNYX_RLS_TEST_B_EMAIL","ETERNYX_RLS_TEST_B_PASSWORD"):
        assert env.get(k)
    for name in ("ETERNYX_EDU_FINALIZE_EXPECTED_SCORE",
                 "ETERNYX_EDU_FINALIZE_EXPECTED_MAX"):
        assert re.fullmatch(r"(0|[1-9][0-9]{0,5})",env.get(name,""))
    score=int(env["ETERNYX_EDU_FINALIZE_EXPECTED_SCORE"])
    max_score=int(env["ETERNYX_EDU_FINALIZE_EXPECTED_MAX"])
    assert 0<=score<=max_score<=100000 and max_score>0
    assert target["expected_score"]==score and target["expected_max"]==max_score
    assert isinstance(target["expected_score"],int) and not isinstance(target["expected_score"],bool)
    assert isinstance(target["expected_max"],int) and not isinstance(target["expected_max"],bool)
    return ref+".supabase.co"


def run():
    REPORT.unlink(missing_ok=True)
    outcomes={case:False for case in CASES}
    violations=[]
    env=os.environ
    # Never open the protected browser before verifying the private handoff.
    target=json.loads(PRIVATE.read_text(encoding="utf8"))
    staging_host=validate(env,target)
    attempt_id=target["fresh_attempt_id"]
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            for label,viewport in (
                ("desktop",{"width":1440,"height":900}),
                ("mobile",{"width":390,"height":844}),
            ):
                for role,email,password in (
                    ("student_a",env["ETERNYX_RLS_TEST_A_EMAIL"],
                     env["ETERNYX_RLS_TEST_A_PASSWORD"]),
                    ("student_b",env["ETERNYX_RLS_TEST_B_EMAIL"],
                     env["ETERNYX_RLS_TEST_B_PASSWORD"]),
                ):
                    context=browser.new_context(viewport=viewport,reduced_motion="reduce")
                    page=context.new_page()
                    page.set_default_timeout(15000)
                    page.route("**/*",lambda route:guard_request(route,staging_host,violations))
                    try:
                        login(page,email,password)
                        if role=="student_a":
                            expect_ledger_grade(page,attempt_id,target["expected_score"],
                                                target["expected_max"])
                            outcomes[label+"_student_a_new_final_grade"]=True
                        else:
                            expect_denied(page,attempt_id)
                            outcomes[label+"_student_b_cannot_read_new_attempt"]=True
                    finally:
                        context.close()
        finally:
            browser.close()
    outcomes["no_unapproved_network_writes"]="unexpected_remote_write" not in violations
    outcomes["no_external_browser_egress"]="unapproved_network_egress" not in violations
    if not all(outcomes.values()):
        raise RuntimeError("staging browser acceptance blocked")
    return outcomes


def main():
    outcome={case:False for case in CASES}
    status="blocked"
    try:
        outcome=run()
        status="passed"
        print("PASS: owner-only real browser view for one fresh staging graded attempt.")
    except Exception:
        print("BLOCKED: real staging new-attempt browser result or student isolation.")
        raise SystemExit(1)
    finally:
        REPORT.parent.mkdir(parents=True,exist_ok=True)
        # No attempt ID, score, account or request URL is ever in an artifact.
        REPORT.write_text(json.dumps({
            "schema":1,"suite":"education-hosted-fresh-journey-browser",
            "environment":"isolated-supabase-staging",
            "source_sha":os.environ.get("GITHUB_SHA",""),
            "github_run_id":os.environ.get("GITHUB_RUN_ID",""),
            "github_run_attempt":os.environ.get("GITHUB_RUN_ATTEMPT",""),
            "result":status,"read_only":True,
            "fresh_attempt_verified":status=="passed",
            "production_tested":False,"production_release_approved":False,
            "checks":[{"check":name,"result":"passed" if outcome[name] else "blocked"}
                      for name in CASES],
        },indent=2)+"\n",encoding="utf8")


if __name__=="__main__":
    main()
