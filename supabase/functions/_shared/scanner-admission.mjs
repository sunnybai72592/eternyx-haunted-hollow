// Call only after Auth getUser(token) verifies the caller's JWT.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function verifiedSessionClaims(authorization,user,now=Date.now()){
 try{
  if(!user||user.is_anonymous===true||!UUID.test(user.id??'')||typeof authorization!=='string'||authorization.length>8192||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))return null;
  const payload=authorization.slice(7).split('.')[1].replaceAll('-','+').replaceAll('_','/');
  const claims=JSON.parse(atob(payload));
  if(claims.sub!==user.id||claims.role!=='authenticated'||claims.is_anonymous===true||!UUID.test(claims.session_id??'')||!Number.isSafeInteger(claims.exp)||claims.exp*1000<=now)return null;
  return {p_owner:user.id,p_session:claims.session_id};
 }catch{return null;}
}
export async function admitScanner({authorization,user,url,serviceKey,publicKey,fetcher=fetch}){
 const claims=verifiedSessionClaims(authorization,user);
 if(!claims)return {status:401,error:'Invalid or expired session'};
 if(!url||!serviceKey||!publicKey||serviceKey===publicKey)return {status:503,error:'Scanner admission unavailable'};
 try{
  const origin=new URL(url);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)return {status:503,error:'Scanner admission unavailable'};
  const response=await fetcher(origin.origin+'/rest/v1/rpc/security_scanner_admit',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
   headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json','Cache-Control':'no-store'},
   body:JSON.stringify(claims)
  });
  if(response.ok){
   const result=await response.json();
   if(result==='admitted')return {status:200};
   if(result==='quota')return {status:429,error:'Scanner usage limit reached. Try again later.'};
   if(result==='revoked')return {status:401,error:'Invalid or expired session'};
  }
 }catch{/* Never expose backend details or credentials. */}
 return {status:503,error:'Scanner admission unavailable'};
}
