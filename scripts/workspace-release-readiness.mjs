#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  evaluateWorkspaceReleaseInventory,
  WORKSPACE_MIGRATION_PATHS,
  WORKSPACE_DRILL_PATHS,
} from "../src/lib/workspaceReleaseInventory.mjs";

const args=process.argv.slice(2);
if(args.length!==1 || !["--source-check","--report"].includes(args[0])) {
  console.error("Usage: node scripts/workspace-release-readiness.mjs --source-check|--report");
  process.exitCode=2;
} else {
  const paths=[
    ...WORKSPACE_MIGRATION_PATHS,...WORKSPACE_DRILL_PATHS,
    ".github/workflows/workspace-revisions-postgres.yml",
    ".github/workflows/ci.yml","src/pages/DigitalWorkspace.tsx",
  ];
  const files=new Map();
  for(const path of paths) {
    try { files.set(path,readFileSync(new URL("../"+path,import.meta.url),"utf8")); }
    catch { files.set(path,null); }
  }
  const report=evaluateWorkspaceReleaseInventory(files);
  if(args[0]==="--report") {
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
  } else {
    process.stdout.write(
      "Workspace offline release inventory: "+
      report.summary.pass+" passed, "+report.summary.fail+" failed.\n"+
      report.checks.filter(c=>c.status==="fail")
        .map(c=>"FAIL "+c.key+": "+c.description+"\n").join("")+
      "Release: "+report.release_gate+"; production certification: NO.\n"+
      report.limitations+"\n"
    );
  }
  if(report.summary.fail)process.exitCode=1;
}
