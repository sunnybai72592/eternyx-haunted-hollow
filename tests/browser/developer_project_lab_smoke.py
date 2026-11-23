"""Real Chrome acceptance for the public ETERNYX Developer Project Lab.

Default mode: ONLY a loopback Vite preview with disposable browser storage.
Staging mode: explicit --staging and --expected-host for an HTTPS staging host.
No authentication, production deployment, external provider calls or unsafe sandbox bypass.
"""
import argparse
import json
import os
import ipaddress
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

REPORT = Path("test-results/developer-project-browser-acceptance.json")
PROJECT_KEY = "eternyx:developer-projects:v1"
RECOVERY_KEY = "eternyx:developer-recovery:v1"
API_KEY = "eternyx:developer-project-api-suites:v1"
TEST_PLAN_KEY = "eternyx:developer-local-tests:v1"
RELEASE_OBSERVATIONS = []
RUNTIME_ERRORS = []
ASSET_FAILURES = []
HEADER_OBSERVATIONS = []
NETWORK_AUDIT = {"blocked_external_requests": 0, "blocked_write_attempts": 0}

def on_runtime_error(error):
    # Record categories only; exception messages may contain user/source data.
    value = str(error)
    if len(RUNTIME_ERRORS) >= 16:
        return
    if "ChunkLoadError" in value or "Failed to fetch dynamically imported module" in value:
        kind = "module-load-error"
    elif "Missing Supabase frontend configuration" in value:
        kind = "missing-frontend-config"
    elif "is not defined" in value:
        kind = "javascript-reference-error"
    elif "Cannot read properties" in value or "Cannot set properties" in value:
        kind = "javascript-type-error"
    else:
        kind = "other-js-error"
    RUNTIME_ERRORS.append(kind)

def on_asset_response(response):
    uri = urlsplit(response.url)
    resource = response.request.resource_type
    if (len(ASSET_FAILURES) < 16 and uri.scheme == urlsplit(ORIGIN).scheme and
            uri.netloc == urlsplit(ORIGIN).netloc and
            resource in ("document", "script") and response.status >= 400):
        ASSET_FAILURES.append({"resource_type": resource, "status": response.status})


def inspect_https_response_headers(response, viewport, phase):
    """Classify public navigation headers. Never store raw header values."""
    headers = response.all_headers() if response else {}
    csp = headers.get("content-security-policy", "")
    hsts = headers.get("strict-transport-security", "")
    cache_referrer = headers.get("referrer-policy", "").lower()
    xfo = headers.get("x-frame-options", "").strip().lower()
    max_age = re.search(r"(?:^|;)\s*max-age\s*=\s*(\d+)(?:;|$)", hsts, re.I)
    frame_match = re.search(r"(?:^|;)\s*frame-ancestors\s+([^;]+)", csp, re.I)
    frame_policy = frame_match.group(1).strip().lower() if frame_match else ""
    referrer_options = [value.strip() for value in cache_referrer.split(",")]
    secure_referrer = {"no-referrer", "strict-origin", "same-origin",
                       "strict-origin-when-cross-origin"}
    HEADER_OBSERVATIONS.append({
        "viewport": viewport,
        "phase": phase,
        "http_status": response.status if response else 0,
        "html_content_type": "text/html" in headers.get("content-type", "").lower(),
        "hsts_one_year": bool(max_age and int(max_age.group(1)) >= 31536000),
        "nosniff": headers.get("x-content-type-options", "").strip().lower() == "nosniff",
        "referrer_restricted": bool(referrer_options and referrer_options[-1] in secure_referrer),
        "content_security_policy": bool(csp.strip()),
        "csp_no_unsafe_eval": bool(csp.strip()) and not bool(re.search(r"'unsafe-eval'", csp, re.I)),
        "frame_protection": (xfo in ("deny", "sameorigin") or frame_policy in ("'self'", "'none'")),
    })

