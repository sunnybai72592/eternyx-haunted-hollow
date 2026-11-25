#!/usr/bin/env node
// Explicitly approved, write-capable STAGING ONLY lifecycle. No account creation,
// payments, service-role keys, preexisting request updates or automatic retries.
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const REF='mhodwvypfbxafamkrgsk';
const APPROVAL='WRITE_SYNTHETIC_SERVICES_STAGING_LIFECYCLE';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireFact(ok,code){if(!ok)throw Error('services_phase50_'+code)}
export function config(env){
 requireFact(env.SERVICES_LIFECYCLE_CONFIRM===APPROVAL,'approval_missing');
 requireFact(env.SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF===REF&&env.SERVICES_PREFLIGHT_URL==='https://'+REF+'.supabase.co','target_invalid');
 const key=env.SERVICES_PREFLIGHT_PUBLISHABLE_KEY;
 requireFact(typeof key==='string'&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(key),'publishable_key_required');
 const people=['CUSTOMER_A','CUSTOMER_B','ADMIN'].map(role=>({
  id:env['SERVICES_LIFECYCLE_'+role+'_ID'],
  email:env['SERVICES_PREFLIGHT_'+role+'_EMAIL'],
  password:env['SERVICES_PREFLIGHT_'+role+'_PASSWORD'],
 }));
 requireFact(people.every(p=>uuid.test(p.id??'')&&typeof p.email==='string'&&p.email.includes('@')&&typeof p.password==='string'&&p.password.length>=12),'actor_config_missing');
 requireFact(new Set(people.map(p=>p.id.toLowerCase())).size===3&&new Set(people.map(p=>p.email.trim().toLowerCase())).size===3,'actors_not_distinct');
 return {url:env.SERVICES_PREFLIGHT_URL,key,people};
}
export function one(r,code){
 requireFact(r&&!r.error&&Array.isArray(r.data)&&r.data.length===1&&r.data[0]&&typeof r.data[0]==='object',code);
 return r.data[0];
}
export function denied(r,code,allowEmpty=false,expected='42501'){
 requireFact(r&&((r.error?.code===expected&&r.data==null&&(expected==='23514'?r.status===400:r.status===401||r.status===403))||
 (allowEmpty&&!r.error&&r.status===200&&Array.isArray(r.data)&&r.data.length===0)),code);
}
const pass=code=>process.stdout.write('PASS '+code+'\n');
const insert=async(c,t,p,cols,code)=>one(await c.from(t).insert(p).select(cols),code);
const update=async(c,t,p,k,v,cols,code)=>one(await c.from(t).update(p).eq(k,v).select(cols),code);
const read=async(c,t,k,v,cols,code)=>one(await c.from(t).select(cols).eq(k,v).limit(2),code);
async function actor(c,p){
 const {data,error}=await c.auth.signInWithPassword({email:p.email,password:p.password});
 requireFact(!error&&data?.user?.id===p.id,'actor_signin_mismatch');
 const check=await c.auth.getUser();
 requireFact(!check.error&&check.data?.user?.id===p.id,'actor_getuser_mismatch');
}
export async function run(c,makeClient){
 const [a,b,admin,anon]=Array.from({length:4},()=>makeClient(c.url,c.key));
 const [pa,pb,pm]=c.people;
 let problem=null;
 try{
  const login=await Promise.allSettled([actor(a,pa),actor(b,pb),actor(admin,pm)]);
  requireFact(login.every(x=>x.status==='fulfilled'),'authentication_failed');
  for(const [client,expected] of [[a,false],[b,false],[admin,true],[anon,false]]){
   const r=await client.rpc('is_admin');
   requireFact(!r.error&&r.data===expected,'administrator_boundary');
  }
  pass('verified four actor roles');
  // Every write is scoped to new server-generated requests from this run.
  // A failed run retains only synthetic records for operator review.
  const tag='Synthetic Services lifecycle '+randomUUID();
  const payload=p=>({user_id:p.id,service_key:'security-review',title:tag,
   description:'Synthetic staging-only acceptance request. No purchased work or fulfillment obligation.',
   contact_email:'services-test@invalid.example',authorization_understood:true});
  const ra=await insert(a,'service_requests',payload(pa),'id,user_id,status','submit_a');
  const rb=await insert(b,'service_requests',payload(pb),'id,user_id,status','submit_b');
  requireFact(uuid.test(ra.id)&&uuid.test(rb.id)&&ra.id!==rb.id&&ra.user_id===pa.id&&rb.user_id===pb.id&&ra.status==='submitted'&&rb.status==='submitted','submission_identity');
  for(const [client,id] of [[a,rb.id],[b,ra.id],[anon,ra.id]]){
   denied(await client.from('service_requests').select('id').eq('id',id),'request_isolation',true);
  }
  denied(await b.from('service_requests').update({status:'declined'}).eq('id',ra.id).select('id'),'cross_customer_write',true);
  denied(await a.from('service_requests').update({status:'reviewing'}).eq('id',ra.id).select('id'),'owner_status_write',true);
  denied(await admin.from('service_requests').update({status:'proposal_sent'}).eq('id',ra.id).select('id'),'premature_proposal',false,'23514');
  pass('submission and unauthorized status changes denied');
  const status=async (value,note)=>{
   const row=await update(admin,'service_requests',{status:value,client_update:note},'id',ra.id,'id,status','admin_status');
   requireFact(row.id===ra.id&&row.status===value,'status_mismatch');
   requireFact((await read(a,'service_requests','id',ra.id,'id,status','customer_status')).status===value,'customer_status_mismatch');
  };
  await status('reviewing','Synthetic administrator review started.');
  await insert(admin,'service_request_triage',{request_id:ra.id,assigned_admin_id:pm.id,priority:'normal',internal_note:'Synthetic private triage'},'request_id','triage');
  denied(await a.from('service_request_triage').select('request_id').eq('request_id',ra.id),'triage_private',true);
  const msg=await insert(a,'service_request_activity',{request_id:ra.id,actor_id:pa.id,event_type:'message',body:'Synthetic customer discussion message.'},'id,request_id','message');
  await insert(admin,'service_request_activity',{request_id:ra.id,actor_id:pm.id,event_type:'message',body:'Synthetic administrator discussion response.'},'id,request_id','admin_message');
  denied(await b.from('service_request_activity').insert({request_id:ra.id,actor_id:pb.id,event_type:'message',body:'Synthetic unauthorized cross-account message.'}).select('id'),'cross_message');
  await status('more_info','Synthetic clarification requested.');
  const q=await insert(admin,'service_clarification_questions',{request_id:ra.id,author_id:pm.id,prompt:'Synthetic question regarding the test scope.'},'id,state','question');
  const ans=await insert(a,'service_clarification_answers',{question_id:q.id,author_id:pa.id,answer:'Synthetic clarification response from the owner.'},'id','answer');
  const closed=await update(admin,'service_clarification_questions',{state:'closed'},'id',q.id,'id,state,closed_by','close_question');
  requireFact(closed.state==='closed'&&closed.closed_by===pm.id,'closure_actor');
  const review=await insert(admin,'service_scope_reviews',{request_id:ra.id,author_id:pm.id,scope_summary:'Synthetic scope review for the staging lifecycle only, without contractual commitment.',deliverables:'Synthetic demonstration deliverable only.',exclusions:'No actual paid work.',assumptions:'Test environment only.',next_steps:'Review nonbinding feedback.'},'id','scope');
  await status('proposal_sent','Synthetic nonbinding scope published.');
  const response=await insert(a,'service_scope_responses',{review_id:review.id,user_id:pa.id,kind:'ready_to_discuss',note:'Synthetic nonbinding customer interest.'},'id','scope_response');
  const amendment=await insert(a,'service_brief_amendments',{request_id:ra.id,author_id:pa.id,category:'requirements',summary:'Synthetic amended scope',details:'Synthetic amendment for the service lifecycle acceptance exercise.'},'id','amendment');
  const reviewed=await update(admin,'service_brief_amendments',{status:'reviewed'},'id',amendment.id,'id,status,reviewed_by','review_amendment');
  requireFact(reviewed.status==='reviewed'&&reviewed.reviewed_by===pm.id,'amendment_actor');
  pass('discussion clarification and scope review persisted');
  for(const next of ['in_progress','completed']){
   denied(await admin.from('service_requests').update({status:next}).eq('id',ra.id).select('id'),'unverified_delivery_denied',false,'23514');
  }
  requireFact((await read(a,'service_requests','id',ra.id,'status','delivery_status')).status==='proposal_sent','delivery_guard_changed_state');
  await status('declined','Synthetic review concluded without a binding agreement or fulfillment.');
  const check=await a.rpc('mark_service_request_checked',{p_request_id:ra.id});
  requireFact(!check.error&&typeof check.data==='string'&&Number.isFinite(Date.parse(check.data)),'owner_checkin');
  denied(await b.rpc('mark_service_request_checked',{p_request_id:ra.id}),'cross_checkin');
  for(const [prefix,id,kind] of [['activity',msg.id,'message'],['question',q.id,'question_published'],['answer',ans.id,'answer_submitted'],['question-closed',q.id,'question_closed'],['scope-review',review.id,'scope_published'],['scope-response',response.id,'scope_response'],['amendment',amendment.id,'amendment_submitted'],['amendment-reviewed',amendment.id,'amendment_reviewed']]){
   const r=one(await a.from('service_request_journal').select('request_id,event_key,event_kind').eq('request_id',ra.id).eq('event_key',prefix+':'+id).limit(2),'journal_source');
   requireFact(r.event_kind===kind&&r.request_id===ra.id,'journal_kind');
  }
  for(const client of [b,anon])denied(await client.from('service_request_journal').select('event_key').eq('request_id',ra.id),'journal_isolation',true);
  requireFact((await read(b,'service_requests','id',rb.id,'status','b_unchanged')).status==='submitted','b_status_changed');
  pass('review-only resolution verified; unauthorized delivery blocked; journal verified');
 }catch(e){problem=e}
 finally{
  const cleanup=await Promise.allSettled([a,b,admin].map(async c=>{
   const r=await c.auth.signOut({scope:'local'});requireFact(!r.error,'cleanup_failed');
  }));
  if(!problem&&cleanup.some(x=>x.status!=='fulfilled'))problem=Error('services_phase50_cleanup_failed');
 }
 if(problem)throw problem;
 pass('synthetic review lifecycle and local auth cleanup; no delivery or payments');
 return true;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 try{
  const c=config(process.env);
  const {createSafeClient}=await import('./services-live-readonly-preflight.mjs');
  await run(c,createSafeClient);
 }catch(e){process.stderr.write('BLOCKED '+(/^services_phase50_[a-z_]+$/.test(e?.message)?e.message:'services_phase50_runtime_failed')+'\n');process.exitCode=1}
}
