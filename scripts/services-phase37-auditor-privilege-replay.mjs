#!/usr/bin/env node
/**
 * Explicitly disposable PG17 ONLY: generate synthetic privilege mutations.
 * Does not connect to any database. CI runs output only inside an existing
 * --network none postgres:17-alpine container, never against Supabase.
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {
  auditorPrivilegeSelect,REQUIRED_AUDITOR_ASSERTIONS
} from './services-phase37-auditor-privileges.mjs';

const ROLE='services_staging_auditor';
const query=auditorPrivilegeSelect();
const check=(name,overrides={})=>{
 const assertions=REQUIRED_AUDITOR_ASSERTIONS.map(k=>{
  const expected=Object.hasOwn(overrides,k)?overrides[k]:true;
  return '  IF p.'+k+' IS DISTINCT FROM '+(expected?'TRUE':'FALSE')+
   " THEN RAISE EXCEPTION 'Phase37 "+name+" failed: "+k+"'; END IF;";
 }).join('\n');
 return [
  'BEGIN TRANSACTION READ ONLY;',
  'SET LOCAL default_transaction_read_only = on;',
  'SET LOCAL ROLE '+ROLE+';',
  'DO $assert_phase37$',
  'DECLARE p record;',
  'BEGIN',
  ' SELECT * INTO p FROM ('+query+') q;',
  assertions,
  'END $assert_phase37$;',
  'ROLLBACK;',
 ].join('\n');
};

export function generatePrivilegeMutationReplay(){
 return [
  '-- Phase37 DISPOSABLE container-only synthetic role and privileges.',
  '-- Real staging/production grants, migrations and data are NOT touched.',
  'CREATE ROLE '+ROLE+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;',
  check('baseline'),
  'GRANT INSERT ON public.service_requests TO '+ROLE+';',
  check('table_insert_grant',{table_write_privileges_denied:false}),
  'REVOKE INSERT ON public.service_requests FROM '+ROLE+';',
  'GRANT CREATE ON SCHEMA public TO '+ROLE+';',
  check('schema_create_grant',{schema_create_denied:false}),
  'REVOKE CREATE ON SCHEMA public FROM '+ROLE+';',
  'ALTER ROLE '+ROLE+' CREATEDB;',
  check('createdb_elevation',{role_configuration_safe:false}),
  'ALTER ROLE '+ROLE+' NOCREATEDB;',
  'GRANT pg_write_all_data TO '+ROLE+';',
  check('privileged_membership',{privileged_memberships_denied:false}),
  'REVOKE pg_write_all_data FROM '+ROLE+';',
  'CREATE SEQUENCE public.services_phase37_disposable_seq;',
  'GRANT USAGE ON SEQUENCE public.services_phase37_disposable_seq TO '+ROLE+';',
  check('sequence_usage_grant',{sequence_write_privileges_denied:false}),
  'REVOKE USAGE ON SEQUENCE public.services_phase37_disposable_seq FROM '+ROLE+';',
  'DROP SEQUENCE public.services_phase37_disposable_seq;',
  check('restored_least_privilege'),
  'DROP ROLE '+ROLE+';',
  "SELECT 'PASS: real PG17 auditor metadata rejects five unsafe privilege mutations and restores baseline' AS verdict;",
  ''
 ].join('\n');
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length===3&&process.argv[2]==='--stdout'){
  process.stdout.write(generatePrivilegeMutationReplay());
 }else{
  process.stderr.write('BLOCKED: unrecognized disposable privilege replay invocation\n');
  process.exitCode=2;
 }
}
