#!/usr/bin/env node
/**
 * Offline manual signed addendum for operator-collected runtime sidecars.
 * No VM boot, network request, mutable routes or public lab activation.
 */
import {
  signIndependentRuntimeAddendum,verifyIndependentRuntimeAddendum,
} from "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs";
import {validSessionId} from
  "../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const SHA=/^[a-f0-9]{64}$/;
const ACK="I_APPROVE_SIGNED_OFFLINE_RUNTIME_ADDENDUM";
const usage=[
  "ETERNYX Labs — offline second-person runtime addendum",
  "After independent human inspection, sign once with private reviewer key:",
  "  node scripts/cyber-range-runtime-addendum.mjs --sign --confirm-offline-runtime-addendum --session UUID --operator-sha SHA256 --reviewer-sha SHA256 --checkpoint-sha INDEPENDENT_SHA256",
  "Read-only verify with TWO independent external SHA pins:",
  "  node scripts/cyber-range-runtime-addendum.mjs --verify --session UUID --operator-sha SHA256 --reviewer-sha SHA256 --checkpoint-sha INDEPENDENT_SHA256 --addendum-sha INDEPENDENT_SHA256",
  "Root sign requires ETERNYX_RUNTIME_ADDENDUM_ACK="+ACK,
  "A reviewer signature binds operator-provided files; it does not attest KVM.",
].join("\n");
const args=process.argv.slice(2);
try{
  if(args.length===0 ||(args.length===1&&args[0]==="--help")){
    console.log(usage);
  }else{
    const action=args[0],signing=action==="--sign";
    if(!["--sign","--verify"].includes(action)||
       (signing&&args[1]!=="--confirm-offline-runtime-addendum"))
      throw Error("Unsupported or unapproved offline runtime addendum action");
    const tail=signing?args.slice(2):args.slice(1);
    const allowed=["--session","--operator-sha","--reviewer-sha",
      "--checkpoint-sha",...(signing?[]:["--addendum-sha"])];
    if(tail.length!==allowed.length*2)
      throw Error("Missing or unexpected runtime addendum arguments");
    const entries=new Map();
    for(let i=0;i<tail.length;i+=2){
      const key=tail[i],value=tail[i+1];
      if(!allowed.includes(key)||entries.has(key)||!value)
        throw Error("Duplicate or unexpected runtime addendum argument");
      entries.set(key,value);
    }
    const sessionId=entries.get("--session");
    const operatorFingerprint=entries.get("--operator-sha");
    const reviewerFingerprint=entries.get("--reviewer-sha");
    const externallyPinnedCheckpointSha256=entries.get("--checkpoint-sha");
    const externallyPinnedAddendumSha256=entries.get("--addendum-sha");
    if(entries.size!==allowed.length||
       !validSessionId(sessionId)||
       !SHA.test(operatorFingerprint??"")||
       !SHA.test(reviewerFingerprint??"")||
       operatorFingerprint===reviewerFingerprint||
       !SHA.test(externallyPinnedCheckpointSha256??"")||
       (!signing&&!SHA.test(externallyPinnedAddendumSha256??"")))
      throw Error("Invalid externally pinned case or sidecar addendum identity");
    const shared={sessionId,operatorFingerprint,reviewerFingerprint,
      externallyPinnedCheckpointSha256};
    if(signing){
      if(process.platform!=="linux"||(process.getuid?.()??-1)!==0||
         process.env.ETERNYX_RUNTIME_ADDENDUM_ACK!==ACK)
        throw Error("Separate privileged human authorization is required");
      console.log(JSON.stringify(await signIndependentRuntimeAddendum({
        ...shared,acknowledgment:ACK,
      })));
    }else{
      console.log(JSON.stringify(await verifyIndependentRuntimeAddendum({
        ...shared,externallyPinnedAddendumSha256,
      })));
    }
  }
}catch{
  // Deliberately never log private logs, keys, internal paths or raw payloads.
  console.error("Offline reviewer runtime addendum refused: recheck both external pins, signed case, private files and human approval.");
  process.exitCode=1;
}
