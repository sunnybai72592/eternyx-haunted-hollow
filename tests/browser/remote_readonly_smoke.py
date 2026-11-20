"""Read-only, no-mocks public ETERNYX hosted-front-end smoke audit.

Run on demand with ETERNYX_REMOTE_TARGET=lovable-preview or public-domain-candidate.
This never tests merchant payments, provider inference, auth or remote security tools.
Only GET/HEAD to one allowlisted origin; browser-local edits use disposable context.
"""
import base64
import json
import os
import re
from pathlib import Path
from urllib.parse import quote, urlsplit

from playwright.sync_api import expect, sync_playwright

TARGETS = {
    "lovable-preview": "https://id-preview--4e3226d5-080f-4830-8446-9d86452bdf76.lovable.app",
    "public-domain-candidate": "https://eternyx-haunted-hollow.lovable.app",
}
REPORT = Path("test-results/remote-readonly-acceptance.json")
VIEWPORTS = [(390, 844), (1440, 900)]
# Remote execution has NO test auth tokens, NO mocked responses, and NO outbound
# POST/PATCH/PUT/DELETE. Never expand this to third-party scan targets.
CASES = (
    "registry-landing", "registry-filter", "developer-json", "developer-base64",
    "developer-url", "developer-uuid", "developer-jwt", "automation-local",
)
results = []
blocked = {"cross_origin": 0, "write_attempt": 0}
target_name = os.environ.get("ETERNYX_REMOTE_TARGET", "")
if target_name not in TARGETS:
    raise SystemExit("Choose one explicit ETERNYX_REMOTE_TARGET from the allowlist")
origin = TARGETS[target_name]
hostname = urlsplit(origin).hostname
if not hostname or urlsplit(origin).scheme != "https":
    raise SystemExit("Invalid approved host")


def guarded_request(route):
    request = route.request
    address = urlsplit(request.url)
    if address.scheme != "https" or address.hostname != hostname or address.port not in (None, 443):
        blocked["cross_origin"] += 1
        return route.abort()
    if request.method not in ("GET", "HEAD"):
        blocked["write_attempt"] += 1
        return route.abort()
    return route.continue_()


def open_page(page, path):
    page.goto(origin + path, wait_until="domcontentloaded", timeout=20000)
    address = urlsplit(page.url)
    assert address.scheme == "https" and address.hostname == hostname, "Unexpected hosted redirect"


def registry_landing(page):
    open_page(page, "/explore")
    expect(page.get_by_role("heading", name="Master tool registry")).to_be_visible()
    expect(page.get_by_text("32 indexed", exact=False)).to_be_visible()
    expect(page.get_by_text("0 production-verified", exact=False)).to_be_visible()
    expect(page.get_by_label("Filter tools by pillar")).to_be_visible()


def registry_filter(page):
    open_page(page, "/explore")
    page.get_by_label("Filter tools by pillar").select_option("developer-studio")
    page.get_by_label("Filter tools by readiness").select_option("local-foundation")
    page.locator("#ecosystem-search").fill("JWT payload inspector")
    expect(page.get_by_role("region", name="Indexed tools").get_by_role("link")).to_have_count(1)
    assert "pillar=developer-studio" in page.url
    page.reload()
    expect(page.locator("#ecosystem-search")).to_have_value("JWT payload inspector")
    page.get_by_label("Filter tools by readiness").select_option("preview-only")
    expect(page.get_by_text("No indexed capabilities match these filters.", exact=False)).to_be_visible()


def developer_json(page):
    open_page(page, "/developer-studio")
    page.get_by_role("tab", name="JSON").click()
    editor = page.get_by_label("JSON input")
    output = page.get_by_label("Formatted JSON")
    editor.fill('{"eternyx":true,"count":2}')
    page.get_by_role("button", name="Validate & format").click()
    assert json.loads(output.input_value()) == {"eternyx": True, "count": 2}
    editor.fill('{"bad":}')
    page.get_by_role("button", name="Validate & format").click()
    expect(output).to_have_value("")


def developer_base64(page):
    open_page(page, "/developer-studio")
    page.get_by_role("tab", name="Base64").click()
    value = "ETERNYX سلام 🌙"
    page.get_by_label("Text to encode").fill(value)
    page.get_by_role("button", name="Encode text").click()
    output = page.get_by_label("Result")
    expect(output).to_have_value(base64.b64encode(value.encode()).decode())
    page.get_by_role("button", name="Decode", exact=True).click()
    page.get_by_label("Base64 to decode").fill("%%%")
    page.get_by_role("button", name="Decode Base64").click()
    expect(output).to_have_value("")
    expect(page.get_by_text("Unable to decode this value.", exact=False)).to_be_visible()


