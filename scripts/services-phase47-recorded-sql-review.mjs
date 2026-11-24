#!/usr/bin/env node
/** Generate a fixed, aggregate-only recorded SQL checksum query. This is
 * an operator metadata review, not the unprivileged auditor's history probe.
 * Does not connect to the database, read unrelated migration statements,
 * or assert that matching history alone proves schema behavior. */
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateRolloutManifest} from './services-phase45-pinned-rollout.mjs';
export function buildRecordedBlobReview(manifest){
 validateRolloutManifest(manifest);
 const expected=manifest.steps.map(s=>"('"+s.managedName+"','"+s.gitBlobSha+"',"+s.step+")").join(',\n');
 return [
  'BEGIN TRANSACTION READ ONLY;',
  'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;',
  'WITH expected(name,blob,step) AS (VALUES '+expected+'),',
  "actual AS (SELECT e.*,h.version,CASE WHEN cardinality(h.statements)=1 THEN encode(extensions.digest(convert_to('blob '||octet_length(h.statements[1])::text,'UTF8')||decode('00','hex')||convert_to(h.statements[1],'UTF8'),'sha1'),'hex') END AS actual_blob FROM expected e LEFT JOIN supabase_migrations.schema_migrations h ON h.name=e.name),",
  "ordered AS (SELECT *,lag(version) OVER (ORDER BY step) AS previous_version FROM actual)",
  "SELECT count(*) AS expected_rows,count(*) FILTER (WHERE actual_blob=blob) AS matches,count(*) FILTER (WHERE actual_blob IS DISTINCT FROM blob) AS mismatches,COALESCE(array_agg(step ORDER BY step) FILTER(WHERE actual_blob IS DISTINCT FROM blob),ARRAY[]::integer[]) AS mismatch_steps,COALESCE(bool_and(version IS NOT NULL AND version ~ '^20[0-9]{12}$' AND (step=1 OR version>previous_version)),false) AS managed_order_verified FROM ordered;",
  'COMMIT;',
  '',
 ].join('\n');
}
export function verifyRecordedBlobReview(row){
 if(!row||Object.keys(row).length!==5||
    row.expected_rows!==14||row.matches!==14||row.mismatches!==0||
    !Array.isArray(row.mismatch_steps)||row.mismatch_steps.length!==0||
    row.managed_order_verified!==true)throw Error('services_phase47_recorded_blob_review_failed');
 return {recordedSqlBlobsMatched:14,managedOrderVerified:true,
  schemaBehaviorVerifiedByHistory:false,realAuthAcceptancePassed:false,productionAuthorized:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3||process.argv[2]!=='--sql')throw Error('invalid_args');
  const m=JSON.parse(await readFile(new URL('./services-phase45-rollout-manifest.json',import.meta.url),'utf8'));
  process.stdout.write(buildRecordedBlobReview(m));
 }catch{process.stderr.write('BLOCKED: Services recorded SQL checksum review unavailable\n');process.exitCode=1;}
}
