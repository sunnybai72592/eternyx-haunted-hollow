#!/usr/bin/env node
/** Phase 38: catalog-only privileged routine exposure checks. No SQL execution,
 * network, caller-provided SQL, routine invocation or pg_proc.prosrc reads.
 */
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const EXPOSED_ROUTINE_CHECKS=Object.freeze([
 'volatile_security_definer_execute_denied',
 'private_helper_schema_usage_denied',
 'security_definer_procedures_execute_denied',
]);

export const EXPOSED_ROUTINE_SQL=[
'SELECT',
'  NOT EXISTS (',
'    SELECT 1 FROM pg_catalog.pg_proc p',
'    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace',
"    WHERE n.nspname IN ('public','eternyx_private')",
"      AND p.prosecdef AND p.provolatile='v'",
"      AND p.prorettype NOT IN ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)",
"      AND pg_catalog.has_schema_privilege(current_user,n.oid,'USAGE')",
"      AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')",
'  ) AS volatile_security_definer_execute_denied,',
'  NOT COALESCE(pg_catalog.has_schema_privilege(',
"    current_user, pg_catalog.to_regnamespace('eternyx_private'), 'USAGE'",
'  ), false) AS private_helper_schema_usage_denied,',
'  NOT EXISTS (',
'    SELECT 1 FROM pg_catalog.pg_proc p',
'    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace',
"    WHERE n.nspname IN ('public','eternyx_private')",
"      AND p.prosecdef AND p.prokind='p'",
"      AND pg_catalog.has_schema_privilege(current_user,n.oid,'USAGE')",
"      AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')",
'  ) AS security_definer_procedures_execute_denied',
].join('\n');

const fail=(code)=>{throw Error('services_phase38_'+code)};
export function exposedRoutineSql(){
 if(!EXPOSED_ROUTINE_SQL.startsWith('SELECT\n')||
    EXPOSED_ROUTINE_SQL.includes(';')||
    EXPOSED_ROUTINE_CHECKS.some(k=>!EXPOSED_ROUTINE_SQL.includes(k)))
    fail('catalog_source_invalid');
 return EXPOSED_ROUTINE_SQL;
}

export function verifyRoutineExposure(row){
 if(!row||typeof row!=='object'||Array.isArray(row))fail('routine_evidence_missing');
 const a=Object.keys(row).sort(),b=[...EXPOSED_ROUTINE_CHECKS].sort();
 if(a.length!==b.length||a.some((key,i)=>key!==b[i]))
   fail('routine_evidence_incomplete');
 for(const key of EXPOSED_ROUTINE_CHECKS)
   if(row[key]!==true)fail('routine_exposure_blocked');
 return {
   privilegedRoutineCatalogSafe:true,
   checksPassed:b.length,
   callableCodeInspected:false,
   securityDefinerSideEffectsProvenSafe:false,
   remoteWritePerformed:false,
 };
}
const invoked=process.argv[1]&&
 path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 if(process.argv.length===3&&process.argv[2]==='--sql')
   process.stdout.write(exposedRoutineSql()+';\n');
 else{
   process.stderr.write('BLOCKED: invalid routine catalog request\n');
   process.exitCode=2;
 }
}
