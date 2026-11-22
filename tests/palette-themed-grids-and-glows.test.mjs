import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const gridScreens = [
  "src/pages/AccountCenter.tsx",
  "src/pages/Profile.tsx",
  "src/pages/Settings.tsx",
  "src/pages/CybersecurityHub.tsx",
  "src/pages/BlackHatPentesting.tsx",
  "src/components/home/SectionSelector.tsx",
];

test("remaining decorative grids and glow dots follow the active palette", () => {
  for (const file of gridScreens) {
    const source = read(file);
    assert.doesNotMatch(source, /rgba\(148,163,184,\.12\)/, file);
    assert.doesNotMatch(source, /rgba\(103,232,249,\.9\)/, file);
    assert.doesNotMatch(source, /rgba\(196,181,253,\.9\)/, file);
    assert.match(source, /hsl\(var\(--(?:primary|accent)\)\//, file);
  }
});

test("account hero gradients use semantic background/card/accent instead of fixed blue-black RGB", () => {
  for (const file of ["src/pages/Profile.tsx", "src/pages/AccountCenter.tsx"]) {
    assert.match(read(file), /eternyx-account-hero-glow/);
    assert.doesNotMatch(read(file), /rgba\((?:7,15,30|9,18,34|13,20,43),/, file);
  }
  const css = read("src/styles/eternyx-palettes.css");
  assert.match(css, /\.eternyx-account-hero-glow\s*\{/);
  for (const token of ["--primary", "--background", "--card", "--accent"]) {
    assert.match(css, new RegExp("var\\(" + token + "\\)"));
  }
});

test("all five palettes remain available, with warning/error colors and auth darkness untouched", () => {
  const css = read("src/styles/eternyx-palettes.css");
  for (const p of ["cyan", "violet", "emerald", "bronze", "rose"]) {
    assert.ok(css.includes(":root[data-eternyx-palette='" + p + "']"));
  }
  assert.match(read("src/styles/lamp-auth.css"), /background: #020304;/);
  assert.match(read("src/App.tsx"), /<EternyxPaletteDock floating/);
});
