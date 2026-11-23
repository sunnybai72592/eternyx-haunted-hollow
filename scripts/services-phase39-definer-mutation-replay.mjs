#!/usr/bin/env node
/**
 * Generates real SQL for --network none disposable PostgreSQL 17 only.
 * Never invoke against remote Supabase or an attached/staging database.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {phase39Sql,PHASE39_FACTS} from './services-phase39-definer-safety.mjs';

const ROLE='services_staging_auditor';
const SQL=phase39Sql();
const FN='public.services_phase39_disposable_definer()';
const BAD='public.services_phase39_disposable_weak()';
const TRG='public.services_phase39_disposable_trigger()';

function check(name,expected={}){
 return [
  'BEGIN TRANSACTION READ ONLY;',
  'SET LOCAL default_transaction_read_only=on;',
  'SET LOCAL ROLE '+ROLE+';',
  'DO $phase39_check$',
  'DECLARE r record;',
  'BEGIN',
  ' SELECT * INTO r FROM ('+SQL+') t;',
  ...PHASE39_FACTS.map(key=>(
   ' IF r.'+key+' IS DISTINCT FROM '+
   (Object.hasOwn(expected,key)?(expected[key]?'TRUE':'FALSE'):'TRUE')+
   " THEN RAISE EXCEPTION 'Phase39 "+name+" failed: "+key+"'; END IF;"
  )),
  'END $phase39_check$;',
  'ROLLBACK;',
 ].join('\n');
}
export function generatePhase39DisposableSql(){
 return [
  '-- CRITICAL: network-isolated disposable CI PostgreSQL ONLY. No remote deployment.',
  'CREATE ROLE '+ROLE+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;',
  check('baseline'),
  'CREATE FUNCTION '+FN+' RETURNS boolean',
  " LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS 'SELECT true';",
  'REVOKE ALL ON FUNCTION '+FN+' FROM PUBLIC;',
  'GRANT EXECUTE ON FUNCTION '+FN+' TO authenticated;',
  check('hardened_client_function_is_allowed'),
  'GRANT EXECUTE ON FUNCTION '+FN+' TO '+ROLE+';',
  check('nonvolatile_auditor_grant',{auditor_nonvolatile_definer_execute_denied:false}),
  'REVOKE EXECUTE ON FUNCTION '+FN+' FROM '+ROLE+';',
  check('auditor_execute_revoked'),
  'ALTER FUNCTION '+FN+' SET search_path = public;',
  check('mutable_client_search_path',{client_definer_unsafe_search_path_denied:false}),
  "ALTER FUNCTION "+FN+" SET search_path = '';",
  check('fixed_search_path_restored'),
  'ALTER FUNCTION '+FN+' RESET search_path;',
  check('unset_client_search_path',{client_definer_unsafe_search_path_denied:false}),
  "ALTER FUNCTION "+FN+" SET search_path = '';",
  'CREATE FUNCTION '+BAD+' RETURNS integer',
  " LANGUAGE sql STABLE SECURITY DEFINER AS 'SELECT 1';",
  // Newly created PostgreSQL functions are EXECUTE-granted to PUBLIC by default.
  check('default_public_execute_is_unsafe',{client_definer_unsafe_search_path_denied:false}),
  'REVOKE ALL ON FUNCTION '+BAD+' FROM PUBLIC;',
  check('public_execute_revoked'),
  'GRANT EXECUTE ON FUNCTION '+BAD+' TO authenticated;',
  check('explicit_client_execute_is_unsafe',{client_definer_unsafe_search_path_denied:false}),
  "ALTER FUNCTION "+BAD+" SET search_path = '';",
  check('second_client_definer_hardened'),
  'CREATE FUNCTION '+TRG+' RETURNS trigger',
  ' LANGUAGE plpgsql SECURITY DEFINER AS $phase39_trigger$',
  ' BEGIN RETURN NEW; END; $phase39_trigger$;',
  check('insecure_definer_trigger',{definer_trigger_unsafe_search_path_denied:false}),
  "ALTER FUNCTION "+TRG+" SET search_path = '';",
  check('trigger_hardened'),
  'DROP FUNCTION '+TRG+';',
  'DROP FUNCTION '+BAD+';',
  'DROP FUNCTION '+FN+';',
  check('all_fixtures_cleaned'),
  'DROP ROLE '+ROLE+';',
  "SELECT 'PASS: Phase39 hardened client and trigger-definer search paths verified against real PG17' AS verdict;",
  '',
 ].join('\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===3&&process.argv[2]==='--stdout')
   process.stdout.write(generatePhase39DisposableSql());
 else{
   process.stderr.write('BLOCKED: Phase39 disposable replay invocation\n');
   process.exitCode=2;
 }
}
