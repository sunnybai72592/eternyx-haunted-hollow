import test from "node:test";
import assert from "node:assert/strict";
import { expectedCases, validateStagingEvidence } from "../scripts/staging/verifyRlsEvidence.mjs";

const tables = ["conversation_sessions", "chat_history", "pentest_engagements"];
const valid = () => ({
  schema: 1, environment: "isolated-supabase-staging",
  approval: "isolated staging only: manual fixture writes",
  production_tested: false, stage_fixture_cleanup_failed: false,
  tested_tables: [...tables], expected_tables: [...tables],
  configured_account_slots: 2, authenticated_accounts: 2,
  expected_cases: 27, attempted_cases: 27, passed_cases: 27,
  results: expectedCases.map(c => ({ case: c, result: "passed" })),
  production_certified: false,
});
test("exact 27-case staging evidence accepted as a consistency check", () => {
  assert.equal(expectedCases.length, 27);
  assert.equal(validateStagingEvidence(valid()), true);
});
test("partial, duplicate and unknown cases fail closed", () => {
  const partial = valid(); partial.results.pop();
  assert.equal(validateStagingEvidence(partial), false);
  const duplicate = valid(); duplicate.results[1] = duplicate.results[0];
  assert.equal(validateStagingEvidence(duplicate), false);
  const unknown = valid(); unknown.results[1] = {case:"forged-success",result:"passed"};
  assert.equal(validateStagingEvidence(unknown), false);
});
test("failed checks and forged counts are rejected", () => {
  const failure = valid(); failure.results[0].result = "failed";
  assert.equal(validateStagingEvidence(failure), false);
  const count = valid(); count.passed_cases = 26;
  assert.equal(validateStagingEvidence(count), false);
});
test("missing signout, cleanup failure or absent authentication rejected", () => {
  const signout = valid(); signout.results.pop();
  assert.equal(validateStagingEvidence(signout), false);
  const cleanup = valid(); cleanup.stage_fixture_cleanup_failed = true;
  assert.equal(validateStagingEvidence(cleanup), false);
  const accounts = valid(); accounts.authenticated_accounts = 0;
  assert.equal(validateStagingEvidence(accounts), false);
});
test("unexpected tables, production claims and extra data refused", () => {
  const missing = valid(); missing.tested_tables.pop();
  assert.equal(validateStagingEvidence(missing), false);
  const claim = valid(); claim.production_certified = true;
  assert.equal(validateStagingEvidence(claim), false);
  const extra = valid(); extra.results[0].email = "private@example.test";
  assert.equal(validateStagingEvidence(extra), false);
  const secret = valid(); secret.credential = "do not store";
  assert.equal(validateStagingEvidence(secret), false);
});
