#!/usr/bin/env node
/**
 * Services Phase 32: compose actual PG17 catalog-verdict regressions.
 * Reads the exact Phase 27 operator-facing SELECT-only query.
 * Emits SQL for a disposable, network-isolated CI PostgreSQL instance only.
 * No connections, databases, migration history or production data touched.
 */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SERVICES_CATALOG_CHECKS} from './services-staging-release-evidence.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PHASE27_SQL='docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql';

export const catalogMutations=Object.freeze([
  {id:'anon_journal_grant',
    sql:'GRANT SELECT ON public.service_request_journal TO anon;',
    failedCheck:'object/service_request_journal/anon_restricted'},
  {id:'missing_activity_authenticated_grant',
    sql:'REVOKE SELECT ON public.service_request_activity FROM authenticated;',
    failedCheck:'object/service_request_activity/authenticated_select'},
  {id:'amendment_rls_disabled',
    sql:'ALTER TABLE public.service_brief_amendments DISABLE ROW LEVEL SECURITY;',
    failedCheck:'object/service_brief_amendments/rls'},
  {id:'journal_no_longer_invoker',
    sql:'ALTER VIEW public.service_request_journal SET (security_invoker = false);',
    failedCheck:'object/service_request_journal/security_invoker'},
  {id:'amendment_burst_trigger_disabled',
    sql:'ALTER TABLE public.service_brief_amendments DISABLE TRIGGER service_brief_amendment_burst_guard;',
    failedCheck:'trigger/service_brief_amendment_burst_guard'},
  {id:'amendment_owner_policy_dropped',
    sql:'DROP POLICY service_brief_amendments_owner_insert ON public.service_brief_amendments;',
    failedCheck:'policy/service_brief_amendments_owner_insert'},
]);

export function validateOperatorQuery(sql){
  if(typeof sql!=='string')throw Error('phase32_catalog_query_invalid');
  const stripped=sql.replace(/--[^\r\n]*/g,'').trim();
  const withoutLiterals=stripped.replace(/'(?:''|[^'])*'/g,"''");
  if(!/^WITH\b/i.test(stripped) || !/;\s*$/.test(stripped) ||
    (stripped.match(/;/g)||[]).length!==1 ||
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|MERGE|DROP|ALTER|CREATE|GRANT|REVOKE|CALL|DO|COPY|PERFORM|EXECUTE)\b/i.test(withoutLiterals) ||
    /\b(?:FROM|JOIN)\s+(?:public|auth)\./i.test(withoutLiterals) ||
    !/COALESCE\(bool_and\(passed IS TRUE\), false\)/.test(stripped) ||
    !/COUNT\(\*\) FILTER \(WHERE passed IS NOT TRUE\)/.test(stripped) ||
    !/failed_check_ids/.test(stripped) ||
    !/checks_evaluated/.test(stripped)) {
    throw Error('phase32_catalog_query_not_read_only_verdict');
  }
  return stripped.slice(0,-1).trim();
}

function assertVerdictSql(failedCheck=null){
  if(failedCheck!==null && (typeof failedCheck!=='string' ||
       !/^[a-z_]+\/[a-z0-9_]+(?:\/[a-z0-9_]+)?$/.test(failedCheck))) {
    throw Error('phase32_check_id_invalid');
  }
  const criteria = failedCheck===null ? [
    'catalog_checks_passed IS TRUE',
    'checks_evaluated = '+SERVICES_CATALOG_CHECKS,
    'checks_failed = 0',
    'COALESCE(cardinality(failed_check_ids), -1) = 0'
  ] : [
    'catalog_checks_passed IS FALSE',
    'checks_evaluated = '+SERVICES_CATALOG_CHECKS,
    'checks_failed >= 1',
    "'"+failedCheck+"' = ANY(failed_check_ids)"
  ];
  return [
    'DO $verify_catalog$',
    'BEGIN',
    '  IF NOT EXISTS (',
    '    SELECT 1 FROM pg_temp.services_catalog_verdict',
    '    WHERE '+criteria.join('\n      AND '),
    '  ) THEN',
    "    RAISE EXCEPTION 'Phase 27 catalog verdict accepted an invalid schema';",
    '  END IF;',
    'END',
    '$verify_catalog$;'
  ].join('\n');
}

function caseSql(query,mutation=null) {
  const statements=['-- TEST ONLY, isolated PostgreSQL: changes rolled back.',
    'BEGIN;',
    "SET LOCAL statement_timeout = '15000ms';"];
  if(mutation!==null){
    if(typeof mutation.id!=='string'||!/^[a-z_]+$/.test(mutation.id)||
       typeof mutation.sql!=='string' ||
       !/^(GRANT|REVOKE|ALTER TABLE|ALTER VIEW|DROP POLICY)\b/.test(mutation.sql)||
       !mutation.sql.endsWith(';'))throw Error('phase32_mutation_invalid');
    statements.push('-- Deliberate security break: '+mutation.id);
    statements.push(mutation.sql);
  }
  statements.push('CREATE TEMP TABLE services_catalog_verdict ON COMMIT DROP AS');
  statements.push(query+';');
  statements.push(assertVerdictSql(mutation?.failedCheck??null));
  statements.push('ROLLBACK;');
  return statements.join('\n');
}

export function createServicesCatalogReplay(sql){
  const query=validateOperatorQuery(sql);
  return [
    '-- WARNING: DISPOSABLE NETWORK-ISOLATED PG17 ONLY.',
    '-- Never apply this generated fixture to a remote database.',
    '\\set ON_ERROR_STOP on',
    caseSql(query),
    ...catalogMutations.map(m=>caseSql(query,m)),
    "SELECT 'PASS: actual Phase 27 catalog verdict rejects six real SQL regressions' AS result;",
    ''
  ].join('\n\n');
}

export async function planCatalogReplay(root=ROOT){
  const sql=await readFile(path.join(root,PHASE27_SQL),'utf8');
  return createServicesCatalogReplay(sql);
}

const invoked=process.argv[1] &&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  if(process.argv.length!==3 || process.argv[2]!=='--stdout'){
    process.stderr.write('Phase 32 catalog replay generator requires --stdout\n');
    process.exitCode=2;
  }else{
    planCatalogReplay().then(s=>process.stdout.write(s)).catch(()=>{
      process.stderr.write('Phase 32 catalog replay unavailable or invalid\n');
      process.exitCode=1;
    });
  }
}
