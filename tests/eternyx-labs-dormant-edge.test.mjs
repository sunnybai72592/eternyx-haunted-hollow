import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,cp,appendFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {rangeActivationPermitted,readBoundedRangeJson} from "../supabase/functions/_shared/ctf-range-dormant-rollout.mjs";
import {createDormantBundleManifest} from "../scripts/labs-dormant-edge-manifest.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const request=(body,headers={"content-type":"application/json"})=>new Request("https://example.invalid",{method:"POST",body,headers,duplex:"half"});
test("source lock cannot be enabled by stale environment flags",()=>{
 assert.equal(rangeActivationPermitted(),false);
 assert.equal(rangeActivationPermitted({CTF_RANGE_WORKER_ENABLED:"true",CTF_RANGE_INGRESS_REVIEWED:"true"}),false);
});
test("bounded reader counts bytes and cancels streaming overflow",async()=>{
 assert.deepEqual(await readBoundedRangeJson(request('{"action":"check"}'),256),{action:"check"});
 let cancelled=false;
 const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(200));},cancel(){cancelled=true;}});
 await assert.rejects(readBoundedRangeJson(request(stream),256),e=>e.status===413);
 assert.equal(cancelled,true);
 await assert.rejects(readBoundedRangeJson(request(JSON.stringify("é".repeat(150))),256),e=>e.status===413);
 await assert.rejects(readBoundedRangeJson(request("{}",{"content-type":"text/plain"}),256),e=>e.status===415);
 await assert.rejects(readBoundedRangeJson(request("{"),256),e=>e.status===400);
 await assert.rejects(readBoundedRangeJson(request("{}",{"content-type":"application/json","content-length":"999"}),256),e=>e.status===413);
});
test("all three bundles resolve the exact reviewed relative dependencies",async()=>{
 const m=await createDormantBundleManifest();
 assert.equal(m.sourceLockedDormant,true);assert.equal(m.remoteDeployed,false);
 assert.deepEqual(m.functions.map(f=>[f.slug,f.verifyJwt,f.files.length]),[["ctf-range-access",true,5],["ctf-range-access-check",false,5],["ctf-range-worker",false,5]]);
 for(const f of m.functions){
  assert.ok(f.files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
  const src=await readFile(join(root,f.entrypoint),"utf8");
  assert.match(src,/if \(!rangeActivationPermitted\(\) \|\| Deno\.env\.get/);
  assert.ok(src.indexOf("if (!rangeActivationPermitted()")<src.indexOf("await readBoundedRangeJson"));
  assert.doesNotMatch(src,/req\.text\(\)/);
 }
});
test("unreviewed relative import fails the bundle gate",async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),"labs-dormant-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const p of ["supabase/functions","supabase/config.toml"])await cp(join(root,p),join(dir,p),{recursive:true});
 await appendFile(join(dir,"supabase/functions/ctf-range-worker/index.ts"),'\nimport "../_shared/unknown.mjs";\n');
 await assert.rejects(createDormantBundleManifest(dir),/unreviewed_dependency/);
});
