#!/usr/bin/env node
/**
 * Read-only microVM operator preflight. Does NOT contact a provider,
 * accept payment details, install binaries or start guests.
 */
import { inspectLocalMicrovmHost } from
  "../infrastructure/cyber-range/provider/microvm-host-preflight.mjs";
import { assertNoUnverifiedHostedRuntime } from
  "../infrastructure/cyber-range/provider/hosted-readiness.mjs";

const opts=process.argv.slice(2);
const help=opts.includes("--help");
const supported=new Set(["--json","--require-kvm","--help"]);
if(opts.some(x=>!supported.has(x)) || opts.length>2 ||
   (help&&opts.length>1)){
  console.error("Usage: npm run range:microvm:preflight -- [--json] [--require-kvm]");
  process.exitCode=2;
}else if(help){
  console.log([
    "ETERNYX Labs — read-only hosted microVM preflight",
    "Checks host Linux, KVM, CPU virtualization, cgroup v2 and Firecracker/jailer binaries.",
    "No cloud calls, VMs, paid resources, downloads or DNS requests.",
    "This is an inspection report, NEVER authorization to launch a public lab.",
    "A hosted runtime still requires an independently audited provider adapter.",
  ].join("\n"));
}else{
  try{
    // A host that configured a hypothetical cloud runtime must NEVER fall
    // through to the local Docker worker silently.
    assertNoUnverifiedHostedRuntime();
    const status=await inspectLocalMicrovmHost();
    console.log(JSON.stringify(status));
    if(opts.includes("--require-kvm") && !status.basicHostSupported){
      process.exitCode=1;
    }
  }catch{
    console.error("Local microVM preflight could not verify its execution context.");
    process.exitCode=1;
  }
}
