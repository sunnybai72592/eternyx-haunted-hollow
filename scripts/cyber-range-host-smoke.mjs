#!/usr/bin/env node
/**
 * Disposable GitHub/Linux Docker acceptance for two real private ranges.
 * This script is NEVER invoked during app startup or user web requests.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { LocalDockerRangeRuntime } from "../infrastructure/cyber-range/provider/docker-runtime.mjs";

if (process.platform!=="linux" ||
    process.env.ETERNYX_PROVIDER_EXECUTION!=="enabled" ||
    process.env.ETERNYX_RANGE_OPERATOR_ACK!=="LOCAL_ONLY_NO_PUBLIC_INGRESS" ||
    process.env.ETERNYX_RANGE_HOST_SMOKE!=="CI_DISPOSABLE_ONLY") {
  console.error("Explicit disposable Linux Docker test acknowledgement required");
  process.exitCode=1;
} else {
  const runtime=new LocalDockerRangeRuntime();
  const ids=[randomUUID(),randomUUID()];
  const started=[];
  try {
    runtime.validateHost();
    for(const id of ids){
      const range=await runtime.start(id);
      assert.equal(range.instanceRef,"cr-"+id.replaceAll("-",""));
      assert.ok(Number.isInteger(range.localPort) &&
        range.localPort>=1024 && range.localPort<=65535);
      started.push(range);
    }
    assert.notEqual(started[0].localPort,started[1].localPort);
    const access=async(index,token,route="/api/tickets?ticket=102")=>
      fetch("http://127.0.0.1:"+started[index].localPort+route,{
        headers:token?{authorization:"Bearer "+token}:{},
        redirect:"manual",signal:AbortSignal.timeout(2500),
      });
    const flags=[];
    for(let i=0;i<started.length;i++){
      const a=await access(i);
      assert.equal(a.status,401);
      const wrong=await access(i,started[1-i].token);
      assert.equal(wrong.status,401);
      const response=await access(i,started[i].token);
      assert.equal(response.status,200);
      const value=await response.json();
      const flag=value.content?.match(/ETERNYX\{ticket_idor_[0-9a-f]{24}\}/)?.[0];
      assert.ok(flag);
      flags.push(flag);
      assert.equal((await access(i,started[i].token,"/not-an-allowed-path")).status,404);
      const inspection=await runtime.attest(ids[i]);
      assert.equal(inspection.services,2);
      assert.equal(inspection.publishedDockerPorts,0);
      assert.equal(inspection.internalNetworks,2);
    }
    assert.notEqual(flags[0],flags[1]);
    console.log("Two private network labs verified; host-only ingress, isolation and token separation passed");
  }catch{
    console.error("Host-only range smoke failed; inspect private CI Docker/network logs securely");
    process.exitCode=1;
  }finally{
    // Do not output secrets; the per-session host listeners terminate first.
    for(const id of [...ids].reverse()){
      try{await runtime.stop(id);}
      catch{console.error("Disposable local lab cleanup requires review");process.exitCode=1;}
    }
  }
}
