import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {getWorkflowPreset,runLocalWorkflow} from "../src/lib/automationWorkflow.mjs";
import {
  decryptScheduledText,encryptScheduledText,scheduledRunFingerprint,
  validSchedulerWorkerKey,SCHEDULE_INPUT_BYTES,SCHEDULE_OUTPUT_BYTES,
} from "../supabase/functions/_shared/automation-schedule-crypto.mjs";

const sourceUrl=new URL("../supabase/functions/automation-scheduler-worker/index.ts",import.meta.url);
const key="a".repeat(64),master="b".repeat(64);
const ids=Object.freeze({
  schedule_id:"11111111-1111-4111-8111-111111111111",
  user_id:"22222222-2222-4222-8222-222222222222",
  workflow_id:"33333333-3333-4333-8333-333333333333",
  lease_token:"44444444-4444-4444-8444-444444444444",
  request_key:"55555555-5555-4555-8555-555555555555",
});
const input="  A  \n B ";
const steps=getWorkflowPreset("clean");

async function loadActualWorker(database,config={}){
  let captured;
  const original=await readFile(sourceUrl,"utf8");
  // Actual unchanged handler (aside from compiled TypeScript typing). Strip
  // static imports so the isolated Node VM can inject real pure crypto and
  // workflow functions; no Supabase network/Deno runtime is involved.
  const stripped=original.replace(/^import[\s\S]*?;\s*/gm,"");
  assert.ok(!stripped.includes('from "https://'),"remote import remained");
  const result=ts.transpileModule(stripped,{
    compilerOptions:{
      module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022,
    },
    reportDiagnostics:true,
  });
  assert.equal(result.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
  vm.runInNewContext(result.outputText,{
    serve(fn){captured=fn;},
    createClient(){return database;},
    getSupabaseSecretKey(){return "offline-only-no-cloud-connection";},
    runLocalWorkflow,encryptScheduledText,decryptScheduledText,
    scheduledRunFingerprint,validSchedulerWorkerKey,
    SCHEDULE_INPUT_BYTES,SCHEDULE_OUTPUT_BYTES,
    Deno:{env:{get(name){
      const configValues={
        AUTOMATION_SCHEDULER_WORKER_KEY:key,
        AUTOMATION_SCHEDULE_ENCRYPTION_KEY:master,
        SUPABASE_URL:"https://offline-fixture.invalid",
        ...config,
      };
      return configValues[name];
    }}},
    Response,Request,TextEncoder,TextDecoder,Uint8Array,JSON,crypto:webcrypto,
  },{timeout:3000,filename:"actual-automation-scheduler-worker.compiled.js"});
  assert.equal(typeof captured,"function");
  return captured;
}
function result(value,error=null){return {data:value,error};}
function makeDb(options={}){
  const calls=[],claims=[...(options.claims??[])];
  let failedCalls=0;
  const db={
    calls,failedCalls:()=>failedCalls,
    async rpc(name,args){
      calls.push({name,args});
      switch(name){
        case "automation_claim_due_schedule":
          return result(claims.shift()??{ok:false,reason:"empty"});
        case "automation_workflow_preflight":
          return result(options.policy??{ok:true,allowed:true});
        case "automation_defer_scheduled_run":
          return options.deferError?result(null,{message:"offline simulated defer failure"}):
            result({ok:true});
        case "automation_complete_scheduled_run":
          return result(options.completion??{ok:true});
        case "automation_fail_scheduled_run":
          failedCalls++;
          if(options.recoveryThrows)throw Error("synthetic network loss");
          if(options.recoveryError)return result(null,{code:"synthetic_rpc_failure"});
          if(options.recoveryStale)return result({ok:false,reason:"stale_lease"});
          return result({ok:true});
        case "automation_prune_schedule_outputs":
          if(options.pruneThrows)throw Error("synthetic cleanup disconnection");
          if(options.pruneError)return result(null,{code:"synthetic_prune_failure"});
          return result({ok:true});
        default: throw Error("Unexpected RPC "+name);
      }
    },
    from(table){
      assert.equal(table,"automation_workflows");
      return {
        select(){return this;},eq(){return this;},
        async maybeSingle(){
          return result(options.workflow??{
            id:ids.workflow_id,user_id:ids.user_id,
            steps,revision:1,active:true,trigger_kind:"manual",
          });
        },
      };
    },
  };
  return db;
}
async function claim(extra={}){
  const encrypted=await encryptScheduledText(master,input,SCHEDULE_INPUT_BYTES);
  return {...ids,ok:true,revision:1,
    ciphertext:encrypted.ciphertext,nonce:encrypted.nonce,...extra};
}
async function tick(db,opts={},cfg={}){
  const handler=await loadActualWorker(db,cfg);
  const headers=opts.headers??{
    "x-eternyx-scheduler-key":key,
    "content-type":"application/json",
  };
  const req=new Request("https://offline-fixture.invalid/worker",{
    method:opts.method??"POST",headers,
    ...((opts.method??"POST")==="GET"?{}:{body:opts.body??JSON.stringify({action:"tick"})}),
  });
  const response=await handler(req);
  return {status:response.status,body:await response.json()};
}
const names=db=>db.calls.map(x=>x.name);
const count=(db,method)=>names(db).filter(x=>x===method).length;

test("actual worker ignores unauthenticated tick and GET without any DB RPC",async()=>{
  const db=makeDb();
  const get=await tick(db,{method:"GET"});
  assert.equal(get.status,405);
  const denied=await tick(db,{headers:{"content-type":"application/json"}});
  assert.equal(denied.status,401);
  assert.equal(db.calls.length,0);
});
test("actual worker denies invalid or oversized request syntax before any claim",async()=>{
  for(const body of [
    JSON.stringify({action:"not_tick"}),
    JSON.stringify({action:"tick",userId:ids.user_id}),
    "{}","invalid JSON","[".repeat(81),
  ]){
    const db=makeDb();
    const r=await tick(db,{body});
    assert.equal([400,413].includes(r.status),true,body);
    assert.equal(count(db,"automation_claim_due_schedule"),0);
  }
});
test("actual worker quota preflight postpones lease exactly once and increments numeric deferral count",async()=>{
  const db=makeDb({
    claims:[await claim()],
    policy:{ok:true,allowed:false,reason:"policy_daily_limit"},
  });
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.processed,0);
  assert.equal(r.body.failed,0);
  assert.equal(r.body.deferred,1);
  assert.equal(count(db,"automation_defer_scheduled_run"),1);
  assert.equal(count(db,"automation_fail_scheduled_run"),0);
  assert.equal(count(db,"automation_complete_scheduled_run"),0);
  assert.equal(count(db,"automation_claim_due_schedule"),2);
});
test("actual worker completion-time daily quota also postpones instead of failing lease",async()=>{
  const db=makeDb({
    claims:[await claim()],
    completion:{ok:false,reason:"daily_run_limit"},
  });
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.processed,0);
  assert.equal(r.body.failed,0);
  assert.equal(r.body.deferred,1);
  assert.equal(count(db,"automation_defer_scheduled_run"),1);
  assert.equal(count(db,"automation_fail_scheduled_run"),0);
  assert.equal(count(db,"automation_complete_scheduled_run"),1);
});
test("actual worker processes one local workflow with encrypted output and no raw output in response",async()=>{
  const db=makeDb({claims:[await claim()]});
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.deepEqual(
    {processed:r.body.processed,failed:r.body.failed,deferred:r.body.deferred},
    {processed:1,failed:0,deferred:0},
  );
  assert.equal(r.body.source,"trusted_scheduler_worker");
  assert.equal(count(db,"automation_complete_scheduled_run"),1);
  assert.equal(count(db,"automation_fail_scheduled_run"),0);
  assert.equal(count(db,"automation_prune_schedule_outputs"),1);
  const complete=db.calls.find(x=>x.name==="automation_complete_scheduled_run").args;
  assert.equal(complete.p_schedule_id,ids.schedule_id);
  assert.equal(complete.p_lease_token,ids.lease_token);
  assert.equal(complete.p_workflow_revision,1);
  assert.match(complete.p_output_ciphertext,/^[0-9a-f]+$/);
  assert.match(complete.p_output_nonce,/^[0-9a-f]{24}$/);
  const output=await decryptScheduledText(master,complete.p_output_ciphertext,
    complete.p_output_nonce,SCHEDULE_OUTPUT_BYTES);
  assert.equal(output,runLocalWorkflow(input,steps).output);
  assert.doesNotMatch(JSON.stringify(r.body),/A  |ciphertext|nonce|user_id|workflow_id/);
});
test("actual worker disabled owner policy fails claimed lease, never completes it",async()=>{
  const db=makeDb({
    claims:[await claim()],
    policy:{ok:true,allowed:false,reason:"policy_scheduled_disabled"},
  });
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.failed,1);
  assert.equal(r.body.deferred,0);
  assert.equal(count(db,"automation_fail_scheduled_run"),1);
  assert.equal(count(db,"automation_complete_scheduled_run"),0);
});
test("actual worker failed quota deferral is counted as failure rather than falsely reported deferred",async()=>{
  const db=makeDb({
    claims:[await claim()],
    policy:{ok:true,allowed:false,reason:"policy_daily_limit"},
    deferError:true,
  });
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.failed,1);
  assert.equal(r.body.deferred,0);
  assert.equal(count(db,"automation_defer_scheduled_run"),1);
  assert.equal(count(db,"automation_fail_scheduled_run"),1);
});
test("actual worker rejects malicious claim without workflow access or plain-text disclosure",async()=>{
  const db=makeDb({claims:[await claim({lease_token:"attacker"})]});
  const r=await tick(db);
  assert.equal(r.status,503);
  assert.match(r.body.error,/Invalid schedule claim/);
  assert.equal(count(db,"automation_workflow_preflight"),0);
  assert.equal(count(db,"automation_complete_scheduled_run"),0);
});
test("actual worker refuses missing encryption key before any database claim",async()=>{
  const db=makeDb({claims:[await claim()]});
  const r=await tick(db,{},{
    AUTOMATION_SCHEDULE_ENCRYPTION_KEY:"",
  });
  assert.equal(r.status,503);
  assert.equal(db.calls.length,0);
});

