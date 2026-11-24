import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { configuration, ORIGIN, deniedStorage } from './security-wave18-real-auth.mjs';
import { sessionClaims } from './security-wave21-live-fence.mjs';
import { revokedRefresh } from './security-wave19-session-evidence.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const insist=(ok,label)=>{if(!ok)throw Error(label);};
export function config25(env){
 insist(env.ETERNYX_W25_ACK==='I_APPROVE_SYNTHETIC_STAGING_GATEWAY_FIXTURES','wave25-ack');
 insist(['pre-cutover','post-cutover'].includes(env.ETERNYX_W25_PHASE),'wave25-phase');
 return {...configuration(env),phase:env.ETERNYX_W25_PHASE};
}
export function explicitDenial(res,status,code){return res.status===status&&res.data?.code===code;}
export async function gatewayAcceptance(env,fetcher=fetch){
 const {key,accounts,phase}=config25(env),checks=[];
 const mark=(label,ok)=>{insist(ok,label);checks.push(label);};
 const call=async(path,token,{method='GET',body,headers={},raw=false}={})=>{
  const h={...headers,apikey:key,'Cache-Control':'no-store'};
  if(token)h.Authorization='Bearer '+token;
  else if(!key.startsWith('sb_publishable_'))h.Authorization='Bearer '+key;
  if(body!==undefined&&!raw)h['Content-Type']='application/json';
  const res=await fetcher(ORIGIN+path,{method,headers:h,body:body===undefined?undefined:raw?body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});
  const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  return {status:res.status,ok:res.ok,data,text,type:res.headers.get('content-type'),cache:res.headers.get('cache-control')};
 };
 const login=async(account,label)=>{
  const result=await call('/auth/v1/token?grant_type=password',null,{method:'POST',body:account});
  insist(result.ok&&typeof result.data?.access_token==='string'&&typeof result.data?.refresh_token==='string','login-'+label);
  const token=result.data.access_token;
  const user=await call('/auth/v1/user',token);
  mark('verified-'+label,user.ok&&uuid.test(user.data?.id??'')&&user.data.id===result.data.user?.id&&user.data.is_anonymous!==true);
  return {id:user.data.id,token,refresh:result.data.refresh_token,...sessionClaims(token,user.data.id)};
 };
 const a=await login(accounts[0],'A'),b=await login(accounts[1],'B');
 mark('distinct-owners',a.id!==b.id&&a.session!==b.session);
 const gateway=(token,action,id,extra={},body)=>call('/functions/v1/security-evidence-gateway',token,{method:'POST',headers:{'x-evidence-action':action,'x-evidence-id':id,...extra},raw:true,body});
 const make=async(user,label)=>{
  const created=await call('/rest/v1/pentest_engagements?select=id',user.token,{method:'POST',headers:{Prefer:'return=representation'},body:{owner_id:user.id,engagement_name:'Wave25 synthetic '+randomUUID(),status:'draft'}});
  mark('engagement-'+label,created.ok&&Array.isArray(created.data)&&created.data.length===1&&uuid.test(created.data[0].id));
  const engagement=created.data[0].id,filename='wave25-'+randomUUID()+'.txt',bytes='Wave25 synthetic '+randomUUID(),requestId=randomUUID();
  const headers={'Content-Type':'text/plain','x-evidence-name':filename,'x-evidence-request-id':requestId};
  const competing=await Promise.all([
   gateway(user.token,'upload',engagement,headers,bytes),
   gateway(user.token,'upload',engagement,headers,bytes)
  ]);
  mark('gateway-upload-'+label,competing.filter(result=>explicitDenial(result,201,'registered')).length===1);
  mark('concurrent-replay-'+label,competing.filter(result=>explicitDenial(result,409,'request-already-used')).length===1);
  const read=()=>call('/rest/v1/pentest_evidence?select=id,owner_id,engagement_id,storage_path,file_size&engagement_id=eq.'+engagement+'&file_name=eq.'+filename,user.token);
  const record=await read();
  mark('registered-once-'+label,record.ok&&Array.isArray(record.data)&&record.data.length===1&&record.data[0].owner_id===user.id&&record.data[0].engagement_id===engagement&&uuid.test(record.data[0].id)&&record.data[0].file_size===Buffer.byteLength(bytes)&&typeof record.data[0].storage_path==='string'&&record.data[0].storage_path.startsWith(user.id+'/'+engagement+'/')&&/^[a-zA-Z0-9._-]+$/.test(record.data[0].storage_path.split('/')[2]??'')&&record.data[0].storage_path.split('/').length===3);
  mark('replay-rejected-'+label,explicitDenial(await gateway(user.token,'upload',engagement,headers,bytes),409,'request-already-used'));
  const after=await read();
  mark('replay-no-duplicate-'+label,after.ok&&Array.isArray(after.data)&&after.data.length===1&&after.data[0].id===record.data[0].id);
  return {...user,engagement,record:record.data[0],bytes,headers};
 };
 const fa=await make(a,'A'),fb=await make(b,'B');
 const positive=async(f,label)=>{
  const res=await gateway(f.token,'download',f.record.id);
  mark('download-'+label,res.status===200&&res.text===f.bytes&&res.type==='application/octet-stream'&&/no-store/.test(res.cache??''));
 };
 await positive(fa,'A');await positive(fb,'B');
 for(const [own,other,label] of [[fa,fb,'A'],[fb,fa,'B']]){
  mark('foreign-download-'+label,explicitDenial(await gateway(other.token,'download',own.record.id),404,'evidence-unavailable'));
  mark('foreign-upload-'+label,explicitDenial(await gateway(other.token,'upload',own.engagement,{...own.headers,'x-evidence-request-id':randomUUID()},own.bytes),404,'engagement-unavailable'));
  const path='/storage/v1/object/';
  const direct=await call(path+'authenticated/pentest-evidence/'+own.record.storage_path,own.token);
  if(phase==='post-cutover'){
   mark('direct-download-denied-'+label,deniedStorage(direct.status,direct.data));
   const sign=await call(path+'sign/pentest-evidence/'+own.record.storage_path,own.token,{method:'POST',body:{expiresIn:10}});
   mark('direct-sign-denied-'+label,deniedStorage(sign.status,sign.data));
   const upload=await call(path+'pentest-evidence/'+own.id+'/'+own.engagement+'/'+randomUUID()+'-denial.txt',own.token,{method:'POST',raw:true,headers:{'Content-Type':'text/plain'},body:'synthetic denial fixture'});
   mark('direct-upload-denied-'+label,deniedStorage(upload.status,upload.data));
   const listing=await call(path+'list/pentest-evidence',own.token,{method:'POST',body:{prefix:own.id+'/'+own.engagement,limit:100}});
   mark('direct-list-denied-'+label,deniedStorage(listing.status,listing.data)||(listing.ok&&Array.isArray(listing.data)&&listing.data.length===0));
   // Never request deletion of registered evidence: verify an absent synthetic
   // object cannot be reached, and prove the registered bytes remain available.
   const missing=await call(path+'authenticated/pentest-evidence/'+own.id+'/'+own.engagement+'/'+randomUUID()+'-absent.txt',own.token);
   mark('direct-absent-object-denied-'+label,deniedStorage(missing.status,missing.data));
   await positive(own,'after-direct-denials-'+label);
  }else mark('pre-cutover-direct-read-'+label,direct.ok&&direct.text===own.bytes);
 }
 mark('invalid-mime',explicitDenial(await gateway(a.token,'upload',fa.engagement,{...fa.headers,'Content-Type':'text/html','x-evidence-request-id':randomUUID()},'synthetic'),400,'invalid-file-metadata'));
 mark('old-JWT-fresh-before-logout',a.expiry>Date.now()+60000);
 mark('logout-A',(await call('/auth/v1/logout?scope=local',a.token,{method:'POST'})).ok);
 const refresh=await call('/auth/v1/token?grant_type=refresh_token',null,{method:'POST',body:{refresh_token:a.refresh}});
 mark('refresh-revoked-A',revokedRefresh(refresh.status,refresh.data));
 const revoked=await gateway(a.token,'download',fa.record.id);
 mark('revoked-download-denied',explicitDenial(revoked,404,'evidence-unavailable')||explicitDenial(revoked,401,'authentication-required'));
 mark('old-JWT-still-unexpired',a.expiry>Date.now()+5000);
 await positive(fb,'B-after-revocation');
 const renewed=await login(accounts[0],'A-new');
 mark('new-session',renewed.id===a.id&&renewed.session!==a.session);
 await positive({...fa,token:renewed.token},'A-recovered');
 return {schema:'eternyx-wave26-gateway-observation-v2',observedAt:new Date().toISOString(),project:'mhodwvypfbxafamkrgsk',phase,checks,checkCount:checks.length,syntheticFixturesRetained:true,quotaExhaustionTested:false,malwareScanningVerified:false,productionAuthorized:false,independentlyAttested:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv[2]==='--check-config'){config25(process.env);console.log('Configuration accepted; no network.');}
  else if(process.argv[2]==='--run')console.log(JSON.stringify(await gatewayAcceptance(process.env),null,2));
  else throw Error('unsupported-command');
 }catch(e){console.error('Wave25 blocked: '+(/^[a-zA-Z0-9_-]{1,100}$/.test(e?.message??'')?e.message:'transport-or-unexpected-response')+'. Synthetic fixtures may remain.');process.exitCode=1;}
}
