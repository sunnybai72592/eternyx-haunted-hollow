#!/usr/bin/env node
/**
 * ETERNYX Automation staging deployment handoff: source-anchored PLAN ONLY.
 * No network requests, linked-project lookup, CLI execution, migrations,
 * function deployment, secret inspection, scheduler tick, or external actions.
 */
import {createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {
  REQUIRED_FUNCTIONS,inspectSources,checkFunctions,checkMigrations,
} from "./automation-runtime-readiness.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const REF=/^[a-z]{20}$/;
const SQL=/^(20\d{12})_[a-z0-9_]+\.sql$/;
const FUNCTION_ORDER=Object.freeze([
  "automation-control",
  "automation-schedule-control",
  "automation-webhook",
  "automation-scheduler-worker",
  "automation-github-public",
  "automation-github-issues",
]);
export const FUNCTION_SECRETS=Object.freeze({
  "automation-control":["AUTOMATION_WEBHOOK_ENCRYPTION_KEY",
    "AUTOMATION_SCHEDULE_ENCRYPTION_KEY","AUTOMATION_APPROVAL_ENCRYPTION_KEY",
    "AUTOMATION_PREVIEW_AUDIT_KEY"],
  "automation-schedule-control":["AUTOMATION_SCHEDULE_ENCRYPTION_KEY",
    "AUTOMATION_SCHEDULER_WORKER_KEY"],
  "automation-webhook":["AUTOMATION_WEBHOOK_ENCRYPTION_KEY",
    "AUTOMATION_APPROVAL_ENCRYPTION_KEY"],
  "automation-scheduler-worker":["AUTOMATION_SCHEDULER_WORKER_KEY",
    "AUTOMATION_SCHEDULE_ENCRYPTION_KEY"],
  "automation-github-public":[],
  "automation-github-issues":["AUTOMATION_GITHUB_WRITE_ENCRYPTION_KEY"],
});
function issue(code,subject){return {code,subject};}
function digest(content){return createHash("sha256").update(content).digest("hex");}
function validatedRef(ref,label){
  if(typeof ref!=="string"||!REF.test(ref))throw Error("Invalid "+label+" project reference");
  return ref;
}
async function sources(root){
  const scan=await inspectSources(root);
  const allFiles=(await readdir(path.join(root,"supabase/migrations")))
    .filter(name=>SQL.test(name)).sort();
  const allVersions=new Set(),duplicateVersions=[];
  for(const name of allFiles){
    const version=SQL.exec(name)[1];
    if(allVersions.has(version))duplicateVersions.push(version);
    allVersions.add(version);
  }
  const automation=scan.migrations;
  const fingerprints=[];
  for(const name of automation){
    const bytes=await readFile(path.join(root,"supabase/migrations",name));
    fingerprints.push({name,sha256:digest(bytes)});
  }
  const functions=[];
  for(const slug of FUNCTION_ORDER){
    const code=await readFile(path.join(root,"supabase/functions",slug,"index.ts"));
    functions.push({slug,sha256:digest(code),
      expectedJwt:REQUIRED_FUNCTIONS[slug],
      serverOnlySecretNames:FUNCTION_SECRETS[slug]});
  }
  const orderWrong=automation.some((name,i)=>i>0&&automation[i-1]>=name);
  return {scan,allMigrationCount:allFiles.length,automationMigrations:fingerprints,
    otherMigrationCount:allFiles.length-fingerprints.length,duplicateVersions,
    orderWrong,functions};
}
export function buildPlanFromEvidence(source,{stagingRef=null,productionRef=null,
  inventory=null,migrationEvidence=null,now=new Date()}={}){
  const hasRefs=stagingRef!==null||productionRef!==null;
  if(hasRefs){
    validatedRef(stagingRef,"staging");
    validatedRef(productionRef,"production");
    if(stagingRef===productionRef)throw Error("Staging cannot be the production project");
  }
  if(!hasRefs&&(inventory!==null||migrationEvidence!==null)){
    throw Error("Target refs required for remote evidence");
  }
  const blockers=source.scan.problems.map(x=>issue(x.code,x.subject));
  for(const version of new Set(source.duplicateVersions))
    blockers.push(issue("duplicate_migration_versions",version));
  if(source.orderWrong)
    blockers.push(issue("out_of_order_automation_migrations","migration_history"));
  const actions=[];
  if(hasRefs){
    // CLI v3 requires --remote=<ref>: bare db push targets local services.
    actions.push({
      stage:"read-only remote migration history",
      argv:["supabase","migration","list","--remote="+stagingRef],
      changesHostedProject:false,
    },{
      stage:"dry-run against all repository migrations, not just Automation",
      argv:["supabase","db","push","--dry-run","--remote="+stagingRef],
      changesHostedProject:false,
    });
  }
  let functionsCheck=null,migrationsCheck=null;
  if(inventory===null)blockers.push(issue("deployed_function_inventory_missing","staging"));
  else{
    functionsCheck=checkFunctions(inventory);
    for(const x of functionsCheck.problems)blockers.push(issue(x.code,x.subject));
  }
  if(migrationEvidence===null){
    blockers.push(issue("applied_migration_evidence_missing","staging"));
  }else{
    migrationsCheck=checkMigrations(migrationEvidence,
      source.automationMigrations.map(x=>x.name),stagingRef,now);
    for(const x of migrationsCheck.problems)blockers.push(issue(x.code,x.subject));
  }
  if(hasRefs){
    // Even a fully evidenced schema is insufficient without an operator
    // reviewing the CLI dry-run, extra migrations, RLS, secret readiness,
    // hosting budgets and a separate explicit staging rollout authorization.
    blockers.push(issue("remote_dry_run_review_required","staging"));
    blockers.push(issue("secret_configuration_review_required","staging"));
    blockers.push(issue("explicit_staging_deployment_approval_required","operator"));
  }else{
    blockers.push(issue("staging_target_not_bound","operator"));
  }
  return {
    schema:"eternyx-automation-v1-staging-handoff-v1",
    mode:hasRefs?"staging_plan":"offline_source_plan",
    stagingRef:hasRefs?stagingRef:null,
    automationMigrationCount:source.automationMigrations.length,
    repositoryMigrationCount:source.allMigrationCount,
    otherMigrationCount:source.otherMigrationCount,
    sourceMigrations:source.automationMigrations,
    duplicateMigrationVersions:[...new Set(source.duplicateVersions)].sort(),
    functionSources:source.functions,
    liveInventoryChecked:inventory!==null,
    appliedMigrationsEvidenced:migrationEvidence!==null,
    observedDeployed:functionsCheck?.present??[],
    observedMissing:functionsCheck?.missing??Object.keys(REQUIRED_FUNCTIONS),
    migrationVersionsMatched:migrationsCheck?.matched?.length??0,
    orderedReadOnlyCommands:actions,
    blockers,readyForExecution:false,productionReady:false,
    productionProjectChanged:false,stagingProjectChanged:false,
    commandsExecuted:false,releaseAuthorized:false,
    stagingExecutionVerified:false,
    next:"Operator: review CLI v3 --help, verify migration history and dry-run for ALL migrations, independently verify staging owner and encrypted secrets, then request separate deployment approval.",
  };
}
export async function buildStagingPlan(opts={}){
  const root=opts.root??ROOT;
  const scan=await sources(root);
  return buildPlanFromEvidence(scan,opts);
}
function args(argv){
  const o={};
  const flags=new Map([["--staging-ref","stagingRef"],
    ["--production-ref","productionRef"],["--functions-inventory","inventoryPath"],
    ["--migration-evidence","receiptPath"]]);
  for(let i=0;i<argv.length;i++){
    const name=argv[i];
    if(!flags.has(name)||!argv[i+1]||argv[i+1].startsWith("--"))
      throw Error("Invalid plan-only argument");
    if(Object.prototype.hasOwnProperty.call(o,flags.get(name)))
      throw Error("Duplicate plan argument");
    o[flags.get(name)]=argv[++i];
  }
  return o;
}
export async function main(argv=process.argv.slice(2)){
  const a=args(argv);
  const inventory=a.inventoryPath?JSON.parse(await readFile(a.inventoryPath,"utf8")):null;
  const migrationEvidence=a.receiptPath?JSON.parse(await readFile(a.receiptPath,"utf8")):null;
  const report=await buildStagingPlan({
    stagingRef:a.stagingRef??null,productionRef:a.productionRef??null,
    inventory,migrationEvidence,
  });
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  // A pre-existing timestamp collision is a HARD STAGING DEPLOYMENT BLOCKER,
  // visible in the report, but is not a broken source-manifest generator.
  // Do not rename historical migrations without an independently verified DB
  // history: doing so could make an applied migration appear unapplied.
  if(report.duplicateMigrationVersions.length){
    process.stderr.write("Automation staging blocked: "+report.duplicateMigrationVersions.length+
      " duplicate migration timestamp(s): "+
      report.duplicateMigrationVersions.join(", ")+"; no database push allowed.\n");
  }
  // CI checks consistency of tracked code, not whether real deployment is ready.
  const sourceErrors=new Set(["migration_source_missing","migration_inventory_short",
    "function_source_missing","handler_not_detected","jwt_config_mismatch",
    "out_of_order_automation_migrations"]);
  return report.blockers.some(x=>sourceErrors.has(x.code))?1:0;
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  main().then(code=>{process.exitCode=code;}).catch(()=>{
    // Never echo contents of operator JSON evidence or environment secrets.
    process.stderr.write("Automation staging deployment plan invalid or unavailable\n");
    process.exitCode=2;
  });
}
