import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkspaceRecoveryReport, recoveryIntegrityState, recoverySafetyWarnings,
} from "../src/lib/workspaceRecoveryProtection.mjs";

const integrity = {
  session_id: "super-private-session", status: "active",
  content_matches: true, baseline_known: true,
  checkpoint_at: "2026-11-23T10:00:00Z", held_at: null,
};
const counts = {
  session_id: integrity.session_id, project_status: "active",
  source_version: 3, receipt_counts_match: true,
  expected_tasks: 2, expected_steps: 1, expected_items: 1, expected_files: 0,
  committed_tasks: 1, committed_steps: 1, committed_items: 0, committed_files: 0,
  actual_tasks: 1, actual_steps: 1, actual_items: 0, stored_objects: 0,
  file_claims: 0, pending_uploads: 0, missing_registered_files: 0,
  unclaimed_objects: 0,
  title: "=Dangerous", storage_path: "owner/secret/file", raw_notes: "sensitive",
};

test("uninspected projects cannot be presented as safe to resume", () => {
  assert.equal(recoveryIntegrityState(null).canResume, false);
  assert.equal(recoveryIntegrityState({}).warning, true);
  assert.match(recoverySafetyWarnings(counts,null)[0], /not been inspected/);
});

test("live server checkpoint matches enable only active imports", () => {
  assert.equal(recoveryIntegrityState(integrity).canResume, true);
  assert.equal(recoveryIntegrityState({...integrity,status:"held"}).canResume, false);
  assert.equal(recoveryIntegrityState({...integrity,status:"complete"}).canResume, false);
  assert.equal(recoveryIntegrityState({...integrity,status:"discarding"}).canResume, false);
});

test("same-count task changes show warnings and refuse safe-resume claim", () => {
  const altered={...integrity,content_matches:false};
  const warnings=recoverySafetyWarnings(counts,altered).join(" ");
  assert.match(warnings,/content changed/i);
  assert.match(warnings,/Record totals still match/);
  assert.equal(recoveryIntegrityState(altered).canResume,false);
});

test("held imports disclose protected state, retaining previous server work", () => {
  const held={...integrity,status:"held",held_at:"2026-11-23T12:00:00Z"};
  assert.match(recoveryIntegrityState(held).label,/Protected/);
  assert.match(recoverySafetyWarnings(counts,held).join(" "),/kept/);
});

test("diagnostics contain only safe server counts, no user content or paths", () => {
  const report=JSON.parse(buildWorkspaceRecoveryReport(counts,integrity));
  assert.equal(report.format,"eternyx.workspace.recovery.diagnostic");
  assert.equal(report.counts.expected_tasks,2);
  assert.equal(report.database_content_matches_checkpoint,true);
  const rendered=JSON.stringify(report);
  for(const token of ["super-private-session","owner/secret/file","=Dangerous","sensitive"]) {
    assert.ok(!rendered.includes(token), token+" should not appear in report");
  }
  assert.match(report.note,/Not a backup/);
});

test("diagnostic export rejects mismatched sessions or unverified counts", () => {
  assert.throws(()=>buildWorkspaceRecoveryReport({...counts,session_id:"other"},integrity),/verified private session/);
  assert.throws(()=>buildWorkspaceRecoveryReport({...counts,actual_tasks:-1},integrity),/missing verified/);
  assert.throws(()=>buildWorkspaceRecoveryReport(counts,{...integrity,status:"forged"}),/unavailable/);
});
