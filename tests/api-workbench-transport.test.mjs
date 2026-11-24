import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readBoundedApiBody,executeApiWorkbenchRequest} from "../src/lib/apiWorkbenchTransport.mjs";
const request={url:"https://example.com/api",method:"GET",headers:[["Accept","application/json"]],body:""};
test("bounded stream distinguishes exact limit from overflow and decodes UTF-8 across chunks",async()=>{
  const bytes=new TextEncoder().encode("aéz");
  const stream=new ReadableStream({start(c){c.enqueue(bytes.slice(0,2));c.enqueue(bytes.slice(2));c.close();}});
  assert.deepEqual(await readBoundedApiBody(new Response(stream),4),{text:"aéz",truncated:false});
  assert.deepEqual(await readBoundedApiBody(new Response("abcde"),3),{text:"abc",truncated:true});
  await assert.rejects(readBoundedApiBody(new Response("x"),0),/byte limit/);
});
test("actual transport options refuse redirects and omit ambient credentials and referrer",async()=>{
  let tick=0;
  const result=await executeApiWorkbenchRequest(request,{now:()=>tick+=5,fetcher:async(url,opts)=>{
    assert.equal(url,request.url);assert.equal(opts.redirect,"error");assert.equal(opts.credentials,"omit");
    assert.equal(opts.referrerPolicy,"no-referrer");assert.equal(opts.mode,"cors");assert.equal(opts.cache,"no-store");
    assert.equal(opts.headers.get("accept"),"application/json");assert.equal(Object.hasOwn(opts,"body"),false);
    return new Response('{"ok":true}',{status:200,headers:{"content-type":"application/json"}});
  }});
  assert.equal(result.status,200);assert.equal(result.headerDurationMs,5);assert.equal(result.durationMs,10);
  assert.equal(JSON.parse(result.body).ok,true);
});
test("aborted request does not accept a late response; explicit write body is preserved",async()=>{
  const controller=new AbortController();
  await assert.rejects(executeApiWorkbenchRequest(request,{signal:controller.signal,fetcher:async()=>{controller.abort();return new Response("late")}}),{name:"AbortError"});
  let calls=0;
  await assert.rejects(executeApiWorkbenchRequest(request,{signal:controller.signal,fetcher:async()=>{calls++;return new Response("x")}}),{name:"AbortError"});
  assert.equal(calls,0);
  await executeApiWorkbenchRequest({...request,method:"POST",body:"{\"x\":1}"},{fetcher:async(_url,opts)=>{assert.equal(opts.body,'{"x":1}');return new Response("ok");}});
});
test("response size cap and stale-safe workbench wiring remain enforced",async()=>{
  const result=await executeApiWorkbenchRequest(request,{fetcher:async()=>new Response("x".repeat(1_000_001))});
  assert.equal(result.body.length,1_000_000);assert.equal(result.truncated,true);
  const view=readFileSync(new URL("../src/pages/ApiEngineeringWorkbench.tsx",import.meta.url),"utf8");
  assert.match(view,/if \(activeRequest\.current\) return/);
  assert.match(view,/activeRequest\.current\?\.abort\(\)/);
  assert.match(view,/window\.confirm\("Send "/);
  assert.match(view,/responseSignature !== draftSignature/);
  assert.match(view,/curlSignature !== draftSignature/);
  assert.match(view,/result && !responseStale \? runApiAssertions\(result, expectations\)/);
  assert.match(view,/disabled=\{!result\.body \|\| responseStale\}/);
  assert.doesNotMatch(view,/redirect:\s*"follow"/);
});
