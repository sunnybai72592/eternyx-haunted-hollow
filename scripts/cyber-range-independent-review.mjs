#!/usr/bin/env node
/**
 * Standalone reviewer workstation: reads ONLY offline case files.
 * Never connects to a host, launches a VM, or toggles ETERNYX public labs.
 */
import {
  inspectIndependentReviewCase,signIndependentReviewCase,
  verifyIndependentReviewCase,
} from "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs";
import {validSessionId} from "../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const SHA=/^[a-f0-9]{64}$/;
const ACK="I_REVIEWED_INDEPENDENT_SOURCE_FILES";
const usage=[
  "ETERNYX offline second-person Firecracker evidence review",
  "node scripts/cyber-range-independent-review.mjs --inspect --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
  "node scripts/cyber-range-independent-review.mjs --endorse --confirm-independent-review --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
  "node scripts/cyber-range-independent-review.mjs --verify --session UUID --operator-sha SHA256 --reviewer-sha SHA256",
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
    if(!["--inspect","--endorse","--verify"].includes(mode))
      throw Error("Unknown review action");
    const endorsed=mode==="--endorse";
    const values=endorsed?args.slice(2):args.slice(1);
    if(endorsed && args[1]!=="--confirm-independent-review")
      throw Error("Reviewer did not confirm the manual review");
    if(values.length!==6)throw Error("Unexpected reviewer arguments");
    const parsed=new Map();
    for(let i=0;i<values.length;i+=2){
      const key=values[i],value=values[i+1];
      if(!["--session","--operator-sha","--reviewer-sha"].includes(key) ||
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
    if(endorsed){
      if(process.platform!=="linux" ||(process.getuid?.()??-1)!==0 ||
         process.env.ETERNYX_INDEPENDENT_REVIEW_ACK!==ACK)
        throw Error("Manual independent reviewer approval missing");
      console.log(JSON.stringify(await signIndependentReviewCase({
        ...shared,reviewerAck:ACK,
      })));
    }else if(mode==="--inspect"){
      console.log(JSON.stringify(await inspectIndependentReviewCase(shared)));
    }else{
      console.log(JSON.stringify(await verifyIndependentReviewCase(shared)));
    }
  }
}catch{
  // Never reveal private keys, captured logs, physical host paths or stderr.
  console.error("Offline case review refused; inspect signer pins, private case files and manual approval.");
  process.exitCode=1;
}
