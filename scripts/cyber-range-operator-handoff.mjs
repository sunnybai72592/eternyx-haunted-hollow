#!/usr/bin/env node
/**
 * Explicit offline operator-to-reviewer signed receipt handoff.
 * No network, host VM, cloud, email, or automatic transfer is performed.
 */
import {
  exportOperatorHandoff,inspectOperatorHandoff,
  importOperatorHandoff,verifyImportedHandoff,
  resumeOperatorHandoff,auditImportedHandoff,
} from "../infrastructure/cyber-range/provider/firecracker-operator-handoff.mjs";
import {validSessionId} from
  "../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const SHA=/^[a-f0-9]{64}$/;
const EXPORT_ACK="I_APPROVE_OFFLINE_OPERATOR_RECEIPT_EXPORT";
const IMPORT_ACK="I_APPROVE_OFFLINE_REVIEWER_RECEIPT_IMPORT";
const RECOVERY_ACK="I_APPROVE_OFFLINE_REVIEWER_IMPORT_RECOVERY";
const usage=[
  "ETERNYX Labs — manual, signed, offline operator receipt handoff",
  "Operator export (no raw logs/private key):",
  "  node scripts/cyber-range-operator-handoff.mjs --export --confirm-offline-transfer --session UUID --operator-sha SPKI_SHA256",
  "Reviewer read-only inbox inspection (out-of-band transfer SHA required):",
  "  node scripts/cyber-range-operator-handoff.mjs --inspect --session UUID --operator-sha SPKI_SHA256 --transport-sha SHA256",
  "Reviewer exclusive private import (no replacement):",
  "  node scripts/cyber-range-operator-handoff.mjs --import --confirm-offline-receipt --session UUID --operator-sha SPKI_SHA256 --transport-sha SHA256",
  "Reviewer read-only transaction audit (reports pending vs committed):",
  "  node scripts/cyber-range-operator-handoff.mjs --audit-import --session UUID --operator-sha SPKI_SHA256 --transport-sha SHA256",
  "Manually approved recovery of original pending import; never overwrites:",
  "  node scripts/cyber-range-operator-handoff.mjs --resume-import --confirm-import-recovery --session UUID --operator-sha SPKI_SHA256 --transport-sha SHA256",
  "Reviewer read-only verification of imported signed receipt:",
  "  node scripts/cyber-range-operator-handoff.mjs --verify-import --session UUID --operator-sha SPKI_SHA256 --transport-sha SHA256",
  "Root and exact ETERNYX_OFFLINE_HANDOFF_ACK required for export/import only.",
  "The operator and reviewer must transfer the JSON locally and record both pins independently.",
  "Independently collected host logs are not in this packet. Public labs remain disabled.",
].join("\n");
const args=process.argv.slice(2);
try{
  if(args.length===0||(args.length===1&&args[0]==="--help")){
    console.log(usage);
  }else{
    const mode=args[0];
    const exporting=mode==="--export",importing=mode==="--import";
    const resuming=mode==="--resume-import";
    if(!["--export","--inspect","--import","--resume-import",
      "--audit-import","--verify-import"].includes(mode))
      throw Error("Unsupported offline handoff operation");
    const confirm=exporting?"--confirm-offline-transfer":
      importing?"--confirm-offline-receipt":
      resuming?"--confirm-import-recovery":null;
    const tail=args.slice(confirm?2:1);
    if(confirm&&args[1]!==confirm)
      throw Error("Manual operator/reviewer confirmation missing");
    const needed=exporting?
      ["--session","--operator-sha"]:
      ["--session","--operator-sha","--transport-sha"];
    if(tail.length!==needed.length*2)
      throw Error("Unexpected offline transfer arguments");
    const values=new Map();
    for(let i=0;i<tail.length;i+=2){
      const key=tail[i],value=tail[i+1];
      if(!needed.includes(key)||values.has(key)||!value)
        throw Error("Missing, repeated or untrusted handoff field");
      values.set(key,value);
    }
    const sessionId=values.get("--session");
    const trustedOperatorFingerprint=values.get("--operator-sha");
    const expectedTransportSha256=values.get("--transport-sha");
    if(values.size!==needed.length||
       !validSessionId(sessionId)||
       !SHA.test(trustedOperatorFingerprint??"")||
       (!exporting&&!SHA.test(expectedTransportSha256??"")))
      throw Error("Untrusted handoff signer or transport digest");
    if(exporting||importing||resuming){
      const wanted=exporting?EXPORT_ACK:
        resuming?RECOVERY_ACK:IMPORT_ACK;
      if(process.platform!=="linux" || (process.getuid?.()??-1)!==0 ||
         process.env.ETERNYX_OFFLINE_HANDOFF_ACK!==wanted)
        throw Error("Explicit trusted root operator transfer approval absent");
    }
    const valuesForCall={
      sessionId,trustedOperatorFingerprint,
      ...(exporting?{}:{expectedTransportSha256}),
    };
    const output=exporting?
      await exportOperatorHandoff(valuesForCall):
      importing?await importOperatorHandoff(valuesForCall):
      resuming?await resumeOperatorHandoff(valuesForCall):
      mode==="--inspect"?await inspectOperatorHandoff(valuesForCall):
      mode==="--audit-import"?await auditImportedHandoff(valuesForCall):
      await verifyImportedHandoff(valuesForCall);
    console.log(JSON.stringify(output));
  }
}catch{
  // Never leak private paths, transcript contents, credentials, or raw logs.
  console.error("Offline signed receipt handoff refused: check fixed private paths, explicit approvals and independently pinned digests.");
  process.exitCode=1;
}
