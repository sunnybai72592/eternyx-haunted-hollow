import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const scene = read("src/components/home/EternalConstellation.tsx");
const css = read("src/components/home/eternal-constellation.css");

test("1: orbit pauses offscreen and releases intersection observer on unmount", () => {
  assert.match(scene, /IntersectionObserver/);
  assert.match(scene, /threshold: 0\.01/);
  assert.match(scene, /observer\.observe\(element\)/);
  assert.match(scene, /observer\.disconnect\(\)/);
  assert.match(scene, /data-motion=\{inView && pageVisible \? "running" : "paused"\}/);
  assert.match(css, /\.eternyx-constellation\[data-motion="paused"\]/);
  assert.match(css, /animation-play-state: paused !important/);
});

test("2: hide-tab animation pauses and event listeners are cleaned up", () => {
  assert.match(scene, /document\.hidden/);
  assert.match(scene, /document\.addEventListener\("visibilitychange", update\)/);
  assert.match(scene, /document\.removeEventListener\("visibilitychange", update\)/);
});

test("3: palette transitions preserve the logo and five colors", () => {
  assert.match(css, /transition: border-color \.5s ease, background-color \.5s ease/);
  assert.match(css, /transition: color \.5s ease, filter \.5s ease/);
  assert.match(css, /hsl\(var\(--primary\)/);
  assert.match(css, /hsl\(var\(--accent\)/);
  const colors = read("src/styles/eternyx-palettes.css");
  for (const name of ["cyan","violet","emerald","bronze","rose"]) {
    assert.ok(colors.includes(":root[data-eternyx-palette='" + name + "']"));
  }
});

test("4: orbital transforms and soft node hover polish remain graceful", () => {
  assert.match(css, /backface-visibility: hidden/);
  assert.match(css, /transform-origin: center center/);
  assert.match(css, /will-change: transform/);
  assert.match(css, /\.eternyx-constellation__node:hover/);
  const core = css.split(".eternyx-constellation__core {")[1]?.split("}")[0];
  assert.ok(core);
  assert.doesNotMatch(core, /animation:/);
});

test("5: narrow handsets keep badges small while retaining original labels", () => {
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /eternyx-constellation__node-icon \{ width: 11px/);
  for (const label of ["SECURITY","DEVELOP","AI","WORKSPACE","CLOUD","AUTOMATE"]) {
    assert.ok(scene.includes('label: "' + label + '"'));
  }
});

test("6: reduced-data users keep a static illustration and less blur", () => {
  assert.match(css, /@media \(prefers-reduced-data: reduce\)/);
  assert.match(css, /\.eternyx-constellation__ambient \{ filter: none; \}/);
});

test("7: forced colors and reduced motion preserve readability", () => {
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /border-color: CanvasText/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /will-change: auto/);
  assert.match(scene, /role="img"/);
  assert.match(scene, /aria-label="ETERNYX connected by design/);
});
