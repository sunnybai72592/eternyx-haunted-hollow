import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const ORIGIN = 'https://mhodwvypfbxafamkrgsk.supabase.co';
const REF = 'mhodwvypfbxafamkrgsk';
const PROD = 'wcncuarekaofmfurbtbh';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tables = ['pentest_engagements','pentest_evidence','pentest_audit_events','security_case_assets','security_case_findings','security_case_finding_evidence','security_case_finding_history'];
const requireThat = (condition, label) => { if (!condition) throw new Error(label); };

export function configuration(env) {
  requireThat(env.ETERNYX_STAGING_URL === ORIGIN && env.ETERNYX_STAGING_PROJECT_REF === REF &&
    env.ETERNYX_PRODUCTION_PROJECT_REF === PROD && env.ETERNYX_STAGING_ONLY === 'yes' &&
    env.ETERNYX_W18_ACK === 'I_APPROVE_PERSISTENT_SYNTHETIC_STAGING_FIXTURES', 'staging-configuration');
  const key = env.ETERNYX_STAGING_PUBLIC_KEY ?? '';
  let legacy = false;
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    legacy = key.split('.').length === 3 && claims.role === 'anon' && claims.ref === REF;
  } catch {}
  requireThat(/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key) || legacy, 'public-key-only');
  const accounts = ['A','B'].map(s => ({email: env['ETERNYX_W18_EMAIL_'+s] ?? '', password: env['ETERNYX_W18_PASSWORD_'+s] ?? ''}));
  requireThat(accounts.every(a => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email) && a.password.length >= 12) &&
    accounts[0].email.toLowerCase() !== accounts[1].email.toLowerCase(), 'distinct-disposable-credentials');
  return {key, accounts};
}

export function deniedDatabase(status, body) {
  return status === 403 && body?.code === '42501';
}

export function deniedStorage(status, body) {
  // Storage has historically returned HTTP 400 with a structured 404/403 code.
  const code = String(body?.statusCode ?? '');
  return [403,404].includes(status) || (status === 400 && ['403','404'].includes(code));
}

