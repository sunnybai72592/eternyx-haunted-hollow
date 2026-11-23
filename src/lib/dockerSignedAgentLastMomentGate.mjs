// Phase 29: bounded, pure last-moment verification around a real signed-agent
// mutation. A confirmed pinned daemon is not enough: the exact container can
// be restarted or swapped after the first safety inspection. No Docker calls.
import {validateSignedAgentTarget} from "./dockerSignedAgentEngineGate.mjs";

const lifecycleKeys=["Running","Status","StartedAt","FinishedAt","Pid","ExitCode",
 "Paused","Restarting","Dead"];
const stateSnapshot=o=>{
 const s=o?.State;
 if(!s||typeof s!=="object"||Array.isArray(s)||
    typeof s.Running!=="boolean"||typeof s.Status!=="string"||
    typeof s.StartedAt!=="string"||typeof s.FinishedAt!=="string"||
    s.StartedAt.length===0||s.FinishedAt.length===0)
  throw Error("Real Docker target lacks complete state and lifecycle timestamps.");
 const result={};
 for(const key of lifecycleKeys)result[key]=s[key]??null;
 result.RestartCount=o.RestartCount??null;
 return result;
};
const networkSnapshot=o=>{
 const n=o?.NetworkSettings;
 if(!n||!n.Networks||typeof n.Networks!=="object"||
    Array.isArray(n.Networks)||!Object.hasOwn(n,"Ports"))
  throw Error("Real Docker target lacks complete network isolation metadata.");
 return JSON.stringify({Networks:n.Networks,Ports:n.Ports});
};
export function assertSignedAgentPreMutationUnchanged(
 initial,rechecked,containerId,operation,pins
){
 validateSignedAgentTarget(initial,containerId,operation,pins);
 validateSignedAgentTarget(rechecked,containerId,operation,pins);
 // The policies and image have been compared separately with independent pins.
 // Also refuse a same-ID runtime state change, even if it returns to "running".
 const a=stateSnapshot(initial),b=stateSnapshot(rechecked);
 if(JSON.stringify(a)!==JSON.stringify(b)||
    networkSnapshot(initial)!==networkSnapshot(rechecked))
  throw Error("Signed-agent disposable container changed between admission and mutation.");
 return {sameContainerAndPolicy:true,sameLifecycle:true,
  sameNetworkIsolation:true,mutatingCommandExecuted:false};
}
export function validateSignedAgentLifecycleEvidence(before,after,operation){
 if(!["start","stop","restart"].includes(operation))
  throw Error("Unexpected signed-agent lifecycle operation.");
 const a=stateSnapshot(before),b=stateSnapshot(after);
 if(operation==="start"){
  if(a.Running!==false||b.Running!==true||b.Status!=="running"||
     a.StartedAt===b.StartedAt)
   throw Error("No distinct container start epoch observed.");
 }else if(operation==="restart"){
  if(a.Running!==true||b.Running!==true||a.StartedAt===b.StartedAt||
     b.Status!=="running")
   throw Error("No distinct container restart epoch observed.");
 }else if(a.Running!==true||b.Running!==false||b.Status!=="exited"||
     a.FinishedAt===b.FinishedAt){
  throw Error("No distinct Docker stop completion epoch observed.");
 }
 return {agentObservedLifecycleTransition:true,
  independentExecutionCausalityProven:false};
}
