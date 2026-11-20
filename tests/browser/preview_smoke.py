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


    page.get_by_text("Save to Digital Workspace", exact=True).click()
    title = page.get_by_label("Saved list title")
    expect(title).to_have_attribute("placeholder", "ALPHA")
    title.fill("Site rounds")
    save = page.get_by_role("button", name="Save cleaned list")
    save.click()
    expect(save).to_be_disabled()
    page.get_by_role("link", name="View saved copies").click()
    page.reload()
    expect(page.locator("#device-note")).to_have_value("Field observations\nNorth station readings.")
    page.locator("#note-search").fill("site rounds")
    match = page.get_by_role("listitem").filter(has_text="Site rounds")
    expect(match).to_have_count(1)
    match.get_by_role("button").first.click()
    expect(page.locator("#device-note")).to_have_value("ALPHA\nbravo")


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


def document_search(page):
    page.goto(ORIGIN + "/ai-arsenal/documents")
    source = page.locator("#document-source")
    content = "# Notes\r\nİ🙂 Reading\r\n## Follow-up\r\nSecond READING"
    page.locator("#document-local-file").set_input_files({
        "name": "observations.md", "mimeType": "text/markdown", "buffer": content.encode(),
    })
    page.get_by_role("button", name="Inspect document").click()
    page.get_by_role("button", name="Line 3 · Follow-up").click()
    selected = "e => e.value.slice(e.selectionStart, e.selectionEnd)"
    assert source.evaluate(selected) == "## Follow-up"
    query = page.locator("#document-search")
    query.fill("reading")
    query.press("Enter")
    page.get_by_role("button", name="Go to line 2, column 5").click()
    assert source.evaluate(selected) == "Reading"
    with page.expect_download() as pending:
        page.get_by_role("button", name="Download matches (.json)").click()
    report = json.loads(Path(pending.value.path()).read_bytes())
    assert report["fileName"] == "observations.md" and report["total"] == 2
    assert [m["matchedText"] for m in report["matches"]] == ["Reading", "READING"]
    with page.expect_download() as pending:
        page.get_by_role("button", name="Download matches (.txt)").click()
    assert "Line 4, column 8 · READING" in Path(pending.value.path()).read_text()
    page.once("dialog", lambda dialog: dialog.dismiss())
    page.get_by_role("button", name="Clear workspace").click()
    expect(source).to_have_value(content.replace("\r\n", "\n"))
    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="Clear workspace").click()
    expect(source).to_have_value("")


def chat(page):
    session = "00000000-0000-4000-8000-000000000002"
    prompt, answer = "Check my field notes", "Fixture reply for the saved conversation."
    turns = []
    submitted = []
    history_attempts = []
    def send(route):
        request = route.request.post_data_json
        submitted.append(request["message"])
        if len(submitted) == 1:
            return route.fulfill(status=402, json={"code": "INSUFFICIENT_CREDITS"})
        assert request["sessionId"] is None and request["message"] == prompt
        for role, content in [("user", prompt), ("assistant", answer)]:
            turns.append({"id": str(len(turns)), "role": role, "content": content,
                          "created_at": "2026-01-01T00:00:00Z"})
        route.fulfill(json={"sessionId": session, "response": answer})

    def sessions(route):
        route.fulfill(json=[{"id": session, "title": prompt}] if turns else [])

    def history(route):
        history_attempts.append(route.request.url)
        if len(history_attempts) == 1:
            return route.fulfill(status=503, json={"message": "Temporary failure"})
        route.fulfill(json=turns)

    page.route("**/functions/v1/eternyx-ai-chat", send)
    page.route("**/rest/v1/conversation_sessions?**", sessions)
    page.route("**/rest/v1/chat_history?**", history)
    page.goto(ORIGIN + "/eternyx-ai")
    draft = page.get_by_role("textbox", name="Message to Eternyx AI")
    draft.fill(prompt)
    draft.press("Enter")
    expect(page.get_by_text("Your account has insufficient chat credits.", exact=False)).to_be_visible()
    expect(draft).to_have_value(prompt)
    page.get_by_role("button", name="Send message").click()
    expect(page.get_by_text(answer, exact=True)).to_be_visible()
    page.reload()
    retry = page.get_by_role("button", name="Retry history")
    expect(retry).to_be_visible()
    draft.fill("Follow-up")
    expect(page.get_by_role("button", name="Send message")).to_be_disabled()
    retry.click()
    expect(page.get_by_text(answer, exact=True)).to_be_visible()
    expect(draft).to_have_value("Follow-up")
    expect(page.get_by_role("button", name="Send message")).to_be_enabled()
    page.get_by_role("button", name="New Chat").click()
    expect(page.get_by_text(answer, exact=True)).to_have_count(0)
    page.get_by_role("button", name=prompt, exact=True).click()
    expect(page.get_by_text(answer, exact=True)).to_be_visible()
    search = page.get_by_label("Find a saved chat")
    search.fill("unmatched search")
    expect(page.get_by_text("No matching chats.", exact=True)).to_be_visible()
    expect(page.get_by_text(answer, exact=True)).to_be_visible()
    page.get_by_role("button", name="Clear", exact=True).click()
    expect(search).to_be_focused()
    search.fill("FIELD")
    expect(page.get_by_role("button", name=prompt, exact=True)).to_have_attribute("aria-pressed", "true")
    with page.expect_download() as pending:
        page.get_by_role("button", name="Download visible messages (.txt)").click()
    assert Path(pending.value.path()).read_text() == f"{prompt}\n\nYou\n{prompt}\n\nEternyx AI\n{answer}\n"
    assert submitted == [prompt, prompt]


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
            document_search(page)
            chat(page)
            print(f"Passed workspace, automation, Explore, inspector, storyboard document and chat journeys at {width} × {height}", flush=True)
        finally:
            context.close()
    browser.close()
