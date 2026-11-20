"""Anonymous, no-credential, no-mocks verification of hosted ETERNYX route guards.

No sign-in, registration, account changes, API tokens or outgoing HTTP writes.
Only GET/HEAD on an exact approved ETERNYX Lovable hostname.
This tests FRONTEND access routing, not Supabase backend authorization/RLS.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

TARGETS = {
    "lovable-preview": "https://id-preview--4e3226d5-080f-4830-8446-9d86452bdf76.lovable.app",
    "public-domain-candidate": "https://eternyx-haunted-hollow.lovable.app",
}
# Do not use dynamic account/user paths or untrusted target inputs.
PROTECTED_ROUTES = {
    "account": "/account",
    "notifications": "/notifications",
    "profile": "/profile",
    "settings": "/settings",
    "ai-image": "/ai-arsenal/image",
    "ai-video": "/ai-arsenal/video",
    "pentest-workbench": "/black-hat-pentesting",
    "private-bug-history": "/my-bug-reports",
}
VIEWPORTS = ((390, 844), (1440, 900))
REPORT = Path("test-results/anonymous-route-acceptance.json")
TELEMETRY = frozenset(("/__l5e/trackevents", "/__l5e/events"))
target = os.environ.get("ETERNYX_REMOTE_TARGET", "")
if target not in TARGETS:
    raise SystemExit("Choose an approved ETERNYX_REMOTE_TARGET")
base = TARGETS[target]
host = urlsplit(base).hostname
blocked_writes = 0
blocked_telemetry = 0
blocked_external = 0
results = []


def network_guard(route):
    global blocked_writes, blocked_telemetry, blocked_external
    request = route.request
    address = urlsplit(request.url)
    if address.scheme != "https" or address.hostname != host or address.port not in (None, 443):
        blocked_external += 1
        return route.abort()
    if request.method not in ("GET", "HEAD"):
        if request.method == "POST" and address.path in TELEMETRY:
            blocked_telemetry += 1
        else:
            blocked_writes += 1
        return route.abort()
    return route.continue_()


def go(page, path):
    page.goto(base + path, wait_until="domcontentloaded", timeout=16000)
    if urlsplit(page.url).scheme != "https" or urlsplit(page.url).hostname != host:
        raise AssertionError("Unexpected navigation off the approved ETERNYX hostname")


def assert_auth_form(page):
    expect(page.get_by_role("heading", name="Welcome back", exact=True)).to_be_visible(timeout=8000)
    mode = page.get_by_role("group", name="Authentication mode")
    expect(mode.get_by_role("button", name="Sign in")).to_be_visible()
    expect(mode.get_by_role("button", name="Create account")).to_be_visible()
    # A signed-out visitor must not see protected user content instead of auth.
    assert urlsplit(page.url).path == "/auth", "Private page did not redirect to /auth"


def auth_entry(page):
    go(page, "/auth")
    assert_auth_form(page)


def private_route(page, path):
    go(page, path)
    page.wait_for_url(
        lambda u: urlsplit(str(u)).scheme == "https"
        and urlsplit(str(u)).hostname == host
        and urlsplit(str(u)).path == "/auth",
        timeout=12000,
    )
    assert_auth_form(page)


def execute(page, case, viewport):
    try:
        if case == "auth-entry":
            auth_entry(page)
        else:
            private_route(page, PROTECTED_ROUTES[case])
    except Exception:
        results.append({"case": case, "viewport": viewport, "result": "failed"})
        print("FAIL", case, viewport, flush=True)
        return
    results.append({"case": case, "viewport": viewport, "result": "passed"})
    print("PASS", case, viewport, flush=True)


try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        try:
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    reduced_motion="reduce", service_workers="block",
                    accept_downloads=False,
                )
                try:
                    page = context.new_page()
                    page.route("**/*", network_guard)
                    page.set_default_timeout(7000)
                    for case in ("auth-entry", *PROTECTED_ROUTES.keys()):
                        execute(page, case, f"{width}x{height}")
                finally:
                    context.close()
        finally:
            browser.close()
finally:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "schema": 1,
        "environment": "hosted ETERNYX anonymous frontend route guards",
        "target": target,
        "hostname": host,
        "source_checkout_sha": os.environ.get("GITHUB_SHA", "unknown"),
        "production_verified": False,
        "server_rls_verified": False,
        "authenticated_user_flow_verified": False,
        "credentials_used": False,
        "network_policy": "GET/HEAD to one exact approved HTTPS host",
        "blocked_external": blocked_external,
        "blocked_telemetry": blocked_telemetry,
        "blocked_writes": blocked_writes,
        "expected": (1 + len(PROTECTED_ROUTES)) * len(VIEWPORTS),
        "cases": results,
    }, indent=2) + "\n", encoding="utf-8")

if blocked_writes or len(results) != (1 + len(PROTECTED_ROUTES)) * len(VIEWPORTS) or any(x["result"] != "passed" for x in results):
    raise SystemExit("Anonymous route-guard acceptance failed; inspect sanitized report")
print("Passed", len(results), "anonymous hosted route guard journeys at", host)
