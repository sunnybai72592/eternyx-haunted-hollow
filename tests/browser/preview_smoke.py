"""Exercise the built Eternyx app in Chrome against the local Vite preview."""
import base64
import json
import os
import re
import time
from urllib.parse import urlsplit, quote
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
    page.goto(ORIGIN + "/")
    resume = page.get_by_role("link", name=re.compile("Continue my work"))
    expect(resume).to_contain_text("latest scratchpad copy")
    expect(resume).not_to_contain_text("Field observations")
    resume.click()
    expect(editor).to_have_value(body)
    expect(editor).to_be_focused()
    expect(page.get_by_label("Title for saved copies")).to_have_value("Field observations")
    page.get_by_role("button", name="Save draft", exact=True).click()
    page.goto(ORIGIN + "/")
    expect(resume).to_contain_text("scratchpad draft")
    resume.click()
    expect(editor).to_have_value(body)
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

    clean = match.get_by_role("button", name="Clean list from Site rounds", exact=True)
    page.once("dialog", lambda dialog: dialog.dismiss())
    clean.click()
    expect(page.locator("#device-note")).to_have_value("ALPHA\nbravo")
    page.once("dialog", lambda dialog: dialog.accept())
    clean.click()
    expect(source).to_have_value("ALPHA\nbravo")
    source.fill(" bravo \nALPHA\nbravo\ncharlie")
    expect(result).to_have_value("bravo\nALPHA\ncharlie")
    page.get_by_text("Save to Digital Workspace", exact=True).click()
    expect(title).to_have_value("Site rounds (cleaned)")
    save.click()
    page.get_by_role("link", name="View saved copies").click()
    page.reload()
    page.locator("#note-search").fill("Site rounds")
    copies = page.get_by_role("listitem").filter(has_text="Site rounds")
    expect(copies).to_have_count(2)
    for name, expected in [("Site rounds", "ALPHA\nbravo"), ("Site rounds (cleaned)", "bravo\nALPHA\ncharlie")]:
        row = copies.filter(has=page.get_by_role("button", name="Delete " + name, exact=True))
        if name.endswith("(cleaned)"):
            page.once("dialog", lambda dialog: dialog.accept())
        row.get_by_role("button").first.click()
        expect(page.locator("#device-note")).to_have_value(expected)


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
        planner.get_by_role("button", name="Download storyboard JSON").click()
    assert pending.value.suggested_filename == "eternyx-storyboard.json"
    contents = Path(pending.value.path()).read_bytes()
    assert json.loads(contents)["totalSeconds"] == 6

    with page.expect_download() as csv_download:
        planner.get_by_role("button", name="Export shot timeline CSV").click()
    assert csv_download.value.suggested_filename == "eternyx-shot-timeline.csv"
    csv_content = Path(csv_download.value.path()).read_text(encoding="utf-8")
    assert '"2","3","6","3","9:16","Workshop"' in csv_content

    with page.expect_download() as srt_download:
        planner.get_by_role("button", name="Export shot captions SRT").click()
    assert srt_download.value.suggested_filename == "eternyx-shot-captions.srt"
    srt_content = Path(srt_download.value.path()).read_text(encoding="utf-8")
    assert "00:00:03,000 --> 00:00:06,000" in srt_content
    assert "Workshop" in srt_content
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
    export = planner.get_by_role("button", name="Export Wan request")
    expect(export).to_be_disabled()
    planner.get_by_label("Frame format").select_option("16:9")
    planner.get_by_label("Seconds per shot").select_option("10")
    expect(export).to_be_disabled()
    planner.get_by_label("Seconds per shot").select_option("3")
    planner.get_by_role("button", name="0:03–0:06 Workshop").click()
    planner.get_by_role("button", name="Create storyboard movie").click()
    movie = planner.get_by_label("Storyboard movie preview")
    expect(movie).to_be_visible(timeout=20000)
    page.wait_for_function("""() => {
        const v = document.querySelector('video[aria-label="Storyboard movie preview"]');
        return v && v.readyState >= 2 && v.videoWidth === 640 && v.videoHeight === 360;
    }""")
    with page.expect_download() as exported_movie:
        planner.get_by_role("link", name="Download storyboard movie").click()
    assert Path(exported_movie.value.path()).stat().st_size > 1000
    review = planner.get_by_role("region", name="Blind video comparison")
    for label in ["Baseline clip", "Candidate clip"]:
        review.get_by_label(label).set_input_files({"name": label + ".webm", "mimeType": "video/webm",
                                                   "buffer": Path(exported_movie.value.path()).read_bytes()})
    review.get_by_label("Quality question").fill("Which clip keeps the framing consistent?")
    review.get_by_role("button", name="Start blind review").click()
    expect(review.get_by_text("Baseline", exact=False)).to_have_count(0)
    review.get_by_role("button", name="Tie", exact=True).click()
    with page.expect_download() as score:
        review.get_by_role("button", name="Download review").click()
    review_data = json.loads(Path(score.value.path()).read_text())
    assert review_data["verdict"] == "Tie" and sorted(review_data["sources"].values()) == ["Baseline", "Candidate"]
    review.get_by_role("button", name="New comparison").click()
    expect(review.get_by_label("Baseline clip")).to_be_visible()
    review.get_by_text("Compare saved verdicts").click()
    legacy = {"version": 1, "question": review_data["question"], "sources": {"A": "Baseline", "B": "Candidate"}, "verdict": "Clip B"}
    reports = review.get_by_label("Review files (.json)")
    def upload(name, data):
        return {"name": name, "mimeType": "application/json", "buffer": json.dumps(data).encode()}
    reports.set_input_files([upload("first.json", review_data), upload("again.json", review_data), upload("older.json", legacy)])
    expect(review.get_by_text("2 counted · 1 duplicate downloads skipped")).to_be_visible()
    expect(review.get_by_text("Candidate wins 1 · Baseline wins 0 · Ties 1")).to_be_visible()
    reports.set_input_files([upload("first.json", review_data), upload("conflict.json", {**review_data, "verdict": "Clip A"})])
    expect(review.get_by_text("Two files disagree", exact=False)).to_be_visible()
    expect(review.get_by_text("Candidate wins", exact=False)).to_have_count(0)
    with page.expect_download() as selected:
        export.click()
    # Exercise the actual inference parser without loading weights or invoking CUDA.
    from runpy import run_path
    parser = run_path(str(Path(__file__).resolve().parents[2] / "gpu-worker" / "wan21_infer.py"))["parse_job"]
    job = parser(Path(selected.value.path()).read_text())
    assert job["prompt"] == "Workshop" and job["num_frames"] == 49
    planner.get_by_role("button", name="Save shot to Workspace").click()
    planner.get_by_role("link", name="Open saved shot in Workspace").click()
    expect(page.get_by_label("Note", exact=True)).to_have_value("Storyboard · Shot 2\n3 seconds · 16:9\nWorkshop")


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



