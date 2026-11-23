"""Real Chrome acceptance for the public ETERNYX Developer Project Lab.

Default mode: ONLY a loopback Vite preview with disposable browser storage.
Staging mode: explicit --staging and --expected-host for an HTTPS staging host.
No authentication, production deployment, external provider calls or unsafe sandbox bypass.
"""
import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

REPORT = Path("test-results/developer-project-browser-acceptance.json")
PROJECT_KEY = "eternyx:developer-projects:v1"
RECOVERY_KEY = "eternyx:developer-recovery:v1"
API_KEY = "eternyx:developer-project-api-suites:v1"

def target_origin(args):
    parsed = urlsplit(args.base_url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Target must be an origin without paths, credentials, query or fragment.")
    if args.staging:
        if parsed.scheme != "https" or parsed.hostname != args.expected_host:
            raise ValueError("Staging requires HTTPS and an exact --expected-host match.")
        if not any(part in (parsed.hostname or "").lower() for part in ("staging", "stage")):
            raise ValueError("Target does not clearly identify a staging host; refusing remote checks.")
    elif parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost") or parsed.port != 4173:
        raise ValueError("Local mode accepts only http://127.0.0.1:4173 or http://localhost:4173.")
    return parsed.scheme + "://" + parsed.netloc

def store(page, key):
    return page.evaluate("(key) => JSON.parse(localStorage.getItem(key) || '[]')", key)

def open_saved(page):
    page.goto(ORIGIN + "/developer-studio/project-lab")
    page.get_by_role("button", name="Open", exact=True).first.click()
    expect(page.locator("#project-name")).to_have_value("Browser Acceptance Project")

def create_save_reopen(page):
    page.goto(ORIGIN + "/developer-studio/project-lab")
    expect(page.get_by_role("heading", name="Local Project Lab")).to_be_visible()
    expect(page.locator("#project-auto-recovery")).not_to_be_checked()
    expect(page.get_by_text("Select Run preview to render this project")).to_be_visible()
    page.locator("#project-name").fill("Browser Acceptance Project")
    page.get_by_role("group", name="Project files").get_by_role("button", name="app.js").click()
    editor = page.locator("#project-editor")
    assert "addEventListener" in editor.input_value()
    editor.fill(editor.input_value() + "\n// acceptance marker")
    page.get_by_role("button", name="Save browser copy").click()
    expect(page.get_by_role("link", name="Open project API tests")).to_be_visible()
    saved = store(page, PROJECT_KEY)
    assert len(saved) == 1 and saved[0]["name"] == "Browser Acceptance Project"
    assert saved[0]["files"][2]["content"].endswith("// acceptance marker")
    page.reload()
    assert len(store(page, PROJECT_KEY)) == 1
    page.get_by_role("button", name="Open", exact=True).first.click()
    expect(page.locator("#project-name")).to_have_value("Browser Acceptance Project")
    assert not store(page, RECOVERY_KEY), "Recovery must remain default-off"

def editing_and_diagnostics(page):
    page.locator("#project-quick-open").fill("app")
    page.locator("#project-quick-open").press("Enter")
    expect(page.locator("#project-editor")).to_have_value(re.compile("acceptance marker"))
    page.locator("#project-quick-open").fill("")
    page.locator("#add-filename").fill("config.json")
    page.get_by_role("button", name="Add file").click()
    editor = page.locator("#project-editor")
    editor.fill('{"status":"safe","number":2}')
    page.get_by_role("button", name="Format JSON").click()
    expect(editor).to_have_value('{\n  "status": "safe",\n  "number": 2\n}\n')
    page.locator("#project-search-input").fill("number")
    expect(page.get_by_role("button", name="config.json · line 3, col 4")).to_be_visible()
    page.locator("#project-replace-input").fill("count")
    page.get_by_role("button", name="Replace first in active file").click()
    expect(editor).to_have_value(re.compile('"count"'))
    page.get_by_role("button", name="Restore", exact=False).click()
    expect(editor).to_have_value(re.compile('"number"'))
    page.get_by_role("button", name="Duplicate file").click()
    expect(page.get_by_role("group", name="Project files").get_by_role("button", name="config-copy.json")).to_be_visible()
    # Navigation, source edits and formatting remain explicit; no auto-save.
    page.get_by_role("button", name="Save browser copy").click()
    assert len(store(page, PROJECT_KEY)[0]["files"]) == 5

def actual_preflight(page):
    page.get_by_role("group", name="Project files").get_by_role("button", name="app.js").click()
    editor=page.locator("#project-editor")
    original=editor.input_value()
    editor.fill('const sensitiveValue = "DO_NOT_EXPORT_THIS"; function oops( {')
    page.get_by_role("button", name="Run project preflight").click()
    expect(page.get_by_text("Review required or results stale", exact=True)).to_be_visible(timeout=20000)
    expect(page.get_by_text("JS parse issues:", exact=False)).to_be_visible()
    with page.expect_download() as file:
        page.get_by_role("button", name="Export metadata-only preflight").click()
    report=json.loads(Path(file.value.path()).read_text(encoding="utf-8"))
    assert report["errors"] >= 1 and report["previewReadiness"] == "review-required"
    assert "DO_NOT_EXPORT_THIS" not in json.dumps(report)
    editor.fill(original)
    expect(page.get_by_text("Project changed. Previous preflight is stale.")).to_be_visible()
    expect(page.get_by_role("button", name="Export metadata-only preflight")).to_be_disabled()
    page.get_by_role("button", name="Run project preflight").click()
    expect(page.get_by_text("No blocking issues found by these rules", exact=True)).to_be_visible(timeout=20000)
    page.get_by_role("button", name="Save browser copy").click()

def preview_isolation(page):
    assert page.locator('iframe[title="Isolated project preview"]').count() == 0
    page.get_by_role("button", name="Run preview").click()
    frame=page.locator('iframe[title="Isolated project preview"]')
    expect(frame).to_be_visible()
    assert frame.get_attribute("sandbox") == "allow-scripts"
    assert frame.get_attribute("referrerpolicy") == "no-referrer"
    doc=frame.get_attribute("srcdoc")
    assert "connect-src 'none'" in doc and "form-action 'none'" in doc
    assert "worker-src 'none'" in doc
    preview=page.frame_locator('iframe[title="Isolated project preview"]')
    expect(preview.locator("#message")).to_have_text("Try editing these files.")
    # The HTML renders before the trailing inline app.js attaches its click handler.
    # Wait for the sandboxed document load so a fast desktop click is meaningful.
    preview.locator("#hello").evaluate("""element => new Promise(resolve => {
      const doc = element.ownerDocument;
      if (doc.readyState === "complete") return resolve(true);
      doc.defaultView.addEventListener("load", () => resolve(true), { once: true });
    })""")
    preview.locator("#hello").click()
    expect(preview.locator("#message")).to_have_text("Hello from the isolated preview!")
    page.get_by_role("group", name="Project files").get_by_role("button", name="index.html").click()
    editor=page.locator("#project-editor")
    editor.fill(editor.input_value() + "<!-- newer -->")
    expect(page.get_by_text("Preview is older than your current files")).to_be_visible()

def recovery_and_tamper(page):
    # Export only happens on click, and never leaks into the browser acceptance artifact.
    with page.expect_download() as exported:
        page.get_by_role("button", name="Export verified backup").click()
    raw=Path(exported.value.path()).read_text(encoding="utf-8")
    data=json.loads(raw)
    assert len(data["checksum"]) == 64
    assert data["project"]["name"] == "Browser Acceptance Project"
    bad=json.loads(raw)
    bad["project"]["name"]="Changed without rehash"
    page.locator("#project-backup-import").fill(json.dumps(bad))
    page.get_by_role("button", name="Verify and import backup").click()
    expect(page.get_by_text("Backup checksum mismatch.", exact=False)).to_be_visible()
    assert page.locator("#project-name").input_value() == "Browser Acceptance Project"
    page.locator("#project-backup-import").fill(raw)
    page.get_by_role("button", name="Verify and import backup").click()
    expect(page.get_by_text("Imported and checksum-verified the project.", exact=False)).to_be_visible()
    assert page.locator('iframe[title="Isolated project preview"]').count() == 0
    page.locator("#project-auto-recovery").check()
    page.get_by_role("group", name="Project files").get_by_role("button", name="index.html").click()
    page.locator("#project-editor").fill("<main><h1>Recoverable draft</h1></main>")
    page.wait_for_function("(key) => { try { const records=JSON.parse(localStorage.getItem(key)||'[]'); return records.length > 0; } catch { return false; } }", arg=RECOVERY_KEY, timeout=12000)
    entries=store(page, RECOVERY_KEY)
    assert entries[0]["project"]["files"][0]["content"] == "<main><h1>Recoverable draft</h1></main>"
    page.get_by_role("button", name="Verify & restore").first.click()
    expect(page.get_by_text("Checksum verified and project restored.", exact=False)).to_be_visible()
    expect(page.locator("#project-auto-recovery")).not_to_be_checked()

def api_project_link(page, staging):
    page.get_by_role("button", name="Save browser copy").click()
    page.get_by_role("link", name="Open project API tests").click()
    expect(page).to_have_url(re.compile(r"/developer-studio/api-workbench\?projectId="))
    expect(page.get_by_role("heading", name="Project-linked API smoke tests")).to_be_visible()
    expect(page.locator("#linked-project")).to_have_value(store(page, PROJECT_KEY)[0]["id"])
    page.locator("#api-scenario-name").fill("Own-origin health")
    page.locator("#api-url").fill(ORIGIN + "/?session=PRIVATE_TOKEN")
    page.get_by_role("button", name="Save current request as check").click()
    saved=store(page, API_KEY)
    assert len(saved) == 1 and saved[0]["url"] == ORIGIN + "/"
    assert "PRIVATE_TOKEN" not in json.dumps(saved)
    # A real HTTP GET runs only against the disposable local preview; never
    # send any requests in staging acceptance without separate operator consent.
    if not staging:
        page.get_by_role("button", name="Run selected project suite").click()
        expect(page.get_by_text("Actual results:", exact=False)).to_be_visible(timeout=15000)
        with page.expect_download() as exported:
            page.get_by_role("button", name="Export sanitized results").click()
        report=json.loads(Path(exported.value.path()).read_text(encoding="utf-8"))
        assert report["summary"]["total"] == 1
        assert report["summary"]["passed"] == 1
        assert "session" not in json.dumps(report)
        assert "PRIVATE_TOKEN" not in json.dumps(report)

def malformed_import_rejected(page):
    page.goto(ORIGIN + "/developer-studio/project-lab")
    page.get_by_role("button", name="Open", exact=True).first.click()
    before=len(store(page, PROJECT_KEY))
    bad={"schema":"eternyx-developer-project-v1","name":"Evil","files":[{"name":"../secrets.js","content":"x"}]}
    page.locator("#project-import").fill(json.dumps(bad))
    page.get_by_role("button", name="Import project", exact=True).click()
    expect(page.get_by_text("File names must be simple names", exact=False)).to_be_visible()
    assert len(store(page, PROJECT_KEY)) == before
    assert page.locator("#project-name").input_value() == "Browser Acceptance Project"

def execute(label, fn, viewport):
    try:
        fn()
        CASES.append({"case":label,"viewport":viewport,"result":"passed"})
        print("Developer acceptance:",label,viewport,"passed",flush=True)
    except Exception:
        CASES.append({"case":label,"viewport":viewport,"result":"failed"})
        raise

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url",required=True)
    parser.add_argument("--staging",action="store_true",help="Run against an explicitly confirmed HTTPS staging host")
    parser.add_argument("--expected-host",default="",help="Required exact staging hostname (independent operator check)")
    args=parser.parse_args()
    ORIGIN=target_origin(args)
    CASES=[]
    try:
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(channel="chrome")
            try:
                for width,height in ((390,844),(1440,900)):
                    viewport=f"{width}x{height}"
                    context=browser.new_context(viewport={"width":width,"height":height},accept_downloads=True,
                                                reduced_motion="reduce")
                    def external(route):
                        url=urlsplit(route.request.url)
                        if url.scheme not in ("http","https") or url.netloc != urlsplit(ORIGIN).netloc:
                            return route.abort()
                        return route.continue_()
                    context.route("**/*",external)
                    page=context.new_page()
                    page.on("dialog",lambda dialog: dialog.accept())
                    try:
                        execute("create-save-reload-reopen",lambda: create_save_reopen(page),viewport)
                        execute("editor-search-format-replace-restore",lambda: editing_and_diagnostics(page),viewport)
                        execute("js-preflight-source-free-report",lambda: actual_preflight(page),viewport)
                        execute("explicit-isolated-preview",lambda: preview_isolation(page),viewport)
                        execute("checksum-recovery-and-tamper",lambda: recovery_and_tamper(page),viewport)
                        execute("project-linked-api-suite",lambda: api_project_link(page,args.staging),viewport)
                        execute("unsafe-import-rejected",lambda: malformed_import_rejected(page),viewport)
                    finally:
                        context.close()
            finally:
                browser.close()
    finally:
        REPORT.parent.mkdir(parents=True,exist_ok=True)
        REPORT.write_text(json.dumps({
            "schema":"eternyx-developer-browser-acceptance-v1",
            "environment":"operator-specified staging" if args.staging else "local Vite preview",
            "production_verified":False,
            "staging_executed":bool(args.staging),
            "browser":"Chrome",
            "commit":os.getenv("GITHUB_SHA","local-unknown"),
            "cases":CASES,
            "note":"Only case names/outcomes recorded; project source, URLs, tokens and downloaded artifacts excluded.",
        },indent=2)+"\n",encoding="utf-8")
