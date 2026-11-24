import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,cp,appendFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {assessLabsRelease,validateHistoricalObservation} from "../scripts/labs-release-assessment.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const load=async name=>JSON.parse(await readFile(join(root,"docs/examples",name),"utf8"));
test("release assessment checks all twelve reviewed source blobs but never claims live readiness",async()=>{
 const r=await assessLabsRelease();
 assert.deepEqual(r.gates[0],{id:"reviewed-source",status:"matched",matchedFiles:12,totalFiles:12});
 assert.equal(r.liveChecksPerformed,false);assert.equal(r.remoteDeploymentCurrent,false);
 assert.equal(r.deployedBundleCryptographicallyVerified,false);
 assert.equal(r.releaseAuthorized,false);assert.equal(r.productionReady,false);
 assert.deepEqual(r.gates.find(x=>x.id==="staging-edge-inventory").missingFunctions,["ctf-range-access","ctf-range-worker","ctf-range-access-check"]);
 assert.equal(r.gates.filter(x=>x.status==="unverified").length,5);
});
test("production reference, incomplete mapping, privileged JWT drift and overclaims fail closed",async()=>{
 const d=await load("labs-staging-deployment-observation.json"),o=await load("labs-release-observation.json");
 for(const mutate of [
 x=>x.projectRef="wcncuarekaofmfurbtbh",x=>x.releaseAuthorized=true,
 x=>x.physicalHardwareVerified=true,x=>x.authenticatedAcceptanceVerified=true,
 x=>x.migrationVersions.pop(),x=>x.activeLabsFunctions[0].verifyJwt=false,
 x=>x.reviewedLocalBundleBlobs[0].path="../../secret",x=>x.spendDisabled=false,
 ]){const x=structuredClone(o);mutate(x);assert.throws(()=>validateHistoricalObservation(x,d));}
});
test("changed transitive source is detected without claiming deployment drift",async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),"labs-release-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const p of ["supabase/migrations","supabase/functions","supabase/config.toml","src/lib/eternyxVerifiedCtf.mjs","docs/examples/labs-release-observation.json","docs/examples/labs-staging-deployment-observation.json"])
   await cp(join(root,p),join(dir,p),{recursive:true});
 await appendFile(join(dir,"supabase/functions/_shared/user-auth.ts"),"\n// changed source\n");
 const r=await assessLabsRelease({root:dir});
 assert.equal(r.sourceDriftDetected,true);assert.equal(r.gates[0].matchedFiles,11);
 assert.equal(r.remoteDeploymentCurrent,false);assert.equal(r.productionReady,false);
});