def developer_json(page):
    page.goto(ORIGIN + "/developer-studio")
    page.get_by_role("tab", name="JSON").click()
    source = page.get_by_label("JSON input")
    output = page.get_by_label("Formatted JSON")
    source.fill('{"scope":"browser","count":2}')
    page.get_by_role("button", name="Validate & format").click()
    assert json.loads(output.input_value()) == {"scope": "browser", "count": 2}
    assert '\n  "scope"' in output.input_value()
    source.fill('{"broken":}')
    page.get_by_role("button", name="Validate & format").click()
    expect(output).to_have_value("")
    expect(page.get_by_text("Valid JSON. Output formatted successfully.")).to_have_count(0)


def developer_base64(page):
    page.get_by_role("tab", name="Base64").click()
    raw = "ETERNYX سلام 🌙"
    expected = base64.b64encode(raw.encode("utf-8")).decode("ascii")
    page.get_by_label("Text to encode").fill(raw)
    page.get_by_role("button", name="Encode text").click()
    output = page.get_by_label("Result")
    expect(output).to_have_value(expected)
    page.get_by_role("button", name="Decode", exact=True).click()
    page.get_by_label("Base64 to decode").fill(expected)
    page.get_by_role("button", name="Decode Base64").click()
    expect(output).to_have_value(raw)
    page.get_by_label("Base64 to decode").fill("%%%")
    page.get_by_role("button", name="Decode Base64").click()
    expect(output).to_have_value("")
    expect(page.get_by_text("Unable to decode this value.", exact=False)).to_be_visible()


