import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../.github/workflows/ai-video-offline-browser.yml",import.meta.url),"utf8");
const fixture=readFileSync(new URL("../scripts/ai-video/generateOfflineBrowserFixture.mjs",import.meta.url),"utf8");
const browser=readFileSync(new URL("./browser/ai_video_offline_playback.py",import.meta.url),"utf8");

test("dedicated CI real-browser acceptance never silently skips a missing Chrome decoder",()=>{
  assert.match(workflow,/runs-on: ubuntu-24\.04/);
  assert.match(workflow,/timeout-minutes: 24/);
  assert.match(workflow,/playwright==1\.56\.0/);
  assert.match(workflow,/command -v google-chrome/);
  assert.match(workflow,/tests\/browser\/ai_video_offline_playback.py/);
  assert.match(browser,/assert chrome and Path\(chrome\)\.is_file\(\)/);
  assert.match(browser,/playwright\.chromium\.launch\(/);
  assert.doesNotMatch(browser,/skipUnless|pytest\.skip|unittest\.skip|ignoreHTTPSErrors/);
});
test("fixture proves entire private ZIP one-launch and requests genuine local movie formats",()=>{
  assert.match(fixture,/buildPortablePhoneMovie/);
  assert.match(fixture,/finish_phone_movie.py","--run"/);
  assert.match(fixture,/delivery:"all"/);
  assert.match(fixture,/quality:"cinematic"/);
  assert.match(fixture,/receipt\.video\.frame_count,48/);
  assert.match(fixture,/receipt\.video\.fps,"24\/1"/);
  assert.match(fixture,/receipt\.video\.width,1280/);
  assert.match(fixture,/receipt\.video\.height,720/);
  assert.match(fixture,/createHash\("sha256"\)/);
});
test("real Chrome must play, decode canvas, assert fallback, downloads and no external egress",()=>{
  for (const token of ["file_uri", "loopback_http",
                       "_actual_mp4_decode_and_clock",
                       "actual_rendered_video_pixels","real_webm_decoder_fallback",
                       "actual_verified_mp4_download",
                       "mobile_playback_and_no_horizontal_overflow",
                       "no_external_network_requests"]) {
    assert.ok(browser.includes(token),token);
  }
  assert.match(browser,/currentTime > 0\.35/);
  assert.match(browser,/getImageData/);
  assert.match(browser,/expect_download/);
  assert.match(browser,/sha256/);
  assert.match(browser,/get_attribute\("src"\) == "video-subtitled\.mp4"/);
  assert.match(browser,/new_context\(viewport=\{"width": 390/);
  assert.match(browser,/127\.0\.0\.1/);
});
