/**
 * One manual, ordered hosted staging release rehearsal. Never called on PRs.
 * All sources of evidence are regenerated in this process, not downloaded
 * from previously successful or unrelated GitHub Actions runs.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertEducationDbEvidence } from "./educationHostedDbMetadata.mjs";
import { validateEducationReleaseConfig, EDUCATION_RELEASE_STAGES,
  summarizeEducationReleaseEvidence } from "./educationReleaseGate.mjs";

const reports = "test-results";
const releaseFile = join(reports,"education-hosted-release-readiness.json");
const plans = {
 "owner-read":["verifyEducationHostedReadOnly.mjs","verifyEducationHostedEvidence.mjs"],
 "cbt-preflight":["verifyEducationHostedCbtWrite.mjs","verifyEducationHostedCbtEvidence.mjs"],
 "cbt-write":["verifyEducationHostedCbtWrite.mjs","verifyEducationHostedCbtEvidence.mjs"],
 "instructor-review":["verifyEducationHostedInstructorGrading.mjs","verifyEducationHostedInstructorEvidence.mjs"],
 "trusted-finalize":["verifyEducationHostedTrustedFinalization.mjs","verifyEducationTrustedFinalizerEvidence.mjs"],
 "verified-results":["verifyEducationHostedFinalResults.mjs","verifyEducationHostedFinalEvidence.mjs"],
};
function run(file, env) {
  const child = spawnSync(process.execPath,[join("scripts","staging",file)],{
    stdio:"inherit",env,timeout:480000,
  });
  if (child.error || child.status !== 0) throw new Error("Hosted staging verification failed");
}
try {
  const config=validateEducationReleaseConfig(process.env);
  const stages=EDUCATION_RELEASE_STAGES[config.mode];
  const provenance={
    sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,
    attempt:process.env.GITHUB_RUN_ATTEMPT,
  };
  // Fail BEFORE any test creates an attempt, instructor review or final grade.
  // The audit was produced by the preceding workflow step in this exact run.
  const dbEvidence=JSON.parse(readFileSync(
    join(reports,"education-hosted-db-metadata.json"),"utf8"));
  assertEducationDbEvidence(dbEvidence,provenance);
  mkdirSync(reports,{recursive:true});
  rmSync(releaseFile,{force:true});
  // Remove ALL stale source reports before initiating any potentially
  // irreversible stage, including reports from earlier manual runs.
  for(const s of EDUCATION_RELEASE_STAGES.rehearsal)
    rmSync(join(reports,s.filename),{force:true});
  const completed=[];
  for(const stage of stages){
    const evidenceFile=join(reports,stage.filename);
    rmSync(evidenceFile,{force:true});
    const [execute,verify]=plans[stage.id];
    // Do not expose the privileged key to read-only or student/instructor
    // processes, even when the whole rehearsal is authorized to finalize.
    const env={...process.env,
      // PostgreSQL connection credential belongs ONLY to the audit step,
      // never to public-key student/instructor/finalizer child processes.
      ETERNYX_EDU_STAGING_DB_PASSWORD:"",
      ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:
        stage.id==="trusted-finalize" ? process.env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY : ""};
    run(execute,env);
    if (!existsSync(evidenceFile)) throw new Error("Missing hosted evidence");
    run(verify,env);
    completed.push(JSON.parse(readFileSync(evidenceFile,"utf8")));
  }
  const report=summarizeEducationReleaseEvidence(
    config.mode,completed,provenance,dbEvidence);
  writeFileSync(releaseFile,JSON.stringify(report,null,2)+"\n");
  process.stdout.write("Education "+report.outcome+
    "; staging-only evidence recorded; production launch NOT approved.\n");
}catch{
  // A missing or partial report is a hard failure, never a partial pass.
  rmSync(releaseFile,{force:true});
  process.stderr.write("Education release readiness BLOCKED. Do not enable production CBT.\n");
  process.exitCode=1;
}
