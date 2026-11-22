/**
 * Minimal local-only relay between the Docker host's 127.0.0.1 gateway
 * port and the authenticated gateway on a separate INTERNAL bridge.
 *
 * This relay is intentionally not an authentication system: the internal
 * managed gateway checks each private bearer. Never expose it publicly.
 * The origin and path are fixed in source; user input cannot choose a URL.
 */
import { createServer } from "node:http";

const internalGateway = "http://gateway:8081";
const routes = new Set([
  "/", "/healthz", "/api/rooms", "/api/tickets", "/api/files",
  "/api/ops/report", "/api/verify",
]);
const methods = new Set(["GET", "POST"]);
const security = Object.freeze({
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});
function reply(res,status,error){
  res.writeHead(status,{...security,"content-type":"application/json; charset=utf-8"});
  res.end(JSON.stringify({error}));
}

export function createLocalRelay({ fetchGateway = fetch } = {}){
  if(typeof fetchGateway !== "function") throw Error("Invalid managed relay transport");
  return createServer(async(req,res)=>{
    try {
      const hostname = req.headers.host ?? "";
      if(!/^(localhost|127\.0\.0\.1):[1-9][0-9]{0,4}$/.test(hostname)){
        return reply(res,421,"Loopback Host required");
      }
      if(!methods.has(req.method)) return reply(res,405,"Unsupported request method");
      if(!req.url || !req.url.startsWith("/") || req.url.startsWith("//") ||
        req.url.includes("\\") || req.url.length > 1024) {
        return reply(res,400,"Invalid lab path");
      }
      const destination = new URL(req.url,internalGateway);
      if(destination.origin !== internalGateway || !routes.has(destination.pathname)){
        return reply(res,404,"Unknown lab resource");
      }
      if(req.method === "POST" && destination.pathname !== "/api/verify"){
        return reply(res,405,"Unsupported POST route");
      }
      const auth = req.headers.authorization;
      if(typeof auth !== "string" || !/^Bearer [0-9a-f]{64}$/.test(auth)){
        return reply(res,401,"Managed gateway authorization required");
      }
      const headers = {"authorization":auth};
      for(const key of ["content-type","x-lab-role"]){
        const value = req.headers[key];
        if(typeof value === "string" && value.length <= 120) headers[key] = value;
      }
      let body;
      if(req.method === "POST"){
        let count=0;
        const chunks=[];
        for await(const chunk of req){
          count+=chunk.length;
          if(count > 1024) return reply(res,413,"Request too large");
          chunks.push(chunk);
        }
        body=Buffer.concat(chunks);
      }
      const response=await fetchGateway(destination,{
        method:req.method, headers, redirect:"manual",
        ...(req.method==="POST"?{body}:{}),
        signal:AbortSignal.timeout(3500),
      });
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>32768)return reply(res,502,"Gateway response too large");
      const safe={...security};
      const type=response.headers.get("content-type");
      if(type && type.length <=120)safe["content-type"]=type;
      res.writeHead(response.status,safe);
      res.end(bytes);
    }catch {
      if(!res.headersSent)reply(res,503,"Internal lab gateway unavailable");
      else res.end();
    }
  });
}

// Do not start a public service when imported for local contract tests.
if(process.argv[1] && import.meta.url === new URL("file://"+process.argv[1]).href){
  const port=Number(process.env.PORT || "8081");
  if(port!==8081)throw Error("Managed relay must listen on exact internal port");
  const server=createLocalRelay();
  server.listen(8081,"0.0.0.0",()=>{
    console.log("ETHERNYX localhost-only relay ready");
  });
  const lifetime=Number(process.env.RANGE_MAX_AGE_SECONDS||"0");
  if(!Number.isInteger(lifetime)||lifetime!==900)throw Error("Invalid relay lifetime");
  setTimeout(()=>server.close(()=>process.exit(0)),900000).unref();
}
