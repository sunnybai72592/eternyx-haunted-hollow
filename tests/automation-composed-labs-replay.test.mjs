import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildComposed,compose} from "../scripts/automation-composed-labs-replay.mjs";
import {CTF} from "../scripts/automation-additive-replay-candidate.mjs";
test("real source yields exactly six LABS then 22 unique Automation files",async()=>{
 const r=await buildComposed();
 assert.equal(r.labs.length,6);assert.equal(r.automation.length,22);
 assert.equal(r.labs[0].name,CTF);
 assert.ok(r.labs[5].name.endsWith("_ctf_range_session_column_privacy.sql"));
 assert.ok(r.automation.every(f=>f.name.includes("_automation_")));
 assert.equal(r.sourceCount,28);
 assert.equal(r.remoteExecutionAuthorized,false);
});
test("missing LABS, reversed order, malformed digests and duplicate versions are rejected",async()=>{
 const {labs,automation}=await buildComposed();
 assert.throws(()=>compose(labs.slice(1),automation),/composed_count/);
 assert.throws(()=>compose([...labs].reverse(),automation),/composed_order/);
 assert.throws(()=>compose(labs,[...automation].reverse()),/composed_order/);
 assert.throws(()=>compose([{...labs[0],sha256:"fake"},...labs.slice(1)],automation),/composed_source/);
 const changed=automation.map(f=>({...f}));
 changed[1].name=changed[0].name.replace(/\.sql$/,"_extra.sql");
 assert.throws(()=>compose(labs,changed),/composed_(collision|order)/);
});
test("actual workflow keeps isolated replay, catalog, row checks and CTF regression mandatory",async()=>{
 const s=await readFile(new URL("../.github/workflows/automation-composed-labs-pg17.yml",import.meta.url),"utf8");
 const steps=["Apply exact LABS baseline","Seed synthetic security markers","Apply only the 22 Automation migrations","Verify all four backend dependencies","Verify preserved LABS RPC definitions","Verify actual CTF owner separation","Publish disposable rehearsal evidence","Clean up local container"];
 let previous=-1;
 for(const step of steps){assert.equal(s.split(step).length,2);const i=s.indexOf(step);assert.ok(i>previous);previous=i;}
 for(const part of ["--network none","sha256sum --check --status","test \"$count\" -eq 6","test \"$count\" -eq 22","cmp \"$RUNNER_TEMP/rows-before.txt\" \"$RUNNER_TEMP/rows-after.txt\"","eternyx-labs-verified-ctf-smoke.sql","ON_ERROR_STOP=1"])assert.ok(s.includes(part),part);
 assert.doesNotMatch(s,/continue-on-error:\s*true|supabase db push|supabase functions deploy/);
 const sql=await readFile(new URL("../scripts/automation-labs-occupied-stage-catalog.sql",import.meta.url),"utf8");
 assert.match(sql,/a\.attacl::text/);assert.match(sql,/BEGIN READ ONLY/);
});
