#!/usr/bin/env node
// Multi-agent local registry. No hosted service, HTTP listener or tokens in stdout.
import {
  readRegistry, writeRegistry, parseConnectionArgs, addConnection, replaceConnection,
  removeConnection, findConnection, queryConnection, makeConnectionSnapshot,
} from "../src/lib/dockerConnectionRegistry.mjs";

const usage = [
  "ETERNYX trusted-operator Docker connections (all connections require your own SSH tunnels)",
  "  node scripts/docker-connections.mjs list",
  "  node scripts/docker-connections.mjs add NAME LOCAL_TUNNEL_PORT ABSOLUTE_PRIVATE_TOKEN_FILE",
  "  node scripts/docker-connections.mjs check NAME",
  "  node scripts/docker-connections.mjs check-all",
  "  node scripts/docker-connections.mjs images NAME",
  "  node scripts/docker-connections.mjs snapshot NAME",
  "  node scripts/docker-connections.mjs rotate NAME ABSOLUTE_NEW_TOKEN_FILE",
  "  node scripts/docker-connections.mjs remove NAME",
].join("\n");
const print = (value) => process.stdout.write(JSON.stringify(value,null,2)+"\n");
async function main(argv) {
  if (argv.length===0 || argv.length===1 && argv[0]==="--help") { process.stdout.write(usage+"\n"); return; }
  const [action,id,a,b] = argv;
  if (action==="list" && argv.length===1) {
    // Stored registrations are NOT proof of a live connection.
    return print({connections:readRegistry().map(c=>({id:c.id,localPort:c.port,lastRegisteredAt:c.registeredAt,state:"not-checked"}))});
  }
  if (action==="add" && argv.length===4) {
    const existing=readRegistry();
    const entry=parseConnectionArgs(id,a,b);
    // A real authenticated probe is required before any local registration is saved.
    const probe=await queryConnection(entry);
    const added=addConnection(existing,entry);
    writeRegistry(added);
    return print({id,localPort:entry.port,state:probe.state,registered:true});
  }
  if (action==="rotate" && argv.length===3) {
    const connections=readRegistry();
    const old=findConnection(connections,id);
    const entry=parseConnectionArgs(id,String(old.port),a);
    const probe=await queryConnection(entry);
    writeRegistry(replaceConnection(connections,{...entry,registeredAt:old.registeredAt}));
    return print({id,state:probe.state,credentialFileUpdated:true});
  }
  if (action==="remove" && argv.length===2) {
    writeRegistry(removeConnection(readRegistry(),id));
    return print({id,removedFromLocalRegistry:true,remoteTokenRevoked:false});
  }
  if (action==="check" && argv.length===2) return print(await queryConnection(findConnection(readRegistry(),id)));
  if (action==="check-all" && argv.length===1) {
    const results=[];
    for (const item of readRegistry()) {
      try { results.push(await queryConnection(item)); }
      catch { results.push({id:item.id,state:"unavailable",checkedAt:new Date().toISOString()}); }
    }
    return print({observedAt:new Date().toISOString(),connections:results});
  }
  if (action==="images" && argv.length===2) {
    const value=await queryConnection(findConnection(readRegistry(),id),"images");
    return print({id,source:value.source,capturedAt:value.capturedAt,images:value.images});
  }
  if (action==="snapshot" && argv.length===2) {
    const value=await queryConnection(findConnection(readRegistry(),id),"list");
    return print(makeConnectionSnapshot(value));
  }
  throw new Error("Unknown command or incorrect argument count. Use --help.");
}
main(process.argv.slice(2)).catch(err=>{
  // Do not echo token values or secret file paths on failure.
  const safe = err instanceof Error ? err.message : "Docker connection manager failed.";
  process.stderr.write(safe+"\n");
  process.exitCode=1;
});