def developer_url(page):
    page.get_by_role("tab", name="URL").click()
    raw = "A B & سلام"
    encoded = quote(raw, safe="~()*!.'-")
    page.get_by_label("Text to encode").fill(raw)
    page.get_by_role("button", name="Encode value").click()
    output = page.get_by_label("Result")
    expect(output).to_have_value(encoded)
    page.get_by_role("button", name="Decode", exact=True).click()
    page.get_by_label("Encoded text to decode").fill(encoded)
    page.get_by_role("button", name="Decode value").click()
    expect(output).to_have_value(raw)
    page.get_by_label("Encoded text to decode").fill("%E0%A4%A")
    page.get_by_role("button", name="Decode value").click()
    expect(output).to_have_value("")
    expect(page.get_by_text("Invalid percent-encoded input.", exact=False)).to_be_visible()


def developer_uuid(page):
    page.get_by_role("tab", name="UUID").click()
    counter = page.get_by_label("Number of UUIDs (1–100)")
    counter.fill("3")
    page.get_by_role("button", name="Generate UUIDs").click()
    output = page.get_by_label("Generated UUIDs")
    ids = output.input_value().splitlines()
    assert len(ids) == len(set(ids)) == 3
    for token in ids:
        assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", token)
    counter.fill("101")
    page.get_by_role("button", name="Generate UUIDs").click()
    expect(output).to_have_value("")
    expect(page.get_by_text("Enter a whole number from 1 to 100.")).to_be_visible()


def developer_jwt(page):
    page.get_by_role("tab", name="JWT").click()
    def encode(payload):
        return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    token = ".".join([encode({"alg": "HS256", "typ": "JWT"}), encode({"sub": "fixture", "role": "test"}), "c2ln"])
    editor = page.get_by_label("JWT token")
    editor.fill(token)
    page.get_by_role("button", name="Decode token").click()
    payload = json.loads(page.get_by_label("Decoded header & payload").input_value())
    assert payload["payload"]["sub"] == "fixture"
    assert payload["header"]["alg"] == "HS256"
    expect(page.get_by_text("Decoding is not verification.", exact=False)).to_be_visible()
    editor.fill("a.b")
    page.get_by_role("button", name="Decode token").click()
    expect(page.get_by_label("Decoded header & payload")).to_have_value("")
    expect(page.get_by_text("three dot-separated segments", exact=False)).to_be_visible()


def explore_filters(page):
    page.goto(ORIGIN + "/explore")
    expect(page.get_by_role("heading", name="Master tool registry")).to_be_visible()
    expect(page.get_by_text("0 production-verified", exact=False)).to_be_visible()
    pillar = page.get_by_label("Filter tools by pillar")
    readiness = page.get_by_label("Filter tools by readiness")
    pillar.select_option("developer-studio")
    readiness.select_option("local-foundation")
    assert "pillar=developer-studio" in page.url
    assert "readiness=local-foundation" in page.url
    cards = page.get_by_role("region", name="Indexed tools").get_by_role("link")
    assert cards.count() >= 5
    assert all("Local foundation" in cards.nth(i).inner_text() for i in range(cards.count()))
    search = page.locator("#ecosystem-search")
    search.fill("JWT payload inspector")
    expect(page.get_by_role("region", name="Indexed tools").get_by_role("link")).to_have_count(1)
    page.reload()
    expect(search).to_have_value("JWT payload inspector")
    expect(pillar).to_have_value("developer-studio")
    expect(readiness).to_have_value("local-foundation")
    readiness.select_option("preview-only")
    expect(page.get_by_text("No indexed capabilities match these filters.", exact=False)).to_be_visible()
    readiness.select_option("local-foundation")
    page.get_by_role("button", name="Clear", exact=True).click()
    expect(page.get_by_text("JSON formatter", exact=False).first).to_be_visible()


# Every entry records a real local-preview Chrome journey, never a production
# deployment certification. External API responses in some journeys are mocked.
results = []
report_path = Path(__file__).resolve().parents[2] / "test-results" / "browser-preview-acceptance.json"

