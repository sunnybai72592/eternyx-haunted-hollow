import { useEffect, useState } from "react";
import { Calculator, ShieldCheck, Network, Cookie, LockKeyhole } from "lucide-react";
import {
  calculateIpv4Subnet, simulateUnixUmask, lintCspPolicy,
  evaluateCorsHeaderExample, reviewSetCookieExample,
} from "@/lib/eternyxLabsFoundations.mjs";

const input = "w-full min-w-0 rounded-xl border border-border/70 bg-background/80 px-3 py-3 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const primary = "inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const resultBox = "min-w-0 rounded-xl border border-border/70 bg-background/50 p-4";
const notice = "rounded-xl border border-primary/15 bg-primary/[0.05] p-3 text-sm leading-6 text-muted-foreground";

function Facts({ rows }: { rows: [string,string | number | boolean][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([name,value]) => (
        <div key={name} className={resultBox}>
          <dt className="text-xs text-muted-foreground">{name}</dt>
          <dd className="mt-1 break-all font-mono text-sm">{typeof value==="boolean"?(value?"Yes":"No"):value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Findings({ warnings }: { warnings: string[] }) {
  return (
    <div aria-live="polite" className="space-y-2">
      {warnings.length===0
        ? <p className="rounded-xl border border-primary/25 p-3 text-sm">No configured heuristic warnings; not a security certification.</p>
        : warnings.map((msg,index)=><p key={index} className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-3 text-sm">{msg}</p>)}
    </div>
  );
}
export default function BrowserSecurityFoundations({ selected }: { selected: string }) {
  const [cidr,setCidr]=useState("192.168.10.42/24");
  const [subnet,setSubnet]=useState<ReturnType<typeof calculateIpv4Subnet> | null>(null);
  const [requested,setRequested]=useState("0777");
  const [umask,setUmask]=useState("0027");
  const [unix,setUnix]=useState<ReturnType<typeof simulateUnixUmask> | null>(null);
  const [policy,setPolicy]=useState("default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const [csp,setCsp]=useState<ReturnType<typeof lintCspPolicy> | null>(null);
  const [requester,setRequester]=useState("https://app.example.org");
  const [resource,setResource]=useState("https://api.example.org");
  const [headers,setHeaders]=useState("Access-Control-Allow-Origin: https://app.example.org\nAccess-Control-Allow-Credentials: true");
  const [credentials,setCredentials]=useState(true);
  const [cors,setCors]=useState<ReturnType<typeof evaluateCorsHeaderExample> | null>(null);
  const [cookie,setCookie]=useState("Set-Cookie: __Host-training=sample; Path=/; Secure; HttpOnly; SameSite=Lax");
  const [cookieResult,setCookieResult]=useState<ReturnType<typeof reviewSetCookieExample> | null>(null);
  const [error,setError]=useState<string | null>(null);
  useEffect(()=>{setError(null);},[selected]);
  const run=(task:()=>void)=>{
    try{task();setError(null);}
    catch(e){setError(e instanceof Error?e.message:"Invalid local training input.");}
  };
  if(!["subnet","chmod","csp","cors","cookie"].includes(selected))return null;
  return (
    <div className="space-y-5">
      {selected==="subnet"&&(
        <div className="space-y-5">
          <p className={notice}>Calculate IPv4 network, broadcast, mask and host range from CIDR notation. This is local mathematics, not network discovery or a connectivity test.</p>
          <label htmlFor="foundation-cidr" className="block text-sm font-semibold">IPv4 CIDR</label>
          <input id="foundation-cidr" className={input} maxLength={64} spellCheck={false} value={cidr} onChange={e=>{setCidr(e.target.value);setSubnet(null);setError(null);}}/>
          <button type="button" className={primary} onClick={()=>run(()=>setSubnet(calculateIpv4Subnet(cidr)))}><Network className="h-4 w-4"/> Calculate subnet</button>
          {subnet&&<div aria-live="polite" className="space-y-4">
            <Facts rows={[
              ["Network",subnet.network],["Broadcast",subnet.broadcast],
              ["Subnet mask",subnet.mask],["Wildcard mask",subnet.wildcard],
              ["First assignable",subnet.first],["Last assignable",subnet.last],
              ["Addresses in block",subnet.addressCount],["Conventional usable",subnet.usableCount],
            ]}/>
            <p className={notice}>{subnet.caveat} Network requests: {subnet.networkRequests}.</p>
          </div>}
        </div>
      )}
      {selected==="chmod"&&(
        <div className="space-y-5">
          <p className={notice}>Understand UNIX octal permissions and umask, without changing any files. Models ordinary read/write/execute bits only, not ACLs or special mode bits.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="foundation-request" className="mb-2 block text-sm font-semibold">Requested octal mode</label><input id="foundation-request" className={input} maxLength={4} value={requested} onChange={e=>{setRequested(e.target.value);setUnix(null);setError(null);}}/></div>
            <div><label htmlFor="foundation-umask" className="mb-2 block text-sm font-semibold">umask</label><input id="foundation-umask" className={input} maxLength={4} value={umask} onChange={e=>{setUmask(e.target.value);setUnix(null);setError(null);}}/></div>
          </div>
          <button type="button" className={primary} onClick={()=>run(()=>setUnix(simulateUnixUmask(requested,umask)))}><Calculator className="h-4 w-4"/> Simulate creation mode</button>
          {unix&&<div aria-live="polite" className="space-y-4">
            <Facts rows={[
              ["Requested",unix.requested],["umask",unix.umask],
              ["Resulting mode",unix.resultingMode],
              ["Owner",unix.owner],["Group",unix.group],["Others",unix.other],
            ]}/>
            <p className={notice}>{unix.caveat}</p>
          </div>}
        </div>
      )}
      {selected==="csp"&&(
        <div className="space-y-5">
          <p className={notice}>Lint a pasted Content-Security-Policy. Highlights common risky choices and missing directives; browser enforcement, multiple policies, nonce behavior and actual exploitability require separate verification.</p>
          <label htmlFor="foundation-csp" className="block text-sm font-semibold">CSP directives (no header prefix)</label>
          <textarea id="foundation-csp" className={input} rows={6} maxLength={4096} spellCheck={false} value={policy} onChange={e=>{setPolicy(e.target.value);setCsp(null);setError(null);}} />
          <button type="button" className={primary} onClick={()=>run(()=>setCsp(lintCspPolicy(policy)))}><ShieldCheck className="h-4 w-4"/> Lint policy locally</button>
          {csp&&<div aria-live="polite" className="space-y-4">
            <Facts rows={[["Distinct directives",csp.directiveCount],["Heuristic findings",csp.warningCount],["Security certified",csp.securityCertified]]}/>
            <p className="break-all text-xs text-muted-foreground">Directive names: {csp.names.join(", ")}</p>
            <Findings warnings={csp.warnings}/>
            <p className={notice}>{csp.caveat}</p>
          </div>}
        </div>
      )}
      {selected==="cors"&&(
        <div className="space-y-5">
          <p className={notice}>Simulate the browser's basic cross-origin response-sharing decision from pasted headers. No request is sent. This does not check preflights, authorization, redirects or method restrictions.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="foundation-request-origin" className="mb-2 block text-sm font-semibold">Requesting origin</label><input id="foundation-request-origin" className={input} maxLength={512} value={requester} onChange={e=>{setRequester(e.target.value);setCors(null);setError(null);}}/></div>
            <div><label htmlFor="foundation-resource-origin" className="mb-2 block text-sm font-semibold">Resource origin</label><input id="foundation-resource-origin" className={input} maxLength={512} value={resource} onChange={e=>{setResource(e.target.value);setCors(null);setError(null);}}/></div>
          </div>
          <label htmlFor="foundation-cors-headers" className="block text-sm font-semibold">Response headers (paste only)</label>
          <textarea id="foundation-cors-headers" className={input} rows={5} maxLength={4096} spellCheck={false} value={headers} onChange={e=>{setHeaders(e.target.value);setCors(null);setError(null);}}/>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={credentials} onChange={e=>{setCredentials(e.target.checked);setCors(null);setError(null);}}/> Credentials included in request?</label>
          <button type="button" className={primary} onClick={()=>run(()=>setCors(evaluateCorsHeaderExample({requestOrigin:requester,resourceOrigin:resource,headers,credentials})))}><ShieldCheck className="h-4 w-4"/> Simulate CORS response</button>
          {cors&&<div aria-live="polite" className="space-y-4">
            <Facts rows={[["Cross-origin",cors.crossOrigin],["Simplified response readable",cors.readAllowed],["Network requests",cors.networkRequests],["Preflight verified",cors.preflightVerified],["Server authorization verified",cors.authorizationVerified]]}/>
            <p className={notice}>{cors.reason}</p><Findings warnings={cors.warnings}/>
          </div>}
        </div>
      )}
      {selected==="cookie"&&(
        <div className="space-y-5">
          <p className={notice}>Inspect a synthetic Set-Cookie header locally. Values are not shown in the analysis. The browser is not asked to set or send the cookie. Do not paste real session cookies.</p>
          <label htmlFor="foundation-cookie" className="block text-sm font-semibold">One Set-Cookie header</label>
          <textarea id="foundation-cookie" className={input} rows={4} maxLength={4096} spellCheck={false} value={cookie} onChange={e=>{setCookie(e.target.value);setCookieResult(null);setError(null);}}/>
          <button type="button" className={primary} onClick={()=>run(()=>setCookieResult(reviewSetCookieExample(cookie)))}><Cookie className="h-4 w-4"/> Inspect attributes</button>
          {cookieResult&&<div aria-live="polite" className="space-y-4">
            <Facts rows={[["Cookie name",cookieResult.cookieName],["Secure",cookieResult.secure],["HttpOnly",cookieResult.httpOnly],["SameSite",cookieResult.sameSite],["Path=/",cookieResult.rootPath],["Domain attribute",cookieResult.domainSpecified],["Value displayed",cookieResult.cookieValueShown],["Live cookie set",cookieResult.liveCookieSet]]}/>
            <Findings warnings={cookieResult.warnings}/>
            <p className={notice}>These are static configuration hints, not verification of browser behavior or server-side session controls.</p>
          </div>}
        </div>
      )}
      {error&&<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
