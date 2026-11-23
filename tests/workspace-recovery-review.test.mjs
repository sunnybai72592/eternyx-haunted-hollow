import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKSPACE_RECOVERY_PAGE_SIZE, workspaceRecoveryMetrics,
  workspaceRecoveryWarnings, workspaceRecoveryPhase,
  workspaceRecoveryCanPrepare, workspaceRecoveryCanFinalize,
} from "../src/lib/workspaceRecoveryReview.mjs";

const report = {
  session_id:"session", project_id:"project", status:"active",
  committed_tasks:2,expected_tasks:3,actual_tasks:2,
  committed_steps:3,expected_steps:4,actual_steps:3,
  committed_items:1,expected_items:2,actual_items:2,
  committed_files:1,expected_files:1,
  stored_objects:1,file_claims:1,pending_uploads:0,
  missing_registered_files:0,unclaimed_objects:0,
  receipt_counts_match:true,
  can_prepare_discard:false,can_finalize_discard:false,
};

test("recovery report reflects actual committed and expected task, step and file counts",()=>{
  const rows=workspaceRecoveryMetrics(report);
  assert.deepEqual(rows.map(r=>[r.label,r.committed,r.expected]),[
    ["Tasks",2,3],["Checklist steps",3,4],
    ["Saved notes/links",1,2],["Registered files",1,1],
  ]);
  assert.equal(rows[0].actual,2);
  assert.equal(rows[2].actual,2); // Notes plus registered files physically exist.
  assert.equal(rows[3].actual,null); // No falsely inferred file object count.
  assert.deepEqual(workspaceRecoveryWarnings(report),[]);
  assert.equal(WORKSPACE_RECOVERY_PAGE_SIZE,20);
});

test("recovery warns about physical Storage anomalies rather than presenting fake success",()=>{
  const altered={...report,receipt_counts_match:false,actual_tasks:3,
    pending_uploads:1,missing_registered_files:2,unclaimed_objects:1};
  const warnings=workspaceRecoveryWarnings(altered).join(" ");
  assert.match(warnings,/differ/);
  assert.match(warnings,/awaiting database registration/);
  assert.match(warnings,/missing from private Storage/);
  assert.match(warnings,/outside this import/);
});

test("invalid counts or missing physical checks fail closed",()=>{
  assert.throws(()=>workspaceRecoveryMetrics(null),/valid server report/);
  assert.throws(()=>workspaceRecoveryMetrics({...report,committed_tasks:-1}),/invalid/);
  assert.throws(()=>workspaceRecoveryWarnings({...report,stored_objects:1,
    pending_uploads:undefined}),/lacks physical file checks/);
  assert.throws(()=>workspaceRecoveryMetrics({...report,expected_steps:1.5}),/invalid/);
});

test("status descriptions report real server phases",()=>{
  assert.match(workspaceRecoveryPhase("active"),/same archive/);
  assert.match(workspaceRecoveryPhase("complete"),/previously restored/);
  assert.match(workspaceRecoveryPhase("discarding"),/Sealed/);
  assert.match(workspaceRecoveryPhase("invalid"),/Unknown status/);
});

test("destructive actions require explicit server eligibility, never inferred counts",()=>{
  assert.equal(workspaceRecoveryCanPrepare({...report,committed_tasks:0,actual_tasks:0}),false);
  assert.equal(workspaceRecoveryCanPrepare({...report,can_prepare_discard:true}),true);
  assert.equal(workspaceRecoveryCanFinalize({...report,status:"discarding",
    can_finalize_discard:true}),true);
  assert.equal(workspaceRecoveryCanFinalize({...report,status:"complete",
    can_finalize_discard:true}),false);
  assert.equal(workspaceRecoveryCanPrepare({...report,status:"complete",
    can_prepare_discard:true}),false);
});
