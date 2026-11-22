// CI-only concurrent Education CBT acceptance against the isolated Postgres 17
// container created by education-postgres-security.yml. No network, secrets,
// external tenants, cloud deployments or live Supabase database connections.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";

const container = "eternyx-education-db-ci";
const admin = "00000000-0000-4000-8000-000000000001";
const student = (suffix) => "00000000-0000-4000-8000-" + suffix.toString().padStart(12, "0");
const active = new Set();
const deadlineMs = 15000;

function dockerPsql(extra = []) {
  return ["exec", "--interactive", container, "psql", "-X", "-q", "-A", "-t",
    "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...extra];
}

function runSql(sql) {
  const result = spawnSync("docker", dockerPsql(), {
    input: sql + "\n",
    encoding: "utf8",
    timeout: deadlineMs,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0,
    "Fixture SQL failed: " + (result.stderr || result.error || result.stdout));
  return result.stdout.trim();
}

function scalar(sql) {
  const lines = runSql(sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) || "";
}

function session(label, uid) {
  const appName = "eternyx_education_" + label;
  const child = spawn("docker", dockerPsql(), { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let closed = false;
  let exitCode = null;
  const completion = new Promise((resolve) => {
    child.once("close", (code) => { closed = true; exitCode = code; resolve(); });
  });
  child.stdout.on("data", (data) => { stdout += String(data); });
  child.stderr.on("data", (data) => { stderr += String(data); });
  const s = {
    appName,
    get output() { return stdout; },
    send(sql) {
      assert.equal(closed, false, label + " psql unexpectedly closed: " + stderr);
      child.stdin.write(sql + "\n");
    },
    async wait(marker) {
      const start = Date.now();
      while (!stdout.includes(marker) && !closed && Date.now() - start < deadlineMs) {
        await pause(30);
      }
      assert(stdout.includes(marker),
        label + " timed out/failed waiting for " + marker +
        "; stdout=" + stdout + "; stderr=" + stderr + "; exit=" + exitCode);
    },
    async close() {
      if (!closed) child.stdin.end();
      await completion;
      assert.equal(exitCode, 0, label + " exited abnormally: " + stderr + stdout);
      active.delete(s);
    },
    stop() {
      if (!closed) child.kill("SIGKILL");
    },
  };
  active.add(s);
  s.send("SET application_name = '" + appName + "'; SET ROLE authenticated; " +
    "SET request.jwt.claim.sub = '" + uid + "'; BEGIN; SELECT 'READY_" + label + "';");
  return s;
}

async function ready(label, uid) {
  const s = session(label, uid);
  await s.wait("READY_" + label);
  return s;
}

async function blocked(appName) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    const count = Number(scalar(
      "SELECT count(*) FROM pg_catalog.pg_stat_activity " +
      "WHERE application_name = '" + appName + "' AND wait_event_type = 'Lock';"
    ));
    if (count > 0) return;
    await pause(80);
  }
  throw new Error("A concurrent transaction never blocked on a database lock: " + appName);
}

function idFrom(output, key) {
  const match = output.match(new RegExp(key + "=([0-9a-f-]{36})", "i"));
  assert(match, key + " missing UUID from session output: " + output);
  return match[1];
}

function count(sql, expected, label) {
  assert.equal(Number(scalar(sql)), expected, label);
}

async function main() {
  const testId = scalar(
    "SELECT id FROM public.tests WHERE title = 'Secondary Instructor Bank' " +
    "AND is_active IS TRUE AND is_published IS TRUE;"
  );
  assert.match(testId, /^[0-9a-f-]{36}$/i, "Published fixture exam not found");
  // Only a disposable test container is mutated. Real Auth accounts are not used.
  runSql("INSERT INTO auth.users (id) VALUES " +
    [7, 8, 9, 10, 11].map((id) => "('" + student(id) + "')").join(",") +
    " ON CONFLICT DO NOTHING;");
  runSql("SET ROLE authenticated; SET request.jwt.claim.sub = '" + admin + "';\n" +
    [7, 8, 9, 10, 11].map((id) =>
      "SELECT public.education_admin_enroll_student('" + testId + "'::uuid, '" +
      student(id) + "'::uuid);").join("\n")
  );

  // 1: Simultaneous starts for the SAME student must return one shared attempt,
  // not a unique-constraint failure or a second live exam.
  const a = await ready("duplicate_a", student(7));
  a.send("SELECT 'FIRST=' || (public.start_cbt_attempt('" + testId +
    "'::uuid)->>'id'); SELECT 'FIRST_LOCKED';");
  await a.wait("FIRST_LOCKED");
  const b = await ready("duplicate_b", student(7));
  b.send("SELECT 'SECOND=' || (public.start_cbt_attempt('" + testId +
    "'::uuid)->>'id'); SELECT 'SECOND_RETURNED';");
  await blocked(b.appName);
  a.send("COMMIT; SELECT 'FIRST_COMMITTED';");
  await a.wait("FIRST_COMMITTED");
  await b.wait("SECOND_RETURNED");
  b.send("COMMIT; SELECT 'SECOND_COMMITTED';");
  await b.wait("SECOND_COMMITTED");
  assert.equal(idFrom(a.output, "FIRST"), idFrom(b.output, "SECOND"),
    "Concurrent starts yielded different attempt IDs");
  await Promise.all([a.close(), b.close()]);
  count("SELECT count(*) FROM public.user_attempts WHERE user_id = '" +
    student(7) + "'::uuid AND test_id='" + testId + "'::uuid;", 1,
    "Concurrent duplicate start persisted more than one attempt");
  console.log("PASS simultaneous start: one reusable locked attempt");

  // 2: If trusted admin revokes enrollment FIRST, a waiting student cannot
  // start an exam after the revocation commits.
  const revokeFirst = await ready("revoke_first", admin);
  revokeFirst.send("SELECT 'REVOKED=' || public.education_admin_revoke_enrollment('" +
    testId + "'::uuid,'" + student(8) + "'::uuid); SELECT 'REVOKE_HELD';");
  await revokeFirst.wait("REVOKE_HELD");
  const waitingStart = await ready("start_after_revoke", student(8));
  waitingStart.send("DO $race$ BEGIN BEGIN " +
    "PERFORM public.start_cbt_attempt('" + testId + "'::uuid); " +
    "RAISE EXCEPTION 'Revoked learner gained exam access'; " +
    "EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $race$; " +
    "SELECT 'REVOKED_START_DENIED';");
  await blocked(waitingStart.appName);
  revokeFirst.send("COMMIT; SELECT 'REVOKE_COMMITTED';");
  await revokeFirst.wait("REVOKE_COMMITTED");
  await waitingStart.wait("REVOKED_START_DENIED");
  waitingStart.send("COMMIT; SELECT 'DENIAL_COMMITTED';");
  await waitingStart.wait("DENIAL_COMMITTED");
  await Promise.all([revokeFirst.close(), waitingStart.close()]);
  count("SELECT count(*) FROM public.user_attempts WHERE user_id='" +
    student(8) + "'::uuid;", 0, "Revoked student acquired an attempt");
  console.log("PASS revoke-first: no post-revocation exam admission");

  // 3: If student starts FIRST, admin revocation must wait and be rejected,
  // because an attempt was already created before the enrollment lock released.
  const startFirst = await ready("start_first", student(9));
  startFirst.send("SELECT 'STARTED9=' || (public.start_cbt_attempt('" + testId +
    "'::uuid)->>'id'); SELECT 'START_HELD';");
  await startFirst.wait("START_HELD");
  const waitingRevoke = await ready("revoke_after_start", admin);
  waitingRevoke.send("DO $race$ BEGIN BEGIN " +
    "PERFORM public.education_admin_revoke_enrollment('" + testId + "'::uuid,'" +
    student(9) + "'::uuid); RAISE EXCEPTION 'Started attempt was revoked'; " +
    "EXCEPTION WHEN invalid_parameter_value THEN NULL; END; END $race$; " +
    "SELECT 'STARTED_REVOKE_DENIED';");
  await blocked(waitingRevoke.appName);
  startFirst.send("COMMIT; SELECT 'START_COMMITTED';");
  await startFirst.wait("START_COMMITTED");
  await waitingRevoke.wait("STARTED_REVOKE_DENIED");
  waitingRevoke.send("COMMIT; SELECT 'REVOKE_DENIAL_COMMITTED';");
  await waitingRevoke.wait("REVOKE_DENIAL_COMMITTED");
  await Promise.all([startFirst.close(), waitingRevoke.close()]);
  count("SELECT count(*) FROM public.education_test_enrollments " +
    "WHERE user_id='" + student(9) + "'::uuid AND test_id='" + testId +
    "'::uuid;", 1, "Enrolled student was revoked after starting");
  console.log("PASS start-first: revocation fails with attempt preserved");

  // Obtain only synthetic fixture IDs for objective-answer race coverage.
  const optionParts = scalar("SELECT q.id::text || '|' || o.id::text " +
    "FROM public.questions AS q JOIN public.options AS o ON o.question_id=q.id " +
    "WHERE q.test_id='" + testId + "'::uuid ORDER BY o.id LIMIT 1;").split("|");
  assert.equal(optionParts.length, 2, "Objective fixture question/option missing");
  const [questionId, optionId] = optionParts;

  function createAttempt(uid) {
    const id = scalar("SET ROLE authenticated; SET request.jwt.claim.sub='" + uid +
      "'; SELECT public.start_cbt_attempt('" + testId + "'::uuid)->>'id';");
    assert.match(id, /^[0-9a-f-]{36}$/i);
    return id;
  }

  // 4: A committed answer saved before a competing submit remains persisted;
  // both methods serialize through the same attempt FOR UPDATE row lock.
  const attempt10 = createAttempt(student(10));
  const saving = await ready("save_first", student(10));
  saving.send("SELECT 'SAVE_RESULT=' || (public.save_cbt_answer('" + attempt10 +
    "'::uuid,'" + questionId + "'::uuid,'" + optionId +
    "'::uuid,NULL)->>'status'); SELECT 'ANSWER_SAVE_HELD';");
  await saving.wait("ANSWER_SAVE_HELD");
  const submitting = await ready("submit_after_save", student(10));
  submitting.send("SELECT 'SUBMIT_RESULT=' || (public.submit_cbt_attempt('" +
    attempt10 + "'::uuid)->>'status'); SELECT 'SUBMIT_AFTER_SAVE_DONE';");
  await blocked(submitting.appName);
  saving.send("COMMIT; SELECT 'SAVE_COMMITTED';");
  await saving.wait("SAVE_COMMITTED");
  await submitting.wait("SUBMIT_AFTER_SAVE_DONE");
  submitting.send("COMMIT; SELECT 'SUBMIT_COMMITTED';");
  await submitting.wait("SUBMIT_COMMITTED");
  assert(saving.output.includes("SAVE_RESULT=saved"), "Valid answer not saved");
  assert(submitting.output.includes("SUBMIT_RESULT=submitted"), "Submission did not finalize");
  await Promise.all([saving.close(), submitting.close()]);
  count("SELECT count(*) FROM public.user_answers WHERE attempt_id='" +
    attempt10 + "'::uuid AND selected_option_id='" + optionId + "'::uuid;", 1,
    "Saved answer was lost in the submit race");
  console.log("PASS save-first: selected answer survives terminal submission");

  // 5: If submit commits FIRST, the losing save must return already_submitted,
  // and not insert a new answer or reset the final exam status.
  const attempt11 = createAttempt(student(11));
  const submittingFirst = await ready("submit_first", student(11));
  submittingFirst.send("SELECT 'SUBMIT_FIRST=' || (public.submit_cbt_attempt('" +
    attempt11 + "'::uuid)->>'status'); SELECT 'SUBMIT_LOCK_HELD';");
  await submittingFirst.wait("SUBMIT_LOCK_HELD");
  const savingLate = await ready("save_after_submit", student(11));
  savingLate.send("SELECT 'LATE_SAVE=' || (public.save_cbt_answer('" + attempt11 +
    "'::uuid,'" + questionId + "'::uuid,'" + optionId +
    "'::uuid,NULL)->>'status'); SELECT 'LATE_SAVE_DONE';");
  await blocked(savingLate.appName);
  submittingFirst.send("COMMIT; SELECT 'SUBMIT_FIRST_COMMITTED';");
  await submittingFirst.wait("SUBMIT_FIRST_COMMITTED");
  await savingLate.wait("LATE_SAVE_DONE");
  savingLate.send("COMMIT; SELECT 'LATE_SAVE_COMMITTED';");
  await savingLate.wait("LATE_SAVE_COMMITTED");
  assert(submittingFirst.output.includes("SUBMIT_FIRST=submitted"),
    "First submit did not complete");
  assert(savingLate.output.includes("LATE_SAVE=already_submitted"),
    "Late save mutated a submitted exam");
  await Promise.all([submittingFirst.close(), savingLate.close()]);
  count("SELECT count(*) FROM public.user_answers WHERE attempt_id='" +
    attempt11 + "'::uuid;", 0, "Late save inserted answer after submission");
  count("SELECT count(*) FROM public.user_attempts WHERE id IN ('" +
    attempt10 + "'::uuid,'" + attempt11 + "'::uuid) AND status='submitted' " +
    "AND end_time IS NOT NULL;", 2,
    "A concurrent save/submit race corrupted terminal state");
  console.log("PASS submit-first: late save ignored and final state retained");
  console.log("All five deterministic Education concurrency gates passed.");
}

try {
  await main();
} finally {
  for (const s of active) s.stop();
}
