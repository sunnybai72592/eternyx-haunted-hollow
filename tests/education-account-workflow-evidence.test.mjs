import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshAccountJournal} from "../scripts/staging/educationStagingAccountProvision.mjs";
import {recoveryEvidence} from "../scripts/staging/educationAccountWorkflowEvidence.mjs";
const env={GITHUB_SHA:"a".repeat(40),GITHUB_RUN_ID:"123",GITHUB_RUN_ATTEMPT:"1"};
const workflow=readFileSync(new URL("../.github/workflows/education-staging-account-provision.yml",import.meta.url),"utf8");
test("account creation is protected, manual, main-only and never automatically rerun",()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/environment: rls-staging/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/github\.run_attempt == '1'/);
 assert.match(workflow,/inputs\.approve_new_accounts && inputs\.acknowledge_partial_failure/);
 assert.match(workflow,/group: eternyx-education-hosted-shared-staging/);
 assert.doesNotMatch(workflow,/pull_request:|push:|schedule:/);
});
test("secrets limited to account creation step and private files never uploaded",()=>{
 const index=workflow.indexOf("Create and independently verify");
 const end=workflow.indexOf("Independently sanitize");
 assert.doesNotMatch(workflow.slice(0,index),/secrets\./);
 assert.doesNotMatch(workflow.slice(end),/secrets\./);
 assert.match(workflow.slice(index,end),/secrets\.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY/);
 assert.match(workflow,/path: test-results\/education-account-provision-recovery\.json/);
 assert.doesNotMatch(workflow,/\.private\.json|DB_PASSWORD/);
});
test("journal validation rejects sensitive extra fields, forged success and repeated run",()=>{
 const j=freshAccountJournal();
 assert.equal(recoveryEvidence(j,env).outcome,"in_progress");
 assert.throws(()=>recoveryEvidence({...j,secret:"private"},env));
 assert.throws(()=>recoveryEvidence({...j,outcome:"four_accounts_verified"},env));
 assert.throws(()=>recoveryEvidence(j,{...env,GITHUB_RUN_ATTEMPT:"2"}));
 j.accounts[0].status="creation_may_have_occurred";
 j.outcome="blocked_inspect_before_retry";
 assert.equal(recoveryEvidence(j,env).automatic_retry_allowed,false);
 j.accounts[0].email="private";
 assert.throws(()=>recoveryEvidence(j,env));
});

test("default config-only dispatch does not require mutation approvals and skips recovery upload",()=>{
 assert.match(workflow,/check_config_only:[\s\S]*?default: true/);
 assert.match(workflow,/inputs\.check_config_only \|\| \(inputs\.approve_new_accounts && inputs\.acknowledge_partial_failure\)/);
 assert.match(workflow,/inputs\.check_config_only && '--check-config'/);
 assert.equal((workflow.match(/if: always\(\) && !inputs\.check_config_only/g)||[]).length,2);
 const runner=readFileSync(new URL("../scripts/staging/runEducationStagingAccountProvision.mjs",import.meta.url),"utf8");
 assert.ok(runner.indexOf('process.argv.includes("--check-config")')<runner.indexOf("writeFileSync(path,"));
});
