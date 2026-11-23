// Repository-only Docker release policy audit. This is NOT an external staging
// health test, proof of successful Docker execution or deployment authorization.
const expectedJwt=Object.freeze({
 "docker-control":true,"docker-enrollment":true,
 "docker-heartbeat":false,"docker-command-dispatch":false
});
function parseDockerJwtSettings(config){
 if(typeof config!=="string"||config.length>200000)throw Error("Invalid Supabase config.");
 const sections=new Map();let current=null;
 for(const raw of config.split(/\r?\n/)){
  const line=raw.trim();
  if(!line||line.startsWith("#"))continue;
  const match=line.match(/^\[functions\.([a-z0-9-]+)\]$/);
  if(match){
   current=match[1];
   if(current.startsWith("docker-")){
    if(sections.has(current))throw Error("Repeated Docker function settings: "+current);
    sections.set(current,{});
   }
   continue;
  }
  if(line.startsWith("[")){current=null;continue;}
  if(current?.startsWith("docker-")){
   const setting=line.match(/^verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/);
   if(setting){
    if(Object.hasOwn(sections.get(current),"verify_jwt"))
      throw Error("Repeated Docker verify_jwt setting: "+current);
    sections.get(current).verify_jwt=setting[1]==="true";
   }else if(/^verify_jwt\s*=/.test(line)){
    throw Error("Invalid Docker JWT setting: "+current);
   }
  }
 }
 return sections;
}
export function auditDockerDeploymentConfig(input){
 if(!input||typeof input!=="object")throw Error("Missing repository security inputs.");
 const checks=[];
 const add=(id,passed,detail)=>checks.push({id,passed:passed===true,detail});
 let settings;
 try{settings=parseDockerJwtSettings(input.config);}
 catch{return {schema:"eternyx-docker-repo-gate-v1",scope:"repository_only",
   checks:[{id:"parse_function_settings",passed:false,detail:"Malformed/duplicate Docker JWT policy"}],
   passed:false,productionAuthorized:false,stagingExecutionAuthorized:false,
   independentStagingVerified:false,manualApprovalRequired:true};}
 add("docker_route_set",settings.size===4,
  "Only the four explicitly approved Docker Edge routes are configured");
 for(const [route,jwt] of Object.entries(expectedJwt))
   add("jwt_"+route,settings.get(route)?.verify_jwt===jwt,
       route+" must declare verify_jwt="+jwt);
 const owner=String(input.ownerControl??"");
 const enrollment=String(input.enrollment??"");
 const auth=String(input.authHelper??"");
 const ownerGuard=String(input.ownerGuard??"");
 const dispatch=String(input.dispatch??"");
 const handler=String(input.dispatchHandler??"");
 const heartbeat=String(input.heartbeat??"");
 const agent=String(input.agent??"");
 add("auth_provider_checks_bearer",/authorization\.match\(/i.test(auth)&&
    /supabase\.auth\.getUser\(match\[1\]\)/.test(auth),
    "Owner identity must come from verified Supabase Auth getUser, not payload metadata");
 for(const [id,code] of [["control",owner],["enrollment",enrollment]]){
   add("owner_auth_"+id,/authenticateUser\(req\)/.test(code)&&
      /verifiedDockerOwnerId\(user,supabase\)/.test(code)&&
      /user\.is_anonymous/.test(code)&&
      /const owner=verifiedOwner;/.test(code),
      "Owner route must bind all operations to server-authenticated, non-anonymous user");
 }
 add("owner_id_shape",/UUID\.test\(user\.id\)/.test(ownerGuard)&&
    /user\.is_anonymous===true/.test(ownerGuard),
    "Only a non-anonymous Supabase UUID may become the owner key");
 add("agent_header_signature",/getSupabaseSecretKey/.test(heartbeat)&&
    /crypto\.subtle\.verify\(/.test(heartbeat)&&
    /req\.headers\.get\("Origin"\)/.test(heartbeat),
    "JWT-exempt heartbeat must independently verify Ed25519 and reject browser Origin");
 add("dispatch_opt_in",/Deno\.env\.get\("DOCKER_REMOTE_LAB_ENABLED"\)==="true"/.test(dispatch)&&
    /getSupabaseSecretKey/.test(dispatch)&&/serverSigningKey\(\)/.test(dispatch),
    "Server-only opt-in flag and signing key are mandatory");
 add("dispatch_protocol",/verifySignedDockerAgentAction\(input,agent,clock,crypt\)/.test(handler)&&
    /isEnabled\(\)!==true/.test(handler)&&
    /context\.rpc\("docker_command_consume_nonce"/.test(handler)&&
    /request\.headers\.get\("Origin"\)/.test(handler),
    "JWT-exempt dispatch must use real agent signature, nonce, and server policy");
 add("agent_second_opt_in",/ETERNYX_REMOTE_LAB_ENABLED/.test(agent)&&
    /process\.argv\[5\]==="--execute-lab"/.test(agent)&&
    /localContext\(\)/.test(agent),
    "Lab agent needs its independent explicit command-line and environment opt-ins");
 add("no_edge_docker",![owner,enrollment,dispatch,heartbeat,handler].some(source=>
    /\bDeno\.Command\b|docker\.sock|\bspawnSync\(/.test(source)),
    "Edge Functions must not invoke host Docker commands");
 return {schema:"eternyx-docker-repo-gate-v1",scope:"repository_only",
  checks,passed:checks.every(x=>x.passed),productionAuthorized:false,
  stagingExecutionAuthorized:false,independentStagingVerified:false,
  manualApprovalRequired:true};
}
