#!/usr/bin/env node
/**
 * Disposable GitHub/Linux Docker acceptance for two real private ranges.
 * This script is NEVER invoked during app startup or user web requests.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  let stage="host-validation";
  try {
    runtime.validateHost();
    for(const [index,id] of ids.entries()){
      stage=index===0?"launch-first":"launch-second";
      const range=await runtime.start(id);
      assert.equal(range.instanceRef,"cr-"+id.replaceAll("-",""));
      assert.ok(Number.isInteger(range.localPort) &&
        range.localPort>=1024 && range.localPort<=65535);
      started.push(range);
    }
    stage="host-local-http";
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
    stage="deny-egress-and-metadata";
    // Reject public Internet and cloud instance-metadata connections from
    // BOTH Docker services on BOTH independent internal-only networks.
    const composeFile=resolve(dirname(fileURLToPath(import.meta.url)),
      "../infrastructure/cyber-range/compose.managed.yaml");
    const deniedTargets=[
      "https://example.com",
      "http://169.254.169.254/latest/meta-data/",
    ];
    for(const id of ids){
      for(const service of ["http-range","gateway"]){
        for(const url of deniedTargets){
          const test=spawnSync("docker",[
            "compose","-p","cr-"+id.replaceAll("-",""),
            "-f",composeFile,"exec","-T",service,"node","-e",
            "fetch(process.argv[1],{signal:AbortSignal.timeout(1300)}).then(()=>process.exit(1),()=>process.exit(0))",
            url,
          ],{
            encoding:"utf8",shell:false,timeout:12_000,maxBuffer:64000,
            env:{PATH:process.env.PATH??"/usr/local/bin:/usr/bin:/bin",
              HOME:process.env.HOME??"/tmp"},
          });
          if(test.error||test.status!==0){
            throw Error("Managed lab service had outbound network access");
          }
        }
      }
    }

    console.log("Two private network labs verified; host-only ingress, isolation and token separation passed");
  }catch(error){
    const detail=typeof error?.message==="string" &&
      /^Managed host-only range startup failed at (?:compose-start|verify-private-upstream|bind-host-loopback|probe-private-gateway)$/.test(error.message)
      ? " ("+error.message+")" : "";
    console.error("Host-only range smoke failed at safe stage: "+stage+detail);
    process.exitCode=1;
  }finally{
    // Do not output secrets; the per-session host listeners terminate first.
    for(const id of [...ids].reverse()){
      try{await runtime.stop(id);}
      catch{console.error("Disposable local lab cleanup requires review");process.exitCode=1;}
    }
  }
}
