#!/usr/bin/env node
/**
 * Phase38: generate disposable PG17-only privilege mutation SQL.
 * Source-only generator, no API/database calls. Networkless CI owns execution.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exposedRoutineSql,EXPOSED_ROUTINE_CHECKS} from './services-phase38-executable-definer-guard.mjs';

const NAME='services_staging_auditor';
const SQL=exposedRoutineSql();
function check(label,overrides={},only=null){
 const keys=only??EXPOSED_ROUTINE_CHECKS;
 return [
 'BEGIN TRANSACTION READ ONLY;',
 'SET LOCAL default_transaction_read_only=on;',
 'SET LOCAL ROLE '+NAME+';',
 'DO $assert_phase38$',
 'DECLARE r record;',
 'BEGIN',
 ' SELECT * INTO r FROM ('+SQL+') q;',
 ...keys.map(key=>{
  const allowed=Object.hasOwn(overrides,key)?overrides[key]:true;
  return ' IF r.'+key+' IS DISTINCT FROM '+(allowed?'TRUE':'FALSE')+
   " THEN RAISE EXCEPTION 'Phase38 "+label+" failed: "+key+"'; END IF;";
 }),
 'END $assert_phase38$;',
 'ROLLBACK;',
 ].join('\n');
}
export function buildPhase38DisposableSql(){
 return [
 '-- Must only be executed by privileged CI inside disposable networkless PostgreSQL 17.',
 '-- Never execute these synthetic roles/grants on remote or shared Supabase.',
 'CREATE ROLE '+NAME+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;',
 check('clean'),
 'CREATE FUNCTION public.services_phase38_disposable_definer() RETURNS boolean',
 " LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS 'SELECT true';",
 'REVOKE ALL ON FUNCTION public.services_phase38_disposable_definer() FROM PUBLIC;',
 check('non_executable_privileged_function'),
 'GRANT EXECUTE ON FUNCTION public.services_phase38_disposable_definer() TO '+NAME+';',
 check('volatile_privileged_exposure',{volatile_security_definer_execute_denied:false},['volatile_security_definer_execute_denied']),
 'REVOKE EXECUTE ON FUNCTION public.services_phase38_disposable_definer() FROM '+NAME+';',
 check('function_execute_revoked'),
 'CREATE PROCEDURE public.services_phase38_disposable_proc()',
 " LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $proc$ BEGIN NULL; END; $proc$;",
 'REVOKE ALL ON PROCEDURE public.services_phase38_disposable_proc() FROM PUBLIC;',
 'GRANT EXECUTE ON PROCEDURE public.services_phase38_disposable_proc() TO '+NAME+';',
 check('privileged_procedure_exposure',{security_definer_procedures_execute_denied:false},['security_definer_procedures_execute_denied']),
 'REVOKE EXECUTE ON PROCEDURE public.services_phase38_disposable_proc() FROM '+NAME+';',
 'DROP PROCEDURE public.services_phase38_disposable_proc();',
 'GRANT USAGE ON SCHEMA eternyx_private TO '+NAME+';',
 check('private_helper_schema_exposure',{private_helper_schema_usage_denied:false},['private_helper_schema_usage_denied']),
 'REVOKE USAGE ON SCHEMA eternyx_private FROM '+NAME+';',
 'DROP FUNCTION public.services_phase38_disposable_definer();',
 check('restored_least_privilege'),
 'DROP ROLE '+NAME+';',
 "SELECT 'PASS: disposable PG17 privileged routine and schema exposure mutations' AS result;",
 ''
 ].join('\n');
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 if(process.argv.length===3&&process.argv[2]==='--stdout')
   process.stdout.write(buildPhase38DisposableSql());
 else{
   process.stderr.write('BLOCKED: invalid Phase38 disposable invocation\n');
   process.exitCode=2;
 }
}
