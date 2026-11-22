import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  parseGitHubIssueAction,safeIssueContent,hasObviousSecret,
  keyedWorkflowInputDigest,fetchConfirmedIssueState,
} from "../supabase/functions/_shared/automation-github-issues.mjs";
import {runLocalWorkflow} from "../src/lib/automationWorkflow.mjs";

const read=(file)=>readFile(new URL("../"+file,import.meta.url),"utf8");
const userId="11111111-1111-4111-8111-111111111111";
const workflowId="22222222-2222-4222-8222-222222222222";
const draftId="33333333-3333-4333-8333-333333333333";
const requestKey="44444444-4444-4444-8444-444444444444";
const token="github_pat_"+ "A".repeat(60);
const owner="octocat",repo="Hello-World";
const canonical="https://github.com/octocat/Hello-World/issues/42";
test("workflow drafts and issue status checks accept only exact authenticated contract",()=>{
  for(const req of [
    {action:"prepareWorkflow",workflowId,title:"New issue",input:"  hello \n  world ",requestKey},
    {action:"trackIssue",draftId,requestKey},
  ]){
    const parsed=parseGitHubIssueAction(req);
    assert.equal(parsed.ok,true,JSON.stringify(req));
  }
  for(const req of [
    {action:"prepareWorkflow",workflowId,title:"",input:"a",requestKey},
    {action:"prepareWorkflow",workflowId,title:"ok",input:"é".repeat(1001),requestKey},
    {action:"prepareWorkflow",workflowId,title:"ok",input:"x",requestKey,writeTo:"https://evil.invalid"},
    {action:"prepareWorkflow",workflowId,title:"ok",input:"x",requestKey,user_id:userId},
    {action:"prepareWorkflow",workflowId:"bad",title:"ok",input:"x",requestKey},
    {action:"prepareWorkflow",workflowId,title:"ok",input:"x",requestKey:"replay"},
    {action:"trackIssue",draftId,requestKey,url:"https://127.0.0.1/"},
    {action:"trackIssue",draftId,requestKey,token},
    {action:"trackIssue",draftId:"bad",requestKey},
    {action:"trackIssue",draftId,requestKey:"bad"},
    {action:"markAsClosed",draftId},
  ]){
    assert.equal(parseGitHubIssueAction(req).ok,false,JSON.stringify(req));
  }
});
test("the real saved workflow engine produces deterministic issue body without external effects",()=>{
  const input="  review service A  \n\n review service A  \n  review service B";
  const steps=[
    {id:"s1",kind:"trim"},{id:"s2",kind:"remove_blanks"},
    {id:"s3",kind:"unique",caseSensitive:false},
  ];
  const result=runLocalWorkflow(input,steps);
  assert.equal(result.output,"review service A\nreview service B");
  assert.equal(result.outputLines,2);
  assert.equal(safeIssueContent("Review findings",result.output),true);
  assert.equal(safeIssueContent("Review findings","x".repeat(1001)),false);
  assert.equal(safeIssueContent(" ",result.output),false);
});
test("obvious credential signatures are blocked from manual and workflow issue content",()=>{
  const examples=[
    "Do not paste github_pat_"+ "K".repeat(40),
    "ghp_"+ "A".repeat(40),
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "AWS key AKIA"+"A".repeat(16),
    "Bearer "+"eyJhbGciOiJIUzI1NiJ9.abcdefABCDEFghijklmnop",
    "sk-"+ "A".repeat(40),
  ];
  for(const item of examples){
    assert.equal(hasObviousSecret(item),true,item.slice(0,15));
    assert.equal(safeIssueContent("bug",item),false);
  }
  for(const content of ["Need login button fixed","No keys included","workflow line a\nworkflow line b"]){
    assert.equal(hasObviousSecret(content),false);
  }
});
test("workflow input provenance is keyed HMAC not a brute-forceable unkeyed digest",async()=>{
  const one=await keyedWorkflowInputDigest("a".repeat(64),userId,workflowId,"hello");
  assert.match(one,/^[0-9a-f]{64}$/);
  assert.equal(one,await keyedWorkflowInputDigest("a".repeat(64),userId,workflowId,"hello"));
  assert.notEqual(one,await keyedWorkflowInputDigest("b".repeat(64),userId,workflowId,"hello"));
  assert.notEqual(one,await keyedWorkflowInputDigest("a".repeat(64),userId,workflowId,"world"));
  await assert.rejects(keyedWorkflowInputDigest("testkey",userId,workflowId,"hello"));
});
test("GitHub status GET uses fixed endpoint, GET only, no redirect and no stored arbitrary URLs",async()=>{
  let called,settings;
  const result=await fetchConfirmedIssueState(token,owner,repo,42,async(url,options)=>{
    called=url;settings=options;
    return new Response(JSON.stringify({
      number:42,html_url:canonical,state:"closed",locked:false,
    }),{status:200,headers:{"Content-Type":"application/json"}});
  });
  assert.deepEqual(result,{ok:true,issueState:"closed",number:42,url:canonical});
  assert.equal(called,"https://api.github.com/repos/octocat/Hello-World/issues/42");
  assert.equal(settings.method,"GET");
  assert.equal(settings.redirect,"error");
  assert.equal(settings.credentials,"omit");
  assert.equal(settings.headers.Authorization,"Bearer "+token);
  assert.equal((await fetchConfirmedIssueState(token,owner,repo,-1)).errorCode,"github_invalid_response");
});
test("GitHub issue tracking rejects pull-request metadata, mismatched issue numbers and false statuses",async()=>{
  const badResponses=[
    {number:42,html_url:canonical,state:"draft"},
    {number:43,html_url:canonical,state:"open"},
    {number:42,html_url:"https://evil.invalid/issues/42",state:"open"},
    {number:42,html_url:canonical,state:"open",pull_request:{url:"fake"}},
  ];
  for(const item of badResponses){
    const r=await fetchConfirmedIssueState(token,owner,repo,42,
      async()=>new Response(JSON.stringify(item),
        {status:200,headers:{"Content-Type":"application/json"}}));
    assert.equal(r.errorCode,"github_invalid_response");
  }
  const statuses=[[404,"github_not_found"],[401,"github_forbidden"],
    [429,"github_rate_limit"],[500,"github_unavailable"]];
  for(const [status,reason] of statuses){
    const result=await fetchConfirmedIssueState(token,owner,repo,42,
      async()=>new Response("",{status}));
    assert.equal(result.errorCode,reason);
  }
  const tooLarge=await fetchConfirmedIssueState(token,owner,repo,42,
    async()=>new Response(JSON.stringify({data:"x".repeat(70000)}),
      {status:200,headers:{"Content-Type":"application/json"}}));
  assert.equal(tooLarge.errorCode,"github_invalid_response");
});
test("source workflow bridge and readback persist only owner-checked metadata and keep explicit approval",async()=>{
  const sql=await read("supabase/migrations/20261123040000_automation_github_workflow_tracking.sql");
  const endpoint=await read("supabase/functions/automation-github-issues/index.ts");
  const parent=await read("src/components/AutomationGitHubIssuesPanel.tsx");
  const child=await read("src/components/AutomationGitHubIssueWorkflowPanel.tsx");
  assert.match(sql,/automation_prepare_github_workflow_issue/);
  assert.match(sql,/public\.automation_workflows/);
  assert.match(sql,/revision=p_workflow_revision/);
  assert.match(sql,/source_workflow_revision/);
  assert.match(sql,/automation_reserve_github_issue_status/);
  assert.match(sql,/automation_finish_github_issue_status/);
  assert.match(sql,/automation_housekeep_github_issue_status/);
  assert.match(sql,/interval '24 hours'\)\s*>=12/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.match(endpoint,/authenticateUser\(req\)/);
  assert.match(endpoint,/runLocalWorkflow\(action\.input,workflow\.steps\)/);
  assert.match(endpoint,/keyedWorkflowInputDigest/);
  assert.match(endpoint,/safeIssueContent\(issue\.title,issue\.body\)/);
  assert.match(endpoint,/automation_reserve_github_issue_status/);
  assert.match(endpoint,/fetchConfirmedIssueState/);
  assert.match(endpoint,/\.eq\("user_id",user\.id\)/);
  assert.match(child,/executed!==false/);
  assert.match(child,/Run saved workflow & save encrypted draft/);
  assert.match(parent,/<AutomationGitHubIssueWorkflowPanel/);
  assert.match(parent,/Fetch actual GitHub issue status/);
});
