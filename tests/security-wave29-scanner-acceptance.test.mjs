import test from 'node:test';
import assert from 'node:assert/strict';
import {scannerConfig,validResult,scannerAcceptance} from '../scripts/security-wave29-scanner-acceptance.mjs';
const env={ETERNYX_W29_ACK:'I_APPROVE_STAGING_SCANNER_RESEARCH',ETERNYX_W18_ACK:'I_APPROVE_PERSISTENT_SYNTHETIC_STAGING_FIXTURES',ETERNYX_STAGING_ONLY:'yes',ETERNYX_STAGING_URL:'https://mhodwvypfbxafamkrgsk.supabase.co',ETERNYX_STAGING_PROJECT_REF:'mhodwvypfbxafamkrgsk',ETERNYX_PRODUCTION_PROJECT_REF:'wcncuarekaofmfurbtbh',ETERNYX_STAGING_PUBLIC_KEY:'sb_publishable_'+'x'.repeat(24),ETERNYX_W18_EMAIL_A:'a@example.invalid',ETERNYX_W18_EMAIL_B:'b@example.invalid',ETERNYX_W18_PASSWORD_A:'a'.repeat(15),ETERNYX_W18_PASSWORD_B:'b'.repeat(15)};
test('staging-only opt-in required, no network on invalid configuration',async()=>{
 for(const delta of [{ETERNYX_W29_ACK:''},{ETERNYX_STAGING_URL:'https://wcncuarekaofmfurbtbh.supabase.co'},{ETERNYX_W29_TLS_HOST:'example.com'},{ETERNYX_W29_TLS_HOST:'127.0.0.1',ETERNYX_W29_TLS_ACK:'I_AUTHORIZE_TLS_ASSESSMENT_OF_THIS_HOST'}]){
  let count=0;await assert.rejects(scannerAcceptance({...env,...delta},async()=>{count++;throw Error('unexpected');}));assert.equal(count,0);
 }
 assert.equal(scannerConfig(env).hostname,'');
});
test('completed provider results require provenance, identifier and coverage',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const base={success:true,coverage_limitations:['limited']};
 assert.equal(validResult('cve',{...base,scan_id:id,source_url:'https://nvd.nist.gov/',candidate_cves:[]}),true);
 assert.equal(validResult('cve',{...base,scan_id:id,candidate_cves:[]}),false);
 assert.equal(validResult('dns',{...base,analysis_id:id,domain:'example.com',dns_records:0}),false);
 assert.equal(validResult('tls',{...base,analysis_id:id,source:'Qualys SSL Labs API v3',overall_grade:'A',ssl_result:{endpoints:[]}}),false);
 assert.equal(validResult('tls',{...base,analysis_id:id,source:'Qualys SSL Labs API v3',overall_grade:'A',ssl_result:{endpoints:[{statusMessage:'Ready'}]}}),true);
});
test('failed login prevents provider traffic',async()=>{
 let count=0;await assert.rejects(scannerAcceptance(env,async()=>{count++;return new Response('{}',{status:401});}),/login-A/);assert.equal(count,1);
});
