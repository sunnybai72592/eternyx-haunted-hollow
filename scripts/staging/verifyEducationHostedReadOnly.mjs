/**
 * Manual READ-ONLY ETERNYX Education hosted Supabase staging acceptance.
 * No INSERT, UPDATE, DELETE, DDL, RPC with side effects or service_role.
 * Requires an independently provisioned, in-progress synthetic exam fixture.
 * Never print Auth tokens, email addresses, UUIDs, rows or error messages.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  validateEducationReadOnlyConfig, EDUCATION_READ_CASES,
} from "./educationHostedReadOnlyConfig.mjs";

const reportFile = "test-results/education-hosted-readonly.json";
const results = [];
let configured = false;
let authenticated = 0;
let signedOut = false;
let a, b, anon;

const record = (name, passed) => {
  results.push({ case: name, result: passed ? "passed" : "failed" });
  process.stdout.write((passed ? "PASS " : "FAIL ") + name + "\n");
};
const requireTrue = (value) => { assert.equal(Boolean(value), true); };
function denied(result) {
  const code = String(result?.error?.code || "");
  const message = String(result?.error?.message || "");
  return Boolean(result?.error &&
    (code === "42501" || (/permission denied|row.level security/i.test(message) &&
      !/not found/i.test(message))));
}
function invisible(result) {
  return denied(result) ||
    (!result?.error && Array.isArray(result?.data) && result.data.length === 0);
}
function rows(result, expected) {
  requireTrue(!result?.error && Array.isArray(result.data) &&
    result.data.length === expected);
  return result.data;
}
function makeClient(config) {
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false,
      detectSessionInUrl: false },
    global: { headers: { "X-ETERNYX-EDUCATION-READONLY": "staging-acceptance" } },
  });
}
async function scenario(name, fn) {
  try {
    await fn();
    record(name, true);
  } catch {
    record(name, false);
  }
}
function report() {
  mkdirSync("test-results", { recursive: true });
  // The evidence is intentionally usable for release review but contains no
  // project ref, URLs, token, user ID, email, UUID, row data or error details.
  writeFileSync(reportFile, JSON.stringify({
    schema: 1, suite: "education-hosted-readonly",
    environment: "isolated-supabase-staging",
    configured,
    distinct_authenticated_students: authenticated === 2,
    expected_cases: EDUCATION_READ_CASES.length,
    attempted_cases: results.length,
    passed_cases: results.filter(r => r.result === "passed").length,
    results,
    staged_sql_deployed_by_test: false,
    writes_performed: false,
    production_tested: false,
    production_certified: false,
    sessions_signed_out: signedOut,
  }, null, 2) + "\n");
}

async function main() {
  const config = validateEducationReadOnlyConfig(process.env);
  configured = true;
  const { testId, questionId, optionId, attemptId, answerId } = config.fixture;
  a = makeClient(config);
  b = makeClient(config);
  anon = makeClient(config);
  const users = [];
  for (const [i, c] of [a, b].entries()) {
    const login = await c.auth.signInWithPassword(config.accounts[i]);
    requireTrue(!login.error && login.data?.user?.id);
    const verified = await c.auth.getUser();
    requireTrue(!verified.error && verified.data?.user?.id === login.data.user.id);
    users.push(login.data.user.id);
  }
  requireTrue(users[0] !== users[1]);
  authenticated = 2;
  record("two-distinct-student-auth-identities", true);

  await scenario("student-a-non-admin", async () => {
    const r = await a.rpc("is_admin");
    requireTrue(!r.error && r.data === false);
  });
  await scenario("student-b-non-admin", async () => {
    const r = await b.rpc("is_admin");
    requireTrue(!r.error && r.data === false);
  });
  await scenario("student-a-not-approved-instructor", async () => {
    const r = await a.rpc("education_instructor_access");
    requireTrue(!r.error && r.data?.approved === false);
  });
  await scenario("student-b-not-approved-instructor", async () => {
    const r = await b.rpc("education_instructor_access");
    requireTrue(!r.error && r.data?.approved === false);
  });

  await scenario("student-a-enrolled-catalog", async () => {
    const r = await a.rpc("education_student_enrolled_catalog");
    requireTrue(!r.error && Array.isArray(r.data) &&
      r.data.some(test => test?.id === testId));
  });
  await scenario("student-b-unenrolled-catalog", async () => {
    const r = await b.rpc("education_student_enrolled_catalog");
    requireTrue(!r.error && Array.isArray(r.data) &&
      !r.data.some(test => test?.id === testId));
  });
  await scenario("student-a-enrolled-test-readable", async () => {
    const data = rows(await a.from("tests").select("id")
      .eq("id", testId), 1);
    requireTrue(data[0].id === testId);
  });
  await scenario("student-b-test-invisible", async () => {
    requireTrue(invisible(await b.from("tests").select("id")
      .eq("id", testId)));
  });
  await scenario("student-a-question-readable", async () => {
    const data = rows(await a.from("questions").select("id,test_id")
      .eq("id", questionId), 1);
    requireTrue(data[0].test_id === testId);
  });
  await scenario("student-b-question-invisible", async () => {
    requireTrue(invisible(await b.from("questions").select("id")
      .eq("id", questionId)));
  });
  await scenario("student-a-own-option-readable", async () => {
    const data = rows(await a.from("options").select("id,question_id,option_text")
      .eq("id", optionId), 1);
    requireTrue(data[0].question_id === questionId &&
      typeof data[0].option_text === "string");
  });
  await scenario("student-b-option-invisible", async () => {
    requireTrue(invisible(await b.from("options").select("id")
      .eq("id", optionId)));
  });
  await scenario("student-a-own-attempt-readable", async () => {
    const data = rows(await a.from("user_attempts")
      .select("id,user_id,test_id,status").eq("id", attemptId), 1);
    requireTrue(data[0].user_id === users[0] &&
      data[0].test_id === testId && data[0].status === "in_progress");
  });
  await scenario("student-b-attempt-invisible", async () => {
    requireTrue(invisible(await b.from("user_attempts")
      .select("id").eq("id", attemptId)));
  });
  await scenario("student-a-own-answer-readable", async () => {
    const data = rows(await a.from("user_answers")
      .select("id,attempt_id,question_id,selected_option_id")
      .eq("id", answerId), 1);
    requireTrue(data[0].attempt_id === attemptId &&
      data[0].question_id === questionId &&
      data[0].selected_option_id === optionId);
  });
  await scenario("student-b-answer-invisible", async () => {
    requireTrue(invisible(await b.from("user_answers")
      .select("id").eq("id", answerId)));
  });

  // Column privileges, not merely RLS row policies, must hide correctness
  // on a known owned option. An empty result is NOT sufficient here.
  for (const [label, c] of [
    ["student-a-answer-key-column-denied", a],
    ["student-b-answer-key-column-denied", b],
    ["anonymous-answer-key-column-denied", anon],
  ]) {
    await scenario(label, async () => {
      requireTrue(denied(await c.from("options")
        .select("id,is_correct").eq("id", optionId)));
    });
  }
  for (const [label, c, table, selectColumn] of [
    ["student-a-private-enrollment-table-denied", a,
      "education_test_enrollments", "test_id"],
    ["student-b-private-enrollment-table-denied", b,
      "education_test_enrollments", "test_id"],
    ["student-a-private-instructor-grants-denied", a,
      "education_instructor_grants", "user_id"],
    ["student-b-private-instructor-grants-denied", b,
      "education_instructor_grants", "user_id"],
  ]) {
    await scenario(label, async () => {
      requireTrue(denied(await c.from(table).select(selectColumn).limit(1)));
    });
  }
  await scenario("student-a-admin-review-rpc-denied", async () => {
    requireTrue(denied(await a.rpc("education_admin_publication_queue")));
  });
  await scenario("student-b-admin-review-rpc-denied", async () => {
    requireTrue(denied(await b.rpc("education_admin_publication_queue")));
  });
  await scenario("anonymous-catalog-rpc-denied", async () => {
    requireTrue(denied(await anon.rpc("education_student_enrolled_catalog")));
  });
  await scenario("anonymous-attempt-invisible", async () => {
    requireTrue(invisible(await anon.from("user_attempts")
      .select("id").eq("id", attemptId)));
  });
  await scenario("anonymous-answer-invisible", async () => {
    requireTrue(invisible(await anon.from("user_answers")
      .select("id").eq("id", answerId)));
  });
}

try {
  await main();
} catch {
  // A failure never reveals configuration, server errors or credentials.
  if (!results.some(r => r.case === "two-distinct-student-auth-identities")) {
    record("two-distinct-student-auth-identities", false);
  }
} finally {
  try {
    if (a && b && authenticated === 2) {
      const outcomes = await Promise.all([a, b].map(async c => {
        try { return !(await c.auth.signOut()).error; } catch { return false; }
      }));
      signedOut = outcomes.every(Boolean);
    } else {
      await Promise.all([a, b].filter(Boolean).map(async c => {
        try { await c.auth.signOut(); } catch { /* no user data emitted */ }
      }));
    }
  } catch { signedOut = false; }
  record("both-staging-sessions-signed-out", signedOut);
  report();
}
if (!configured || authenticated !== 2 || !signedOut ||
  results.length !== EDUCATION_READ_CASES.length ||
  EDUCATION_READ_CASES.some((name, index) => results[index]?.case !== name ||
    results[index]?.result !== "passed")) {
  process.exitCode = 1;
}
