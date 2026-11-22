// Local, read-only structural drift check on captured Docker inspect JSON.
// No Docker process is executed. Only allowlisted security-relevant fields
// are hashed or reported; environment variables and secrets are never emitted.
import {createHash} from "node:crypto";
import {verifyManagedTarget} from "./dockerOperatorUtils.mjs";
const ID=/^[a-f0-9]{64}$/;
const HASH=/^[a-f0-9]{64}$/;
const stable=value=>JSON.stringify(value);
const hasKeys=obj=>obj&&typeof obj==="object"&&!Array.isArray(obj);
export function normalizedLabContainer(inspect,id){
 if(!ID.test(id||"")||!hasKeys(inspect))throw Error("Invalid Docker inspect input or full container ID.");
 verifyManagedTarget(inspect,id);
 const c=inspect.Config,h=inspect.HostConfig;
 // Only a structural allowlist, no Config.Env, secrets, commands, host paths
 // or raw Docker inspect output in drift results.
 const result={
   id, imageId:typeof inspect.Image==="string"?inspect.Image:"",
   imageName:typeof c.Image==="string"?c.Image:"",
   user:c.User,
   managedLabel:c.Labels["io.eternyx.operator.managed"],
   scopeLabel:c.Labels["io.eternyx.operator.scope"],
   privileged:h.Privileged,readonly:h.ReadonlyRootfs,network:h.NetworkMode,
   mounts:inspect.Mounts?.length??0,
   binds:h.Binds?.length??0,ports:Object.keys(h.PortBindings||{}).sort(),
   capDrop:(h.CapDrop||[]).slice().sort(),
   capAdd:(h.CapAdd||[]).slice().sort(),
   securityOpts:(h.SecurityOpt||[]).slice().sort(),
   devices:h.Devices?.length??0,deviceRequests:h.DeviceRequests?.length??0,
   pidMode:h.PidMode||"",ipcMode:h.IpcMode||"",cgroupnsMode:h.CgroupnsMode||"",
   usernsMode:h.UsernsMode||"",utsMode:h.UTSMode||"",
   pidsLimit:h.PidsLimit,memoryBytes:h.Memory,
   restartPolicy:h.RestartPolicy?.Name||"no",
 };
 if(!result.imageId||!result.imageName)
   throw Error("Captured Docker inspect lacks image identity.");
 return result;
}
function digest(value){return createHash("sha256").update(
 "ETERNYX_DOCKER_LAB_POLICY_FINGERPRINT_V1\n"+stable(value)).digest("hex");}
export function fingerprintLabContainer(inspect,id){
 const normalized=normalizedLabContainer(inspect,id);
 return {schema:"eternyx-docker-lab-fingerprint-v1",containerId:id,
  policySha256:digest(normalized),policyChecksPassed:true,
  executionAuthorized:false,remoteOwnershipVerified:false};
}
export function compareLabContainerDrift(baseline,current,id,pinnedBaselineSha256){
 if(!HASH.test(pinnedBaselineSha256||""))
   throw Error("An independently retained baseline SHA-256 is required.");
 const old=normalizedLabContainer(baseline,id);
 const actual=digest(old);
 if(actual!==pinnedBaselineSha256)throw Error("Baseline does not match pinned policy digest.");
 let next;
 try{next=normalizedLabContainer(current,id);}
 catch{return {status:"unsafe_or_invalid_current_capture",driftDetected:true,
   attentionRequired:true,changedFields:[],baselineVerified:true,
   executionAuthorized:false,realDockerEngineChecked:false};}
 const differences=Object.keys(old).filter(k=>stable(old[k])!==stable(next[k]));
 return {status:differences.length?"security_policy_drift":"fingerprints_match",
   driftDetected:differences.length>0,attentionRequired:differences.length>0,
   changedFields:differences,baselineVerified:true,
   baselinePolicySha256:actual,currentPolicySha256:digest(next),
   executionAuthorized:false,realDockerEngineChecked:false};
}
