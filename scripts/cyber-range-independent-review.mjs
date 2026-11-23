#!/usr/bin/env node
/**
 * Standalone reviewer workstation: reads ONLY offline case files.
 * Never connects to a host, launches a VM, or toggles ETERNYX public labs.
 */
import {
  inspectIndependentReviewCase,signIndependentReviewCase,
  verifyIndependentReviewCase,auditIndependentReviewConsistency,
  signIndependentReviewDisposition,verifyIndependentReviewDisposition,
} from "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs";
import {validSessionId} from "../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const SHA=/^[a-f0-9]{64}$/;
const ACK="I_REVIEWED_INDEPENDENT_SOURCE_FILES";
const DISPOSITION_ACK="I_APPROVE_OFFLINE_REVIEW_DISPOSITION";
const DECISIONS=new Set([
  "reviewed-for-archival","follow-up-required","evidence-rejected",
]);
const REASONS=new Set([
  "independent-host-source-not-established",
  "guest-identity-not-cryptographically-proven",
  "systemd-watchdog-proof-needs-review",
  "image-origin-not-independently-established",
  "source-timestamp-reconciliation-needed",
  "human-log-inspection-incomplete",
  "other-documented-in-private-case",
]);
const usage=[
  "ETERNYX offline second-person Firecracker evidence review",
  "node scripts/cyber-range-independent-review.mjs --audit-consistency --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
  "node scripts/cyber-range-independent-review.mjs --inspect --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
  "node scripts/cyber-range-independent-review.mjs --endorse --confirm-independent-review --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
  "node scripts/cyber-range-independent-review.mjs --verify --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
  "node scripts/cyber-range-independent-review.mjs --decide --confirm-independent-disposition --session UUID --operator-sha SHA256 --reviewer-sha SHA256 --decision reviewed-for-archival|follow-up-required|evidence-rejected --reasons none|comma-separated-controlled-codes",
  "node scripts/cyber-range-independent-review.mjs --verify-decision --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
  "Only --decide requires ETERNYX_INDEPENDENT_DISPOSITION_ACK="+DISPOSITION_ACK,
  "Only --endorse requires root plus ETERNYX_INDEPENDENT_REVIEW_ACK="+ACK,
  "Review files must be manually staged in the fixed private reviewer case directory.",
  "No auto VM, no cloud, no public labs; positive endorsement is NOT hardware attestation.",
].join("\n");
const args=process.argv.slice(2);
try{
  if(args.length===0 || (args.length===1&&args[0]==="--help")){
    console.log(usage);
  }else{
    const mode=args[0];
    if(!["--audit-consistency","--inspect","--endorse","--verify",
      "--decide","--verify-decision"].includes(mode))
      throw Error("Unknown review action");
    const endorsed=mode==="--endorse",deciding=mode==="--decide";
    const manual=endorsed||deciding;
    const values=manual?args.slice(2):args.slice(1);
    if((endorsed && args[1]!=="--confirm-independent-review")||
       (deciding && args[1]!=="--confirm-independent-disposition"))
      throw Error("Reviewer did not explicitly approve the action");
    if(values.length!==(deciding?10:6))
      throw Error("Unexpected reviewer arguments");
    const parsed=new Map();
    for(let i=0;i<values.length;i+=2){
      const key=values[i],value=values[i+1];
      if(!["--session","--operator-sha","--reviewer-sha",
        ...(deciding?["--decision","--reasons"]:[])].includes(key) ||
         parsed.has(key)||!value)throw Error("Untrusted reviewer field");
      parsed.set(key,value);
    }
    const sessionId=parsed.get("--session");
    const operatorFingerprint=parsed.get("--operator-sha");
    const reviewerFingerprint=parsed.get("--reviewer-sha");
    if(!validSessionId(sessionId)||!SHA.test(operatorFingerprint??"")||
       !SHA.test(reviewerFingerprint??"")||
       operatorFingerprint===reviewerFingerprint)
      throw Error("Invalid offline reviewer identity");
    const shared={sessionId,operatorFingerprint,reviewerFingerprint};
    if(endorsed||deciding){
      if(process.platform!=="linux" ||(process.getuid?.()??-1)!==0)
        throw Error("Root-owned offline reviewer machine required");
      if(endorsed){
        if(process.env.ETERNYX_INDEPENDENT_REVIEW_ACK!==ACK)
          throw Error("Manual independent reviewer approval missing");
        console.log(JSON.stringify(await signIndependentReviewCase({
          ...shared,reviewerAck:ACK,
        })));
      }else{
        if(process.env.ETERNYX_INDEPENDENT_DISPOSITION_ACK!==DISPOSITION_ACK)
          throw Error("Manual reviewer disposition approval missing");
        const decision=parsed.get("--decision");
        const raw=parsed.get("--reasons");
        if(!DECISIONS.has(decision)||!raw ||
           (raw!=="none"&&raw.split(",").some(x=>!REASONS.has(x))))
          throw Error("Reviewer disposition choices are not approved");
        const reasons=raw==="none"?[]:raw.split(",");
        console.log(JSON.stringify(await signIndependentReviewDisposition({
          ...shared,decision,reasons,acknowledgment:DISPOSITION_ACK,
        })));
      }
    }else if(mode==="--audit-consistency"){
      console.log(JSON.stringify(await auditIndependentReviewConsistency(shared)));
    }else if(mode==="--inspect"){
      console.log(JSON.stringify(await inspectIndependentReviewCase(shared)));
    }else if(mode==="--verify-decision"){
      console.log(JSON.stringify(await verifyIndependentReviewDisposition(shared)));
    }else{
      console.log(JSON.stringify(await verifyIndependentReviewCase(shared)));
    }
  }
}catch{
  // Never reveal private keys, captured logs, physical host paths or stderr.
  console.error("Offline case review refused; inspect signer pins, private case files and manual approval.");
  process.exitCode=1;
}