def presence(page):
    requests = []
    def data(route):
        requests.append(route.request.post_data_json)
        route.fulfill(json={"total": 7, "countries": [{"code": "SA", "count": 5}],
                            "networkAvailable": True, "gatewayLocated": True})
    path = "**/rest/v1/rpc/visitor_presence"
    page.route(path, data)
    page.add_init_script("""(() => {
        window.testPublicPins = [];
        class PresenceSocket extends EventTarget {
            static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
            readyState = 0;
            constructor(url) {
                super();
                this.url = url;
                setTimeout(() => { this.readyState = 1; this.emit('open', new Event('open')); }, 0);
            }
            emit(type, event) {
                this.dispatchEvent(event);
                this['on' + type]?.(event);
            }
            send(raw) {
                const packet = JSON.parse(raw);
                const array = Array.isArray(packet);
                const [join_ref, ref, topic, event, payload] = array ? packet :
                    [packet.join_ref, packet.ref, packet.topic, packet.event, packet.payload];
                if (event === 'presence' && payload.event === 'track') window.testPublicPins.push(payload.payload);
                const reply = {status: 'ok', response: {}};
                const frame = array ? [join_ref, ref, topic, 'phx_reply', reply] :
                    {join_ref, ref, topic, event: 'phx_reply', payload: reply};
                setTimeout(() => this.emit('message', new MessageEvent('message', {data: JSON.stringify(frame)})), 0);
            }
            close() { this.readyState = 3; this.emit('close', new CloseEvent('close')); }
        }
        window.WebSocket = PresenceSocket;
    })()""")
    page.context.set_geolocation({"latitude": 12.34567, "longitude": 32.12345, "accuracy": 8})
    page.context.grant_permissions(["geolocation"], origin=ORIGIN)
    page.goto(ORIGIN + "/")
    panel = page.get_by_role("region", name="Around Eternyx now")
    expect(panel.get_by_text("Saudi Arabia", exact=True)).to_be_visible()
    world = panel.get_by_role("img", name="Live visitor map with country estimates and voluntarily shared device pins")
    expect(world).to_be_visible()
    expect(world.get_by_text("SA · 5")).to_be_visible()
    panel.get_by_text("Share my location on the map", exact=True).click()
    share = panel.get_by_role("button", name="Share my location publicly")
    expect(share).to_be_enabled()
    assert not page.evaluate("window.testPublicPins")
    share.click()
    remove = panel.get_by_role("button", name="Remove my public pin")
    expect(remove).to_be_visible()
    assert page.evaluate("window.testPublicPins") == [{"city": "Shared location", "latitude": 12.34567, "longitude": 32.12345, "accuracy": 8}]
    remove.click()
    expect(share).to_be_enabled()
    expect(panel.get_by_text("7 estimated active networks")).to_be_visible()
    expect(panel.get_by_role("checkbox")).to_be_checked()
    with page.expect_response(lambda response: response.url.endswith("/rpc/visitor_presence") and not response.request.post_data_json["contribute"]):
        panel.get_by_role("checkbox").uncheck()
    assert {"contribute": True} in requests and requests[-1] == {"contribute": False}
    page.reload()
    expect(panel.get_by_role("checkbox")).not_to_be_checked()
    page.unroute(path, data)
    page.route(path, lambda route: route.fulfill(status=503, json={}))
    page.reload()
    expect(panel.get_by_text("Live visitor data is temporarily unavailable.")).to_be_visible()
    expect(panel.get_by_text("Saudi Arabia", exact=True)).to_have_count(0)


def navigation_terminal(page):
    held = []
    pattern = "**/assets/DeveloperStudio-*.js"
    page.route(pattern, lambda route: held.append(route))
    page.goto(ORIGIN + "/developer-studio", wait_until="commit")
    prompt = page.get_by_text("Opening developer studio", exact=False)
    expect(prompt).to_be_visible()
    expect(page.get_by_text("Recent page assets", exact=True)).to_be_visible()
    assert held, "The real route chunk should still be pending"
    for route in held:
        route.continue_()
    page.unroute(pattern)
    expect(prompt).to_have_count(0)


def home_task_finder(page):
    page.goto(ORIGIN + "/")
    expect(page.get_by_role("heading", name="Welcome to Eternyx")).to_be_visible()
    field = page.get_by_label("What would you like to do?")
    field.fill("Can you check my domain please?")
    field.press("Enter")
    expect(page.get_by_role("link", name="Check a domain’s DNS")).to_have_attribute("href", "/cybersecurity/dns")
    page.get_by_role("button", name="Make a video", exact=True).click()
    expect(page.get_by_text("Video rendering is currently unavailable.", exact=False)).to_be_visible()
    expect(page.get_by_role("link", name="Open Video Studio")).to_have_attribute("href", "/ai-arsenal/video")
    field.fill("zzzqqq")
    field.press("Enter")
    expect(page.get_by_role("link", name="Browse tools", exact=True)).to_be_visible()
    page.get_by_role("button", name="Clear task search and suggestions").click()
    expect(field).to_have_value("")
    expect(page.get_by_role("link", name="Browse tools", exact=True)).to_have_count(0)
    expect(page.locator("#pillars h3")).to_have_count(6)
    page.get_by_role("button", name="Learn something").click()
    # A quick example now offers an explicit navigable suggestion, rather
    # than unexpectedly redirecting before the user chooses a destination.
    expect(page).to_have_url(ORIGIN + "/")
    education_link = page.get_by_role("link", name="Explore education")
    expect(education_link).to_have_attribute("href", "/education")
    education_link.click()
    expect(page).to_have_url(ORIGIN + "/education")