export async function acceptance(env, fetcher = fetch) {
  const {key,accounts} = configuration(env);
  const checks = [];
  const stamp = randomUUID();
  const startedAt = new Date().toISOString();
  const mark = (label, condition) => { requireThat(condition,label); checks.push(label); };
  const request = async (path, token, method = 'GET', body, raw = false) => {
    const headers = {apikey:key, 'Cache-Control':'no-store'};
    if (token) headers.Authorization = 'Bearer '+token;
    else if (!key.startsWith('sb_publishable_')) headers.Authorization = 'Bearer '+key;
    if (body !== undefined) headers['Content-Type'] = raw ? 'text/plain' : 'application/json';
    if (path.startsWith('/rest/v1/') && method !== 'GET') headers.Prefer = 'return=representation';
    const response = await fetcher(ORIGIN+path,{method,headers,body: body === undefined ? undefined : raw ? body : JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
    const str = await response.text();
    let data;
    try { data = JSON.parse(str); } catch { data = str; }
    return {status:response.status,ok:response.ok,data};
  };
  const auth = async (credentials, label) => {
    const login = await request('/auth/v1/token?grant_type=password',null,'POST',credentials);
    const token = login.data?.access_token;
    requireThat(login.ok && typeof token === 'string','password-login-'+label);
    const user = await request('/auth/v1/user',token);
    mark('auth-user-'+label,user.ok && UUID.test(user.data?.id ?? '') &&
      user.data?.id === login.data?.user?.id && user.data?.is_anonymous !== true);
    return {token,id:user.data.id};
  };
  const [a,b] = await Promise.all([auth(accounts[0],'A'),auth(accounts[1],'B')]);
  mark('distinct-auth-identities',a.id !== b.id);
  const rest = (table, token, query='', method='GET', body) => request('/rest/v1/'+table+'?'+query,token,method,body);
  const one = async (table,token,body,label,query='select=id',method='POST') => {
    const response = await rest(table,token,query,method,body);
    mark(label,response.ok && Array.isArray(response.data) && response.data.length === 1 && UUID.test(response.data[0].id));
    return response.data[0].id;
  };
  const storage = (path,token,method='GET',body) => request('/storage/v1/object/'+(method==='GET'?'authenticated/':'')+'pentest-evidence/'+path,token,method,body,body !== undefined);
  const fixture = async (user,label) => {
    const target = 'wave18-'+label.toLowerCase()+'.invalid';
    const engagement = await one('pentest_engagements',user.token,{owner_id:user.id,engagement_name:'Wave18 synthetic '+stamp+' '+label,scope_targets:[target],status:'authorized',authorization_attested:true,authorization_attested_at:new Date().toISOString()},'engagement-'+label);
    const base = {owner_id:user.id,engagement_id:engagement};
    const asset = await one('security_case_assets',user.token,{...base,target},'asset-'+label);
    const finding = await one('security_case_findings',user.token,{...base,asset_id:asset,title:'Synthetic regression fixture'},'finding-'+label);
    const path = user.id+'/'+engagement+'/'+randomUUID()+'-wave18.txt';
    const bytes = 'Wave18 synthetic '+stamp+' '+label;
    mark('storage-upload-'+label,(await storage(path,user.token,'POST',bytes)).ok);
    const evidence = await one('pentest_evidence',user.token,{...base,storage_path:path,file_name:'wave18.txt',mime_type:'text/plain',file_size:Buffer.byteLength(bytes)},'evidence-'+label);
    await one('security_case_finding_evidence',user.token,{...base,finding_id:finding,evidence_id:evidence},'evidence-link-'+label);
    return {...user,engagement,asset,finding,path,bytes,target};
  };
  const fa = await fixture(a,'A'), fb = await fixture(b,'B');
  const verifyIsolation = async (phase) => {
    for (const [own,other,label] of [[fa,fb,'A'],[fb,fa,'B']]) {
      for (const table of tables) {
        const field = table === 'pentest_engagements' ? 'id' : 'engagement_id';
        const query = 'select=id&'+field+'=eq.'+own.engagement;
        const positive = await rest(table,own.token,query);
        mark(phase+'-owner-'+label+'-'+table,positive.ok && Array.isArray(positive.data) && positive.data.length > 0);
        const cross = await rest(table,other.token,query);
        mark(phase+'-cross-'+label+'-'+table,cross.ok && Array.isArray(cross.data) && cross.data.length === 0);
        const anonymous = await rest(table,null,query);
        mark(phase+'-anon-'+label+'-'+table,(anonymous.ok && Array.isArray(anonymous.data) && anonymous.data.length===0) ||
          ([401,403].includes(anonymous.status) && anonymous.data?.code==='42501'));
      }
      const content = await storage(own.path,own.token);
      mark(phase+'-storage-owner-'+label,content.ok && content.data === own.bytes);
      const cross = await storage(own.path,other.token);
      mark(phase+'-storage-cross-'+label,deniedStorage(cross.status,cross.data));
      const anonymous = await storage(own.path,null);
      mark(phase+'-storage-anon-'+label,deniedStorage(anonymous.status,anonymous.data) || anonymous.status===401);
    }
  };
  await verifyIsolation('baseline');
  const patch = (table,actor,id,data) => rest(table,actor.token,'select=id&id=eq.'+id,'PATCH',data);
  const cross = await patch('security_case_assets',fb,fa.asset,{notes:'Cross-owner forbidden'});
  mark('cross-owner-update-no-rows',cross.ok && Array.isArray(cross.data) && cross.data.length===0);
  const foreign = await rest('security_case_assets',fb.token,'select=id','POST',{owner_id:fa.id,engagement_id:fa.engagement,target:fa.target});
  mark('cross-owner-insert-denied',deniedDatabase(foreign.status,foreign.data));
  await one('security_case_assets',fa.token,{notes:'Authorized baseline'},'authorized-baseline-write','select=id&id=eq.'+fa.asset,'PATCH');
  await one('pentest_engagements',fa.token,{status:'draft',authorization_attested:false},'revoke-A','select=id&id=eq.'+fa.engagement,'PATCH');
  for (const [table,id,body] of [['security_case_assets',fa.asset,{notes:'Forbidden after revocation'}],['security_case_findings',fa.finding,{title:'Forbidden after revocation'}]]) {
    const denied = await patch(table,fa,id,body);
    mark('revoked-update-'+table,deniedDatabase(denied.status,denied.data));
  }
  const insert = await rest('security_case_assets',fa.token,'select=id','POST',{owner_id:fa.id,engagement_id:fa.engagement,target:fa.target});
  mark('revoked-insert-asset',deniedDatabase(insert.status,insert.data));
  await one('security_case_assets',fb.token,{notes:'B remains authorized'},'B-write-after-A-revocation','select=id&id=eq.'+fb.asset,'PATCH');
  const audit = await rest('pentest_audit_events',fa.token,'select=actor_id,details,created_at&engagement_id=eq.'+fa.engagement+'&event_type=eq.engagement_updated');
  mark('revocation-audit',audit.ok && Array.isArray(audit.data) && audit.data.some(x=>x.actor_id===fa.id && x.details?.changed_fields?.includes('authorization_attested') && x.created_at && Date.parse(x.created_at)>=Date.parse(startedAt)-5000));
  await verifyIsolation('revoked');
  return {schema:'eternyx-wave18-staging-observation-v1',project:REF,startedAt,completedAt:new Date().toISOString(),checks:checks.sort(),checkCount:checks.length,syntheticFixturesRetained:true,productionAuthorized:false,sessionRevocationTested:false,independentlyAttested:false};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--check-config') {
    try { configuration(process.env); console.log('Configuration accepted; no HTTP calls.'); }
    catch { console.error('Wave 18 blocked: staging configuration or disposable credentials missing.'); process.exitCode=1; }
  } else if (process.argv[2] === '--run') {
    try { console.log(JSON.stringify(await acceptance(process.env),null,2)); }
    catch (error) {
      // Never emit remote bodies, tokens, URLs, credentials or stack traces.
      const label = typeof error?.message==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(error.message) ? error.message : 'transport-or-unexpected-response';
      console.error('Wave 18 blocked: '+label+'. Synthetic staging fixtures may remain.'); process.exitCode=1;
    }
  } else { console.error('Use --check-config or --run; live run retains synthetic fixtures.'); process.exitCode=1; }
}
