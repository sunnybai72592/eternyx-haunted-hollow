"""Exercise an extracted two-shot movie directly from disk in Chrome."""
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", args=["--disable-gpu"])
    for width in (390, 1280):
        context = browser.new_context(viewport={"width": width, "height": 850}, offline=True)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(Path(sys.argv[1]).resolve().as_uri())
        video = page.locator("video")
        previous = page.get_by_role("button", name="Previous shot")
        following = page.get_by_role("button", name="Next shot")
        expect(previous).to_be_disabled()
        following.click()
        expect(following).to_be_disabled()
        assert abs(video.evaluate("v => v.currentTime") - 1) < 0.001
        page.locator("summary").click()
        expect(page.locator('[aria-current="time"]')).to_contain_text("shot 2")
        page.get_by_role("button", name="Go to shot 1").press("Enter")
        expect(previous).to_be_disabled()
        page.get_by_role("button", name="Next frame").click()
        fps = int(video.get_attribute("data-fps"))
        assert abs(video.evaluate("v => v.currentTime") - 1 / fps) < 0.001
        page.get_by_label("Playback speed").select_option("1.5")
        assert video.evaluate("v => v.playbackRate") == 1.5
        video.evaluate("v => v.play()")
        page.wait_for_function("document.querySelector('video').currentTime > 1.1")
        expect(page.locator('[aria-current="time"]')).to_contain_text("shot 2")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors, errors
        context.close()
    browser.close()