def developer_url(page):
    open_page(page, "/developer-studio")
    page.get_by_role("tab", name="URL").click()
    raw = "ETERNYX & سلام"
    page.get_by_label("Text to encode").fill(raw)
    page.get_by_role("button", name="Encode value").click()
    expect(page.get_by_label("Result")).to_have_value(quote(raw, safe="~()*!.'-"))
    page.get_by_role("button", name="Decode", exact=True).click()
    page.get_by_label("Encoded text to decode").fill("%E0%A4%A")
    page.get_by_role("button", name="Decode value").click()
    expect(page.get_by_label("Result")).to_have_value("")
    expect(page.get_by_text("Invalid percent-encoded input.", exact=False)).to_be_visible()


def developer_uuid(page):
    open_page(page, "/developer-studio")
    page.get_by_role("tab", name="UUID").click()
    counter = page.get_by_label("Number of UUIDs (1–100)")
    counter.fill("4")
    page.get_by_role("button", name="Generate UUIDs").click()
    values = page.get_by_label("Generated UUIDs").input_value().splitlines()
    assert len(values) == len(set(values)) == 4
    assert all(re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", v) for v in values)
    counter.fill("101")
    page.get_by_role("button", name="Generate UUIDs").click()
    expect(page.get_by_label("Generated UUIDs")).to_have_value("")


def developer_jwt(page):
    open_page(page, "/developer-studio")
    page.get_by_role("tab", name="JWT").click()
    def part(payload):
        return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    token = ".".join([part({"alg": "HS256", "typ": "JWT"}), part({"sub": "synthetic"}), "c2ln"])
    page.get_by_label("JWT token").fill(token)
    page.get_by_role("button", name="Decode token").click()
    assert json.loads(page.get_by_label("Decoded header & payload").input_value())["payload"]["sub"] == "synthetic"
    expect(page.get_by_text("Decoding is not verification.", exact=False)).to_be_visible()
    page.get_by_label("JWT token").fill("not.a.jwt")
    page.get_by_role("button", name="Decode token").click()
    expect(page.get_by_label("Decoded header & payload")).to_have_value("")


def automation_local(page):
    open_page(page, "/automation")
    source = page.get_by_label("Input lines")
    output = page.get_by_label("Result (0 lines)")
    source.fill(" bravo \nALPHA\nBravo\n")
    page.get_by_label("Ignore case for duplicates").check()
    page.get_by_label("Order", exact=True).select_option("ascending")
    expect(page.locator("#workflow-output")).to_have_value("ALPHA\nbravo")
    # No browser download or save-to-workspace mutation is required.
    assert page.locator("#workflow-input").input_value() == " bravo \nALPHA\nBravo\n"


EXECUTE = {
    "registry-landing": registry_landing,
    "registry-filter": registry_filter,
    "developer-json": developer_json,
    "developer-base64": developer_base64,
    "developer-url": developer_url,
    "developer-uuid": developer_uuid,
    "developer-jwt": developer_jwt,
    "automation-local": automation_local,
}


def exercise(page, name, viewport):
    try:
        EXECUTE[name](page)
    except Exception:
        results.append({"case": name, "viewport": viewport, "result": "failed"})
        raise
    results.append({"case": name, "viewport": viewport, "result": "passed"})


def write_report():
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "environment": "remote ETERNYX hosted frontend, anonymous, read-only",
        "target": target_name,
        "hostname": hostname,
        "git_revision_under_test": "unverified: hosting release SHA not exposed",
        "source_checkout_sha": os.environ.get("GITHUB_SHA", "unknown"),
        "production_verified": False,
        "payment_or_provider_verified": False,
        "mocked_responses": False,
        "network_policy": "GET/HEAD to exact allowlisted first-party HTTPS host only",
        "blocked_external_requests": blocked["cross_origin"],
        "blocked_write_attempts": blocked["write_attempt"],
        "expected_cases": len(CASES) * len(VIEWPORTS),
        "cases": results,
    }, indent=2) + "\n", encoding="utf-8")


try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome")
        try:
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    reduced_motion="reduce",
                    service_workers="block",
                    accept_downloads=False,
                )
                try:
                    page = context.new_page()
                    page.route("**/*", guarded_request)
                    for name in CASES:
                        exercise(page, name, f"{width}x{height}")
                finally:
                    context.close()
        finally:
            browser.close()
finally:
    # The only persisted outputs are fixture-free case statuses and dimensions.
    write_report()

if blocked["write_attempt"]:
    raise SystemExit("Anonymous app attempted an HTTP write; blocked and reported")
assert len(results) == len(CASES) * len(VIEWPORTS)
assert all(case["result"] == "passed" for case in results)
print("Passed", len(results), "read-only remote browser journeys at", hostname)
