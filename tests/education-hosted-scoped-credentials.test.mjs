import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const FILES=Object.freeze([
 "education-hosted-release-readiness.yml",
 "education-staging-config-inventory.yml",
 "education-hosted-trusted-finalization.yml",
 "education-hosted-cbt-write.yml",
 "education-hosted-instructor-final-grading.yml",
 "education-hosted-readonly.yml",
 "education-hosted-final-results.yml",
]);
function content(file){
 return readFileSync(new URL("../.github/workflows/"+file,import.meta.url),"utf8");
}
const policies=Object.fromEntries(FILES.map(name=>[name,content(name)]));
const stepsOf=text=>{
 const sep="\n    steps:\n",pos=text.indexOf(sep);
 assert.ok(pos>=0,"steps block missing");
 const job=text.slice(0,pos);
 const steps=text.slice(pos+sep.length).split(/\n      - /).map((p,i)=>{
  const source=i===0?p:"      - "+p;
  return {title:source.match(/(?:^|\n)\s+- name: ([^\n]+)/)?.[1]||
    source.match(/uses: ([^\n]+)/)?.[1]||"unnamed",source};
 });
 return {job,steps};
};
const findStep=(w,label)=>{
 const s=stepsOf(w).steps.find(x=>x.title===label);
 assert.ok(s, "missing required step "+label);
 return s.source;
};
const secretRefCount=s=>(s.match(/\$\{\{\s*(?:secrets)\./g)||[]).length;

test("all seven Education manual hosted jobs are main-only and fail closed before protected environment access",()=>{
 for(const [name,w] of Object.entries(policies)){
  assert.match(w,/workflow_dispatch:/,name);
  assert.match(w,/environment: rls-staging/);
  assert.match(w,/if: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main' && github\.repository == 'sunnybai72592\/eternyx-haunted-hollow' \}\}/);
  assert.match(w,/permissions:\s+contents: read/);
  const {job}=stepsOf(w);
  assert.equal(secretRefCount(job),0,name+" leaked a secret at job scope");
 }
});
test("checkout, npm ci, app setup and artifact upload do not receive credential bindings",()=>{
 for(const [name,w] of Object.entries(policies)){
  const {job,steps}=stepsOf(w);
  assert.equal(secretRefCount(job),0);
  for(const s of steps){
   if(/actions\/checkout|actions\/setup-node|actions\/upload-artifact|npm ci|Verify sanitized evidence|Independently .*evidence|Validate all sanitized/.test(s.source)){
    assert.equal(secretRefCount(s.source),0,name+": "+s.title);
   }
  }
 }
});
test("release workflow scopes basic identity credentials to needed steps; privileged key never reaches SQL probes",()=>{
 const w=policies["education-hosted-release-readiness.yml"];
 const expect={
  "Inventory protected staging settings and fixture contracts before any remote checks":
    ["ETERNYX_RLS_STAGING_PUBLISHABLE_KEY","ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY","ETERNYX_EDU_STAGING_DB_PASSWORD"],
  "Reject production, unapproved modes, malformed fixtures and unsafe grant configuration":
    ["ETERNYX_RLS_TEST_A_PASSWORD","ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY"],
  "Verify real staging database RLS, grants and protected grading before any CBT writes":
    ["ETERNYX_RLS_TEST_A_PASSWORD","ETERNYX_EDU_STAGING_DB_PASSWORD"],
  "Validate fresh journey exam, instructor ownership and expected marks before any write":
    ["ETERNYX_RLS_INSTRUCTOR_PASSWORD","ETERNYX_EDU_STAGING_DB_PASSWORD"],
  "Run ordered real-JWT protected backend acceptance and issue staging-only verdict":
    ["ETERNYX_RLS_TEST_B_PASSWORD","ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY"],
 };
 for(const [label,names] of Object.entries(expect)){
  const step=findStep(w,label);
  assert.match(step,/\n        env:\n/,"no scoped step env: "+label);
  for(const key of names)
   assert.ok(step.includes(key+": "),label+" missing "+key);
 }
 const db=findStep(w,"Verify real staging database RLS, grants and protected grading before any CBT writes");
 const fixture=findStep(w,"Validate fresh journey exam, instructor ownership and expected marks before any write");
 const runner=findStep(w,"Run ordered real-JWT protected backend acceptance and issue staging-only verdict");
 for(const x of [db,fixture]) assert.doesNotMatch(x,/ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(runner,/ETERNYX_EDU_STAGING_DB_PASSWORD/);
 const npm=findStep(w,"Install locked dependencies");
 assert.equal(secretRefCount(npm),0);
});
test("each standalone hosted verification limits test account credentials to approval and live-acceptance steps",()=>{
 const paired={
  "education-hosted-trusted-finalization.yml":[
   "Reject unsafe project, role, mode or missing irreversible-write approval",
   "Run genuine Supabase staging Auth and reviewed final-grade acceptance"],
  "education-hosted-cbt-write.yml":[
   "Fail closed on unsafe project, mode, credentials or incomplete approvals",
   "Execute actual staging Auth and CBT preflight or one-time student write"],
  "education-hosted-instructor-final-grading.yml":[
   "Fail closed on missing project isolation or review approval",
   "Exercise protected real-JWT review or finalized result reads"],
  "education-hosted-readonly.yml":[
   "Explicitly reject unapproved or unsafe staging configuration",
   "Query real staging Auth and Data API with two test identities"],
  "education-hosted-final-results.yml":[
   "Require owner approval and verify all isolated staging guards",
   "Verify real hosted Auth and final-grade PostgREST boundaries"],
 };
 for(const [file,labels] of Object.entries(paired)){
  const w=policies[file];
  for(const label of labels){
   const step=findStep(w,label);
   assert.ok(step.includes("ETERNYX_RLS_TEST_A_PASSWORD: "),file+" missing credentials at "+label);
   assert.ok(secretRefCount(step)>=6,file+" missing scoped credential bindings");
  }
  const install=stepsOf(w).steps.find(x=>x.source.includes("run: npm ci"));
  assert.ok(install);
  assert.equal(secretRefCount(install.source),0);
 }
 const finalizer=policies["education-hosted-trusted-finalization.yml"];
 const privilegedSteps=stepsOf(finalizer).steps.filter(s=>s.source.includes("ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:"));
 assert.equal(privilegedSteps.length,2);
});
test("standalone configuration inventory has no database behavior and exposes secrets to a single diagnostic step only",()=>{
 const file=policies["education-staging-config-inventory.yml"];
 const steps=stepsOf(file).steps;
 const bound=steps.filter(s=>secretRefCount(s.source)>0);
 assert.equal(bound.length,1);
 assert.match(bound[0].source,/node scripts\/staging\/educationStagingConfigurationInventory\.mjs/);
 assert.ok(bound[0].source.includes("ETERNYX_EDU_STAGING_DB_PASSWORD:"));
 assert.ok(bound[0].source.includes("ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:"));
 assert.doesNotMatch(bound[0].source,/psql |curl |supabase db |docker /);
});
