#!/usr/bin/env node
/**
 * ETERNYX reviewer case checkpoint. Offline file-integrity anchor only.
 * Never contacts a VM, host supervisor, Supabase, Docker or public network.
 */
import {
  inspectIndependentCaseCheckpoint,sealIndependentCaseCheckpoint,
  verifyIndependentCaseCheckpoint,
} from "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs";
import {validSessionId} from
  "../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const SHA=/^[a-f0-9]{64}$/;
const ACK="I_APPROVE_OFFLINE_CASE_CHECKPOINT";
const usage=[
  "ETERNYX offline reviewer evidence checkpoint",
  "Read-only digest after verifying three signatures and all source files:",
  "  node scripts/cyber-range-review-checkpoint.mjs --inspect --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
  "Explicit root-only one-time private seal (record SHA outside the case):",
  "  node scripts/cyber-range-review-checkpoint.mjs --seal --confirm-case-checkpoint --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
  "Read-only check of the sealed files against an independently trusted SHA:",
  "  node scripts/cyber-range-review-checkpoint.mjs --verify --session UUID --operator-sha SHA256 --reviewer-sha SHA256 --checkpoint-sha SHA256",
  "Only --seal requires ETERNYX_CASE_CHECKPOINT_ACK="+ACK,
  "SHA-256 pinning is not hardware attestation or public lab authorization.",
].join("\n");
const args=process.argv.slice(2);
try{
  if(args.length===0||(args.length===1&&args[0]==="--help")){
    console.log(usage);
  }else{
    const action=args[0],sealing=action==="--seal";
    if(!["--inspect","--seal","--verify"].includes(action)||
       (sealing&&args[1]!=="--confirm-case-checkpoint"))
      throw Error("Unknown or unapproved offline case checkpoint action");
    const values=sealing?args.slice(2):args.slice(1);
    const allowed=action==="--verify"?
      ["--session","--operator-sha","--reviewer-sha","--checkpoint-sha"]:
      ["--session","--operator-sha","--reviewer-sha"];
    if(values.length!==allowed.length*2)
      throw Error("Unexpected offline case checkpoint arguments");
    const parsed=new Map();
    for(let i=0;i<values.length;i+=2){
      const key=values[i],value=values[i+1];
      if(!allowed.includes(key)||parsed.has(key)||!value)
        throw Error("Missing, repeated or untrusted checkpoint field");
      parsed.set(key,value);
    }
    if(parsed.size!==allowed.length||
       !validSessionId(parsed.get("--session"))||
       !SHA.test(parsed.get("--operator-sha")??"")||
       !SHA.test(parsed.get("--reviewer-sha")??"")||
       parsed.get("--operator-sha")===parsed.get("--reviewer-sha")||
       (action==="--verify"&&!SHA.test(parsed.get("--checkpoint-sha")??"")))
      throw Error("Invalid offline checkpoint identity or external pin");
    const shared={
      sessionId:parsed.get("--session"),
      operatorFingerprint:parsed.get("--operator-sha"),
      reviewerFingerprint:parsed.get("--reviewer-sha"),
    };
    if(sealing){
      if(process.platform!=="linux"||(process.getuid?.()??-1)!==0||
         process.env.ETERNYX_CASE_CHECKPOINT_ACK!==ACK)
        throw Error("Case checkpoint sealing has not been manually approved");
      console.log(JSON.stringify(await sealIndependentCaseCheckpoint({
        ...shared,acknowledgment:ACK,
      })));
    }else if(action==="--verify"){
      console.log(JSON.stringify(await verifyIndependentCaseCheckpoint({
        ...shared,externallyPinnedSha256:parsed.get("--checkpoint-sha"),
      })));
    }else{
      console.log(JSON.stringify(await inspectIndependentCaseCheckpoint(shared)));
    }
  }
}catch{
  console.error("Offline checkpoint refused: verify signed case, external pins, exclusive storage and operator approval.");
  process.exitCode=1;
}
