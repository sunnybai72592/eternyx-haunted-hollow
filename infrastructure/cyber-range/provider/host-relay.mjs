/**
 * Linux operator-host loopback ingress. This module is intentionally outside
 * Docker: every managed Docker service uses only internal networks and has
 * ZERO published host ports or outbound NAT bridge.
 *
 * This host process is trusted. Never bind a non-loopback interface or accept
 * an upstream URL/address from learners. A verified Docker gateway address is
 * checked against its internal Docker network before each request.
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { validSessionId } from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const ROUTES=new Set(["/","/healthz","/api/rooms","/api/tickets",
  "/api/files","/api/ops/report","/api/verify"]);
const METHODS=new Set(["GET","POST"]);
const HEADERS=Object.freeze({
  "cache-control":"no-store",
  "x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer",
  "content-security-policy":"default-src 'none'; frame-ancestors 'none'",
});
const answer=(res,status,error)=>{
  res.writeHead(status,{...HEADERS,"content-type":"application/json; charset=utf-8"});
  res.end(JSON.stringify({error}));
};

const bytes=(addr)=>{
  if(typeof addr!=="string" || !/^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(addr))
    return null;
  const a=addr.split(".").map(Number);
  return a.every(x=>x>=0&&x<=255)?a:null;
};
const privateAddress=a=>(a[0]===10 ||
  (a[0]===172 && a[1]>=16 && a[1]<=31) ||
  (a[0]===192 && a[1]===168));

export function verifyInternalGatewayAddress({ip,subnet,network,project,containerId}){
  const a=bytes(ip);
  const p=typeof subnet==="string"?subnet.split("/"):[];
  const net=bytes(p[0]);
  const mask=Number(p[1]);
  if(!a||!net||p.length!==2||!privateAddress(a)||
     !privateAddress(net)||!Number.isInteger(mask)||mask<16||mask>30 ||
     typeof network!=="string" || !/^cr-[0-9a-f]{32}_gateway_ingress_only$/.test(network) ||
     project!==network.slice(0,-"_gateway_ingress_only".length) ||
     typeof containerId!=="string" || !/^[a-f0-9]{64}$/.test(containerId)){
    throw new Error("Unverified internal Docker gateway address");
  }
  const aa=a.reduce((v,n)=>(v<<8)|n,0)>>>0;
  const nn=net.reduce((v,n)=>(v<<8)|n,0)>>>0;
  const m=(0xffffffff<<(32-mask))>>>0;
  const networkAddress = (nn&m)>>>0;
  const broadcast = (networkAddress | (~m>>>0))>>>0;
  if(((aa&m)>>>0)!==networkAddress || aa===networkAddress || aa===broadcast)
    throw new Error("Gateway IP is outside verified private Docker subnet");
  return {ip,network,containerId};
}

export function createHostRangeRelay({sessionId,token,verifyUpstream,requestFetch=fetch}={}){
  if(!validSessionId(sessionId) ||
     typeof token!=="string"||!/^[0-9a-f]{64}$/.test(token) ||
     typeof verifyUpstream!=="function"||typeof requestFetch!=="function"){
    throw new Error("Invalid trusted host relay configuration");
  }
  let actualPort=0;
  const server=createServer(async(req,res)=>{
    let privatePhase="preflight";
    try{
      if(!actualPort || !new RegExp("^(?:127\\.0\\.0\\.1|localhost):"+actualPort+"$").test(req.headers.host??""))
        return answer(res,421,"Localhost host required");
      if(!METHODS.has(req.method))return answer(res,405,"Method denied");
      if(!req.url||req.url.length>1024||!req.url.startsWith("/")||
         req.url.startsWith("//")||req.url.includes("\\"))
        return answer(res,400,"Invalid local resource");
      const path=new URL(req.url,"http://127.0.0.1:"+actualPort);
      if(!ROUTES.has(path.pathname)||path.origin!=="http://127.0.0.1:"+actualPort)
        return answer(res,404,"Unknown lab resource");
      if(req.method==="POST"&&path.pathname!=="/api/verify")
        return answer(res,405,"Unsupported POST resource");
      const bearer=req.headers.authorization;
      const presented=typeof bearer==="string"&&bearer.startsWith("Bearer ")?
        Buffer.from(bearer.slice(7)):Buffer.alloc(0);
      const expected=Buffer.from(token);
      if(presented.length!==expected.length||!timingSafeEqual(presented,expected))
        return answer(res,401,"Valid managed lab credential required");
      privatePhase="verify-private-docker";
      const {ip}=await verifyUpstream();
      // No arbitrary DNS, caller-supplied URL, redirects, proxy headers or
      // cloud metadata address. IP is verified against this session's Docker
      // internal network every time by the trusted host runtime.
      const destination=new URL(path.pathname+path.search,"http://"+ip+":8081");
      const headers={authorization:"Bearer "+token,host:"gateway:8081"};
      for(const name of ["content-type","x-lab-role"]){
        const v=req.headers[name];
        if(typeof v==="string" && v.length<=120)headers[name]=v;
      }
      let body;
      if(req.method==="POST"){
        let length=0;const chunks=[];
        for await(const chunk of req){
          length+=chunk.length;
          if(length>1024)return answer(res,413,"Request exceeds lab limit");
          chunks.push(chunk);
        }
        body=Buffer.concat(chunks);
      }
      privatePhase="private-http-fetch";
      const upstream=await requestFetch(destination,{
        method:req.method,headers,redirect:"manual",
        ...(req.method==="POST"?{body}:{}),
        signal:AbortSignal.timeout(3500),
      });
      privatePhase="read-private-response";
      const buffer=Buffer.from(await upstream.arrayBuffer());
      if(buffer.length>32768)return answer(res,502,"Lab response exceeds limit");
      const safe={...HEADERS};
      const type=upstream.headers.get("content-type");
      if(type && type.length<=120)safe["content-type"]=type;
      res.writeHead(upstream.status,safe);
      res.end(buffer);
    }catch{
      if(process.env.ETERNYX_RANGE_HOST_SMOKE==="CI_DISPOSABLE_ONLY" &&
         ["verify-private-docker","private-http-fetch","read-private-response"].includes(privatePhase)) {
        console.error("Host relay safe diagnostic phase: "+privatePhase);
      }
      if(!res.headersSent)answer(res,503,"Internal range gateway unavailable");
      else res.end();
    }
  });
  return {
    async listen(){
      await new Promise((resolve,reject)=>{
        server.once("error",reject);
        server.listen(0,"127.0.0.1",()=>{
          server.removeListener("error",reject);resolve();
        });
      });
      actualPort=server.address().port;
      return actualPort;
    },
    get port(){return actualPort;},
    async close(){
      if(!server.listening)return;
      await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
      actualPort=0;
    },
  };
}
