import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditRepository, auditServicesSource, PHASE_13, PHASE_14 } from '../scripts/services-migration-source-guard.mjs';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const loadSources = async () => Promise.all([
  read('supabase/migrations/' + PHASE_13),
  read('supabase/migrations/' + PHASE_14),
]);
const pinned = {
  sourceBaselineValid: true, sourceDefects: [], collisionVersionCount: 11,
  collisions: [
    { version:'20261123040000', files:[
      { name:PHASE_13, gitBlobSha:'a'.repeat(40) },
      { name:'20261123040000_automation_github_workflow_tracking.sql',gitBlobSha:'b'.repeat(40)},
      { name:'20261123040000_docker_agent_signed_reports.sql',gitBlobSha:'c'.repeat(40)},
    ] },
    { version:'20261123050000', files:[
      { name:PHASE_14,gitBlobSha:'d'.repeat(40) },
      { name:'20261123050000_automation_template_gallery.sql',gitBlobSha:'e'.repeat(40)},
      { name:'20261123050000_docker_operation_review.sql',gitBlobSha:'f'.repeat(40)},
      { name:'20261123050000_workspace_owner_projects_tasks_items.sql',gitBlobSha:'1'.repeat(40)},
    ] },
  ],
};
const audit = (phase13,phase14,forensics=pinned) =>
  auditServicesSource({phase13,phase14,forensics});

test('Phase 28 actual repo retains pinned Services migrations and reports source-only success',async()=>{
  const report=await auditRepository();
  assert.equal(report.schema,'eternyx-services-migration-source-gate-v1');
  assert.equal(report.sourceSafetyPassed,true,JSON.stringify(report.defects));
  assert.deepEqual(report.defects,[]);
  assert.equal(report.collisionVersionCount,11);
  assert.equal(report.servicePhase13File,PHASE_13);
  assert.equal(report.servicePhase14File,PHASE_14);
  assert.equal(report.verifiedAppliedMigrationHistory,false);
  assert.equal(report.realAccountAcceptancePerformed,false);
  assert.equal(report.stagingDeploymentAuthorized,false);
  assert.equal(report.productionDeploymentAuthorized,false);
  assert.equal(report.remoteSqlConnected,false);
});

test('no missing migration, changed collision hash, or foreign collision can pass',async()=>{
  const [p13,p14]=await loadSources();
  for(const corrupted of [
    {...pinned,sourceBaselineValid:false},
    {...pinned,sourceDefects:[{code:'historical_collision_content_changed'}]},
    {...pinned,collisions:[]},
    {...pinned,collisions:[pinned.collisions[0]]},
    {...pinned,collisions:pinned.collisions.map(g=>({...g,files:[]}))},
  ]) assert.equal(audit(p13,p14,corrupted).sourceSafetyPassed,false);
});

test('Phase 13 lost RLS, limited grants, trigger or admin queue protections cannot pass',async()=>{
  const [p13,p14]=await loadSources();
  const mutations=[
    [ /ENABLE ROW LEVEL SECURITY/, 'DISABLE ROW LEVEL SECURITY', 'phase13_rls_enabled' ],
    [ /GRANT UPDATE \(status\)/, 'GRANT UPDATE', 'phase13_limited_update' ],
    [ /CREATE TRIGGER service_brief_amendment_burst_guard/, 'CREATE TRIGGER removed_burst_guard', 'phase13_rate_guard_trigger' ],
    [ /security_invoker = true/, 'security_invoker = false', 'phase13_owner_queue' ],
    [ /WHERE \(SELECT public\.is_admin\(\)\);/, 'WHERE true;', 'phase13_admin_queue_guard' ],
  ];
  for(const [find,replace,defect] of mutations){
    assert.match(p13,find,'test source anchor missing: '+defect);
    const out=audit(p13.replace(find,replace),p14);
    assert.equal(out.sourceSafetyPassed,false,defect);
    assert.ok(out.defects.includes(defect),JSON.stringify(out.defects));
  }
});

test('Phase 14 journal must preserve participant RLS, all six source families and no admin triage leak',async()=>{
  const [p13,p14]=await loadSources();
  const mutations=[
    [ /security_invoker = true/, 'security_invoker = false', 'phase14_invoker_journal' ],
    [ /FROM public\.service_brief_amendments a/, 'FROM public.missing_amendments a', 'phase14_missing_source_service_brief_amendments' ],
    [ /GRANT SELECT ON public\.service_request_journal TO authenticated;/, 'GRANT SELECT ON public.service_request_journal TO anon;', 'phase14_authenticated_select' ],
  ];
  for(const [find,replace,expected] of mutations){
    assert.match(p14,find);
    const out=audit(p13,p14.replace(find,replace));
    assert.equal(out.sourceSafetyPassed,false);
    assert.ok(out.defects.includes(expected),JSON.stringify(out.defects));
  }
  const exposed=audit(p13,p14+'\nUNION ALL SELECT * FROM public.service_request_triage;\n');
  assert.ok(exposed.defects.includes('phase14_internal_triage_source_forbidden'));
  const publicGrant=audit(p13,p14+'\nGRANT SELECT ON public.service_request_journal TO anon;\n');
  assert.ok(publicGrant.defects.includes('public_or_anon_grant_forbidden'));
});

test('a source-code security rule cannot be satisfied by SQL comments',async()=>{
  const [p13,p14]=await loadSources();
  const code=p14.replace(
    /CREATE OR REPLACE VIEW public\.service_request_journal/,
    'CREATE OR REPLACE VIEW public.fake_journal');
  const out=audit(p13,code+'\n-- CREATE OR REPLACE VIEW public.service_request_journal WITH (security_invoker = true)\n');
  assert.ok(out.defects.includes('phase14_invoker_journal'));
});

test('Phase 28 source gate reads only local files and cannot connect, deploy, or repair migrations',async()=>{
  const src=await read('scripts/services-migration-source-guard.mjs');
  const workflow=await read('.github/workflows/services-migration-source-gate.yml');
  assert.match(src,/generateReport/);
  assert.match(src,/sourceSafetyPassed/);
  assert.match(src,/remoteSqlConnected: false/);
  assert.match(src,/productionDeploymentAuthorized: false/);
  assert.doesNotMatch(src,/createClient\(|execute_sql|apply_migration|pg\.Client|supabase\.db\.push/);
  assert.match(workflow,/permissions:\s*contents: read/);
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/node scripts\/services-migration-source-guard\.mjs/);
  assert.doesNotMatch(workflow, /\bsecrets\./);
});

test('Phase 28 release notes clearly distinguish source pass from actual deployed history',async()=>{
  const doc=await read('docs/ETERNYX_SERVICES_MIGRATION_SOURCE_GATE_PHASE28.md');
  assert.match(doc,/11 historical collision versions/);
  assert.match(doc,/Phase 13 before Phase 14/);
  assert.match(doc,/connection timeout/i);
  assert.match(doc,/real-account staging/i);
  assert.match(doc,/no new migration/i);
  assert.match(doc,/not production-ready/i);
});
