// Conservative local-only deployment safeguards. Never contacts Docker or Supabase.
import {isLocalEndpoint} from "./dockerOperatorUtils.mjs";
import {inspectLocalKeyFiles} from "./dockerLabDrillEvidence.mjs";
export function evaluateDockerLabPreflight({
 env=process.env,nodeVersion=process.versions.node,agentKeyPath=null,pinnedServerKeyPath=null
}={}){
 const checks=[];
 const push=(id,pass,detail)=>checks.push({id,status:pass?"pass":"fail",detail});
 const major=Number(String(nodeVersion).split(".")[0]);
 push("node_runtime",Number.isInteger(major)&&major>=20,"Node.js 20+ required");
 for(const name of ["ETERNYX_REMOTE_LAB_ENABLED","DOCKER_REMOTE_LAB_ENABLED"]){
   const v=env[name];
   push("opt_in_off_"+name,v===undefined||v===""||v==="false",
     name+" is not enabled in this local process");
 }
 push("local_docker_host",!env.DOCKER_HOST||isLocalEndpoint(env.DOCKER_HOST),
   "DOCKER_HOST unset or local Unix/npipe only");
 push("context_override_absent",!env.DOCKER_CONTEXT,"DOCKER_CONTEXT must be unset");
 push("config_override_absent",!env.DOCKER_CONFIG,"DOCKER_CONFIG must be unset");
 push("tls_override_absent",!env.DOCKER_TLS_VERIFY&&!env.DOCKER_CERT_PATH,
   "Remote Docker TLS environment flags unset");
 if(Boolean(agentKeyPath)!==Boolean(pinnedServerKeyPath)){
   push("local_keys_present",false,"Both agent private key and independently pinned server public key paths are required together");
 }else if(agentKeyPath){
   try{inspectLocalKeyFiles(agentKeyPath,pinnedServerKeyPath);
     push("local_key_files",true,"Ed25519 key files are canonical and locally owner controlled");}
   catch{push("local_key_files",false,"Operator key files failed local validation");}
 }else checks.push({id:"local_key_files",status:"not_checked",
   detail:"Key files not supplied; remote enrollment and server key are not verified"});
 return {schema:"eternyx-docker-lab-preflight-v1",mode:"offline-local-only",
   checkedAt:new Date().toISOString(),checks,
   passed:checks.every(c=>c.status!=="fail"),
   executionAuthorized:false,remoteServerVerified:false,realDockerEngineChecked:false,
   note:"Local environment snapshot only, never a production readiness certificate."};
}
