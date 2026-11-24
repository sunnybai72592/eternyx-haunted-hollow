import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { configuration, deniedStorage, deniedDatabase, ORIGIN } from './security-wave18-real-auth.mjs';
import { revokedRefresh } from './security-wave19-session-evidence.mjs';

const tables=['pentest_engagements','pentest_evidence','pentest_audit_events','security_case_assets','security_case_findings','security_case_finding_evidence','security_case_finding_history'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const insist=(ok,label)=>{if(!ok)throw Error(label);};
export function config21(env){
 insist(env.ETERNYX_W21_ACK==='I_APPROVE_STAGING_LIVE_SESSION_FENCE_TEST','wave21-ack');
 return configuration(env);
}
export function sessionClaims(token,owner,now=Date.now()){
 try{
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  insist(token.split('.').length===3 && claims.sub===owner && uuid.test(claims.session_id??'') &&
    claims.role==='authenticated' && claims.is_anonymous!==true && Number.isSafeInteger(claims.exp) &&
    claims.exp*1000>now+30000,'fresh-session-claims');
  return {session:claims.session_id,expiry:claims.exp*1000};
 }catch{throw Error('fresh-session-claims');}
}
export function rowDenied(response){
 return (response.ok && Array.isArray(response.data) && response.data.length===0) ||
   deniedDatabase(response.status,response.data);
}
export async function runFence(env,fetcher=fetch){
 const {key,accounts}=config21(env);
 const checks=[];
 const mark=(label,ok)=>{insist(ok,label);checks.push(label);};
 const request=async(path,token,method='GET',body,raw=false)=>{
  const headers={apikey:key,'Cache-Control':'no-store'};
  if(token)headers.Authorization='Bearer '+token;
  else if(!key.startsWith('sb_publishable_'))headers.Authorization='Bearer '+key;
  if(body!==undefined)headers['Content-Type']=raw?'text/plain':'application/json';
  if(path.startsWith('/rest/v1/')&&method!=='GET')headers.Prefer='return=representation';
  const res=await fetcher(ORIGIN+path,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
  const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  return {status:res.status,ok:res.ok,data};
 };
 const login=async(account,label)=>{
  const result=await request('/auth/v1/token?grant_type=password',null,'POST',account);
  insist(result.ok&&typeof result.data?.access_token==='string'&&typeof result.data?.refresh_token==='string','login-'+label);
  const token=result.data.access_token;
  const user=await request('/auth/v1/user',token);
  mark('verified-user-'+label,user.ok&&uuid.test(user.data?.id??'')&&user.data.id===result.data.user?.id&&user.data.is_anonymous!==true);
  return {id:user.data.id,token,refresh:result.data.refresh_token,...sessionClaims(token,user.data.id)};
 };
 const a=await login(accounts[0],'A'),b=await login(accounts[1],'B');
 mark('distinct-users-and-sessions',a.id!==b.id&&a.session!==b.session);
 const rest=(table,token,query='',method='GET',body)=>request('/rest/v1/'+table+'?'+query,token,method,body);
 const one=async(table,token,body,label,method='POST',query='select=id')=>{
  const res=await rest(table,token,query,method,body);
  mark(label,res.ok&&Array.isArray(res.data)&&res.data.length===1&&uuid.test(res.data[0].id));
  return res.data[0].id;
 };
 const storage='/storage/v1/object/';
 const make=async(user,label)=>{
  const target='wave21-'+label.toLowerCase()+'.invalid';
  const engagement=await one('pentest_engagements',user.token,{owner_id:user.id,engagement_name:'Wave21 synthetic '+randomUUID(),scope_targets:[target],status:'authorized',authorization_attested:true,authorization_attested_at:new Date().toISOString()},'engagement-'+label);
  const base={owner_id:user.id,engagement_id:engagement};
  const asset=await one('security_case_assets',user.token,{...base,target},'asset-'+label);
  const finding=await one('security_case_findings',user.token,{...base,asset_id:asset,title:'Synthetic session acceptance'},'finding-'+label);
  const path=user.id+'/'+engagement+'/'+randomUUID()+'-wave21.txt';
  const bytes='Wave21 synthetic '+randomUUID();
  mark('upload-'+label,(await request(storage+'pentest-evidence/'+path,user.token,'POST',bytes,true)).ok);
  const evidence=await one('pentest_evidence',user.token,{...base,storage_path:path,file_name:'wave21.txt',mime_type:'text/plain',file_size:Buffer.byteLength(bytes)},'evidence-'+label);
  await one('security_case_finding_evidence',user.token,{...base,finding_id:finding,evidence_id:evidence},'link-'+label);
  return {...user,engagement,asset,finding,evidence,path,bytes,target};
 };
 const fa=await make(a,'A'),fb=await make(b,'B');
 const filter=(table,f)=>'select=id&'+(table==='pentest_engagements'?'id':'engagement_id')+'=eq.'+f.engagement;
 const observe=async(f,other,phase)=>{
  for(const table of tables){
   const own=await rest(table,f.token,filter(table,f));
   mark(phase+'-own-'+table,own.ok&&Array.isArray(own.data)&&own.data.length>0);
   mark(phase+'-cross-'+table,rowDenied(await rest(table,other.token,filter(table,f))));
  }
  const own=await request(storage+'authenticated/pentest-evidence/'+f.path,f.token);
  mark(phase+'-private-bytes',own.ok&&own.data===f.bytes);
 };
 await observe(fa,fb,'before-A');
 await observe(fb,fa,'before-B');
 mark('A-access-token-still-unexpired-before-logout',a.expiry>Date.now()+60000);
 mark('local-logout-A',(await request('/auth/v1/logout?scope=local',a.token,'POST')).ok);
 const refresh=await request('/auth/v1/token?grant_type=refresh_token',null,'POST',{refresh_token:a.refresh});
 mark('refresh-revoked',revokedRefresh(refresh.status,refresh.data));
 for(const table of tables){
  mark('old-JWT-read-denied-'+table,rowDenied(await rest(table,a.token,filter(table,fa))));
 }
 mark('old-JWT-insert-denied',deniedDatabase(...((x)=>[x.status,x.data])(await rest('security_case_assets',a.token,'select=id','POST',{owner_id:a.id,engagement_id:fa.engagement,target:fa.target}))));
 mark('old-JWT-update-denied',rowDenied(await rest('security_case_assets',a.token,'select=id&id=eq.'+fa.asset,'PATCH',{notes:'forbidden'})));
 const old=await request(storage+'authenticated/pentest-evidence/'+fa.path,a.token);
 mark('old-JWT-storage-denied',deniedStorage(old.status,old.data));
 const sign=await request(storage+'sign/pentest-evidence/'+fa.path,a.token,'POST',{expiresIn:10});
 mark('old-JWT-signing-denied',deniedStorage(sign.status,sign.data));
 mark('old-JWT-remained-unexpired-through-denial',a.expiry>Date.now()+5000);
 await observe(fb,fa,'after-B');
 await one('security_case_assets',b.token,{notes:'B remains authorized'},'B-write-continuity','PATCH','select=id&id=eq.'+fb.asset);
 const fresh=await login(accounts[0],'A-new');
 mark('new-A-session-distinct',fresh.id===a.id&&fresh.session!==a.session);
 await observe({...fa,...fresh},fb,'fresh-A');
 return {schema:'eternyx-wave21-live-fence-v1',project:'mhodwvypfbxafamkrgsk',checks,checkCount:checks.length,oldUnexpiredJwtDenied:true,previouslyIssuedSignedUrlsRevoked:false,syntheticFixturesRetained:true,productionAuthorized:false,independentlyAttested:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv[2]==='--check-config'){config21(process.env);console.log('Configuration accepted; no network.');}
  else if(process.argv[2]==='--run')console.log(JSON.stringify(await runFence(process.env),null,2));
  else throw Error('unsupported-command');
 }catch(e){console.error('Wave21 blocked: '+(/^[a-zA-Z0-9_-]{1,100}$/.test(e?.message??'')?e.message:'transport-or-unexpected-response')+'. Synthetic fixtures may remain.');process.exitCode=1;}
}
