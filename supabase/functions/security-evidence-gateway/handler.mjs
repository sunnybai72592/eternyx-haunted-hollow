// Web-standard handler; dependency injection permits offline security tests.
export const MAX_BYTES=20*1024*1024;
const BUCKET='pentest-evidence';
const MIME=new Set(['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/json']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-evidence-action,x-evidence-id,x-evidence-name,x-evidence-description','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(status,code)=>new Response(JSON.stringify({code}),{status,headers:{...headers,'Content-Type':'application/json'}});
const safePath=(path,owner,engagement)=>typeof path==='string'&&path.startsWith(owner+'/'+engagement+'/')&&/^[A-Za-z0-9._-]{1,240}$/.test(path.split('/')[2]??'')&&path.split('/').length===3&&!['.','..'].includes(path.split('/')[2]);
async function boundedBytes(req,limit){
 const reader=req.body?.getReader();
 if(!reader)return null;
 const chunks=[];let total=0;
 try{
  while(true){
   const {value,done}=await reader.read();if(done)break;
   total+=value.byteLength;
   if(total>limit){await reader.cancel();return null;}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 if(!total)return null;
 const bytes=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return bytes;
}
const decode=(value,limit)=>{
 if(typeof value!=='string'||value.length>limit*12)return null;
 try{const text=decodeURIComponent(value);return text.length<=limit&&!/[\u0000-\u001f\u007f]/.test(text)?text:null;}catch{return null;}
};
export function createEvidenceHandler({url,publicKey,serviceKey,enabled=false,fetcher=fetch,randomId=()=>crypto.randomUUID()}){
 return async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json(405,'method-not-allowed');
  if(!enabled||!url||!publicKey||!serviceKey||publicKey===serviceKey)return json(503,'gateway-disabled');
  const bearer=req.headers.get('Authorization')??'';
  if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer)||bearer.length>8192)return json(401,'authentication-required');
  const action=req.headers.get('x-evidence-action'),id=req.headers.get('x-evidence-id')??'';
  if(!['upload','download'].includes(action)||!UUID.test(id))return json(400,'invalid-request');
  const call=(path,privileged=false,options={})=>fetcher(url+path,{...options,redirect:'error',signal:AbortSignal.timeout(25000),headers:{...(options.headers??{}),apikey:privileged?serviceKey:publicKey,Authorization:privileged?'Bearer '+serviceKey:bearer,'Cache-Control':'no-store'}});
  const readOne=async(path)=>{
   const response=await call('/rest/v1/'+path);
   if(!response.ok)return null;
   const rows=await response.json();
   return Array.isArray(rows)&&rows.length===1?rows[0]:null;
  };
  try{
   const userResponse=await call('/auth/v1/user');
   if(!userResponse.ok)return json(401,'authentication-required');
   const user=await userResponse.json();
   if(!UUID.test(user.id??'')||user.is_anonymous===true)return json(401,'authentication-required');
   const owner=user.id;
   // User-token queries, never privileged metadata queries. Wave 20's RLS
   // session fence is required before enabling this service.
   if(action==='download'){
    const query='pentest_evidence?select=id,owner_id,engagement_id,storage_path,file_size&id=eq.'+id+'&owner_id=eq.'+owner;
    const row=await readOne(query);
    if(!row||row.id!==id||row.owner_id!==owner||!UUID.test(row.engagement_id??'')||!safePath(row.storage_path,owner,row.engagement_id)||!Number.isSafeInteger(row.file_size)||row.file_size<1||row.file_size>MAX_BYTES)return json(404,'evidence-unavailable');
    const object=await call('/storage/v1/object/authenticated/'+BUCKET+'/'+row.storage_path,true);
    if(!object.ok)return json(404,'evidence-unavailable');
    const bytes=await boundedBytes(object,row.file_size);
    if(!bytes||bytes.byteLength!==row.file_size)return json(409,'evidence-integrity-mismatch');
    // Recheck authorization immediately before releasing any bytes.
    const latest=await readOne(query);
    if(!latest||latest.owner_id!==owner||latest.id!==id||latest.engagement_id!==row.engagement_id||latest.storage_path!==row.storage_path||latest.file_size!==row.file_size)return json(404,'evidence-unavailable');
    return new Response(bytes,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':'attachment','Content-Security-Policy':"default-src 'none'; sandbox"}});
   }
   const mime=req.headers.get('Content-Type')??'';
   const filename=decode(req.headers.get('x-evidence-name'),255);
   const description=decode(req.headers.get('x-evidence-description')??'',500);
   if(!MIME.has(mime)||!filename||description===null)return json(400,'invalid-file-metadata');
   const length=req.headers.get('Content-Length');
   if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))return json(413,'file-too-large');
   const engagementQuery='pentest_engagements?select=id,owner_id&id=eq.'+id+'&owner_id=eq.'+owner;
   const engagement=await readOne(engagementQuery);
   if(!engagement||engagement.id!==id||engagement.owner_id!==owner)return json(404,'engagement-unavailable');
   const bytes=await boundedBytes(req,MAX_BYTES);
   if(!bytes)return json(413,'invalid-file-size');
   const suffix=filename.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^\.+/,'').slice(-180)||'evidence';
   const path=owner+'/'+id+'/'+randomId()+'-'+suffix;
   if(!safePath(path,owner,id))return json(500,'gateway-error');
   const latest=await readOne(engagementQuery);
   if(!latest||latest.id!==id||latest.owner_id!==owner)return json(404,'engagement-unavailable');
   const uploaded=await call('/storage/v1/object/'+BUCKET+'/'+path,true,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:bytes});
   if(!uploaded.ok)return json(502,'upload-failed');
   // Registration retains user RLS and existing audit trigger. On uncertain
   // registration failure retain the orphan for review; never delete evidence.
   const registered=await call('/rest/v1/pentest_evidence',false,{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({owner_id:owner,engagement_id:id,storage_path:path,file_name:filename,mime_type:mime,file_size:bytes.byteLength,description:description||null})});
   if(!registered.ok)return json(409,'registration-unconfirmed');
   return json(201,'registered');
  }catch{return json(503,'gateway-unavailable');}
 };
}
