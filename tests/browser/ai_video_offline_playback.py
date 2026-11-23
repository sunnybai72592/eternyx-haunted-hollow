"""Real offline Chrome acceptance of genuine one-launch phone movie assets.

Requires a real Chrome binary plus Playwright. NEVER skips missing browser
or decoder support. Operates exclusively on generated, synthetic footage.
Checks browser playback, media pixels, fallback, captions/transcript, downloads,
the verified receipt and complete absence of remote browser requests.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

assert len(sys.argv) == 2, "Pass the extracted phone-movie-output directory"
ROOT = Path(sys.argv[1]).resolve(strict=True)
assert ROOT.is_dir() and not ROOT.is_symlink()
receipt = json.loads((ROOT / "manifest.json").read_text(encoding="utf8"))
assert receipt["fps"] == 24
assert (receipt["video"]["width"], receipt["video"]["height"], receipt["video"]["frame_count"]) == (1280, 720, 48)
required = {"video.mp4", "video.webm", "video-subtitled.mp4",
            "poster.png", "watch.html", "captions.srt", "captions.vtt"}
assert required <= set(receipt["deliverables"])
for name in required:
    path = ROOT / name
    assert path.is_file() and not path.is_symlink()
    raw = path.read_bytes()
    assert len(raw) == receipt["deliverables"][name]["file_bytes"]
    assert hashlib.sha256(raw).hexdigest() == receipt["deliverables"][name]["sha256"]

chrome = os.getenv("AI_VIDEO_CHROME_EXECUTABLE") or next(
    (exe for candidate in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
     if (exe := shutil.which(candidate))), None)
assert chrome and Path(chrome).is_file(), "Real system Chrome/Chromium required; no silent browser skip"

class QuietLocalHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = ThreadingHTTPServer(("127.0.0.1", 0),
    partial(QuietLocalHandler, directory=str(ROOT)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
url = f"http://127.0.0.1:{server.server_port}/watch.html"
file_url = (ROOT / "watch.html").as_uri()
seen_hosts = set()
cases = []

# Video should actually decode and advance, not only advertise canPlayType.
def play_and_verify(page, extension):
    page.wait_for_function("""() => {
      const v=document.querySelector('video');
      return !!v && v.readyState >= 2 && Number.isFinite(v.duration)
        && v.duration > 1.8 && v.videoWidth === 1280 && v.videoHeight === 720;
    }""", timeout=30000)
    playback = page.locator("video").evaluate("""async (v) => {
      v.muted = true;
      v.currentTime = 0;
      await v.play();
      return {playing: !v.paused, width:v.videoWidth, height:v.videoHeight,
        selected: new URL(v.currentSrc).pathname,
        duration:v.duration};
    }""")
    assert playback["playing"] and playback["selected"].endswith(extension), playback
    assert playback["width"] == 1280 and playback["height"] == 720
    assert 1.8 < playback["duration"] < 2.3, playback
    page.wait_for_function(
      "() => document.querySelector('video').currentTime > 0.35",
      timeout=15000)
    page.locator("video").evaluate("(v) => v.pause()")

def inspect_page(page):
    assert page.title() == "Eternyx movie playback"
    assert page.get_by_text("1280 × 720 · 24 FPS · 2 s").count() == 1
    assert page.locator("video").get_attribute("poster") == "poster.png"
    assert page.locator("video source").count() == 2
    assert page.locator("video source").first.get_attribute("src") == "video-subtitled.mp4"
    assert page.locator("video source").nth(1).get_attribute("src") == "video.webm"
    assert page.locator("details summary").inner_text() == "Timed transcript"
    page.locator("details summary").click()
    assert "Real browser playback of operator-recorded footage" in page.locator("details").inner_text()
    assert "00:00:00.000" in page.locator("details").inner_text()
    assert "00:00:02.000" in page.locator("details").inner_text()
    poster = page.evaluate("""async () => {
      const img = new Image();
      img.src = 'poster.png';
      await img.decode();
      return {width: img.naturalWidth, height: img.naturalHeight};
    }""")
    assert poster == {"width": 1280, "height": 720}, poster
    for name in required - {"watch.html"}:
        assert page.locator(f'a[href="{name}"][download]').count() == 1, name
    assert page.locator('a[href="manifest.json"]').count() == 1
    cases.append("player_links_transcript_poster")

try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=chrome, headless=True,
            args=["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required",
                  "--no-sandbox", "--disable-dev-shm-usage"])
        for case_url, label in ((file_url, "file_uri"), (url, "loopback_http")):
            context = browser.new_context(accept_downloads=True, viewport={"width": 1280, "height": 800})
            context.on("request", lambda request: seen_hosts.add(
                (urlparse(request.url).scheme, urlparse(request.url).hostname)
            ))
            page = context.new_page()
            response = page.goto(case_url,wait_until="load")
            if label == "loopback_http":
                assert response is not None and response.status == 200
            inspect_page(page)
            play_and_verify(page, "video-subtitled.mp4")
            cases.append(label + "_actual_mp4_decode_and_clock")
            if label == "loopback_http":
                # Sampling a decoded pixel proves actual frame rasterization.
                sample = page.evaluate("""() => {
                  const v=document.querySelector('video');
                  const canvas=document.createElement('canvas');
                  canvas.width=2;canvas.height=2;
                  const ctx=canvas.getContext('2d');
                  ctx.drawImage(v,0,0,2,2);
                  return Array.from(ctx.getImageData(0,0,2,2).data);
                }""")
                assert len(sample)==16 and sample[3]==255 and sample[7]==255, sample
                cases.append("actual_rendered_video_pixels")
                with page.expect_download(timeout=15000) as download:
                    page.locator('a[href="video.mp4"][download]').click()
                dl=Path(download.value.path())
                assert hashlib.sha256(dl.read_bytes()).hexdigest() == receipt["deliverables"]["video.mp4"]["sha256"]
                cases.append("actual_verified_mp4_download")
                # Force WebM-only source: full browser decoder fallback, not a DOM placeholder.
                page.evaluate("""() => {
                  const v=document.querySelector('video');
                  v.querySelector('source[type="video/mp4"]').remove();
                  v.load();
                }""")
                play_and_verify(page,"video.webm")
                cases.append("real_webm_decoder_fallback")
            context.close()
        mobile=browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  is_mobile=True, accept_downloads=True)
        mobile.on("request", lambda req: seen_hosts.add(
            (urlparse(req.url).scheme, urlparse(req.url).hostname)
        ))
        phone=mobile.new_page()
        assert phone.goto(url,wait_until="load").status == 200
        inspect_page(phone)
        play_and_verify(phone, "video-subtitled.mp4")
        assert phone.evaluate(
            "() => document.documentElement.scrollWidth <= window.innerWidth+1")
        cases.append("mobile_playback_and_no_horizontal_overflow")
        mobile.close()
        browser.close()
    assert all((scheme == "file" or
                (scheme == "http" and host == "127.0.0.1"))
               for scheme,host in seen_hosts), f"External requests seen: {seen_hosts}"
    assert ("http", "127.0.0.1") in seen_hosts
    cases.append("no_external_network_requests")
    print(json.dumps({"status":"passed","real_browser":True,
          "offline":True,"cases":cases,"decoded_fps":24,
          "decoded_dimensions":[1280,720]}))
finally:
    server.shutdown()
    server.server_close()