def observe_hosted_release(page, viewport, phase, require_current):
    # Real GET to the exact same-origin public manifest. No credentials,
    # redirects or body snippets are added to CI artifacts.
    navigation = page.goto(ORIGIN + "/", wait_until="domcontentloaded")
    inspect_https_response_headers(navigation, viewport, phase)
    observed = page.evaluate("""async () => {
      const value = {
        stamp: null,
        html_id: document.querySelector('meta[name="eternyx-build-id"]')?.content ?? null,
        client_id: document.documentElement.getAttribute("data-eternyx-build-id")
      };
      try {
        const response = await fetch("/release-info.json", {
          method: "GET", credentials: "omit", cache: "no-store", redirect: "error"
        });
        if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return value;
        const text = await response.text();
        if (text.length > 4096) return value;
        value.stamp = JSON.parse(text);
      } catch { /* A missing/untrusted manifest cannot establish provenance. */ }
      return value;
    }""")
    stamp = observed.get("stamp") if isinstance(observed, dict) else None
    expected = os.getenv("GITHUB_SHA", "").lower()
    source_sha, build_id, status = None, None, "unavailable"
    html_matches = client_matches = matches_checkout = False
    if isinstance(stamp, dict):
        ident = stamp.get("build_id")
        reported_sha = stamp.get("source_sha")
        sha_origin = stamp.get("source_sha_origin")
        if (stamp.get("schema") == 1 and stamp.get("project") == "eternyx" and
                stamp.get("production_verified") is False and
                isinstance(ident, str) and re.fullmatch(r"[a-f0-9]{32}", ident) and
                sha_origin in ("git-checkout", "unavailable") and
                ((reported_sha is None and sha_origin == "unavailable") or
                 (isinstance(reported_sha, str) and re.fullmatch(r"[a-f0-9]{40}", reported_sha) and
                  sha_origin == "git-checkout"))):
            build_id = ident
            source_sha = reported_sha
            html_matches = observed.get("html_id") == ident
            client_matches = observed.get("client_id") == ident
            matches_checkout = bool(source_sha and re.fullmatch(r"[a-f0-9]{40}", expected) and source_sha == expected)
            status = ("source-matched" if matches_checkout else "build-matched") if (
                html_matches and client_matches) else "inconsistent"
    RELEASE_OBSERVATIONS.append({
        "viewport": viewport, "phase": phase, "status": status,
        "build_id": build_id, "source_sha": source_sha,
        "html_matches": html_matches, "client_matches": client_matches,
        "matches_checkout": matches_checkout,
    })
    if require_current and status != "source-matched":
        raise AssertionError("Staging release identity is unknown, stale or mismatched; workflows were not accepted.")


def target_origin(args):
    parsed = urlsplit(args.base_url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Target must be an origin without paths, credentials, query or fragment.")
    if args.staging:
        if not args.confirmed_staging:
            raise ValueError("Remote browser acceptance requires explicit --confirmed-staging.")
        if parsed.port is not None or parsed.hostname is None:
            raise ValueError("Staging accepts only the standard HTTPS port and a named host.")
        if parsed.hostname.endswith((".localhost", ".local", ".internal", ".test", ".invalid")) or parsed.hostname == "localhost":
            raise ValueError("Remote staging cannot use local or internal domains.")
        try:
            ipaddress.ip_address(parsed.hostname)
        except ValueError:
            pass
        else:
            raise ValueError("Remote staging cannot use IP literals.")
        if parsed.scheme != "https" or parsed.hostname != args.expected_host:
            raise ValueError("Staging requires HTTPS and an exact --expected-host match.")
        if not any(part in (parsed.hostname or "").lower() for part in ("staging", "stage")):
            raise ValueError("Target does not clearly identify a staging host; refusing remote checks.")
    elif args.confirmed_staging or args.expected_host or parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost") or parsed.port != 4173:
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
    page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="app.js").click()
    editor = page.locator("#project-editor")
    assert "addEventListener" in editor.input_value()
    # This marker is set by the sample's own JS AFTER it registered the click
    # handler. It verifies real execution readiness, not merely DOM visibility.
    editor.fill(editor.input_value() +
                '\n' + 'document.querySelector("#hello")?.setAttribute("data-handler-ready", "true");' +
                "\n// acceptance marker")
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
    page.get_by_role("button", name=re.compile(r"^Restore \(\d+\)$")).click()
    expect(editor).to_have_value(re.compile('"number"'))
    page.get_by_role("button", name="Duplicate file").click()
    expect(page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="config-copy.json")).to_be_visible()
    page.locator("#project-local-file-import").set_input_files({
        "name": "field-notes.md", "mimeType": "text/markdown",
        "buffer": b"First line\nSecond line",
    })
    expect(page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="field-notes.md")).to_be_visible()
    expect(page.locator("#project-editor")).to_have_value("First line\nSecond line")
    page.locator("#editor-goto-line").fill("2")
    page.get_by_role("button", name="Go to line").click()
    assert page.locator("#project-editor").evaluate("(el) => el.selectionStart") == 11
    # Import and code changes are explicit; no auto-save or preview execution.
    page.get_by_role("button", name="Save browser copy").click()
    assert len(store(page, PROJECT_KEY)[0]["files"]) == 6
    page.locator("#project-editor").fill("Unsaved draft that can be reversed")
    expect(page.get_by_role("heading", name="Saved-vs-working review")).to_be_visible()
    expect(page.get_by_role("button", name="Undo edit (1)")).to_be_enabled()
    with page.expect_download() as exported:
        page.get_by_role("button", name="Export source-free changes").click()
    review = json.loads(Path(exported.value.path()).read_text(encoding="utf-8"))
    assert review["schema"] == "eternyx-developer-revisions-v1"
    assert review["changedFiles"] == 1
    assert "Unsaved draft" not in json.dumps(review)
    page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="app.js").click()
    page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="field-notes.md").click()
    page.get_by_role("button", name="Undo edit (1)").click()
    expect(page.locator("#project-editor")).to_have_value("First line\nSecond line")
    page.get_by_role("button", name="Redo edit (1)").click()
    expect(page.locator("#project-editor")).to_have_value("Unsaved draft that can be reversed")
    page.get_by_role("group", name="Changed project files").get_by_role(
        "button", name=re.compile("field-notes.md")).click()
    page.get_by_role("button", name="Open changed line").click()
    assert page.locator("#project-editor").evaluate("(el) => el.selectionStart") == 0
    page.get_by_role("button", name="Restore saved file").first.click()
    expect(page.locator("#project-editor")).to_have_value("First line\nSecond line")
    expect(page.get_by_text("No differences from the last explicitly saved project.")).to_be_visible()

