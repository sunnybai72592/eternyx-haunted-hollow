import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceHandler,MAX_BYTES,sha256 } from '../supabase/functions/security-evidence-gateway/handler.mjs';
const owner='11111111-1111-4111-8111-111111111111',eng='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const url='https://staging.example.invalid',publicKey='public-fixture',serviceKey='server-fixture';
const row={id,owner_id:owner,engagement_id:eng,storage_path:owner+'/'+eng+'/file.txt',file_size:3};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const req=(action='download',extra={},body)=>new Request(url,{method:'POST',headers:{Authorization:'Bearer a.b.c','x-evidence-action':action,'x-evidence-id':action==='upload'?eng:id,'x-evidence-request-id':id,...extra},body});
function setup({rows=[row,row],enabled=true,user={id:owner},registered=201,reservation='reserved',digest='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',sealed=201,allowedOwners=null}={}){
 const calls=[];let n=0;
 const handler=createEvidenceHandler({url,publicKey,serviceKey,enabled,allowedOwners,randomId:()=>id,fetcher:async(path,opts)=>{
  calls.push({path,opts});
  if(path.endsWith('/rest/v1/rpc/security_evidence_gateway_reserve_v2'))return json(reservation);
  if(path.includes('/rest/v1/security_evidence_gateway_digests?'))return json([{owner_id:owner,byte_count:3,sha256:digest}]);
  if(path.endsWith('/rest/v1/security_evidence_gateway_digests'))return json({},sealed);
  if(path.endsWith('/auth/v1/user'))return json(user);
  if(path.includes('/rest/v1/pentest_engagements?'))return json([{id:eng,owner_id:owner}]);
  if(path.endsWith('/rest/v1/pentest_evidence'))return json({},registered);
  if(path.includes('/rest/v1/pentest_evidence?'))return json(rows[n++]?[rows[n-1]]:[]);
  if(path.includes('/storage/v1/object/authenticated/'))return new Response('abc');
  if(path.includes('/storage/v1/object/pentest-evidence/'))return json({},200);
  throw Error('unexpected');
 }});
 return {handler,calls};
}
test('disabled or invalid request never reaches credentials or backend',async()=>{
 const a=setup({enabled:false});assert.equal((await a.handler(req())).status,503);assert.equal(a.calls.length,0);
 const b=setup();assert.equal((await b.handler(req('download',{Authorization:'Bearer public-fixture'}))).status,401);
 assert.equal((await b.handler(req('download',{'x-evidence-id':'../x'}))).status,400);assert.equal(b.calls.length,0);
});
test('owner download checks metadata twice and returns non-cacheable attachment, not a link',async()=>{
 const {handler,calls}=setup();const res=await handler(req());assert.equal(res.status,200);assert.equal(await res.text(),'abc');
 assert.match(res.headers.get('cache-control'),/no-store/);assert.equal(res.headers.get('content-disposition'),'attachment');
 assert.equal(res.headers.get('content-type'),'application/octet-stream');
 assert.equal(calls.length,6);assert.equal(calls[4].opts.headers.Authorization,'Bearer '+serviceKey);
 for(const i of [0,1,5])assert.equal(calls[i].opts.headers.Authorization,'Bearer a.b.c');
 assert.ok(calls.every(c=>c.opts.redirect==='error'));
});
test('cross-owner, malformed path and anonymous callers cannot reach privileged Storage',async()=>{
 for(const options of [{rows:[]},{rows:[{...row,owner_id:eng}]},{rows:[{...row,storage_path:owner+'/'+eng+'/../file.txt'}]},{user:{id:owner,is_anonymous:true}}]){
  const {handler,calls}=setup(options);assert.ok([401,404].includes((await handler(req())).status));
  assert.ok(calls.every(c=>c.opts.headers.Authorization!=='Bearer '+serviceKey));
 }
});
test('revoked during download or changed metadata never releases bytes',async()=>{
 for(const rows of [[row],[row,{...row,file_size:4}]]){
  const {handler}=setup({rows});const res=await handler(req());assert.equal(res.status,404);assert.notEqual(await res.text(),'abc');
 }
});
test('bounded upload derives path and owner, disables upsert, registers with caller JWT',async()=>{
 const {handler,calls}=setup();
 const res=await handler(req('upload',{'Content-Type':'text/plain','x-evidence-name':'sample.txt'},'abc'));
 assert.equal(res.status,201);
 const upload=calls.find(c=>c.path.includes('/storage/v1/object/pentest-evidence/'));
 assert.ok(upload.path.endsWith(owner+'/'+eng+'/'+id+'-sample.txt'));assert.equal(upload.opts.headers['x-upsert'],'false');
 const register=calls.at(-1);assert.equal(register.opts.headers.Authorization,'Bearer a.b.c');
 const body=JSON.parse(register.opts.body);assert.equal(body.owner_id,owner);assert.equal(body.engagement_id,eng);assert.equal(body.file_size,3);
});
test('unconfirmed registration never deletes storage or claims success',async()=>{
 const {handler,calls}=setup({registered:409});
 assert.equal((await handler(req('upload',{'Content-Type':'text/plain','x-evidence-name':'sample.txt'},'abc'))).status,409);
 assert.ok(calls.every(c=>c.opts.method!=='DELETE'));
});
test('oversize and unapproved MIME never reach privileged Storage',async()=>{
 for(const headers of [{'Content-Type':'text/html'},{'Content-Type':'text/plain','Content-Length':String(MAX_BYTES+1)}]){
  const {handler,calls}=setup();const res=await handler(req('upload',{'x-evidence-name':'file.txt',...headers},'abc'));
  assert.ok([400,413].includes(res.status));assert.ok(calls.every(c=>c.opts.headers.Authorization!=='Bearer '+serviceKey));
 }
});

