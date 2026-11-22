import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const component = read("src/components/home/EternalConstellation.tsx");
const css = read("src/components/home/eternal-constellation.css");

test("1: user can pause/resume the live constellation with an accessible button", () => {
  assert.match(component, /type="button"/);
  assert.match(component, /onClick=\{toggleMotion\}/);
  assert.match(component, /aria-label=\{userPaused \? "Resume ETERNYX orbital animation"/);
  assert.match(component, /aria-pressed=\{userPaused\}/);
  assert.match(component, /<Pause aria-hidden="true"/);
  assert.match(component, /<Play aria-hidden="true"/);
});

test("2: pause preference survives reloads without requiring authentication", () => {
  assert.match(component, /MOTION_STORAGE_KEY = "eternyx-constellation-paused"/);
  assert.match(component, /useState\(readPausedPreference\)/);
  assert.match(component, /localStorage\.getItem\(MOTION_STORAGE_KEY\)/);
  assert.match(component, /localStorage\.setItem\(MOTION_STORAGE_KEY, String\(next\)\)/);
  assert.match(component, /catch \{ \/\* Storage may be disabled;/);
});

test("3: preference synchronizes between tabs and cleans up the listener", () => {
  assert.match(component, /event\.key === MOTION_STORAGE_KEY \|\| event\.key === null/);
  assert.match(component, /addEventListener\("storage", onStorage\)/);
  assert.match(component, /removeEventListener\("storage", onStorage\)/);
});

test("4: manual pause composes with the previous scroll and visibility throttling", () => {
  assert.match(component, /data-motion=\{inView && pageVisible && !userPaused \? "running" : "paused"\}/);
  assert.match(component, /IntersectionObserver/);
  assert.match(component, /visibilitychange/);
  assert.match(css, /animation-play-state: paused !important/);
});

test("5: the button stays keyboard accessible instead of being hidden by role img", () => {
  const roleIndex = component.indexOf('role="img"');
  const buttonIndex = component.indexOf('<button');
  const imageCloseIndex = component.lastIndexOf('</div>', buttonIndex);
  assert.ok(roleIndex > 0 && buttonIndex > imageCloseIndex && imageCloseIndex > roleIndex);
  assert.match(component, /aria-label="ETERNYX connected by design/);
  assert.match(css, /focus-visible/);
  assert.match(css, /outline: 2px solid hsl\(var\(--ring\)\)/);
});

test("6: mobile and system accessibility settings remain readable", () => {
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /min-width: 36px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\), \(prefers-reduced-data: reduce\)/);
  assert.match(css, /eternyx-constellation__motion-toggle \{ display: none; \}/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /border-color: ButtonText/);
});

test("7: original ETERNYX identity and all six ecosystem nodes survive", () => {
  assert.match(component, /Connected by design/);
  for (const label of ["SECURITY", "DEVELOP", "AI", "WORKSPACE", "CLOUD", "AUTOMATE"]) {
    assert.ok(component.includes('label: "' + label + '"'));
  }
  assert.match(css, /hsl\(var\(--primary\)/);
  assert.match(css, /hsl\(var\(--accent\)/);
});
