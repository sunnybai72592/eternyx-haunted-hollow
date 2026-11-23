import { useEffect, useState } from "react";
import { Activity, FileCode2, Fingerprint, Network, ShieldCheck, Zap } from "lucide-react";
import {
  inspectDnsZoneLocally,inspectHttpRequestLocally,inspectSecurityTxtLocally,
  correlateSecurityEventsLocally,generateLocalRandomToken,
} from "@/lib/eternyxLabsOperations.mjs";

const box="rounded-xl border border-border/70 bg-background/50 p-4";
const field="w-full min-w-0 rounded-xl border border-border/70 bg-background/80 p-3 font-mono text-xs leading-6 outline-none focus-visible:ring-2 focus-visible:ring-primary";
const button="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const notice="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm leading-6 text-muted-foreground";
const sampleZone=[
  "example.test. 300 IN A 192.0.2.10",
  "alias.example.test. 300 IN CNAME example.test.",
  "example.test. 300 IN MX 10 mail.example.test.",
  "_dmarc.example.test. 300 IN TXT \"v=DMARC1; p=none\"",
].join("\n");
const sampleHttp="POST /training HTTP/1.1\nHost: example.test\nContent-Type: application/json\nContent-Length: 2\n\n{}";
const sampleSecurity="Contact: mailto:security@example.test\nExpires: 2030-01-01T00:00:00Z\nCanonical: https://example.test/.well-known/security.txt";
const sampleEvents=[
  "2026-11-23T10:00:00Z|WARN|login-failed",
  "2026-11-23T10:03:00Z|WARN|login-failed",
  "2026-11-23T10:04:00Z|WARN|login-failed",
  "2026-11-23T10:08:00Z|INFO|login-success",
].join("\n");

