// Wave 16: compare LOCAL CLI-generated candidate bytes against reviewed staged SQL.
// No database, Supabase CLI, network call, migration write or deployment.
import {createHash} from "node:crypto";
import {basename} from "node:path";
export const CANDIDATE_PREAMBLE="-- CLI-generated candidate; not reviewed or applied. Deploy only after staged acceptance.\n";
const sha=data=>createHash("sha256").update(data,"utf8").digest("hex");
export function reviewLedgerMigrationCandidate({filename,proposal,candidate,baselineMigrations}){
 if(typeof filename!=="string"||
    !/^\d{14}_security_case_indexed_ledger\.sql$/.test(basename(filename))||
    typeof proposal!=="string"||typeof candidate!=="string"||
    !proposal.startsWith("-- ETERNYX Wave 4 security case ledger")||
    !proposal.includes("STAGED SQL PROPOSAL ONLY")||
    proposal.includes("DISABLE ROW LEVEL SECURITY")||
    !Array.isArray(baselineMigrations)||baselineMigrations.length!==2||
    !baselineMigrations.every(x=>typeof x==="string"&&x.includes("pentest_")))
   throw new Error("Reviewed local staged proposal or migration candidate is invalid.");
 const version=basename(filename).slice(0,14);
 if(version<="20261111220000"||
   candidate!==CANDIDATE_PREAMBLE+proposal)
   throw new Error("Candidate does not exactly match the reviewed staged ledger SQL.");
 return {candidateFilename:basename(filename),candidateSha256:sha(candidate),
  proposalSha256:sha(proposal),baselineMigrationFiles:[...baselineMigrations],
  localByteMatch:true,appliedToStaging:false,productionAuthorized:false,
  limitations:"Exact local byte equality is not remote migration deployment or independent approval."};
}