test("malformed Content-Length headers fail closed even for otherwise valid tick",async()=>{
  for(const headerValue of ["-1","NaN","8e1","999","0x10","81","1.5","001000"]){
    const db=makeDb();
    const r=await tick(db,{
      body:'{"action":"tick"}',
      headers:{
        "x-eternyx-scheduler-key":key,
        "content-type":"application/json",
        "content-length":headerValue,
      },
    });
    assert.equal(r.status,413,headerValue);
    assert.equal(db.calls.length,0);
  }
});
test("two claimed runs can defer first and process second without losing numeric counters",async()=>{
  const c1=await claim();
  const c2=await claim({
    schedule_id:"66666666-6666-4666-8666-666666666666",
    lease_token:"77777777-7777-4777-8777-777777777777",
  });
  let checked=0;
  const db=makeDb({claims:[c1,c2]});
  const orig=db.rpc.bind(db);
  db.rpc=async(name,args)=>{
    if(name==="automation_workflow_preflight"){
      checked++;
      return result(checked===1?
        {ok:true,allowed:false,reason:"policy_daily_limit"}:
        {ok:true,allowed:true});
    }
    return orig(name,args);
  };
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.processed,1);
  assert.equal(r.body.failed,0);
  assert.equal(r.body.deferred,1);
  assert.equal(count(db,"automation_claim_due_schedule"),2);
  assert.equal(count(db,"automation_defer_scheduled_run"),1);
  assert.equal(count(db,"automation_complete_scheduled_run"),1);
  assert.equal(count(db,"automation_fail_scheduled_run"),0);
});
test("valid authorized worker rejects oversized streamed body before any schedule database calls",async()=>{
  const db=makeDb();
  const r=await tick(db,{body:" ".repeat(81)});
  assert.equal(r.status,413);
  assert.equal(db.calls.length,0);
});


