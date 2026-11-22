import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const finder = read("src/components/home/HomeTaskFinder.tsx");
const resume = read("src/components/home/ContinueWork.tsx");
const home = read("src/components/home/SectionSelector.tsx");

test("1: empty or irrelevant task searches show real fallback suggestions instead of relying on an absent top result", () => {
  assert.match(finder, /findHomeTaskChoices\\(value, tools\\)/);
  assert.match(finder, /No matching tool found/);
  assert.match(finder, /to="\/explore"/);
  assert.match(finder, /setChoices\\(found\\)/);
});

test("2: task search is keyboard and screen-reader navigable with announced result count", () => {
  for (const attr of ['type="search"', 'autoComplete="off"', 'aria-describedby="home-task-hint"', 'aria-controls="home-task-results"', 'aria-live="polite"', 'aria-atomic="true"', 'type="submit"']) assert.ok(finder.includes(attr), attr);
  assert.match(finder, /resultCount === 1 \? "tool" : "tools"/);
  assert.match(finder, /Results are suggestions, not executed tools/);
});

test("3: task entry is usable on small screens with an obvious focus and accessible tap target", () => {
  assert.match(finder, /flex flex-col gap-2.*sm:flex-row/);
  assert.match(finder, /min-h-11 min-w-0 flex-1/);
  assert.match(finder, /focus-visible:ring-2 focus-visible:ring-primary/);
  assert.match(finder, /disabled:cursor-not-allowed/);
  assert.match(finder, /maxLength=\{240\}/);
});

test("4: task suggestions and quick examples use semantic five-color palette tokens", () => {
  for (const token of ['bg-card', 'text-foreground', 'text-primary', 'text-primary-foreground', 'border-primary/30', 'border-border']) assert.ok(finder.includes(token), token);
  assert.doesNotMatch(finder, /(?:bg|text|border)-cyan-/);
  assert.match(finder, /examples\.map\(example/);
});

test("5: Continue Work resumes real local scratchpad data with keyboard focus", () => {
  assert.match(resume, /resumableNote\(localStorage\)/);
  assert.match(resume, /state=\{\{ resumeNote: note \}\}/);
  assert.match(resume, /focus-visible:ring-primary/);
  assert.match(resume, /focus-visible:ring-offset-background/);
  assert.match(resume, /text-muted-foreground/);
  assert.doesNotMatch(resume, /(?:bg|text|border)-cyan-/);
});

test("6: homepage ambient light and major CTAs follow the chosen palette", () => {
  for (const token of ['bg-primary/[0.13]', 'bg-accent/[0.13]', 'bg-primary px-6 font-bold text-primary-foreground', 'hover:bg-primary/90', 'bg-gradient-to-r from-primary/[0.08] via-accent/[0.04]']) assert.ok(home.includes(token), token);
  assert.doesNotMatch(home, /bg-cyan-200 px-6 font-bold/);
  assert.match(home, /motion-safe:hover:-translate-y-0\.5/);
});

test("7: all six pillar icon accents inherit the user's swatch without duplicate mappings", () => {
  assert.match(home, /border-primary\/20 bg-primary\/\[0\.08\] text-primary/);
  assert.doesNotMatch(home, /const accentClasses/);
  assert.match(home, /ecosystemPillars\.map/);
  assert.match(home, /pillar\.href/);
  assert.match(home, /isActive \? "border-emerald-300/);
});

test("8: core experience remains: six pillars, live constellation, account signup and accessible search", () => {
  assert.match(home, /<EternalConstellation \/>/);
  assert.match(home, /id="pillars"/);
  assert.match(home, /navigate\("\/auth\?mode=signup"\)/);
  assert.match(home, /navigate\("\/account"\)/);
  const colors = read("src/styles/eternyx-palettes.css");
  for (const p of ["cyan", "violet", "emerald", "bronze", "rose"]) assert.ok(colors.includes(":root[data-eternyx-palette='" + p + "']"));
});


test("9: TypeScript parser detects syntax errors in the homepage task finder", () => {
  const parsed = ts.createSourceFile(
    "HomeTaskFinder.tsx", finder, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX
  );
  assert.deepEqual(
    parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
    [],
    "Task finder must be syntactically valid before the production Vite build"
  );
});
