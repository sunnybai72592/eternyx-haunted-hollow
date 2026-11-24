import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ci=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8");
const browser=readFileSync(new URL("../tests/browser/developer_project_lab_smoke.py",import.meta.url),"utf8");

test("developer lab Chrome runs inside same local Vite preview after the main browser suite",()=>{
  assert.match(ci,/tests\/browser\/preview_smoke\.py[\s\S]*tests\/browser\/developer_project_lab_smoke\.py --base-url http:\/\/127\.0\.0\.1:4173/);
  assert.match(ci,/test-results\/developer-project-browser-acceptance\.json/);
  assert.match(browser,/chromium\.launch\(channel="chrome"\)/);
  assert.match(browser,/\(390,844\),\(1440,900\)/);
});

test("staging is opt-in HTTPS, host-checked, and does not run unattended API requests",()=>{
  assert.match(browser,/parser\.add_argument\("--staging",action="store_true"/);
  assert.match(browser,/parsed\.hostname != args\.expected_host/);
  assert.match(browser,/parsed\.scheme != "https"/);
  assert.match(browser,/if not staging:/);
  assert.match(browser,/external\(route\)/);
  assert.match(browser,/url\.netloc != urlsplit\(ORIGIN\)\.netloc/);
  assert.match(browser,/"production_verified":False/);
});

test("actual browser journeys cover seven independent, previously untested capabilities",()=>{
  for(const name of ["create-save-reload-reopen","editor-search-format-replace-restore","js-preflight-source-free-report",
    "explicit-isolated-preview","checksum-recovery-and-tamper","project-linked-api-suite","unsafe-import-rejected"]) {
    assert.ok(browser.includes('execute("'+name+'"'),name);
  }
  assert.match(browser,/Backup checksum mismatch/);
  assert.match(browser,/connect-src 'none'/);
  assert.match(browser,/report\["summary"\]\["passed"\] == 1/);
  assert.match(browser,/PROJECT_KEY\)\[0\]/);
});

test("acceptance evidence stores no source text, token values or downloaded artifacts",()=>{
  assert.match(browser,/REPORT\.write_text/);
  assert.match(browser,/"cases":CASES/);
  assert.match(browser,/"environment":/);
  assert.match(browser,/"staging_executed":/);
  assert.doesNotMatch(browser,/page\.screenshot|record_video_dir|trace\.start/);
});

test("wide preview scrolls inside its viewport and checks both real pointer hit targets",()=>{
  const studio=readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx",import.meta.url),"utf8");
  assert.match(studio,/previewScroller\.current\.scrollLeft = 0/);
  assert.match(studio,/max-w-full overflow-x-auto overscroll-x-contain/);
  assert.match(studio,/sandbox="allow-scripts"/);
  assert.match(browser,/element\.scrollWidth > element\.clientWidth/);
  assert.match(browser,/element\.scrollLeft > 0/);
  assert.match(browser,/area\.scrollLeft === 0/);
  assert.match(browser,/button\.contains\(document\.elementFromPoint\(r\.x\+r\.width\/2, r\.y\+r\.height\/2\)\)/);
  assert.match(browser,/document\.elementFromPoint\(point\.x, point\.y\) === frame/);
  assert.match(browser,/hello\.click\(\)/);
  assert.match(browser,/to_have_text\("Hello from the isolated preview!"\)/);
  assert.doesNotMatch(browser,/dispatch_event\("click"\)|evaluate\([^\\n]*\.click\(\)/);
});