test("acknowledged failure releases one claimed lease without claiming pending recovery",async()=>{
  const db=makeDb({claims:[await claim()],
    policy:{ok:true,allowed:false,reason:"policy_scheduled_disabled"}});
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.failed,1);
  assert.equal(r.body.leaseRecoveryUnconfirmed,0);
  assert.equal(r.body.retentionCleanupFailed,false);
  const failure=db.calls.find(x=>x.name==="automation_fail_scheduled_run").args;
  assert.equal(failure.p_schedule_id,ids.schedule_id);
  assert.equal(failure.p_lease_token,ids.lease_token);
  assert.equal(failure.p_schedule_revision,1);
});

test("stale lease receipt fails closed: worker does not falsely claim database recovery",async()=>{
  const db=makeDb({claims:[await claim()],recoveryStale:true,
    policy:{ok:true,allowed:false,reason:"policy_scheduled_disabled"}});
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.failed,1);
  assert.equal(r.body.leaseRecoveryUnconfirmed,1);
  assert.equal(r.body.processed,0);
  assert.equal(count(db,"automation_fail_scheduled_run"),1);
  assert.equal(count(db,"automation_complete_scheduled_run"),0);
  assert.equal(r.body.schedulerEnabled,true);
});

test("database returned error from recovery RPC is not mistaken for a released lease",async()=>{
  const db=makeDb({claims:[await claim()],recoveryError:true,
    policy:{ok:true,allowed:false,reason:"policy_scheduled_disabled"}});
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.failed,1);
  assert.equal(r.body.leaseRecoveryUnconfirmed,1);
  assert.equal(count(db,"automation_fail_scheduled_run"),1);
});

test("thrown transport recovery error is counted once without raw database details",async()=>{
  const db=makeDb({claims:[await claim()],recoveryThrows:true,
    policy:{ok:true,allowed:false,reason:"policy_scheduled_disabled"}});
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.failed,1);
  assert.equal(r.body.leaseRecoveryUnconfirmed,1);
  assert.doesNotMatch(JSON.stringify(r.body),/synthetic|network|token|lease_token|schedule_id/);
});

