#!/usr/bin/env node
/**
 * End-to-end, read-only offline Labs evidence audit.
 * This command never signs, copies evidence, opens a network port or starts
 * Firecracker, Docker, paid infrastructure or any customer-facing Labs.
 */
import {auditCompleteIndependentReviewCase} from
  "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs";
import {validSessionId} from
  "../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const SHA=/^[a-f0-9]{64}$/;
const flags=["--session","--operator-sha","--reviewer-sha",
  "--checkpoint-sha","--addendum-sha"];
const usage=[
  "ETERNYX Labs | complete read-only OFFLINE case audit",
  "Use ONLY fingerprints and SHA-256 pins obtained independently of the case disk.",
  "node scripts/cyber-range-complete-case-audit.mjs --audit \\",
  "  --session UUID --operator-sha PINNED_OPERATOR_SPKI_SHA256 \\",
  "  --reviewer-sha PINNED_REVIEWER_SPKI_SHA256 \\",
  "  --checkpoint-sha EXTERNAL_CHECKPOINT_SHA256 \\",
  "  --addendum-sha EXTERNAL_ADDENDUM_SHA256",
  "The result is a file-integrity classification, NOT hardware attestation.",
].join("\n");
try{
  const argv=process.argv.slice(2);
  if(argv.length===0||(argv.length===1&&argv[0]==="--help")){
    console.log(usage);
  }else{
    if(argv[0]!=="--audit"||argv.length!==1+flags.length*2)
      throw Error("Missing or unexpected offline audit flags");
    const parsed=new Map();
    for(let i=1;i<argv.length;i+=2){
      const key=argv[i],value=argv[i+1];
      if(!flags.includes(key)||parsed.has(key)||!value)
        throw Error("Duplicate, empty or unsupported offline audit parameter");
      parsed.set(key,value);
    }
    if(parsed.size!==flags.length||
       !validSessionId(parsed.get("--session"))||
       flags.slice(1).some(k=>!SHA.test(parsed.get(k)??""))||
       parsed.get("--operator-sha")===parsed.get("--reviewer-sha"))
      throw Error("Missing out-of-band cryptographic audit identity");
    const result=await auditCompleteIndependentReviewCase({
      sessionId:parsed.get("--session"),
      operatorFingerprint:parsed.get("--operator-sha"),
      reviewerFingerprint:parsed.get("--reviewer-sha"),
      externallyPinnedCheckpointSha256:parsed.get("--checkpoint-sha"),
      externallyPinnedAddendumSha256:parsed.get("--addendum-sha"),
    });
    console.log(JSON.stringify(result));
  }
}catch{
  // No log content, signing keys, private paths or raw audit inputs in errors.
  console.error("Offline complete case audit refused: verify all original signed files, independent SHA pins, and private-case integrity.");
  process.exitCode=1;
}
