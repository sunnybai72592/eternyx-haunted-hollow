import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  parseGitHubIntegrationRequest,validateGitHubName,
  sanitizeGitHubRepo,fetchGitHubPublicRepo,
} from "../supabase/functions/_shared/automation-github-public.mjs";

const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const githubFixture={
  name:"eternyx-haunted-hollow",full_name:"sunnybai72592/eternyx-haunted-hollow",
  owner:{login:"sunnybai72592"},description:"Real repo",private:false,
  stargazers_count:3,forks_count:2,open_issues_count:1,archived:false,
  language:"TypeScript",default_branch:"main",
  permissions:{admin:true,push:true},token:"NEVER_RETURN_THIS",
};
test("only authenticated-status, policy, history and inspect actions allowed",()=>{
  for(const req of [
    {action:"status"},{action:"history"},
    {action:"configure",enabled:false,dailyLimit:1},
    {action:"configure",enabled:true,dailyLimit:20},
    {action:"inspect",owner:"sunnybai72592",repo:"eternyx-haunted-hollow",requestKey:id},
  ])assert.equal(parseGitHubIntegrationRequest(req).ok,true,JSON.stringify(req));
  for(const req of [
    {action:"deleteRepository",owner:"x",repo:"y"},
    {action:"writeIssue",title:"x"},
    {action:"configure",enabled:"true",dailyLimit:5},
    {action:"configure",enabled:true,dailyLimit:0},
    {action:"configure",enabled:true,dailyLimit:21},
    {action:"configure",enabled:true,dailyLimit:3.2},
    {action:"inspect",owner:"x",repo:"y",requestKey:id,url:"https://127.0.0.1/"},
    {action:"inspect",owner:"x",repo:"y",requestKey:id,token:"a"},
    {action:"inspect",owner:"../internal",repo:"repo",requestKey:id},
    {action:"inspect",owner:"octocat",repo:"..",requestKey:id},
    {action:"inspect",owner:"octocat",repo:"hello%2Fworld",requestKey:id},
    {action:"inspect",owner:"octocat",repo:"hello",requestKey:"fake"},
    {action:"status",user_id:id},
  ])assert.equal(parseGitHubIntegrationRequest(req).ok,false,JSON.stringify(req));
});
test("GitHub owner/repo validation rejects hostname and path injection",()=>{
  for(const o of ["localhost","127-0-0-1","octocat","a"]){
    assert.equal(validateGitHubName(o,"Hello-World"),true);
  }
  for(const [owner,repo] of [
    ["", "x"],["-octocat","x"],["octocat-","x"],["octocat","."],
    ["octocat",".."],["octocat","repo/x"],["octocat","repo?x=1"],
    ["octocat","repo#x"],["octocat"," "],["octocat","💜"],["octocat","a".repeat(101)],
    ["a".repeat(40),"repo"],["octocat.example.com","repo"],
  ])assert.equal(validateGitHubName(owner,repo),false,owner+"/"+repo);
});
test("upstream response is narrow and cannot leak permissions or credentials",()=>{
  const meta=sanitizeGitHubRepo(githubFixture,"SUNNYBAI72592","eternyx-haunted-hollow");
  assert.deepEqual(Object.keys(meta).sort(),[
    "name","fullName","description","stars","forks","openIssues",
    "language","archived","defaultBranch","url",
  ].sort());
  assert.equal(meta.url,"https://github.com/sunnybai72592/eternyx-haunted-hollow");
  assert.ok(!JSON.stringify(meta).includes("NEVER_RETURN_THIS"));
  assert.ok(!JSON.stringify(meta).includes("permissions"));
  assert.throws(()=>sanitizeGitHubRepo({...githubFixture,private:true},"sunnybai72592","eternyx-haunted-hollow"));
  assert.throws(()=>sanitizeGitHubRepo({...githubFixture,full_name:"wrong/repo"},"sunnybai72592","eternyx-haunted-hollow"));
  assert.throws(()=>sanitizeGitHubRepo({...githubFixture,stargazers_count:-1},"sunnybai72592","eternyx-haunted-hollow"));
});
test("integration contacts only the fixed public GitHub endpoint with GET and no auth token",async()=>{
  let urlCalled,optionsCalled;
  const inspected=await fetchGitHubPublicRepo("sunnybai72592","eternyx-haunted-hollow",
    async(url,options)=>{
      urlCalled=url;optionsCalled=options;
      return new Response(JSON.stringify(githubFixture),
        {status:200,headers:{"Content-Type":"application/json"}});
    });
  assert.equal(inspected.ok,true);
  assert.equal(urlCalled,"https://api.github.com/repos/sunnybai72592/eternyx-haunted-hollow");
  assert.equal(optionsCalled.method,"GET");
  assert.equal(optionsCalled.redirect,"error");
  assert.equal(optionsCalled.credentials,"omit");
  assert.equal(optionsCalled.headers.Authorization,undefined);
  assert.equal(optionsCalled.headers["User-Agent"],"ETERNYX-Automation-Public-Metadata");
  assert.equal(inspected.result.fullName,"sunnybai72592/eternyx-haunted-hollow");
});
test("GitHub 404 and 429 remain factual outcomes, not fabricated metadata",async()=>{
  const notFound=await fetchGitHubPublicRepo("octocat","Hello-World",
    async()=>new Response("missing",{status:404}));
  assert.deepEqual(notFound,{ok:false,httpStatus:404,errorCode:"not_found"});
  const limited=await fetchGitHubPublicRepo("octocat","Hello-World",
    async()=>new Response("",{status:403,headers:{"x-ratelimit-remaining":"0"}}));
  assert.equal(limited.errorCode,"provider_rate_limited");
  const serverError=await fetchGitHubPublicRepo("octocat","Hello-World",
    async()=>{throw new Error("network");});
  assert.equal(serverError.errorCode,"provider_unavailable");
  const invalid=await fetchGitHubPublicRepo("octocat","Hello-World",
    async()=>new Response("<html>not json</html>",{status:200,headers:{"Content-Type":"text/html"}}));
  assert.equal(invalid.errorCode,"upstream_invalid");
});
test("oversize and private provider payload fail closed",async()=>{
  const full=JSON.stringify({...githubFixture,description:"X".repeat(55000)});
  const huge=await fetchGitHubPublicRepo("sunnybai72592","eternyx-haunted-hollow",
    async()=>new Response(full,{status:200,headers:{"Content-Type":"application/json"}}));
  assert.equal(huge.errorCode,"upstream_invalid");
  const priv=await fetchGitHubPublicRepo("sunnybai72592","eternyx-haunted-hollow",
    async()=>new Response(JSON.stringify({...githubFixture,private:true}),
      {status:200,headers:{"Content-Type":"application/json"}}));
  assert.equal(priv.errorCode,"upstream_invalid");
});
test("database metering and Edge handler use trusted ownership rather than client identity",async()=>{
  const sql=await read("supabase/migrations/20261123020000_automation_github_read_provider.sql");
  const endpoint=await read("supabase/functions/automation-github-public/index.ts");
  const ui=await read("src/components/AutomationGitHubReadPanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/daily_limit BETWEEN 1 AND 20/);
  assert.match(sql,/UNIQUE\(user_id,request_key\)/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/automation_reserve_github_read/);
  assert.match(sql,/automation_finish_github_read/);
  assert.match(sql,/automation_prune_github_reads/);
  assert.match(sql,/interval '7 days'/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql,/REVOKE ALL ON public\.automation_provider_calls FROM PUBLIC,anon,authenticated/);
  assert.match(endpoint,/authenticateUser\(req\)/);
  assert.match(endpoint,/automation_reserve_github_read/);
  assert.match(endpoint,/automation_finish_github_read/);
  assert.match(endpoint,/fetchGitHubPublicRepo/);
  assert.match(endpoint,/\.eq\("user_id",user\.id\)/);
  assert.match(ui,/externalWritesAllowed/);
  assert.match(ui,/Inspect public repository/);
  assert.match(cloud,/<AutomationGitHubReadPanel/);
});
