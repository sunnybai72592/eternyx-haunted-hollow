#!/usr/bin/env node
/** Read-only metadata verification of Phase48 candidate, not deployment. */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateInventoryTarget} from './services-phase42-staging-inventory.mjs';
export const FACTS=Object.freeze(['administrator_table_rls','direct_table_access_denied','public_wrapper_invoker','private_definer_exact_body','owner_consistent','wrapper_bound_to_helper','implicit_public_execute_denied','compatibility_grants_without_create','private_schema_public_denied','private_schema_only_reviewed_helper']);
export function analyzeHardening(raw){
 if(typeof raw!=='string'||raw.length>16000||raw.trim().split(/\r?\n/).length!==1)throw Error('services_phase48_invalid_output');
 let obj;try{obj=JSON.parse(raw)}catch{throw Error('services_phase48_invalid_json')}
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).length!==FACTS.length||FACTS.some(k=>typeof obj[k]!=='boolean'))throw Error('services_phase48_incomplete_facts');
 const missing=FACTS.filter(k=>!obj[k]);
 return {schema:'eternyx-services-phase48-helper-proof-v1',state:missing.length?'hardening_not_verified':'hardened_catalog_verified',factsPassed:FACTS.length-missing.length,missingFacts:missing,liveDataApiExposureVerified:false,realAccountAcceptancePassed:false,productionAuthorized:false};
}
export async function inspectHardening(env=process.env){
 const target=validateInventoryTarget(env);
 const source=await readFile(new URL('../docs/sql/eternyx/services-phase48-readonly-admin-helper-verdict.sql',import.meta.url),'utf8');
 const child=spawnSync('psql',['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',target.host,'-p','5432','-U',target.user,'-d','postgres'],{
 input:"BEGIN TRANSACTION READ ONLY;\nSET TRANSACTION ISOLATION LEVEL REPEATABLE READ;\n"+source+"\nCOMMIT;\n",encoding:'utf8',timeout:40000,maxBuffer:32768,
 env:{PATH:process.env.PATH??'/usr/bin:/bin',HOME:process.env.HOME??'/tmp',PGPASSWORD:target.password,PGSSLMODE:'verify-full',PGSSLROOTCERT:'/etc/ssl/certs/ca-certificates.crt',PGCONNECT_TIMEOUT:'8',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=12000',PGAPPNAME:'eternyx-services-phase48-helper-readonly'}});
 if(child.error||child.signal||child.status!==0)throw Error('services_phase48_probe_failed');
 return analyzeHardening(child.stdout);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==2)throw Error('invalid_arguments');process.stdout.write(JSON.stringify(await inspectHardening())+'\n')}
 catch{process.stderr.write('BLOCKED services_phase48_metadata_unavailable\n');process.exitCode=1}
}
