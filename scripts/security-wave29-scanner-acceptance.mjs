import { configuration, ORIGIN } from './security-wave18-real-auth.mjs';
import { pathToFileURL } from 'node:url';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const insist=(condition,label)=>{if(!condition)throw new Error(label);};
export function scannerConfig(env){
 insist(env.ETERNYX_W29_ACK==='I_APPROVE_STAGING_SCANNER_RESEARCH','scanner-ack');
 const hostname=(env.ETERNYX_W29_TLS_HOST??'').trim().toLowerCase();
 if(hostname) {
  insist(env.ETERNYX_W29_TLS_ACK==='I_AUTHORIZE_TLS_ASSESSMENT_OF_THIS_HOST','tls-consent');
  insist(hostname.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)&&!/\.(?:local|internal|test|invalid|localhost|example)$/.test(hostname),'tls-hostname');
 }
 return {...configuration(env),hostname};
}
export function validResult(kind,data){
 if(data?.success!==true||!Array.isArray(data.coverage_limitations)||!data.coverage_limitations.length)return false;
 if(kind==='cve')return UUID.test(data.scan_id??'')&&data.source_url==='https://nvd.nist.gov/'&&Array.isArray(data.candidate_cves)&&data.candidate_cves.length<=20;
 if(kind==='dns')return UUID.test(data.analysis_id??'')&&data.domain==='example.com'&&Number.isSafeInteger(data.dns_records)&&data.dns_records>0;
 if(kind==='tls')return UUID.test(data.analysis_id??'')&&data.source==='Qualys SSL Labs API v3'&&typeof data.overall_grade==='string'&&data.overall_grade!=='N/A'&&data.ssl_result?.endpoints?.some(x=>x.statusMessage==='Ready');
 return false;
}
export async function scannerAcceptance(env,fetcher=fetch){
 const {key,accounts,hostname}=scannerConfig(env);
 const checks=[],pending=[];
 const mark=(label,ok)=>{insist(ok,label);checks.push(label);};
 const call=async(path,token,method='GET',body,raw=false)=>{
  const headers={apikey:key,'Cache-Control':'no-store'};
  if(token)headers.Authorization='Bearer '+token;
  else if(!key.startsWith('sb_publishable_'))headers.Authorization='Bearer '+key;
  if(body!==undefined)headers['Content-Type']='application/json';
  const res=await fetcher(ORIGIN+path,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(90000)});
  const data=await res.json().catch(()=>null);
  return {status:res.status,ok:res.ok,data};
 };
 const login=async(account,label)=>{
  const result=await call('/auth/v1/token?grant_type=password',null,'POST',account);
  insist(result.ok&&typeof result.data?.access_token==='string','login-'+label);
  const token=result.data.access_token;
  const user=await call('/auth/v1/user',token);
  mark('verified-'+label,user.ok&&UUID.test(user.data?.id??'')&&user.data.id===result.data.user?.id&&user.data.is_anonymous!==true);
  return {token,id:user.data.id};
 };
 const a=await login(accounts[0],'A'),b=await login(accounts[1],'B');
 mark('distinct-accounts',a.id!==b.id);
 const specs=[
  {kind:'cve',slug:'vulnerability-scanner',body:{vendor:'OpenSSL',product:'OpenSSL'},invalid:{product:''},table:'vulnerability_scans',id:'scan_id',type:'cve-keyword-research'},
  {kind:'dns',slug:'dns-analyzer',body:{domain:'example.com'},invalid:{domain:'http://invalid'},table:'ai_security_analysis',id:'analysis_id',type:'dns_security'},
  {kind:'tls',slug:'ssl-analyzer',body:{hostname},invalid:{hostname:'127.0.0.1'},table:'ai_security_analysis',id:'analysis_id',type:'ssl_analysis'}
 ];
 for(const s of specs){
  const path='/functions/v1/'+s.slug;
  mark(s.kind+'-anonymous-denied',[401,403].includes((await call(path,null,'POST',s.invalid)).status));
  mark(s.kind+'-invalid-input',(await call(path,a.token,'POST',s.invalid)).status===400);
  mark(s.kind+'-oversized-input',(await call(path,a.token,'POST','"'+('x'.repeat(5000))+'"',true)).status===413);
  if(s.kind==='tls'&&!hostname){pending.push('tls-authorized-host-required');continue;}
  const result=await call(path,a.token,'POST',s.body);
  if(s.kind==='tls'&&result.status===202){pending.push('tls-provider-in-progress');continue;}
  mark(s.kind+'-provider-completed',result.status===200&&validResult(s.kind,result.data)&&(s.kind!=='tls'||result.data.hostname===hostname));
  const id=result.data[s.id],q='/rest/v1/'+s.table+'?select=id,user_id,'+(s.kind==='cve'?'scan_type,status':'analysis_type')+'&id=eq.'+id;
  const own=await call(q,a.token),foreign=await call(q,b.token);
  mark(s.kind+'-owner-history',own.ok&&Array.isArray(own.data)&&own.data.length===1&&own.data[0].id===id&&own.data[0].user_id===a.id&&(s.kind==='cve'?own.data[0].scan_type===s.type&&own.data[0].status==='completed':own.data[0].analysis_type===s.type));
  mark(s.kind+'-foreign-history-denied',foreign.ok&&Array.isArray(foreign.data)&&foreign.data.length===0);
 }
 return {schema:'eternyx-wave29-scanner-observation-v1',project:'mhodwvypfbxafamkrgsk',checks,pending,complete:pending.length===0,productionAuthorized:false,independentlyAttested:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv[2]==='--check-config'){scannerConfig(process.env);console.log('Configuration accepted; no network.');}
  else if(process.argv[2]==='--run'){const result=await scannerAcceptance(process.env);console.log(JSON.stringify(result,null,2));if(!result.complete)process.exitCode=1;}
  else throw Error('unsupported-command');
 }catch(error){console.error('Scanner acceptance blocked: '+(/^[a-zA-Z0-9_-]{1,100}$/.test(error?.message??'')?error.message:'transport-or-unexpected-response'));process.exitCode=1;}
}
