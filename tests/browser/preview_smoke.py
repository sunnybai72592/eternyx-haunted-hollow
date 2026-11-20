"""Exercise the built Eternyx app in Chrome against the local Vite preview."""
import json
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


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome")
    for width, height in [(390, 844), (1440, 900)]:
        context = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
        try:
            page = context.new_page()
            workspace(page)
            automation(page, width < 768)
            print(f"Passed workspace and automation journeys at {width} × {height}", flush=True)
        finally:
            context.close()
    browser.close()