function Rows({values}:{values:[string,string|number|boolean][]}){
  return <dl className="grid gap-3 sm:grid-cols-2">
    {values.map(([k,v])=><div key={k} className={box}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="mt-1 break-all font-mono text-sm">{typeof v==="boolean"?(v?"Yes":"No"):v}</dd>
    </div>)}
  </dl>;
}
function Warnings({warnings}:{warnings:string[]}){
  return <div className="space-y-2" aria-live="polite">
    {warnings.length===0?<p className={notice}>No flagged heuristics. This does not certify the source or service as secure.</p>:
      warnings.map((w,i)=><p key={i} className="rounded-xl border border-destructive/25 bg-destructive/[0.05] p-3 text-sm">{w}</p>)}
  </div>;
}
export default function BrowserDefensiveOperations({selected}:{selected:string}){
  const [dnsInput,setDnsInput]=useState(sampleZone);
  const [dns,setDns]=useState<ReturnType<typeof inspectDnsZoneLocally>|null>(null);
  const [httpInput,setHttpInput]=useState(sampleHttp);
  const [http,setHttp]=useState<ReturnType<typeof inspectHttpRequestLocally>|null>(null);
  const [securityInput,setSecurityInput]=useState(sampleSecurity);
  const [security,setSecurity]=useState<ReturnType<typeof inspectSecurityTxtLocally>|null>(null);
  const [eventInput,setEventInput]=useState(sampleEvents);
  const [events,setEvents]=useState<ReturnType<typeof correlateSecurityEventsLocally>|null>(null);
  const [token,setToken]=useState<ReturnType<typeof generateLocalRandomToken>|null>(null);
  const [tokenBytes,setTokenBytes]=useState(32);
  const [tokenFormat,setTokenFormat]=useState<"hex"|"base64url">("hex");
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>setError(null),[selected]);
  const run=(action:()=>void)=>{
    try{action();setError(null);}
    catch(e){setError(e instanceof Error?e.message:"Invalid local exercise input.");}
  };
  if(!["dns","http","securitytxt","events","tokens"].includes(selected))return null;
  return <div className="space-y-5">
    {selected==="dns"&&<div className="space-y-4">
      <p className={notice}>Paste synthetic A, CNAME, MX and TXT zone records. This checks limited syntax and CNAME conflicts only. No DNS queries, DNSSEC verification or zone publishing.</p>
      <label htmlFor="ops-dns" className="block text-sm font-semibold">Training DNS zone records</label>
      <textarea id="ops-dns" rows={7} maxLength={8192} spellCheck={false} className={field}
        value={dnsInput} onChange={e=>{setDnsInput(e.target.value);setDns(null);setError(null);}}/>
      <button type="button" className={button} onClick={()=>{setDns(null);run(()=>setDns(inspectDnsZoneLocally(dnsInput)));}}>
        <Network className="h-4 w-4"/> Check DNS record syntax
      </button>
      {dns&&<div aria-live="polite" className="space-y-4">
        <Rows values={[["Records",dns.recordCount],["Owner names",dns.distinctOwners],
          ["A records",dns.counts.A],["CNAME records",dns.counts.CNAME],
          ["MX records",dns.counts.MX],["TXT records",dns.counts.TXT],
          ["Queries sent",dns.queriesSent]]}/>
        <Warnings warnings={dns.warnings}/><p className={notice}>{dns.caveat}</p>
      </div>}
    </div>}

    {selected==="http"&&<div className="space-y-4">
      <p className={notice}>Review a synthetic HTTP/1.x request locally. Detect selected request-framing ambiguities and missing Host headers. Sensitive header values and URL paths are not printed in results. No request is transmitted.</p>
      <label htmlFor="ops-http" className="block text-sm font-semibold">Raw HTTP/1.x training request</label>
      <textarea id="ops-http" rows={8} maxLength={8192} spellCheck={false} className={field}
        value={httpInput} onChange={e=>{setHttpInput(e.target.value);setHttp(null);setError(null);}}/>
      <button type="button" className={button} onClick={()=>{setHttp(null);run(()=>setHttp(inspectHttpRequestLocally(httpInput)));}}>
        <FileCode2 className="h-4 w-4"/> Analyze request framing
      </button>
      {http&&<div aria-live="polite" className="space-y-4">
        <Rows values={[["Method",http.method],["HTTP version",http.version],
          ["Headers",http.headerCount],["UTF-8 body bytes",http.bodyBytes],
          ["Content-Length fields",http.contentLengthHeaders],
          ["Transfer-Encoding fields",http.transferEncodingHeaders],
          ["Query present",http.targetHasQuery],["Requests sent",http.requestsSent]]}/>
        <Warnings warnings={http.warnings}/><p className={notice}>{http.caveat}</p>
      </div>}
    </div>}

    {selected==="securitytxt"&&<div className="space-y-4">
      <p className={notice}>Review security.txt disclosure metadata without visiting the website or contacting the listed security team. Contacts are counted, not echoed. This does not authenticate domain ownership.</p>
      <label htmlFor="ops-securitytxt" className="block text-sm font-semibold">Synthetic security.txt content</label>
      <textarea id="ops-securitytxt" rows={7} maxLength={8192} spellCheck={false} className={field}
        value={securityInput} onChange={e=>{setSecurityInput(e.target.value);setSecurity(null);setError(null);}}/>
      <button type="button" className={button} onClick={()=>{setSecurity(null);run(()=>setSecurity(inspectSecurityTxtLocally(securityInput)));}}>
        <ShieldCheck className="h-4 w-4"/> Review disclosure file
      </button>
      {security&&<div aria-live="polite" className="space-y-4">
        <Rows values={[["Contact fields",security.contactCount],["Expires (UTC)",security.expiresAt||"(missing/invalid)"],
          ["Warnings",security.warningCount],["Requests sent",security.requestsSent]]}/>
        <p className="break-all text-xs text-muted-foreground">Field names: {security.fields.join(", ")||"(none)"}</p>
        <Warnings warnings={security.warnings}/><p className={notice}>{security.caveat}</p>
      </div>}
    </div>}

    {selected==="events"&&<div className="space-y-4">
      <p className={notice}>Correlate synthetic timestamp|severity|event records only. This detects a simple three-failed-logins/10-minute pattern and summarizes counts; it cannot identify attackers or confirm an incident. No logs are uploaded.</p>
      <label htmlFor="ops-events" className="block text-sm font-semibold">Synthetic event timeline (one event per line)</label>
      <textarea id="ops-events" rows={8} maxLength={8192} spellCheck={false} className={field}
        value={eventInput} onChange={e=>{setEventInput(e.target.value);setEvents(null);setError(null);}}/>
      <button type="button" className={button} onClick={()=>{setEvents(null);run(()=>setEvents(correlateSecurityEventsLocally(eventInput)));}}>
        <Activity className="h-4 w-4"/> Correlate events locally
      </button>
      {events&&<div aria-live="polite" className="space-y-4">
        <Rows values={[["Events",events.eventCount],["INFO",events.levels.INFO],["WARN",events.levels.WARN],
          ["ERROR",events.levels.ERROR],["First event",events.firstAt],["Last event",events.lastAt],
          ["Three-failure windows",events.threeFailureWindows],["Repeated failure pattern",events.repeatedFailuresObserved],
          ["Logs uploaded",events.logsUploaded]]}/>
        <p className={notice}>{events.caveat}</p>
      </div>}
    </div>}

    {selected==="tokens"&&<div className="space-y-4">
      <p className={notice}>Use real Web Crypto randomness to generate a locally displayed token. It is never saved, sent or synced. Treat the result as sensitive, and do not share it in a chat or use a public demo as a credential manager.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="ops-bytes" className="mb-2 block text-sm font-semibold">Random byte length</label>
          <select id="ops-bytes" className={field} value={tokenBytes} onChange={e=>{setTokenBytes(Number(e.target.value));setToken(null);setError(null);}}>
            <option value={16}>16 bytes</option><option value={24}>24 bytes</option><option value={32}>32 bytes</option><option value={48}>48 bytes</option>
          </select></div>
        <div><label htmlFor="ops-format" className="mb-2 block text-sm font-semibold">Encoding</label>
          <select id="ops-format" className={field} value={tokenFormat} onChange={e=>{setTokenFormat(e.target.value as "hex"|"base64url");setToken(null);setError(null);}}>
            <option value="hex">Hexadecimal</option><option value="base64url">Base64url</option>
          </select></div>
      </div>
      <button type="button" className={button} onClick={()=>{setToken(null);run(()=>setToken(generateLocalRandomToken({bytes:tokenBytes,format:tokenFormat})));}}>
        <Zap className="h-4 w-4"/> Generate fresh random token
      </button>
      {token&&<div aria-live="polite" className="space-y-3">
        <Rows values={[["Random bytes",token.byteCount],["Source bits",token.randomBits],
          ["Stored",token.storageUsed],["Requests sent",token.requestsSent]]}/>
        <div className={box}>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Sensitive token — protect this value</p>
          <code className="break-all text-sm" data-testid="generated-token">{token.token}</code>
        </div>
        <p className={notice}>{token.caveat}</p>
      </div>}
    </div>}
    {error&&<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-3 text-sm text-destructive">{error}</p>}
  </div>;
}
