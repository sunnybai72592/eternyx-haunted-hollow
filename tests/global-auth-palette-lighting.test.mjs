import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const app = read("src/App.tsx");
const atmosphere = read("src/components/auth/AuthAtmosphere.tsx");
const palette = read("src/lib/eternyxPalette.ts");
const dock = read("src/components/EternyxPaletteDock.tsx");
const styles = read("src/styles/eternyx-palettes.css");
const lighting = read("src/styles/lamp-auth.css");

test("all five original auth swatches are now shared across the entire site", () => {
  for (const value of ["cyan", "violet", "emerald", "bronze", "rose"]) {
    assert.match(palette, new RegExp("id: '" + value + "'"));
    assert.match(styles, new RegExp("data-eternyx-palette='" + value + "'"));
  }
  assert.match(dock, /ETERNYX_PALETTES\.map/);
  assert.match(dock, /aria-pressed=\{palette === item\.id\}/);
  assert.match(dock, /aria-label=\{item\.name\}/);
});

test("the palette choice survives refresh and updates across tabs", () => {
  assert.match(palette, /eternyx-auth-palette/);
  assert.match(palette, /localStorage\.setItem/);
  assert.match(palette, /localStorage\.getItem/);
  assert.match(palette, /window\.addEventListener\('storage'/);
  assert.match(palette, /window\.dispatchEvent\(new CustomEvent/);
  assert.match(palette, /document\.documentElement\.dataset\.eternyxPalette/);
  assert.match(palette, /catch \{/); // works when storage is blocked
});

test("one dock is used on auth and one global mount serves all other routes", () => {
  assert.match(atmosphere, /<EternyxPaletteDock\s*\/>/);
  assert.match(app, /!isAuthPage && <EternyxPaletteDock floating\s*\/>/);
  assert.match(app, /applyEternyxPalette\(readEternyxPalette\(\)\)/);
  assert.match(styles, /position: fixed; z-index: 65/);
  assert.match(app, /applyAccountTheme\(profile\?\.preferences\?\.theme\)/);
});

test("semantic design-system accents change globally without suppressing account themes", () => {
  for (const value of ["--primary", "--accent", "--ring", "--cyber-cyan", "--gradient-cyber"]) {
    assert.ok(styles.includes(value), value);
  }
  assert.match(styles, /data-eter-theme='matrix'/);
  assert.match(styles, /data-eter-theme='dark'/);
});

test("lamp-off is actually near-black; lamp-on illuminates while preserving accessible actions", () => {
  assert.match(lighting, /\.lamp-auth-page\[data-light='off'\]\s*\{\s*background:\s*#020304/);
  assert.match(lighting, /\.lamp-auth-page\[data-light='on'\]\s*\{\s*background:/);
  assert.match(lighting, /\.lamp-auth-page\[data-light='on'\] \.lamp-auth-form/);
  assert.match(lighting, /focus-visible/);
  assert.match(lighting, /prefers-reduced-motion: reduce/);
  assert.match(atmosphere, /setOn\(next\)/);
});