test('same-length altered evidence is denied by server-only SHA-256 digest',async()=>{
 const {handler}=setup({digest:'0'.repeat(64)});
 const res=await handler(req());assert.equal(res.status,409);assert.notEqual(await res.text(),'abc');
 assert.equal(await sha256(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('quota and replay decisions prevent privileged byte operations',async()=>{
 for(const [reservation,status] of [['quota',429],['replay',409],['unexpected',503]]){
  const {handler,calls}=setup({reservation});
  const res=await handler(req('upload',{'Content-Type':'text/plain','x-evidence-name':'sample.txt'},'abc'));
  assert.equal(res.status,status);assert.ok(calls.every(c=>!c.path.includes('/storage/v1/')));
 }
});
test('upload seals exact digest before metadata registration; missing seal blocks success',async()=>{
 const a=setup();assert.equal((await a.handler(req('upload',{'Content-Type':'text/plain','x-evidence-name':'sample.txt'},'abc'))).status,201);
 const seal=a.calls.find(c=>c.path.endsWith('/rest/v1/security_evidence_gateway_digests'));
 assert.equal(JSON.parse(seal.opts.body).sha256,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.equal(seal.opts.headers.Authorization,'Bearer '+serviceKey);
 const b=setup({sealed:409});assert.equal((await b.handler(req('upload',{'Content-Type':'text/plain','x-evidence-name':'sample.txt'},'abc'))).status,409);
 assert.ok(b.calls.every(c=>!c.path.endsWith('/rest/v1/pentest_evidence')));
});

test('staging allowlist prevents all non-approved owners from reaching metadata or privileged controls',async()=>{
 for(const allowedOwners of [new Set([eng,id]),new Set(),[]]){
  const {handler,calls}=setup({allowedOwners});
  const res=await handler(req());assert.equal(res.status,403);
  assert.equal(calls.length,1);assert.ok(calls[0].path.endsWith('/auth/v1/user'));
 }
 const {handler}=setup({allowedOwners:new Set([owner,eng])});
 assert.equal((await handler(req())).status,200);
});