def domain_check(page):
    def dns(route):
        assert route.request.post_data_json == {"domain": "example.com"}
        route.fulfill(json={"success": True, "domain": "example.com", "dns_records": 9, "nameservers": 2})
    page.route("**/functions/v1/dns-analyzer", dns)
    page.goto(ORIGIN + "/")
    page.get_by_role("button", name="Check my domain").click()
    page.get_by_role("link", name="Check a domain’s DNS").click()
    page.get_by_label("Domain name").fill("example.com")
    page.get_by_role("button", name="Check DNS").click()
    summary = "example.com · 9 DNS records observed · 2 nameservers observed."
    expect(page.get_by_text(summary)).to_be_visible()
    submitted = []
    def explain(route):
        payload = route.request.post_data_json
        assert payload["sessionId"] is None
        submitted.append(payload["message"])
        route.fulfill(json={"sessionId": "00000000-0000-4000-8000-000000000003", "response": "These counts describe the lookup."})
    page.route("**/functions/v1/eternyx-ai-chat", explain)
    page.get_by_role("button", name="Explain with Eternyx AI").click()
    draft = page.get_by_role("textbox", name="Message to Eternyx AI")
    expect(draft).to_have_value(re.compile(re.escape(summary)))
    assert not submitted
    prompt = draft.input_value() + " Explain nameservers first."
    draft.fill(prompt)
    page.get_by_role("button", name="Send message").click()
    expect(page.get_by_text("These counts describe the lookup.", exact=True)).to_be_visible()
    assert submitted == [prompt]


def exercise(case_id, action, width, height):
    try:
        action()
    except Exception:
        results.append({"case": case_id, "viewport": f"{width}x{height}", "result": "failed"})
        raise
    results.append({"case": case_id, "viewport": f"{width}x{height}", "result": "passed"})

try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome")
        try:
            for width, height in [(390, 844), (1440, 900)]:
                context = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
                try:
                    page = context.new_page()
                    exercise("homepage-presence-mocked", lambda: presence(page), width, height)
                    exercise("navigation-terminal", lambda: navigation_terminal(page), width, height)
                    exercise("home-task-finder", lambda: home_task_finder(page), width, height)
                    exercise("device-scratchpad", lambda: workspace(page), width, height)
                    exercise("clean-list", lambda: automation(page, width < 768), width, height)
                    exercise("explore-github-mocked", lambda: explore_and_inspect(page), width, height)
                    exercise("explore-registry-filters", lambda: explore_filters(page), width, height)
                    exercise("json-format", lambda: developer_json(page), width, height)
                    exercise("utf8-base64", lambda: developer_base64(page), width, height)
                    exercise("uri-encoding", lambda: developer_url(page), width, height)
                    exercise("uuid-generation", lambda: developer_uuid(page), width, height)
                    exercise("jwt-inspection", lambda: developer_jwt(page), width, height)
                    exercise("video-storyboard", lambda: storyboard(page), width, height)
                    exercise("home-domain-check-mocked", lambda: domain_check(page), width, height)
                    exercise("document-search", lambda: document_search(page), width, height)
                    exercise("chat-mocked-backend", lambda: chat(page), width, height)
                    print(f"Passed 16 preview journeys at {width} × {height}", flush=True)
                finally:
                    context.close()
        finally:
            browser.close()
finally:
    # Write partial evidence on failure, too. Avoid screenshots or sensitive
    # fixture data; artifacts contain only case IDs, viewport and result.
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps({
        "environment": "local Vite preview (not production)",
        "browser": "Chrome",
        "external_api_note": "GitHub and authenticated AI responses are test fixtures, not live provider checks",
        "production_verified": False,
        "commit": os.environ.get("GITHUB_SHA", "local-unknown"),
        "cases": results,
    }, indent=2) + "\n", encoding="utf-8")
