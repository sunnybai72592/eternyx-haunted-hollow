#!/usr/bin/env node
/**
 * Portable, canonical offline review report. Read-only case access.
 *
 * --emit prints a metadata-only canonical JSON wrapper (redirect it to an
 * independently controlled private archive). It does NOT create files.
 * --verify reads the saved wrapper from stdin (max 4096 bytes) and requires
 * a separately recorded SHA-256, then re-verifies the entire original case.
 */
import {auditCompleteIndependentReviewCase} from
  "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs";
import {
  createPortableOfflineAuditReceipt,verifyPortableOfflineAuditReceipt,
} from "../infrastructure/cyber-range/provider/firecracker-portable-audit-receipt.mjs";
import {validSessionId} from
  "../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const SHA=/^[a-f0-9]{64}$/;
const FLAGS=["--session","--operator-sha","--reviewer-sha",
  "--checkpoint-sha","--addendum-sha"];
const MAX_STDIN=4096;
const usage=[
  "ETERNYX Labs | portable offline file-review receipt",
  "Produce one canonical metadata-only JSON wrapper to stdout:",
  "  node scripts/cyber-range-portable-audit.mjs --emit \\",
  "    --session UUID --operator-sha PIN --reviewer-sha PIN \\",
  "    --checkpoint-sha PIN --addendum-sha PIN > private-archive.json",
  "Record the receiptSha256 out of band, independent of the saved JSON.",
  "Validate saved bytes AND the original case read-only:",
  "  node scripts/cyber-range-portable-audit.mjs --verify \\",
  "    --session UUID --operator-sha PIN --reviewer-sha PIN \\",
  "    --checkpoint-sha PIN --addendum-sha PIN \\",
  "    --archive-sha EXTERNALLY_TRUSTED_RECEIPT_SHA256 < private-archive.json",
  "Passing means offline file-chain consistency, never real KVM attestation.",
].join("\n");
async function readBoundedStdin(){
  if(process.stdin.isTTY)
    throw Error("Saved offline receipt must be supplied by a pipe");
  const chunks=[];
  let size=0;
  for await (const chunk of process.stdin){
    size+=chunk.length;
    if(size>MAX_STDIN)throw Error("Oversized saved portable audit receipt");
    chunks.push(chunk);
  }
  if(size<2)throw Error("Missing saved portable receipt on stdin");
  return Buffer.concat(chunks,size);
}
try{
  const args=process.argv.slice(2);
  if(args.length===0||(args.length===1&&args[0]==="--help")){
    console.log(usage);
  }else{
    const mode=args[0],verifying=mode==="--verify";
    const flags=verifying?[...FLAGS,"--archive-sha"]:FLAGS;
    if(!["--emit","--verify"].includes(mode)||
       args.length!==1+flags.length*2)
      throw Error("Unsupported or incomplete portable case audit action");
    const parsed=new Map();
    for(let i=1;i<args.length;i+=2){
      const name=args[i],value=args[i+1];
      if(!flags.includes(name)||parsed.has(name)||!value)
        throw Error("Duplicate or unsupported case audit flag");
      parsed.set(name,value);
    }
    const sessionId=parsed.get("--session");
    const operatorFingerprint=parsed.get("--operator-sha");
    const reviewerFingerprint=parsed.get("--reviewer-sha");
    if(parsed.size!==flags.length||!validSessionId(sessionId)||
       flags.slice(1).some(f=>!SHA.test(parsed.get(f)??""))||
       operatorFingerprint===reviewerFingerprint)
      throw Error("Invalid or missing independent audit identity pins");
    const saved=verifying?await readBoundedStdin():null;
    const verifiedAudit=await auditCompleteIndependentReviewCase({
      sessionId,operatorFingerprint,reviewerFingerprint,
      externallyPinnedCheckpointSha256:parsed.get("--checkpoint-sha"),
      externallyPinnedAddendumSha256:parsed.get("--addendum-sha"),
    });
    if(verifying){
      const parsedSaved=JSON.parse(saved.toString("utf8"));
      if(!parsedSaved||Array.isArray(parsedSaved)||
         Object.keys(parsedSaved).sort().join("|")!==
           ["receipt","receiptSha256"].sort().join("|")||
         !SHA.test(parsedSaved.receiptSha256??"")||
         !saved.equals(Buffer.from(JSON.stringify(parsedSaved)+"\n","utf8")))
        throw Error("Noncanonical or untrusted saved archive wrapper");
      const original=Buffer.from(
        JSON.stringify(parsedSaved.receipt)+"\n","utf8");
      if(parsedSaved.receiptSha256!==
         parsed.get("--archive-sha"))
        throw Error("Archive wrapper and independent trust pin disagree");
      const result=verifyPortableOfflineAuditReceipt({
        savedBytes:original,verifiedAudit,
        externallyPinnedReceiptSha256:parsed.get("--archive-sha"),
      });
      console.log(JSON.stringify(result));
    }else{
      const output=createPortableOfflineAuditReceipt(verifiedAudit);
      const wrapper={receipt:output.receipt,
        receiptSha256:output.receiptSha256};
      const printable=Buffer.from(JSON.stringify(wrapper)+"\n","utf8");
      if(printable.length>MAX_STDIN)
        throw Error("Metadata-only receipt exceeded export safety limit");
      process.stdout.write(printable);
    }
  }
}catch{
  console.error("Portable offline audit refused: verify original private evidence, all three independent pins, and the canonical saved receipt.");
  process.exitCode=1;
}
