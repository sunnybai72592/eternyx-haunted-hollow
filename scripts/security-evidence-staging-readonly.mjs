#!/usr/bin/env node
// No writes. Opt-in only, two distinct real staging JWTs and project refs.
const vars=["ETERNYX_STAGING_ONLY","ETERNYX_STAGING_URL","ETERNYX_STAGING_PROJECT_REF","ETERNYX_PRODUCTION_PROJECT_REF","ETERNYX_STAGING_PUBLIC_KEY","ETERNYX_STAGING_JWT_A","ETERNYX_STAGING_JWT_B"];
function refuse(msg){process.stderr.write("STAGING READ-ONLY BLOCKED: "+msg+"\n");process.exit(2);}
const command=process.argv[2]??"--check-config";
if(!["--check-config","--run"].includes(command))refuse("Select --check-config or --run.");
const env=process.env,missing=vars.filter(k=>!env[k]);if(missing.length)refuse("Missing "+missing.join(", "));
if(env.ETERNYX_STAGING_ONLY!=="yes")refuse("Explicit staging-only acknowledgement required.");
const stage=env.ETERNYX_STAGING_PROJECT_REF,prod=env.ETERNYX_PRODUCTION_PROJECT_REF;
if(!/^[a-z0-9]{8,32}$/.test(stage)||!/^[a-z0-9]{8,32}$/.test(prod)||stage===prod)
 refuse("Distinct valid staging and production refs required.");
let origin;
try{origin=new URL(env.ETERNYX_STAGING_URL);}catch{refuse("Invalid staging URL.");}
if(origin.protocol!=="https:"||origin.hostname!==stage+".supabase.co"||origin.pathname!=="/"||origin.search||origin.hash)
 refuse("Staging must be the exact HTTPS project URL.");
const a=env.ETERNYX_STAGING_JWT_A,b=env.ETERNYX_STAGING_JWT_B;
if(a===b||!env.ETERNYX_STAGING_PUBLIC_KEY.trim())refuse("Two distinct JWTs and a publishable key required.");
if(command==="--check-config"){process.stdout.write("PASS: staging config valid; no network accessed.\n");process.exit(0);}
const headers=t=>({apikey:env.ETERNYX_STAGING_PUBLIC_KEY,Authorization:"Bearer "+t,Accept:"application/json"});
let requests=0;
async function get(path,token,params) {
 const u=new URL(path,origin);if(params)for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
 if(u.hostname!==origin.hostname)throw new Error("Endpoint escaped staging host.");
 const response=await fetch(u,{method:"GET",headers:headers(token),redirect:"error",signal:AbortSignal.timeout(15000)});
 requests++;
 const json=response.ok&&(response.headers.get("content-type")||"").includes("application/json");
 const value=json?await response.json():null;
 if(!json&&response.body)await response.body.cancel();
 return {status:response.status,value};
}
function check(ok,msg){if(!ok)throw new Error(msg);}
async function identity(token) {
 const r=await get("/auth/v1/user",token);
 check(r.status===200&&typeof r.value?.id==="string","Staging JWT identity failed.");return r.value.id;
}
async function fixture(token,id) {
 const r=await get("/rest/v1/pentest_evidence",token,{select:"id,owner_id,engagement_id,storage_path",owner_id:"eq."+id,limit:"1"});
 check(r.status===200&&Array.isArray(r.value)&&r.value.length===1,"Each staging account needs one private evidence row.");
 const row=r.value[0];
 check(row.owner_id===id&&typeof row.id==="string"&&typeof row.storage_path==="string"&&
  row.storage_path.startsWith(id+"/"+row.engagement_id+"/"),"Invalid owned fixture.");
 return row;
}
function url(row){return "/storage/v1/object/authenticated/pentest-evidence/"+row.storage_path.split("/").map(encodeURIComponent).join("/");}
async function crossMetadata(token,row){
 const r=await get("/rest/v1/pentest_evidence",token,{select:"id,owner_id",id:"eq."+row.id,limit:"1"});
 check(r.status===200&&Array.isArray(r.value)&&r.value.length===0,"Cross-owner metadata was exposed.");
}
async function storage(token,row,own){
 const r=await get(url(row),token);
 check(own?[200,206].includes(r.status):[401,403,404].includes(r.status),
  own?"Owned private object was not readable.":"Other account could read private Storage.");
}
try{
 const [idA,idB]=await Promise.all([identity(a),identity(b)]);
 check(idA!==idB,"Both JWTs identify the same user.");
 const [rowA,rowB]=await Promise.all([fixture(a,idA),fixture(b,idB)]);
 await Promise.all([crossMetadata(a,rowB),crossMetadata(b,rowA),
  storage(a,rowA,true),storage(b,rowB,true),storage(a,rowB,false),storage(b,rowA,false)]);
 process.stdout.write("PASS: two real staging identities, own metadata and private downloads, cross-account metadata and Storage denial. "+
 requests+" GET requests, zero writes. No IDs or credentials logged.\n");
}catch(e){process.stderr.write("FAIL: staging acceptance not proven: "+(e instanceof Error?e.message:"Unexpected error")+"\n");process.exitCode=1;}
