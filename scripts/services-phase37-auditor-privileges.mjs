#!/usr/bin/env node
/**
 * Services Phase 37: metadata-only verification of the ACTUAL SQL auditor's
 * privilege boundary. No database driver, network, file writes or DDL.
 * Executed as a subquery inside Phase 36's live READ ONLY transaction.
 */
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const AUDITOR_PRIVILEGE_SQL = String.raw`SELECT
  COALESCE((
    SELECT r.rolcanlogin AND NOT r.rolsuper
       AND NOT r.rolcreatedb AND NOT r.rolcreaterole
       AND NOT r.rolreplication AND NOT r.rolbypassrls
       AND NOT r.rolinherit
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user
  ), false) AS role_configuration_safe,
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname IN (
      'postgres', 'supabase_admin', 'service_role', 'authenticator',
      'supabase_auth_admin', 'supabase_storage_admin', 'pg_database_owner',
      'pg_read_all_data', 'pg_write_all_data', 'pg_monitor',
      'pg_execute_server_program', 'pg_read_server_files',
      'pg_write_server_files', 'pg_signal_backend'
    ) AND pg_catalog.pg_has_role(current_user, r.oid, 'MEMBER')
  ) AS privileged_memberships_denied,
  NOT pg_catalog.has_database_privilege(
    current_user, current_database(), 'CREATE'
  ) AS database_create_denied,
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace n
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_%'
      AND pg_catalog.has_schema_privilege(current_user,n.oid,'CREATE')
  ) AS schema_create_denied,
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_%'
      AND c.relkind IN ('r','p','v','m','f')
      AND (
        pg_catalog.has_table_privilege(current_user,c.oid,'INSERT')
        OR pg_catalog.has_table_privilege(current_user,c.oid,'UPDATE')
        OR pg_catalog.has_table_privilege(current_user,c.oid,'DELETE')
        OR pg_catalog.has_table_privilege(current_user,c.oid,'TRUNCATE')
        OR pg_catalog.has_table_privilege(current_user,c.oid,'REFERENCES')
        OR pg_catalog.has_table_privilege(current_user,c.oid,'TRIGGER')
      )
  ) AS table_write_privileges_denied,
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_%'
      AND c.relkind='S'
      AND (
        pg_catalog.has_sequence_privilege(current_user,c.oid,'USAGE')
        OR pg_catalog.has_sequence_privilege(current_user,c.oid,'UPDATE')
      )
  ) AS sequence_write_privileges_denied,
  (pg_catalog.current_setting('transaction_read_only')='on'
    AND pg_catalog.current_setting('default_transaction_read_only')='on')
    AS readonly_transaction_enforced`;

export const REQUIRED_AUDITOR_ASSERTIONS=Object.freeze([
 'role_configuration_safe',
 'privileged_memberships_denied',
 'database_create_denied',
 'schema_create_denied',
 'table_write_privileges_denied',
 'sequence_write_privileges_denied',
 'readonly_transaction_enforced',
]);

const fail=(code)=>{throw Error('services_phase37_'+code)};
export function validateAuditorPrivilegeResult(row){
 if(row===null||typeof row!=='object'||Array.isArray(row))
   fail('privilege_proof_missing');
 const actual=Object.keys(row).sort();
 const expected=[...REQUIRED_AUDITOR_ASSERTIONS].sort();
 if(actual.length!==expected.length||
   expected.some((key,i)=>key!==actual[i]))
   fail('privilege_proof_incomplete');
 for(const key of REQUIRED_AUDITOR_ASSERTIONS)
   if(row[key]!==true)fail('privilege_proof_failed');
 return {leastPrivilegeMetadataVerified:true,checksPassed:expected.length,
   checkedWithinReadOnlyTransaction:true,securityDefinerFunctionsReviewed:false,
   stagingAdminProvisionedByThisCheck:false,productionChangesMade:false};
}

// SQL is a constant assembled from audited source; never accept SQL from env.
export function auditorPrivilegeSelect(){
 if(!AUDITOR_PRIVILEGE_SQL.startsWith('SELECT\n')||
    AUDITOR_PRIVILEGE_SQL.includes(';'))
    fail('query_corrupted');
 return AUDITOR_PRIVILEGE_SQL;
}
const invoked=process.argv[1]&&
 path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 if(process.argv.length===3&&process.argv[2]==='--sql'){
  process.stdout.write(auditorPrivilegeSelect()+';\n');
 }else{
  process.stderr.write('BLOCKED: invalid auditor metadata source request\n');
  process.exitCode=2;
 }
}
