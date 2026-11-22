import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encryptScheduledText, decryptScheduledText } from "../supabase/functions/_shared/automation-schedule-crypto.mjs";
import {
  parseGitHubIssueAction,validFineGrainedToken,issueFingerprint,
  verifyIssueConnection,createApprovedGitHubIssue,ISSUE_PAYLOAD_BYTES,
} from "../supabase/functions/_shared/automation-github-issues.mjs";

const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const token="github_pat_"+ "A".repeat(60);
const repo="eternyx-haunted-hollow";
const owner="sunnybai72592";
const master="b".repeat(64);
test("only nine fixed owner actions are accepted; no arbitrary URL or unapproved methods",()=>{
  const accepted=[
    {action:"status"},{action:"list"},{action:"disconnect"},
    {action:"toggle",enabled:true},{action:"toggle",enabled:false},
    {action:"connect",owner,repo,token},
    {action:"prepare",title:"Investigate bug",body:"Details",requestKey:id},
    {action:"preview",draftId:id},{action:"approve",draftId:id},
    {action:"reject",draftId:id},
  ];
  for(const body of accepted)assert.equal(parseGitHubIssueAction(body).ok,true,JSON.stringify({...body,token:undefined}));
  const rejected=[
    {action:"createIssue",title:"sneaky"},
    {action:"approve",draftId:id,url:"https://127.0.0.1/"},
    {action:"approve",draftId:id,token},
    {action:"approve",draftId:"foo"},
    {action:"status",user_id:id},
    {action:"connect",owner,repo,token:"ghp_test"},
    {action:"connect",owner,repo:"../internal",token},
    {action:"connect",owner,repo,token,url:"https://other.example"},
    {action:"toggle",enabled:"true"},
    {action:"prepare",title:"",body:"fine",requestKey:id},
    {action:"prepare",title:"a".repeat(121),body:"fine",requestKey:id},
    {action:"prepare",title:"okay",body:"a".repeat(1001),requestKey:id},
    {action:"prepare",title:"okay",body:"é".repeat(600),requestKey:id},
    {action:"prepare",title:"okay",body:"",requestKey:"not-uuid"},
    {action:"prepare",title:"okay",body:"",requestKey:id,extra:"untrusted"},
  ];
  for(const body of rejected)assert.equal(parseGitHubIssueAction(body).ok,false,JSON.stringify({...body,token:undefined}));
});
test("only fine-grained PAT shaped tokens accepted; never broad classic tokens",()=>{
  assert.equal(validFineGrainedToken(token),true);
  assert.equal(validFineGrainedToken("ghp_"+"A".repeat(45)),false);
  assert.equal(validFineGrainedToken("github_pat_"+ "A".repeat(310)),false);
  assert.equal(validFineGrainedToken(undefined),false);
});
test("verify connection uses fixed-host GET and does not claim that Issues write permission was verified",async()=>{
  let called=null,opts=null;
  const checked=await verifyIssueConnection(token,owner,repo,async(url,options)=>{
    called=url;opts=options;
    return new Response(JSON.stringify({
      full_name:owner+"/"+repo,has_issues:true,owner:{login:owner},
    }),{status:200,headers:{"Content-Type":"application/json"}});
  });
  assert.deepEqual(checked,{ok:true,login:owner});
  assert.equal(called,"https://api.github.com/repos/"+owner+"/"+repo);
  assert.equal(opts.method,"GET");
  assert.equal(opts.redirect,"error");
  assert.equal(opts.credentials,"omit");
  assert.equal(opts.headers.Authorization,"Bearer "+token);
  const missing=await verifyIssueConnection(token,owner,repo,
    async()=>new Response("",{status:404}));
  assert.equal(missing.reason,"repository_unavailable");
  const noIssues=await verifyIssueConnection(token,owner,repo,
    async()=>new Response(JSON.stringify({
      full_name:owner+"/"+repo,has_issues:false,owner:{login:owner},
    }),{status:200,headers:{"Content-Type":"application/json"}}));
  assert.equal(noIssues.ok,false);
});
test("actual approved outbound write is single POST to exact repo path, only title/body",async()=>{
  let calls=0,urlCalled="",config=null;
  const issue=await createApprovedGitHubIssue(token,owner,repo,"Fix outage","Detailed repro",
    async(url,options)=>{
      calls++;urlCalled=url;config=options;
      return new Response(JSON.stringify({
        number:42,html_url:"https://github.com/"+owner+"/"+repo+"/issues/42",
        secret:"not_released",
      }),{status:201,headers:{"Content-Type":"application/json"}});
    });
  assert.equal(calls,1);
  assert.equal(urlCalled,"https://api.github.com/repos/"+owner+"/"+repo+"/issues");
  assert.equal(config.method,"POST");
  assert.equal(config.redirect,"error");
  assert.equal(config.credentials,"omit");
  assert.deepEqual(JSON.parse(config.body),{title:"Fix outage",body:"Detailed repro"});
  assert.deepEqual(issue,{
    state:"succeeded",number:42,url:"https://github.com/"+owner+"/"+repo+"/issues/42",
  });
});
test("uncertain network outcomes never return retry instructions; 4xx are recorded without repeating writes",async()=>{
  const network=await createApprovedGitHubIssue(token,owner,repo,"Issue","Body",
    async()=>{throw Error("connection lost after POST");});
  assert.deepEqual(network,{state:"uncertain",code:"network_uncertain"});
  const http500=await createApprovedGitHubIssue(token,owner,repo,"Issue","Body",
    async()=>new Response("error",{status:500}));
  assert.deepEqual(http500,{state:"uncertain",code:"github_unavailable"});
  const denied=await createApprovedGitHubIssue(token,owner,repo,"Issue","Body",
    async()=>new Response("forbidden",{status:403}));
  assert.deepEqual(denied,{state:"failed",code:"github_forbidden"});
  const bad=await createApprovedGitHubIssue(token,owner,repo,"Issue","Body",
    async()=>new Response(JSON.stringify({number:2,html_url:"https://evil.example/"}),
      {status:201,headers:{"Content-Type":"application/json"}}));
  assert.deepEqual(bad,{state:"uncertain",code:"github_invalid_response"});
});
test("credentials and drafts encrypt with independent server key and random nonce",async()=>{
  const stored=await encryptScheduledText(master,token,320);
  assert.notEqual(stored.ciphertext,token);
  assert.equal(await decryptScheduledText(master,stored.ciphertext,stored.nonce,320),token);
  const draft=JSON.stringify({title:"Hello",body:"Some issue details"});
  const encrypted=await encryptScheduledText(master,draft,ISSUE_PAYLOAD_BYTES);
  assert.equal(await decryptScheduledText(master,encrypted.ciphertext,
    encrypted.nonce,ISSUE_PAYLOAD_BYTES),draft);
  assert.notEqual((await encryptScheduledText(master,draft,ISSUE_PAYLOAD_BYTES)).nonce,encrypted.nonce);
  await assert.rejects(decryptScheduledText("a".repeat(64),encrypted.ciphertext,
    encrypted.nonce,ISSUE_PAYLOAD_BYTES));
  const fp=await issueFingerprint(id,owner,repo,1,"Hello","body");
  assert.match(fp,/^[0-9a-f]{64}$/);
  assert.notEqual(fp,await issueFingerprint(id,owner,repo,2,"Hello","body"));
});
test("database reserves a one-way approved write and guarantees no second POST for same draft",async()=>{
  const sql=await read("supabase/migrations/20261123030000_automation_github_issue_approvals.sql");
  const handler=await read("supabase/functions/automation-github-issues/index.ts");
  const ui=await read("src/components/AutomationGitHubIssuesPanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/scope='github_issue_create'/);
  assert.match(sql,/UNIQUE\(user_id,request_key\)/);
  assert.match(sql,/>=3 THEN/);
  assert.match(sql,/status='submitting',payload_ciphertext=NULL,payload_nonce=NULL/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/automation_housekeep_github_issues/);
  assert.match(sql,/automation_mark_github_issue_previewed/);
  assert.match(sql,/d\.previewed_at<pg_catalog\.statement_timestamp\(\)-interval '10 minutes'/);
  assert.match(sql,/Prevent reconnecting with a fresh version=1/);
  assert.match(sql,/REVOKE ALL ON public\.automation_github_issue_connections FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/REVOKE ALL ON public\.automation_github_issue_drafts FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.match(handler,/authenticateUser\(req\)/);
  assert.match(handler,/automation_mark_github_issue_previewed/);
  assert.match(handler,/automation_claim_github_issue/);
  assert.match(handler,/createApprovedGitHubIssue\(token,claimed.owner,claimed.repo,/);
  assert.match(handler,/automation_finish_github_issue/);
  assert.match(handler,/retryAllowed:false/);
  assert.match(handler,/AUTOMATION_GITHUB_WRITE_ENCRYPTION_KEY/);
  assert.match(ui,/Preview issue/);
  assert.match(ui,/Approve & create issue/);
  assert.match(ui,/Disconnect and erase token/);
  assert.match(cloud,/<AutomationGitHubIssuesPanel/);
});
