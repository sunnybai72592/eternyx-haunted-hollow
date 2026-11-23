#!/usr/bin/env node
/**
 * Phase 39: catalog-only SECURITY DEFINER safety. Never invoke functions,
 * read application data, generate caller SQL, or modify a database.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PHASE39_FACTS=Object.freeze([
 'auditor_nonvolatile_definer_execute_denied',
 'client_definer_unsafe_search_path_denied',
 'definer_trigger_unsafe_search_path_denied',
]);

// An empty fixed search_path requires schema-qualified references. The
// pg_proc proconfig array stores SET search_path='' as search_path="" or
// search_path=, depending on textual representation.
const safeSearchPath=[
 'EXISTS (',
 ' SELECT 1 FROM unnest(p.proconfig) AS cfg(setting)',
 " WHERE cfg.setting IN ('search_path=', 'search_path=\"\"')",
 ')',
].join('\n');
const projectSchema="n.nspname IN ('public','eternyx_private')";
const isCallable=[
 "p.prokind='f'",
 "p.prorettype NOT IN ('pg_catalog.trigger'::regtype,'pg_catalog.event_trigger'::regtype)",
].join(' AND ');

export const PHASE39_SQL=[
 'SELECT',
 '  NOT EXISTS (',
 '    SELECT 1 FROM pg_catalog.pg_proc p',
 '    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace',
 "    WHERE "+projectSchema+" AND p.prosecdef AND p.provolatile IN ('s','i')",
 '      AND '+isCallable,
 "      AND pg_catalog.has_schema_privilege(current_user,n.oid,'USAGE')",
 "      AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')",
 '  ) AS auditor_nonvolatile_definer_execute_denied,',
 '  NOT EXISTS (',
 '    SELECT 1 FROM pg_catalog.pg_proc p',
 '    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace',
 '    WHERE '+projectSchema+' AND p.prosecdef AND '+isCallable,
 '      AND (',
 "        (pg_catalog.has_schema_privilege('anon',n.oid,'USAGE')",
 "          AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'))",
 '        OR',
 "        (pg_catalog.has_schema_privilege('authenticated',n.oid,'USAGE')",
 "          AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'))",
 '      ) AND NOT '+safeSearchPath,
 '  ) AS client_definer_unsafe_search_path_denied,',
 '  NOT EXISTS (',
 '    SELECT 1 FROM pg_catalog.pg_proc p',
 '    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace',
 '    WHERE '+projectSchema+' AND p.prosecdef',
 "      AND p.prorettype='pg_catalog.trigger'::regtype",
 '      AND NOT '+safeSearchPath,
 '  ) AS definer_trigger_unsafe_search_path_denied',
].join('\n');

const fail=(code)=>{throw Error('services_phase39_'+code)};
export function phase39Sql(){
 if(!PHASE39_SQL.startsWith('SELECT\n')||PHASE39_SQL.includes(';')||
    PHASE39_FACTS.some(x=>!PHASE39_SQL.includes(x)))
    fail('sql_guard_invalid');
 return PHASE39_SQL;
}
export function validatePhase39Facts(data){
 if(!data||typeof data!=='object'||Array.isArray(data))
   fail('evidence_missing');
 const actual=Object.keys(data).sort(),expected=[...PHASE39_FACTS].sort();
 if(actual.length!==expected.length||
    actual.some((k,i)=>k!==expected[i]))fail('evidence_incomplete');
 for(const key of PHASE39_FACTS)
   if(data[key]!==true)fail('definer_risk_detected');
 return {passed:true,catalogFacts:PHASE39_FACTS.length,
  functionBodiesReviewed:false,fullAuditOfAllSchemas:false,
  noRemoteMutation:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===3&&process.argv[2]==='--sql')
   process.stdout.write(phase39Sql()+';\n');
 else{
   process.stderr.write('BLOCKED: Phase39 fixed SQL source invocation\n');
   process.exitCode=2;
 }
}
