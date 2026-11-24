import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { configuration, acceptance, deniedStorage, ORIGIN } from './security-wave18-real-auth.mjs';

const bucket = 'pentest-evidence';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assert = (ok, label) => { if (!ok) throw new Error(label); };

export function wave19Config(env) {
  assert(env.ETERNYX_W19_ACK === 'I_APPROVE_DISPOSABLE_SESSION_AND_EVIDENCE_TESTS','wave19-ack');
  return configuration(env);
}

export function signedPath(value, objectPath) {
  assert(typeof value==='string' && value.length<=8192,'signed-url-shape');
  const url = new URL(value.startsWith('/object/sign/') ? '/storage/v1'+value : value,ORIGIN);
  assert(url.origin===ORIGIN && !url.username && !url.password && !url.hash &&
    url.pathname==='/storage/v1/object/sign/'+bucket+'/'+objectPath &&
    [...url.searchParams.keys()].length===1 && !!url.searchParams.get('token'),'signed-url-boundary');
  return url.pathname+url.search;
}
export function revokedRefresh(status, body) {
  return status===400 && ['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired'].includes(body?.error_code ?? body?.code);
}

export async function lifecycle(env, fetcher=fetch) {
  const {key, accounts} = wave19Config(env);
  const checks=[];
  const mark=(label,ok)=>{assert(ok,label);checks.push(label);};
  const request=async(path,{token,method='GET',body,raw=false,anonymous=false,upsert=false}={})=>{
    const headers={'Cache-Control':'no-store'};
    if(!anonymous) {
      headers.apikey=key;
      if(token) headers.Authorization='Bearer '+token;
      else if(!key.startsWith('sb_publishable_')) headers.Authorization='Bearer '+key;
    }
    if(body!==undefined) headers['Content-Type']=raw?'text/plain':'application/json';
    if(upsert) headers['x-upsert']='true';
    if(path.startsWith('/rest/v1/')) headers.Prefer='return=representation';
    const resp=await fetcher(ORIGIN+path,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
    const text=await resp.text();
    let data;try{data=JSON.parse(text);}catch{data=text;}
    return {ok:resp.ok,status:resp.status,data};
  };
  const login=async(account,label)=>{
    const res=await request('/auth/v1/token?grant_type=password',{method:'POST',body:account});
    assert(res.ok && typeof res.data?.access_token==='string' && typeof res.data?.refresh_token==='string','login-'+label);
    const user=await request('/auth/v1/user',{token:res.data.access_token});
    mark('verified-user-'+label,user.ok && uuid.test(user.data?.id??'') && user.data.id===res.data.user?.id && user.data.is_anonymous!==true);
    return {id:user.data.id,token:res.data.access_token,refresh:res.data.refresh_token};
  };
  const a=await login(accounts[0],'A'), b=await login(accounts[1],'B');
  mark('distinct-users',a.id!==b.id);
  const insert=async(table,body,label)=>{
    const res=await request('/rest/v1/'+table+'?select=id',{token:a.token,method:'POST',body});
    mark(label,res.ok && Array.isArray(res.data) && res.data.length===1 && uuid.test(res.data[0].id));
    return res.data[0].id;
  };
  const engagement=await insert('pentest_engagements',{owner_id:a.id,engagement_name:'Wave19 synthetic '+randomUUID(),status:'draft'},'synthetic-engagement');
  const path=a.id+'/'+engagement+'/'+randomUUID()+'-wave19.txt';
  const orphan=a.id+'/'+engagement+'/'+randomUUID()+'-orphan.txt';
  const bytes='Wave19 synthetic '+randomUUID();
  const object='/storage/v1/object/'+bucket+'/';
  const download='/storage/v1/object/authenticated/'+bucket+'/';
  const sign='/storage/v1/object/sign/'+bucket+'/';
  const denied=(res)=>deniedStorage(res.status,res.data);
  mark('owner-upload',(await request(object+path,{token:a.token,method:'POST',raw:true,body:bytes})).ok);
  mark('orphan-upload',(await request(object+orphan,{token:a.token,method:'POST',raw:true,body:bytes})).ok);
  await insert('pentest_evidence',{owner_id:a.id,engagement_id:engagement,storage_path:path,file_name:'wave19.txt',mime_type:'text/plain',file_size:Buffer.byteLength(bytes)},'register-evidence');
  mark('registered-owner-read',(await request(download+path,{token:a.token})).data===bytes);
  mark('private-public-endpoint-denied',denied(await request('/storage/v1/object/public/'+bucket+'/'+path,{anonymous:true})));
  mark('cross-owner-signed-url-denied',denied(await request(sign+path,{token:b.token,method:'POST',body:{expiresIn:15}})));
  const ownLink=await request(sign+path,{token:a.token,method:'POST',body:{expiresIn:15}});
  mark('owner-signed-url-issued',ownLink.ok && typeof ownLink.data?.signedURL==='string');
  const link=signedPath(ownLink.data.signedURL,path);
  const signed=await request(link,{anonymous:true});
  mark('signed-bearer-download',signed.ok && signed.data===bytes);
  // A signed capability may be shared with anyone before expiry. Never log it.
  const modified=new URL(link,ORIGIN);modified.searchParams.set('token',modified.searchParams.get('token')+'x');
  mark('tampered-signature-denied',denied(await request(modified.pathname+modified.search,{anonymous:true})) ||
    false);
  const remove=async(p)=>request('/storage/v1/object/'+bucket,{token:a.token,method:'DELETE',body:{prefixes:[p]}});
  const replacement=await request(object+path,{token:a.token,method:'PUT',raw:true,body:'forbidden replacement',upsert:true});
  mark('registered-overwrite-denied',denied(replacement));
  // Bulk delete may return success with an empty array when RLS hides an object.
  const registeredDelete=await remove(path);
  mark('registered-delete-not-permitted',denied(registeredDelete) || (registeredDelete.ok && Array.isArray(registeredDelete.data) && registeredDelete.data.length===0));
  const unchanged=await request(download+path,{token:a.token});
  mark('registered-bytes-unchanged',unchanged.ok && unchanged.data===bytes);
  const orphanDelete=await remove(orphan);
  mark('unregistered-owner-delete',orphanDelete.ok && Array.isArray(orphanDelete.data) && orphanDelete.data.length===1);
  mark('unregistered-object-gone',denied(await request(download+orphan,{token:a.token})));
  const logout=await request('/auth/v1/logout?scope=local',{token:a.token,method:'POST'});
  mark('local-session-logout',logout.ok);
  const refresh=async(session)=>request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh}});
  const invalid=await refresh(a);
  mark('revoked-refresh-token-denied',revokedRefresh(invalid.status,invalid.data));
  const stillValid=await request(download+path,{token:a.token});
  // An unexpired access JWT may remain usable even after session logout.
  const residual=stillValid.ok && stillValid.data===bytes;
  mark('old-access-token-observed',residual || [401,403].includes(stillValid.status));
  const bRefresh=await refresh(b);
  mark('other-account-refresh-unaffected',bRefresh.ok && typeof bRefresh.data?.access_token==='string' && bRefresh.data.user?.id===b.id);
  // Wait longer than the maximum lifetime from issuance; no claim of instantaneous revocation.
  await new Promise(resolve=>setTimeout(resolve,17000));
  const expired=await request(link,{anonymous:true});
  mark('signed-url-expired',denied(expired) || (expired.status===400 && /expired/i.test(String(expired.data?.message??''))));
  return {schema:'eternyx-wave19-lifecycle-observation-v1',project:'mhodwvypfbxafamkrgsk',checks,checkCount:checks.length,oldAccessTokenStillUsable:residual,sessionLogoutTested:true,immediateAccessRevocationGuaranteed:false,syntheticFixturesRetained:true,productionAuthorized:false,independentlyAttested:false};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv[2]==='--check-config'){wave19Config(process.env);console.log('Configuration accepted; no network.');}
    else if(process.argv[2]==='--run'){console.log(JSON.stringify(await lifecycle(process.env),null,2));}
    else if(process.argv[2]==='--run-wave18-and-19'){
      wave19Config(process.env);
      const wave18=await acceptance(process.env);
      const wave19=await lifecycle(process.env);
      console.log(JSON.stringify({wave18,wave19,productionAuthorized:false},null,2));
    } else throw new Error('unsupported-command');
  }catch(e){
    console.error('Wave19 blocked: '+(/^[a-zA-Z0-9_-]{1,100}$/.test(e?.message??'')?e.message:'transport-or-unexpected-response')+'. Synthetic fixtures may remain.');
    process.exitCode=1;
  }
}
