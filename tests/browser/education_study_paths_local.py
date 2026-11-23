"""Real Chrome proof of local Study Paths: author, read, complete, export and restore.

Uses only 127.0.0.1 preview; all other network destinations are aborted.
No Supabase credentials, authentic learner content, screenshots or traces.
"""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright

BASE="http://127.0.0.1:4173"
REPORT=Path("test-results/education-study-paths-local-browser.json")
CHECKS=(
    "author_real_lesson_and_export_path",
    "unanswered_lesson_cannot_be_marked_complete",
    "activity_reflection_enables_manual_completion",
    "private_resume_roundtrip_restores_progress",
    "safe_csv_export_neutralizes_formulas",
    "privileged_key_import_fails_closed",
    "no_private_study_data_sent_to_external_hosts",
)
SENSITIVE="=WEBSERVICE"

def check(out,label,name,condition):
    if not condition:
        raise AssertionError("Local study path acceptance condition blocked")
    out.append({"viewport":label,"check":name,"result":"passed"})


def exercise(browser,label,viewport,out):
    context=browser.new_context(viewport=viewport,reduced_motion="reduce",accept_downloads=True)
    page=context.new_page()
    page.set_default_timeout(15000)
    leaked=[]
    blocked_hosts=[]

    def guard(route):
        request=route.request
        url=urlsplit(request.url)
        if url.scheme=="http" and url.hostname=="127.0.0.1" and url.port==4173:
            route.continue_()
        else:
            value=request.url+"\n"+(request.post_data or "")
            if SENSITIVE in value or "Private observation notes" in value:
                leaked.append("sensitive_offsite_request")
            blocked_hosts.append("third_party_denied")
            route.abort()

    page.route("**/*",guard)
    try:
        page.goto(BASE+"/education/study-paths",wait_until="domcontentloaded")
        expect(page.get_by_role("heading",name="Study Paths",exact=True)).to_be_visible()
        page.get_by_role("button",name="Create lesson pack").click()
        page.locator("#study-author-title").fill("Local CP Learning Path")
        page.locator("#study-author-description").fill("One actual author-written lesson.")
        page.get_by_role("button",name="Add lesson").click()
        page.locator("#study-author-title").last.fill("Reference Electrode Basics")
        page.locator("#study-author-objective").fill("Describe the role of a reference electrode.")
        page.locator("#study-author-reading").fill(
            "A reference electrode provides a stable potential against which a structure is measured. "
            "Surface conditions and instrument connection affect interpretation."
        )
        page.locator("#study-author-activity_prompt").fill(
            "Record a potential measurement from a safe simulated example."
        )
        page.locator("#study-author-reflection_prompt").fill(
            "What factors can change your measurement?"
        )
        expect(page.get_by_role("button",name="Export validated path (.json)")).to_be_enabled()
        with page.expect_download() as result:
            page.get_by_role("button",name="Export validated path (.json)").click()
        pack=json.loads(Path(result.value.path()).read_text(encoding="utf8"))
        check(out,label,"author_real_lesson_and_export_path",
              pack["format"]=="eternyx-local-study-path" and
              len(pack["lessons"])==1 and
              pack["lessons"][0]["title"]=="Reference Electrode Basics" and
              "correct" not in pack["lessons"][0] and
              "score" not in pack)

        page.get_by_role("button",name="Open this path for study").click()
        expect(page.get_by_text("A reference electrode provides a stable potential",exact=False)).to_be_visible()
        check(out,label,"unanswered_lesson_cannot_be_marked_complete",
              page.get_by_role("button",name="Mark lesson complete").is_disabled())

        page.locator("#study-activity").fill(SENSITIVE+'("https://example.invalid")')
        page.locator("#study-reflection").fill("Stable reference points help comparisons.")
        page.locator("#study-private-note").fill("@SUM(1,2) Private observation notes")
        page.get_by_role("button",name="Flag for review").click()
        page.get_by_role("button",name="Mark lesson complete").click()
        expect(page.get_by_role("button",name="Reopen lesson")).to_be_visible()
        check(out,label,"activity_reflection_enables_manual_completion",
              page.get_by_role("progressbar",name="Manually completed lessons").get_attribute("aria-valuenow")=="1")

        with page.expect_download() as result:
            page.get_by_role("button",name="Save study resume (.json)").click()
        resume_text=Path(result.value.path()).read_text(encoding="utf8")
        saved=json.loads(resume_text)
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_text("No study path loaded")).to_be_visible()
        page.get_by_label("Choose ETERNYX study path JSON or resume").set_input_files({
            "name":"resume.json","mimeType":"application/json","buffer":resume_text.encode("utf8")
        })
        expect(page.get_by_role("button",name="Reopen lesson")).to_be_visible()
        check(out,label,"private_resume_roundtrip_restores_progress",
              saved["format"]=="eternyx-local-study-session" and
              saved["records"][0]["completed"] is True and
              saved["records"][0]["flagged"] is True and
              page.locator("#study-private-note").input_value()=="@SUM(1,2) Private observation notes")

        with page.expect_download() as result:
            page.get_by_role("button",name="Export private notes (.csv)").click()
        csv=Path(result.value.path()).read_text(encoding="utf8")
        check(out,label,"safe_csv_export_neutralizes_formulas",
              "'=WEBSERVICE" in csv and "'@SUM" in csv and
              '"Not graded"' in csv and "Official grade" not in csv)

        forged=json.loads(json.dumps(pack))
        forged["lessons"][0]["correct_answer"]="SECRET"
        page.once("dialog",lambda d:d.accept())
        page.get_by_label("Choose ETERNYX study path JSON or resume").set_input_files({
            "name":"untrusted.json","mimeType":"application/json",
            "buffer":json.dumps(forged).encode("utf8")
        })
        expect(page.get_by_text("Import rejected.",exact=False)).to_be_visible()
        check(out,label,"privileged_key_import_fails_closed",
              page.get_by_role("button",name="Reopen lesson").is_visible())

        check(out,label,"no_private_study_data_sent_to_external_hosts",
              leaked==[] and len(blocked_hosts)>=0)
    finally:
        context.close()


def main():
    REPORT.unlink(missing_ok=True)
    outcomes=[]
    try:
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(channel="chrome")
            try:
                for label,viewport in (
                    ("desktop",{"width":1440,"height":900}),
                    ("mobile",{"width":390,"height":844}),
                ):
                    exercise(browser,label,viewport,outcomes)
            finally:
                browser.close()
        assert len(outcomes)==len(CHECKS)*2
        print("PASS: 14 real desktop/mobile local Study Paths browser checks; no external study-data egress.")
    except Exception:
        print("BLOCKED: local Study Paths authoring, progress, export or import browser checks.")
        raise SystemExit(1)
    finally:
        REPORT.parent.mkdir(parents=True,exist_ok=True)
        REPORT.write_text(json.dumps({
            "schema":1,"suite":"education-local-study-paths-browser",
            "environment":"local synthetic preview; no hosted backend",
            "staging_tested":False,"production_tested":False,
            "checks":outcomes,
        },indent=2)+"\n",encoding="utf8")


if __name__=="__main__":
    main()
