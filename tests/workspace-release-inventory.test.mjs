import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateWorkspaceReleaseInventory,
  WORKSPACE_MIGRATION_PATHS,
  WORKSPACE_DRILL_PATHS,
} from "../src/lib/workspaceReleaseInventory.mjs";

function fixture() {
  const paths=[...WORKSPACE_MIGRATION_PATHS,...WORKSPACE_DRILL_PATHS];
  const files=new Map(paths.map(path=>[path,"-- synthetic file with more than twenty characters"]));
  files.set(".github/workflows/workspace-revisions-postgres.yml",
    paths.join("\n"));
  files.set(".github/workflows/ci.yml",
    "run: node scripts/workspace-release-readiness.mjs --source-check");
  files.set("src/pages/DigitalWorkspace.tsx",
    "<WorkspaceReadinessPanel owner={owner} />");
  return files;
}
test("complete SOURCE inventory still requires real staging release review",()=>{
  const report=evaluateWorkspaceReleaseInventory(fixture());
  assert.equal(report.summary.fail,0);
  assert.equal(report.release_gate,"manual_review_required");
  assert.equal(report.production_certified,false);
  assert.equal(report.live_migrations_checked,false);
  assert.equal(report.real_storage_bytes_tested,false);
  assert.ok(report.checks.length>=20);
});
test("missing migration, omitted CI smoke or UI wiring blocks source inventory",()=>{
  const missing=fixture();
  missing.delete(WORKSPACE_MIGRATION_PATHS[0]);
  assert.equal(evaluateWorkspaceReleaseInventory(missing).release_gate,"blocked");
  const noDrill=fixture();
  noDrill.set(".github/workflows/workspace-revisions-postgres.yml",
    WORKSPACE_MIGRATION_PATHS.join("\n"));
  assert.ok(evaluateWorkspaceReleaseInventory(noDrill).summary.fail>=1);
  const noPanel=fixture();
  noPanel.set("src/pages/DigitalWorkspace.tsx","no readiness panel");
  assert.equal(evaluateWorkspaceReleaseInventory(noPanel).release_gate,"blocked");
  const noCi=fixture();
  noCi.set(".github/workflows/ci.yml","no offline inventory");
  assert.ok(evaluateWorkspaceReleaseInventory(noCi).checks
    .some(check=>check.key==="ci:readiness"&&check.status==="fail"));
});
test("invalid source map is never accepted as a successful audit",()=>{
  assert.throws(()=>evaluateWorkspaceReleaseInventory(null),/readable file map/);
});
