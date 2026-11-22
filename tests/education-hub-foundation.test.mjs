import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { filterEducationTests, normalizeEducationTest } from "../src/lib/educationCatalog.mjs";

const page = readFileSync(new URL("../src/pages/Education.tsx", import.meta.url), "utf8");
const a = {id:"11111111-1111-4111-8111-111111111111",title:"  CP fundamentals  ",description:"Cathodic protection",duration_minutes:30,is_active:true,created_at:"2026-11-20T00:00:00Z"};
const b = {id:"22222222-2222-4222-8222-222222222222",title:"Coating inspection",description:"DFT and blasting",duration_minutes:15,is_active:true,created_at:"2026-11-21T00:00:00Z"};
const c = {id:"33333333-3333-4333-8333-333333333333",title:"API documentation",description:"Developer skills",duration_minutes:40,is_active:true,created_at:"2026-11-19T00:00:00Z"};
const rows = [a,b,c].map(normalizeEducationTest);

test("1: only valid active assessment records are displayed", () => {
  assert.equal(normalizeEducationTest({...a,is_active:false}),null);
  assert.equal(normalizeEducationTest({...a,duration_minutes:0}),null);
  assert.equal(normalizeEducationTest({...a,duration_minutes:1.5}),null);
  assert.equal(normalizeEducationTest({...a,id:"invalid"}),null);
  assert.equal(normalizeEducationTest(null),null);
  assert.equal(normalizeEducationTest({...a,description:null}).description,"");
});

test("2: title, metadata and duration are sanitized for display", () => {
  assert.equal(normalizeEducationTest(a).title,"CP fundamentals");
  assert.equal(normalizeEducationTest({...a,title:" "}),null);
  assert.equal(normalizeEducationTest({...a,duration_minutes:1441}),null);
  assert.equal(normalizeEducationTest({...a,description:"  Field theory "}).description,"Field theory");
});

test("3: filter works for case-insensitive title and description searches", () => {
  assert.deepEqual(filterEducationTests(rows,"cathodic").map(x=>x.id),[a.id]);
  assert.deepEqual(filterEducationTests(rows,"COATING").map(x=>x.id),[b.id]);
  assert.deepEqual(filterEducationTests(rows,"NO MATCH"),[]);
});

test("4: latest, alphabetic and duration sorting are deterministic", () => {
  assert.deepEqual(filterEducationTests(rows,"","newest").map(x=>x.id),[b.id,a.id,c.id]);
  assert.deepEqual(filterEducationTests(rows,"","title").map(x=>x.id),[c.id,b.id,a.id]);
  assert.deepEqual(filterEducationTests(rows,"","shortest").map(x=>x.id),[b.id,a.id,c.id]);
  assert.deepEqual(rows.map(x=>x.id),[a.id,b.id,c.id], "sorting must not mutate the query cache");
});

test("5: search is bounded to 120 characters and blank queries display all", () => {
  assert.equal(filterEducationTests(rows," ").length,3);
  assert.deepEqual(filterEducationTests(rows,"x".repeat(1000)),[]);
});

test("6: Education uses the existing shared authenticated session instead of duplicate listeners", () => {
  assert.match(page,/useAuthStore/);
  assert.match(page,/queryKey: \["education-active-tests", user\?\.id\]/);
  assert.match(page,/enabled: !authLoading && isAuthenticated && !!user\?\.id/);
  assert.doesNotMatch(page,/onAuthStateChange/);
});

test("7: sign-in routes to auth and carries Education as redirect target", () => {
  assert.ok(page.includes('to="/auth?redirect=%2Feducation"'));
  assert.doesNotMatch(page,/navigate\('\/'\)/);
  assert.match(page,/Sign in to Education/);
});

test("8: real Supabase active tests, retry and safe loading/empty states are preserved", () => {
  assert.match(page,/\.from\("tests"\)/);
  assert.match(page,/\.eq\("is_active", true\)/);
  assert.match(page,/\.select\("id,title,description,duration_minutes,created_at,is_active"\)/);
  assert.match(page,/Retry loading/);
  assert.match(page,/No active assessments available/);
  assert.match(page,/No matching assessments/);
  assert.match(page,/role="status" aria-live="polite"/);
});

test("9: accessible filtering, responsive cards and direct route navigation are functional", () => {
  assert.match(page,/htmlFor="education-search"/);
  assert.match(page,/htmlFor="education-sort"/);
  assert.match(page,/type="search"/);
  assert.match(page,/onChange=\{e => setSearch\(e\.target\.value\)\}/);
  assert.match(page,/setSort\(e\.target\.value\)/);
  assert.match(page,/Clear filters/);
  assert.match(page,/educationAttemptNavigation\(test\.id, previous, attemptCheckReady, user\?\.id\)/);
  assert.match(page,/to=\{action\.path\}/);
  assert.match(page,/sm:grid-cols-2 xl:grid-cols-3/);
});

test("10: education displays only grounded capability claims and follows palette tokens", () => {
  assert.match(page,/not proof of automatic grading/);
  assert.match(page,/controlled by server permissions/);
  assert.doesNotMatch(page,/screen lock detection and session monitoring/);
  assert.match(page,/from-primary\/10 via-card to-accent\/10/);
  assert.match(page,/bg-primary text-primary-foreground/);
});

test("11: page TSX syntax parses before production build", () => {
  const parsed=ts.createSourceFile("Education.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