def actual_preflight(page):
    page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="app.js").click()
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
    # Real local project assertions and parser preflight, never executed JS.
    page.get_by_role("button", name="Run project tests").click()
    expect(page.get_by_text("Local test suite passed", exact=True)).to_be_visible(timeout=20000)
    with page.expect_download() as file:
        page.get_by_role("button", name="Export source-free test report").click()
    results=json.loads(Path(file.value.path()).read_text(encoding="utf-8"))
    assert results["schema"] == "eternyx-developer-local-test-results-v1"
    assert results["passed"] == 2 and results["failed"] == 0
    assert results["preflightPassed"] is True
    assert "acceptance marker" not in json.dumps(results)
    page.locator("#developer-test-kind").select_option("text-absent")
    page.locator("#developer-test-file").fill("app.js")
    page.locator("#developer-test-expected").fill("acceptance marker")
    page.get_by_role("button", name="Add assertion").click()
    expect(page.get_by_text("Project or test plan changed. Test results are stale.")).to_be_visible()
    expect(page.get_by_role("button", name="Export source-free test report")).to_be_disabled()
    page.get_by_role("button", name="Run project tests").click()
    expect(page.get_by_text("Local tests require review or are stale", exact=True)).to_be_visible(timeout=20000)
    with page.expect_download() as file:
        page.get_by_role("button", name="Export source-free test report").click()
    failed=json.loads(Path(file.value.path()).read_text(encoding="utf-8"))
    assert failed["passed"] == 2 and failed["failed"] == 1
    assert "acceptance marker" not in json.dumps(failed)
    page.get_by_role("button", name="Save test plan locally").click()
    stored=store(page, TEST_PLAN_KEY)
    assert len(stored) == 1 and len(stored[0]["tests"]) == 3
    # Stale reports cannot be exported after editing the checked project.
    editor.fill(original + "\n// modified after test")
    expect(page.get_by_role("button", name="Export source-free test report")).to_be_disabled()
    editor.fill(original)
    # One-click recommendations add six real static HTML checks, not mock passes.
    page.get_by_role("button", name="Add HTML quality checks").click()
    expect(page.get_by_role("group", name="Configured local tests").get_by_role("button", name="Remove test 9")).to_be_visible()
    page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="index.html", exact=True).click()
    html_before=editor.input_value()
    editor.fill(html_before + '\n<a href="#quality-missing-target">broken</a>')
    page.get_by_role("button", name="Run project tests").click()
    expect(page.get_by_text("unresolved-local-anchor", exact=False)).to_be_visible(timeout=20000)
    page.get_by_role("button", name="Show failed only").click()
    expect(page.get_by_role("button", name="Show all results")).to_be_visible()
    with page.expect_download() as download:
        page.get_by_role("button", name="Export source-free test report").click()
    quality_report=json.loads(Path(download.value.path()).read_text(encoding="utf-8"))
    assert quality_report["failed"] >= 2
    assert "quality-missing-target" not in json.dumps(quality_report)
    assert "index.html" not in json.dumps(quality_report)
    editor.fill(html_before)
    # 3.5: opt in to three cross-file references; prove broken links fail
    # in both desktop and mobile Chrome without adding a new journey ID.
    page.get_by_role("button", name="Add integration checks").click()
    expect(page.get_by_role("group", name="Configured local tests").get_by_role("button", name="Remove test 12")).to_be_visible()
    integration_marker = "PRIVATE_MISSING_INTEGRATION.js"
    editor.fill(html_before + '\n<script src="./' + integration_marker + '"></script>')
    expect(page.get_by_text("Cross-file references:", exact=False)).to_be_visible()
    page.get_by_role("button", name="Run project tests").click()
    results_panel = page.get_by_label("Local test results")
    expect(results_panel.get_by_text("missing-local-reference", exact=False)).to_be_visible(timeout=20000)
    expect(results_panel.get_by_text("Next step:", exact=False).first).to_be_visible()
    with page.expect_download() as file:
        page.get_by_role("button", name="Export source-free test report").click()
    integration_report = json.loads(Path(file.value.path()).read_text(encoding="utf-8"))
    assert integration_report["failed"] >= 2
    assert integration_marker not in json.dumps(integration_report)
    assert "index.html" not in json.dumps(integration_report)
    editor.fill(html_before)
    # 3.6: current dependency graph and metadata-only export are exercised in
    # the same seven canonical acceptance journeys on mobile and desktop.
    expect(page.get_by_text("Dependency intelligence & change impact")).to_be_visible()
    page.locator("#developer-dependency-focus").select_option("index.html")
    expect(page.get_by_text("reference(s) in view", exact=False)).to_be_visible()
    with page.expect_download() as file:
        page.get_by_role("button", name="Export filename-free graph summary").click()
    dependency_report=json.loads(Path(file.value.path()).read_text(encoding="utf-8"))
    assert dependency_report["schema"] == "eternyx-developer-dependencies-v1"
    assert "fileCount" in dependency_report
    assert "PRIVATE_MISSING_INTEGRATION" not in json.dumps(dependency_report)
    assert "index.html" not in json.dumps(dependency_report)
    page.get_by_role("button", name="Save browser copy").click()
    # 3.7: explicit, current-source handoff snapshot and filename-free evidence.
    # The established journey ID and viewport contract remain unchanged.
    page.get_by_role("button", name="Run local release review").click()
    expect(page.get_by_text("Local source checks passed · hosted release still on hold")).to_be_visible(timeout=20000)
    expect(page.get_by_text("Hosted staging, protected backend and production are", exact=False)).to_be_visible()
    with page.expect_download() as file:
        page.get_by_role("button", name="Export redacted handoff").click()
    clean_handoff=json.loads(Path(file.value.path()).read_text(encoding="utf-8"))
    assert clean_handoff["schema"] == "eternyx-developer-local-handoff-v1"
    assert clean_handoff["localVerdict"] == "local-checks-passed"
    assert clean_handoff["releaseDecision"] == "HOLD_HOSTED_RELEASE"
    assert all(entry["status"] == "not-verified" for entry in clean_handoff["checks"][-3:])
    assert "app.js" not in json.dumps(clean_handoff) and "index.html" not in json.dumps(clean_handoff)
    # Changing the source invalidates the review and prevents stale export.
    page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="app.js", exact=True).click()
    before_broken = editor.input_value()
    editor.fill(before_broken + '\nfunction RELEASE_PRIVATE_MARKER_BROKEN( {')
    expect(page.get_by_text("Project or baseline changed. Release review is stale; rerun required.")).to_be_visible()
    expect(page.get_by_role("button", name="Export redacted handoff")).to_be_disabled()
    page.get_by_role("button", name="Run local release review").click()
    expect(page.get_by_text("Local review requires attention")).to_be_visible(timeout=20000)
    with page.expect_download() as file:
        page.get_by_role("button", name="Export redacted handoff").click()
    failed_handoff=json.loads(Path(file.value.path()).read_text(encoding="utf-8"))
    assert failed_handoff["localVerdict"] == "local-review-required"
    assert failed_handoff["checks"][1]["status"] == "review-required"
    assert "RELEASE_PRIVATE_MARKER_BROKEN" not in json.dumps(failed_handoff)
    editor.fill(before_broken)
    page.get_by_role("button", name="Save browser copy").click()

