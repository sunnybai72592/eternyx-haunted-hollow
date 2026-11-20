"""Exercise the built Eternyx app in Chrome against the local Vite preview."""
import base64
import json
import time
from urllib.parse import urlsplit
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ORIGIN = "http://127.0.0.1:4173"


def workspace(page):
    page.goto(ORIGIN + "/workspace")
    editor = page.get_by_label("Note", exact=True)
    body = "Field observations\nNorth station readings."
    editor.fill(body)
    page.get_by_role("button", name="Use first line: Field observations").click()
    page.get_by_role("button", name="Save named copy", exact=True).click()
    page.get_by_role("button", name="Save draft", exact=True).click()
    page.reload()
    expect(editor).to_have_value(body)
    search = page.locator("#note-search")
    search.fill("north station")
    copy = page.get_by_role("listitem").filter(has_text="Field observations")
    expect(copy).to_have_count(1)
    search.fill("unmatched phrase")
    expect(page.get_by_text("No matching copies.", exact=True)).to_be_visible()
    search.fill("")
    copy.get_by_role("button").first.click()
    with page.expect_download() as pending:
        page.get_by_role("button", name="Download .txt", exact=True).click()
    download = pending.value
    assert download.suggested_filename == "Field observations.txt"
    assert Path(download.path()).read_text() == body


def automation(page, narrow):
    page.goto(ORIGIN + "/automation")
    source = page.locator("#workflow-input")
    result = page.locator("#workflow-output")
    source.fill(" bravo \nALPHA\nBravo\n\n")
    page.get_by_label("Ignore case for duplicates").check()
    page.get_by_label("Order", exact=True).select_option("ascending")
    expect(result).to_have_value("ALPHA\nbravo")
    expect(source).to_have_value(" bravo \nALPHA\nBravo\n\n")
    before = source.bounding_box()
    after = result.bounding_box()
    if narrow:
        assert after["y"] >= before["y"] + before["height"], "Editors should stack"
    else:
        assert after["x"] >= before["x"] + before["width"], "Editors should sit side by side"
    with page.expect_download() as pending:
        page.get_by_role("button", name="Download .json", exact=True).click()
    assert json.loads(Path(pending.value.path()).read_text()) == ["ALPHA", "bravo"]


def explore_and_inspect(page):
    page.goto(ORIGIN + "/explore")
    search = page.locator("#ecosystem-search")
    search.fill("zz-no-tool")
    expect(page.get_by_text("No matching areas found")).to_be_visible()
    page.get_by_role("button", name="Clear", exact=True).click()
    expect(search).to_be_focused()
    search.press_sequentially("GitHub repository hub")
    expect(search).to_have_value("GitHub repository hub")
    page.reload()
    expect(search).to_have_value("GitHub repository hub")
    page.get_by_role("region", name="Indexed tools").get_by_role("link").click()

    repo = "example/demo"
    def github_response(route):
        path = route.request.url.split("?")[0]
        if path.endswith("/branches"):
            payload = [{"name": name, "protected": protected, "commit": {"sha": "abcdef0"}}
                       for name, protected in [("main", True), ("topic", False)]]
        elif path.endswith("/commits"):
            payload = []
        elif path.endswith("/actions/runs"):
            route.fulfill(status=403, json={"message": "Restricted"})
            return
        elif path.endswith("/" + repo):
            payload = {"full_name": repo, "html_url": "https://github.com/" + repo,
                       "default_branch": "main", "visibility": "public", "archived": False,
                       "stargazers_count": 0, "forks_count": 0, "open_issues_count": 0,
                       "subscribers_count": 0}
        else:
            route.fulfill(status=404, json={"message": "Not Found"})
            return
        route.fulfill(json=payload)

    page.route("https://api.github.com/repos/**", github_response)
    repository = page.get_by_label("GitHub repository", exact=True)
    repository.fill(repo)
    page.get_by_role("button", name="Inspect repository").click()
    expect(page.get_by_role("heading", name=repo)).to_be_visible()
    expect(page.get_by_text("Workflow activity unavailable.", exact=True)).to_be_visible()
    expect(page.get_by_text("No commits returned.", exact=True)).to_be_visible()
    page.get_by_label("Protected only").check()
    expect(page.get_by_text("1 of 2 loaded branches")).to_be_visible()
    page.get_by_label("Find a branch").fill("topic")
    expect(page.get_by_text("No branches match these filters.")).to_be_visible()
    page.get_by_role("link", name="Back to Explore", exact=True).click()
    expect(search).to_have_value("GitHub repository hub")


def storyboard(page):
    # Isolate the test account and all external traffic inside this browser page.
    user = {"id": "00000000-0000-4000-8000-000000000001", "email": "studio@example.invalid",
            "aud": "authenticated", "role": "authenticated", "app_metadata": {}, "user_metadata": {}}
    def encoded(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
    token = ".".join([encoded({"alg": "HS256", "typ": "JWT"}),
                      encoded({"sub": user["id"], "exp": int(time.time()) + 3600}), "fixture"])
    def service(route):
        url = urlsplit(route.request.url)
        if url.hostname == "127.0.0.1":
            return route.continue_()
        if url.path.endswith("/auth/v1/token"):
            return route.fulfill(json={"user": user, "access_token": token, "refresh_token": "local-fixture",
                                       "token_type": "bearer", "expires_in": 3600})
        if url.path.endswith("/auth/v1/user"):
            return route.fulfill(json=user)
        if url.path.endswith("/rest/v1/profiles"):
            return route.fulfill(json={"id": user["id"], "user_id": user["id"], "role": "user"})
        return route.fulfill(json=[])

    page.route("**/*", service)
    page.goto(ORIGIN + "/auth?redirect=/ai-arsenal/video")
    page.get_by_label("Email address", exact=True).fill(user["email"])
    page.get_by_label("Password", exact=True).fill("local-browser-fixture")
    page.get_by_role("button", name="Sign in to ETERNYX", exact=True).click()
    planner = page.get_by_role("region", name="Storyboard planner")
    editor = planner.get_by_label("Shot descriptions")
    editor.fill("Dawn\nWorkshop")
    planner.get_by_label("Seconds per shot").select_option("3")
    planner.get_by_label("Frame format").select_option("9:16")
    planner.get_by_role("button", name="0:03–0:06 Workshop").click()
    with page.expect_download() as pending:
        planner.get_by_role("button", name="Download shot list (.json)").click()
    contents = Path(pending.value.path()).read_bytes()
    assert json.loads(contents)["totalSeconds"] == 6
    editor.fill("Another draft")
    file = planner.get_by_label("Open exported storyboard (.json)")
    file.set_input_files({"name": "broken.json", "mimeType": "application/json", "buffer": b"{"})
    expect(planner.get_by_role("alert")).to_be_visible()
    expect(editor).to_have_value("Another draft")
    file.set_input_files({"name": "shots.json", "mimeType": "application/json", "buffer": contents})
    expect(editor).to_have_value("Another draft")
    planner.get_by_role("button", name="Replace current plan").click()
    expect(editor).to_have_value("Dawn\nWorkshop")
    expect(planner.get_by_label("Frame format")).to_have_value("9:16")
    expect(planner.get_by_label("Seconds per shot")).to_have_value("3")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome")
    for width, height in [(390, 844), (1440, 900)]:
        context = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
        try:
            page = context.new_page()
            workspace(page)
            automation(page, width < 768)
            explore_and_inspect(page)
            storyboard(page)
            print(f"Passed workspace, automation, Explore, inspector and storyboard journeys at {width} × {height}", flush=True)
        finally:
            context.close()
    browser.close()