test("two failed claims with one unconfirmed lease recovery preserve batch counters",async()=>{
  const c1=await claim();
  const c2=await claim({
    schedule_id:"66666666-6666-4666-8666-666666666666",
    lease_token:"77777777-7777-4777-8777-777777777777",
  });
  const db=makeDb({claims:[c1,c2],policy:{
    ok:true,allowed:false,reason:"policy_scheduled_disabled",
  }});
  const old=db.rpc.bind(db);
  let failures=0;
  db.rpc=async(name,args)=>{
    if(name==="automation_fail_scheduled_run"){
      failures++;
      if(failures===1)return result({ok:false,reason:"stale_lease"});
    }
    return old(name,args);
  };
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.failed,2);
  assert.equal(r.body.leaseRecoveryUnconfirmed,1);
  assert.equal(r.body.processed,0);
  assert.equal(r.body.deferred,0);
  assert.equal(failures,2);
});

test("age-based ciphertext prune returning an RPC error is explicitly observable",async()=>{
  const db=makeDb({pruneError:true});
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.processed,0);
  assert.equal(r.body.retentionCleanupFailed,true);
  assert.equal(r.body.leaseRecoveryUnconfirmed,0);
  assert.equal(count(db,"automation_prune_schedule_outputs"),1);
});

test("age-based ciphertext prune throwing transport error is explicitly observable",async()=>{
  const db=makeDb({pruneThrows:true});
  const r=await tick(db);
  assert.equal(r.status,200);
  assert.equal(r.body.retentionCleanupFailed,true);
  assert.doesNotMatch(JSON.stringify(r.body),/synthetic|disconnection/);
});

test("claimed workflow row must match owner, workflow id and bounded revision before decrypt or preflight",async()=>{
  const valid={
    id:ids.workflow_id,user_id:ids.user_id,steps,
    revision:1,active:true,trigger_kind:"manual",
  };
  const tampered=[
    {...valid,id:"88888888-8888-4888-8888-888888888888"},
    {...valid,user_id:"99999999-9999-4999-8999-999999999999"},
    {...valid,revision:0},
    {...valid,revision:1.5},
    {...valid,revision:Number.MAX_SAFE_INTEGER+1},
    {...valid,steps:"not_an_array"},
    {...valid,active:false},
    {...valid,trigger_kind:"external"},
  ];
  for(const workflow of tampered){
    const db=makeDb({claims:[await claim()],workflow});
    const r=await tick(db);
    assert.equal(r.status,200,JSON.stringify(workflow));
    assert.equal(r.body.processed,0);
    assert.equal(r.body.failed,1);
    assert.equal(r.body.leaseRecoveryUnconfirmed,0);
    assert.equal(count(db,"automation_workflow_preflight"),0);
    assert.equal(count(db,"automation_complete_scheduled_run"),0);
    assert.equal(count(db,"automation_fail_scheduled_run"),1);
  }
});

test("malformed, oversized or truncated encrypted claims fail before workflow access or any failure-RPC mutation",async()=>{
  const originals=await claim();
  const variants=[
    {ciphertext:"F".repeat(2*(SCHEDULE_INPUT_BYTES+17))},
    {ciphertext:"a".repeat(31)},
    {ciphertext:"zz".repeat(200)},
    {ciphertext:"1".repeat(35)},
    {nonce:"g".repeat(24)},
    {nonce:"f".repeat(22)},
    {nonce:"f".repeat(26)},
    {revision:1.2},
  ];
  for(const changes of variants){
    const db=makeDb({claims:[{...originals,...changes}]});
    const r=await tick(db);
    assert.equal(r.status,503,JSON.stringify(changes).slice(0,90));
    assert.match(r.body.error,/Invalid schedule claim/);
    assert.equal(r.body.failed,0);
    assert.equal(r.body.leaseRecoveryUnconfirmed,0);
    assert.equal(count(db,"automation_workflow_preflight"),0);
    assert.equal(count(db,"automation_fail_scheduled_run"),0);
  }
});

test("the worker never leaks raw failures, tenant ids or ciphertext in its observable recovery metrics",async()=>{
  const db=makeDb({claims:[await claim()],recoveryError:true,pruneError:true,
    policy:{ok:true,allowed:false,reason:"policy_scheduled_disabled"}});
  const r=await tick(db);
  assert.deepEqual(Object.keys(r.body).sort(),[
    "deferred","failed","leaseRecoveryUnconfirmed","processed",
    "retentionCleanupFailed","schedulerEnabled","source",
  ].sort());
  assert.equal(r.body.leaseRecoveryUnconfirmed,1);
  assert.equal(r.body.retentionCleanupFailed,true);
  const payload=JSON.stringify(r.body);
  assert.doesNotMatch(payload,/user_id|lease_token|schedule_id|workflow_id|ciphertext|nonce|offline|a{32}|b{32}/);
});