def preview_isolation(page):
    assert page.locator('iframe[title="Isolated project preview"]').count() == 0
    with page.expect_download() as exported:
        page.get_by_role("button", name="Export standalone HTML").click()
    html = Path(exported.value.path()).read_text(encoding="utf-8")
    assert "Content-Security-Policy" in html
    assert "Hello from the isolated preview!" in html
    # Explicit export must not start executing user JavaScript.
    assert page.locator('iframe[title="Isolated project preview"]').count() == 0
    page.get_by_role("button", name="Run preview").click()
    frame=page.locator('iframe[title="Isolated project preview"]')
    expect(frame).to_be_visible()
    page.get_by_role("button", name="Phone 375").click()
    expect(frame).to_have_css("width", "375px", timeout=5000)
    page.get_by_role("button", name="Tablet 768").click()
    expect(frame).to_have_css("width", "768px", timeout=5000)
    page.get_by_role("button", name="Desktop 1200").click()
    expect(frame).to_have_css("width", "1200px", timeout=5000)
    page.get_by_role("button", name="Fluid", exact=True).click()
    assert frame.get_attribute("sandbox") == "allow-scripts"
    assert frame.get_attribute("referrerpolicy") == "no-referrer"
    doc=frame.get_attribute("srcdoc")
    assert "connect-src 'none'" in doc and "form-action 'none'" in doc
    assert "worker-src 'none'" in doc
    # A visible srcdoc element is not yet proof its inline JavaScript has run.
    # Wait for the actual opaque-origin iframe load event before clicking the
    # starter button; otherwise a fast desktop CI runner can click before its
    # addEventListener executes, leaving the initial text unchanged.
    frame_handle = frame.element_handle()
    assert frame_handle is not None, "Explicit preview iframe was not mounted"
    isolated_frame = frame_handle.content_frame()
    assert isolated_frame is not None, "Explicit preview iframe has no document"
    isolated_frame.wait_for_load_state("load", timeout=15000)
    preview=page.frame_locator('iframe[title="Isolated project preview"]')
    expect(preview.locator("#message")).to_have_text("Try editing these files.")
    # DOM readyState/load does not prove the user script attached its handler.
    # Wait for a marker set by the actual inline script AFTER addEventListener.
    # This does not retry a failed click or conceal broken script execution.
    expect(preview.locator("#hello")).to_have_attribute(
        "data-handler-ready", "true", timeout=15000)
    preview.locator("#hello").click()
    expect(preview.locator("#message")).to_have_text("Hello from the isolated preview!")
    page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="index.html").click()
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
    page.get_by_role("group", name="Project files", exact=True).get_by_role("button", name="index.html").click()
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
    parser.add_argument("--confirmed-staging",action="store_true",help="Required second explicit confirmation for remote checks")
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
                                                reduced_motion="reduce",service_workers="block",ignore_https_errors=False)
                    def external(route):
                        url=urlsplit(route.request.url)
                        if url.scheme != urlsplit(ORIGIN).scheme or url.netloc != urlsplit(ORIGIN).netloc:
                            NETWORK_AUDIT["blocked_external_requests"] += 1
                            return route.abort()
                        if args.staging and route.request.method not in ("GET", "HEAD"):
                            NETWORK_AUDIT["blocked_write_attempts"] += 1
                            return route.abort()
                        return route.continue_()
                    context.route("**/*",external)
                    page=context.new_page()
                    page.on("dialog",lambda dialog: dialog.accept())
                    page.on("pageerror", on_runtime_error)
                    page.on("response", on_asset_response)
                    try:
                        observe_hosted_release(page, viewport, "before", args.staging)
                        execute("create-save-reload-reopen",lambda: create_save_reopen(page),viewport)
                        execute("editor-search-format-replace-restore",lambda: editing_and_diagnostics(page),viewport)
                        execute("js-preflight-source-free-report",lambda: actual_preflight(page),viewport)
                        execute("explicit-isolated-preview",lambda: preview_isolation(page),viewport)
                        execute("checksum-recovery-and-tamper",lambda: recovery_and_tamper(page),viewport)
                        execute("project-linked-api-suite",lambda: api_project_link(page,args.staging),viewport)
                        execute("unsafe-import-rejected",lambda: malformed_import_rejected(page),viewport)
                        observe_hosted_release(page, viewport, "after", args.staging)
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
            "target_host":urlsplit(ORIGIN).hostname,
            "network_scope":"same-origin only",
            "release_observations":RELEASE_OBSERVATIONS,
            "header_observations":HEADER_OBSERVATIONS,
            "runtime_errors":RUNTIME_ERRORS,
            "asset_failures":ASSET_FAILURES,
            "network_audit":NETWORK_AUDIT,
            "api_requests_executed":not bool(args.staging),
            "finished_at":datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z"),
            "commit":os.getenv("GITHUB_SHA","local-unknown"),
            "cases":CASES,
            "note":"Only case names/outcomes recorded; project source, URLs, tokens and downloaded artifacts excluded.",
        },indent=2)+"\n",encoding="utf-8")
