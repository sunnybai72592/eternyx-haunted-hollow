// ETERNYX Wave 10: network-read-only, two-account cybersecurity staging acceptance.
// This module never performs writes, deploys migrations, or grants production approval.
export const SECURITY_STAGING_REPORT_SCHEMA = "eternyx.cybersecurity.staging-readonly.v1";
export const REQUIRED_STAGING_TABLES = Object.freeze([
  "pentest_engagements", "pentest_evidence", "pentest_audit_events",
  "security_case_assets", "security_case_findings",
  "security_case_finding_evidence", "security_case_finding_history",
]);
export const REQUIRED_CHECKS = Object.freeze([
  "staging-project-separation", "distinct-auth-users", "scoped-engagements",
  ...REQUIRED_STAGING_TABLES.map((t)=>"owner-and-cross-owner:"+t),
  "owned-private-storage", "foreign-private-storage-denied",
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF=/^[a-z0-9]{8,32}$/;
const REQUIRED_ENV=["ETERNYX_STAGING_ONLY","ETERNYX_STAGING_URL",
  "ETERNYX_STAGING_PROJECT_REF","ETERNYX_PRODUCTION_PROJECT_REF",
  "ETERNYX_STAGING_PUBLIC_KEY","ETERNYX_STAGING_JWT_A","ETERNYX_STAGING_JWT_B"];
const STATUS=["pass","fail"];
const uuid=(v)=>typeof v==="string"&&UUID.test(v);
function insist(ok,message) {if(!ok)throw new Error(message);}
function shape(v,keys) {return v!==null&&typeof v==="object"&&!Array.isArray(v)&&
  Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(v,k));}
export function validateSecurityStagingConfig(env) {
  insist(env&&typeof env==="object","Staging environment is missing.");
  const missing=REQUIRED_ENV.filter((k)=>typeof env[k]!=="string"||!env[k].trim());
  insist(!missing.length,"Missing required staging environment: "+missing.join(", "));
  insist(env.ETERNYX_STAGING_ONLY==="yes","Explicit staging-only acknowledgement is required.");
  const stage=env.ETERNYX_STAGING_PROJECT_REF;
  const prod=env.ETERNYX_PRODUCTION_PROJECT_REF;
  insist(REF.test(stage)&&REF.test(prod)&&stage!==prod,
    "Distinct valid staging and production Supabase project refs are mandatory.");
  let url;
  try{url=new URL(env.ETERNYX_STAGING_URL);}catch{throw new Error("Staging URL is invalid.");}
  insist(url.protocol==="https:"&&url.hostname===stage+".supabase.co"&&
    url.port===""&&url.username===""&&url.password===""&&
    url.pathname==="/"&&!url.search&&!url.hash,
    "Staging URL must be the exact dedicated HTTPS Supabase project root.");
  const a=env.ETERNYX_STAGING_JWT_A,b=env.ETERNYX_STAGING_JWT_B;
  insist(a!==b&&a.length>24&&b.length>24,
    "Two distinct nonempty staging account access tokens are required.");
  return {url:url.origin+"/",stagingRef:stage,productionRef:prod,
    publishableKey:env.ETERNYX_STAGING_PUBLIC_KEY,tokenA:a,tokenB:b};
}
function fetchEndpoint(config,fetchImpl) {
  return async (path,token,query=null)=>{
    const url=new URL(path,config.url);
    insist(url.origin+"/"===config.url&&url.username===""&&url.password==="",
      "Request escaped the allowlisted staging project.");
    if(query)for(const [k,v]of Object.entries(query))url.searchParams.set(k,String(v));
    const response=await fetchImpl(url.toString(),{
      method:"GET",redirect:"error",
      headers:{apikey:config.publishableKey,Authorization:"Bearer "+token,Accept:"application/json"},
      signal:AbortSignal.timeout(15000),
    });
    const contentType=response.headers?.get?.("content-type")||"";
    const isJson=response.ok&&contentType.includes("application/json");
    let data=null;
    if(isJson)data=await response.json();
    else if(response.body?.cancel)await response.body.cancel();
    return {status:response.status,data,isJson};
  };
}
function requireList(response,label) {
  insist(response.status===200&&response.isJson&&Array.isArray(response.data),
    label+": table missing, inaccessible or response malformed.");
  return response.data;
}
function oneOwned(rows,owner,label) {
  insist(rows.length===1&&uuid(rows[0]?.id)&&rows[0]?.owner_id===owner,
    label+": staged private fixture missing or belongs to another user.");
  return rows[0];
}
function privateStoragePath(row) {
  insist(typeof row.storage_path==="string"&&
    row.storage_path.startsWith(row.owner_id+"/"+row.engagement_id+"/"),
    "Private evidence fixture has an invalid owner/engagement prefix.");
  const suffix=row.storage_path.slice((row.owner_id+"/"+row.engagement_id+"/").length);
  insist(suffix.length>0&&suffix.length<=500&&!suffix.includes("..")&&
    !suffix.includes("\\")&&!suffix.includes("\x00"),
    "Private evidence fixture path contains unsupported segments.");
  return "/storage/v1/object/authenticated/pentest-evidence/"+
    row.storage_path.split("/").map(encodeURIComponent).join("/");
}
function record(checks,id) {checks.push({id,status:"pass"});}
async function identity(get,token,label) {
  const res=await get("/auth/v1/user",token);
  insist(res.status===200&&res.isJson&&uuid(res.data?.id),label+" staging user authentication failed.");
  return res.data.id;
}
async function engagementFixture(get,token,owner) {
  const rows=requireList(await get("/rest/v1/pentest_engagements",token,{
    select:"id,owner_id,scope_targets,excluded_targets,status,authorization_attested,authorization_attested_at",
    owner_id:"eq."+owner,limit:1
  }),"pentest_engagements");
  const row=oneOwned(rows,owner,"pentest_engagements");
  insist(row.authorization_attested===true&&row.authorization_attested_at&&
    ["authorized","in_progress","on_hold","completed"].includes(row.status)&&
    Array.isArray(row.scope_targets)&&row.scope_targets.length>0&&
    Array.isArray(row.excluded_targets)&&
    row.scope_targets.some(t=>!row.excluded_targets.includes(t)),
    "Staging engagement fixture must have an attested, non-excluded scope target.");
  return row;
}
async function tableFixture(get,table,token,owner,engagementId) {
  if(table==="pentest_engagements")throw new Error("Engagement fixture has a dedicated probe.");
  const rows=requireList(await get("/rest/v1/"+table,token,{
    select:table==="pentest_evidence"?"id,owner_id,engagement_id,storage_path":"id,owner_id,engagement_id",
    owner_id:"eq."+owner,engagement_id:"eq."+engagementId,limit:1
  }),table);
  const row=oneOwned(rows,owner,table);
  insist(row.engagement_id===engagementId,
    table+": fixture does not belong to the selected owned engagement.");
  return row;
}
async function crossDenied(get,table,token,foreignRow) {
  const rows=requireList(await get("/rest/v1/"+table,token,{
    select:"id,owner_id",id:"eq."+foreignRow.id,limit:1,
  }),table+" cross-owner query");
  insist(rows.length===0,table+": foreign row leaked across account RLS.");
}
async function storageProbe(get,token,row,isOwner) {
  const response=await get(privateStoragePath(row),token);
  insist(isOwner?[200,206].includes(response.status):[401,403,404].includes(response.status),
    isOwner?"Owned private Storage object is inaccessible.":
      "Foreign private Storage object was returned by server.");
}
export async function runSecurityStagingReadOnly(config,fetchImpl=globalThis.fetch) {
  insist(config&&typeof config.url==="string"&&typeof fetchImpl==="function",
    "Run requires validated staging configuration and network transport.");
  const get=fetchEndpoint(config,fetchImpl),checks=[];
  record(checks,"staging-project-separation");
  const [ownerA,ownerB]=await Promise.all([
    identity(get,config.tokenA,"Account A"),identity(get,config.tokenB,"Account B")
  ]);
  insist(ownerA!==ownerB,"Two staging JWTs resolved to one account.");
  record(checks,"distinct-auth-users");
  const [engA,engB]=await Promise.all([
    engagementFixture(get,config.tokenA,ownerA),
    engagementFixture(get,config.tokenB,ownerB),
  ]);
  record(checks,"scoped-engagements");
  await Promise.all([
    crossDenied(get,"pentest_engagements",config.tokenA,engB),
    crossDenied(get,"pentest_engagements",config.tokenB,engA),
  ]);
  record(checks,"owner-and-cross-owner:pentest_engagements");
  const byTable={};
  for(const table of REQUIRED_STAGING_TABLES.filter(t=>t!=="pentest_engagements")) {
    const [rowA,rowB]=await Promise.all([
      tableFixture(get,table,config.tokenA,ownerA,engA.id),
      tableFixture(get,table,config.tokenB,ownerB,engB.id),
    ]);
    await Promise.all([
      crossDenied(get,table,config.tokenA,rowB),
      crossDenied(get,table,config.tokenB,rowA),
    ]);
    byTable[table]={rowA,rowB};
    record(checks,"owner-and-cross-owner:"+table);
  }
  const {rowA:evidenceA,rowB:evidenceB}=byTable.pentest_evidence;
  await Promise.all([
    storageProbe(get,config.tokenA,evidenceA,true),
    storageProbe(get,config.tokenB,evidenceB,true),
  ]);
  record(checks,"owned-private-storage");
  await Promise.all([
    storageProbe(get,config.tokenA,evidenceB,false),
    storageProbe(get,config.tokenB,evidenceA,false),
  ]);
  record(checks,"foreign-private-storage-denied");
  const observedAt=new Date().toISOString();
  return {schema:SECURITY_STAGING_REPORT_SCHEMA,environment:"staging-readonly",
    stagingProjectRef:config.stagingRef,productionProjectRef:config.productionRef,
    observedAt,status:"pass",checks,
    summary:{distinctAccounts:2,coveredTables:REQUIRED_STAGING_TABLES.length,
      privateStorageAccounts:2,remoteMutations:0},
    limitations:[
      "Unsigned local client report; a copied JSON document is not independently trusted evidence.",
      "No writes, migration apply, token revocation or RLS mutation checks were performed.",
      "Production release is not authorized by this report.",
    ]};
}
export function validateSecurityStagingReport(input) {
  insist(shape(input,["schema","environment","stagingProjectRef","productionProjectRef",
    "observedAt","status","checks","summary","limitations"]),
    "Staging report has missing or unsupported fields.");
  insist(input.schema===SECURITY_STAGING_REPORT_SCHEMA&&input.environment==="staging-readonly"&&
    REF.test(input.stagingProjectRef)&&REF.test(input.productionProjectRef)&&
    input.stagingProjectRef!==input.productionProjectRef,
    "Report must describe a distinct staging project.");
  insist(typeof input.observedAt==="string"&&Number.isFinite(Date.parse(input.observedAt)),
    "Staging report timestamp is invalid.");
  insist(input.status==="pass"&&Array.isArray(input.checks)&&input.checks.length===REQUIRED_CHECKS.length,
    "Staging report is incomplete or not passing.");
  insist(REQUIRED_CHECKS.every((id,i)=>{
    const x=input.checks[i];return shape(x,["id","status"])&&x.id===id&&STATUS.includes(x.status)&&x.status==="pass";
  }),"Staging report required probes are missing, repeated or failed.");
  insist(shape(input.summary,["distinctAccounts","coveredTables","privateStorageAccounts","remoteMutations"])&&
    input.summary.distinctAccounts===2&&
    input.summary.coveredTables===REQUIRED_STAGING_TABLES.length&&
    input.summary.privateStorageAccounts===2&&input.summary.remoteMutations===0,
    "Staging report claimed coverage is inconsistent.");
  insist(Array.isArray(input.limitations)&&input.limitations.length>=3&&input.limitations.length<=8&&
    input.limitations.every(s=>typeof s==="string"&&s.length<=250),
    "Staging report missing limitations.");
  return input;
}
/**
 * Even a genuine passing read-only result does NOT authorize deployment.
 * All manual release prerequisites remain outside this probe and must be
 * separately verified by an appropriate authorized operator.
 */
export function evaluateCybersecurityReleaseGate(report=null) {
  const blockers=[
    "Review and deploy the indexed ledger migration in an isolated staging project, with verified migration history.",
    "Complete privileged SQL catalog, grants, policy and role review in staging.",
    "Complete real separate-account write/deny, revocation and rollback acceptance in staging.",
    "Obtain independent security review and named deployment approver sign-off.",
    "Demonstrate rollback, restore and monitoring readiness before any production promotion.",
  ];
  try {
    if(!report)throw new Error("No live staging read-only acceptance report supplied.");
    validateSecurityStagingReport(report);
    return {readOnlyStaging:"reported-pass-unattested",production:"blocked",
      details:"This uploaded JSON is not signed; it cannot prove live staging execution.",blockers};
  }catch(e){
    return {readOnlyStaging:"not-established",production:"blocked",
      details:e instanceof Error?e.message:"Staging evidence validation failed.",blockers};
  }
}
