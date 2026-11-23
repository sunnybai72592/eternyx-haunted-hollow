import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {COMMON_KEYS,WRITE_KEYS} from "../scripts/staging/educationStagingConfigurationInventory.mjs";
const inventory=readFileSync(new URL("../.github/workflows/education-staging-config-inventory.yml",import.meta.url),"utf8");
const release=readFileSync(new URL("../.github/workflows/education-hosted-release-readiness.yml",import.meta.url),"utf8");

test("standalone inventory uses exactly the same staging inputs as hosted release",()=>{
 const keys=[...COMMON_KEYS,...WRITE_KEYS];
 for(const key of keys){
  const target=new RegExp("^[ ]{6,10}"+key+": \\$\\{\\{ (?:vars|secrets)\\."+key+" \\}\\}$","m");
  assert.match(inventory,target,key);
  assert.ok(release.includes(key+": \${{"),key);
 }
});
test("manual offline inventory does not contact DB or grant release approval",()=>{
 assert.match(inventory,/workflow_dispatch:/);
 assert.match(inventory,/environment: rls-staging/);
 assert.match(inventory,/permissions:\s+contents: read/);
 assert.doesNotMatch(inventory,/\bpush:|\bpull_request:|\bschedule:/);
 assert.doesNotMatch(inventory,/curl |psql |supabase login|supabase db |docker exec/);
 assert.doesNotMatch(inventory,/I_APPROVE_EDUCATION_STAGING_RELEASE_CHECKS/);
 assert.match(inventory,/if: always\(\)/);
});
test("real hosted release checks configuration BEFORE any remote database or write",()=>{
 const inventoryStep=release.indexOf("node scripts/staging/educationStagingConfigurationInventory.mjs");
 const oldConfig=release.indexOf("Reject production, unapproved modes");
 const db=release.indexOf("node scripts/staging/educationHostedDbMetadata.mjs");
 const fixture=release.indexOf("node scripts/staging/educationJourneyFixturePreflight.mjs");
 const runner=release.indexOf("node scripts/staging/runEducationHostedRelease.mjs");
 assert.ok(inventoryStep>0&&inventoryStep<oldConfig&&oldConfig<db&&db<fixture&&fixture<runner);
 assert.match(release,/test-results\/education-hosted-configuration-inventory\.json/);
 const step=release.slice(release.indexOf("      - name: Inventory protected staging"),
   release.indexOf("      - name: Reject production"));
 assert.match(step,/ETERNYX_EDU_STAGING_DB_PASSWORD: \$\{\{ secrets\.ETERNYX_EDU_STAGING_DB_PASSWORD \}\}/);
 assert.doesNotMatch(release.slice(release.indexOf("      - name: Run ordered real-JWT")),
  /ETERNYX_EDU_STAGING_DB_PASSWORD: \$\{\{/);
});
