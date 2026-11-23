import {useEffect,useRef,useState} from "react";
import {Fingerprint,KeyRound,Network,ShieldCheck,MailCheck} from "lucide-react";
import {
  createPkcePairLocally,derivePkceChallengeLocally,
  signHmacLocally,verifyHmacLocally,
  checkCidrMembershipLocally,inspectHstsLocally,inspectDmarcLocally,
} from "@/lib/eternyxLabsIdentity.mjs";

const field="w-full min-w-0 rounded-xl border border-border/70 bg-background/80 p-3 font-mono text-xs leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const action="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 disabled:cursor-not-allowed";
const secondary="inline-flex min-h-11 items-center justify-center rounded-xl border border-border/70 bg-card/80 px-5 py-2.5 text-sm font-semibold transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60";
const notice="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm leading-6 text-muted-foreground";
const card="min-w-0 rounded-xl border border-border/70 bg-background/50 p-3";
type Fact=string|number|boolean|null;
function Facts({entries}:{entries:[string,Fact][]}){
  return <dl className="grid gap-3 sm:grid-cols-2">{entries.map(([key,value])=>
    <div key={key} className={card}><dt className="text-xs text-muted-foreground">{key}</dt>
      <dd className="mt-1 break-all font-mono text-sm">{value===null?"(none)":typeof value==="boolean"?(value?"Yes":"No"):String(value)}</dd></div>
  )}</dl>;
}
function Warnings({items}:{items:string[]}){
  return <div className="space-y-2" aria-live="polite">{items.length
    ?items.map((v,i)=><p key={i} className="rounded-xl border border-destructive/25 bg-destructive/[0.05] p-3 text-sm">{v}</p>)
    :<p className={notice}>No selected heuristic warnings. This is not a production security certification.</p>}</div>;
}
export default function BrowserIdentityDefense({selected}:{selected:string}){
  const [verifier,setVerifier]=useState("DGHVAZPzN7hLwcc_p7XcdQjXc8xMx6x6jVdN-vHcAQM");
  const [pkce,setPkce]=useState<{verifier?:string;challenge:string;method:string;stored:boolean;caveat:string}|null>(null);
  const [hmacMessage,setHmacMessage]=useState("synthetic webhook event");
  const [hmacKey,setHmacKey]=useState("synthetic-local-key-only");
  const [hmacHex,setHmacHex]=useState("");
  const [hmacResult,setHmacResult]=useState<{verified?:boolean;signatureHex?:string;caveat:string}|null>(null);
  const [cidr,setCidr]=useState("2001:db8:abcd::/48");
  const [ip,setIp]=useState("2001:db8:abcd:2::1234");
  const [cidrResult,setCidrResult]=useState<ReturnType<typeof checkCidrMembershipLocally>|null>(null);
  const [hstsInput,setHstsInput]=useState("max-age=31536000; includeSubDomains");
  const [hstsResult,setHstsResult]=useState<ReturnType<typeof inspectHstsLocally>|null>(null);
  const [dmarcInput,setDmarcInput]=useState("v=DMARC1; p=reject; sp=quarantine; rua=mailto:dmarc@example.test; adkim=s; aspf=r");
  const [dmarcResult,setDmarcResult]=useState<ReturnType<typeof inspectDmarcLocally>|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const seq=useRef(0);
  useEffect(()=>{seq.current++;setBusy(false);setError(null);},[selected]);
  const run=(fn:()=>void)=>{try{fn();setError(null);}catch(reason){setError(reason instanceof Error?reason.message:"Invalid local training input.");}};
  const runAsync=async(task:(ticket:number)=>Promise<void>)=>{
    const ticket=++seq.current;
    setError(null);setBusy(true);
    try{await task(ticket);}
    catch(reason){if(ticket===seq.current)setError(reason instanceof Error?reason.message:"Browser crypto operation failed.");}
    finally{if(ticket===seq.current)setBusy(false);}
  };
  const cancel=()=>{seq.current++;setBusy(false);setError(null);};
  if(!["pkce","hmac","cidrcheck","hsts","dmarc"].includes(selected))return null;

  return <div className="space-y-5">
    {selected==="pkce"&&<div className="space-y-4">
      <p className={notice}>Practice OAuth PKCE (RFC 7636) with a real SHA-256 S256 challenge. Generate a fresh secure verifier or derive a challenge from a synthetic 43–128-character verifier. Nothing is stored or sent. Never reuse real OAuth verifier values.</p>
      <label htmlFor="identity-pkce" className="block text-sm font-semibold">Synthetic PKCE verifier</label>
      <textarea id="identity-pkce" className={field} rows={4} maxLength={128} spellCheck={false} value={verifier}
        onChange={e=>{cancel();setVerifier(e.target.value);setPkce(null);}}/>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} className={action} onClick={()=>runAsync(async(ticket)=>{
          const result=await derivePkceChallengeLocally(verifier);
          if(ticket===seq.current)setPkce({...result,verifier:undefined});
        })}><Fingerprint className="h-4 w-4"/> Derive S256 challenge</button>
        <button type="button" disabled={busy} className={secondary} onClick={()=>runAsync(async(ticket)=>{
          const pair=await createPkcePairLocally();
          if(ticket===seq.current){setVerifier(pair.verifier);setPkce(pair);}
        })}>Generate a fresh verifier</button>
      </div>
      {pkce&&<div aria-live="polite" className="space-y-3">
        <Facts entries={[["Method",pkce.method],["Saved to account",pkce.stored]]}/>
        <div className={card}><p className="mb-2 text-xs font-semibold text-muted-foreground">S256 challenge (Base64url SHA-256)</p>
          <code className="break-all text-sm">{pkce.challenge}</code></div>
        <p className={notice}>{pkce.caveat}</p>
      </div>}
    </div>}

    {selected==="hmac"&&<div className="space-y-4">
      <p className={notice}>Practice real HMAC-SHA256 message signing and checking with Web Crypto. Use only synthetic keys, never production secrets. A matching signature proves shared-key integrity, not human identity, replay defense, or webhook origin authenticity.</p>
      <label htmlFor="identity-hmac-message" className="block text-sm font-semibold">Training message</label>
      <textarea id="identity-hmac-message" className={field} rows={4} maxLength={4096} spellCheck={false} value={hmacMessage}
        onChange={e=>{cancel();setHmacMessage(e.target.value);setHmacResult(null);}}/>
      <label htmlFor="identity-hmac-key" className="block text-sm font-semibold">Synthetic signing key (never shown in results)</label>
      <input id="identity-hmac-key" type="password" autoComplete="off" className={field} maxLength={256} value={hmacKey}
        onChange={e=>{cancel();setHmacKey(e.target.value);setHmacResult(null);}}/>
      <label htmlFor="identity-hmac-sig" className="block text-sm font-semibold">Signature in hexadecimal</label>
      <textarea id="identity-hmac-sig" className={field} rows={3} maxLength={64} spellCheck={false} value={hmacHex}
        onChange={e=>{cancel();setHmacHex(e.target.value);setHmacResult(null);}}/>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} className={action} onClick={()=>runAsync(async(ticket)=>{
          const result=await signHmacLocally(hmacMessage,hmacKey);
          if(ticket===seq.current){setHmacHex(result.signatureHex);setHmacResult(result);}
        })}><KeyRound className="h-4 w-4"/> Compute real HMAC</button>
        <button type="button" disabled={busy} className={secondary} onClick={()=>runAsync(async(ticket)=>{
          const result=await verifyHmacLocally(hmacMessage,hmacKey,hmacHex);
          if(ticket===seq.current)setHmacResult(result);
        })}>Verify HMAC locally</button>
      </div>
      {hmacResult&&<div aria-live="polite" className="space-y-3">
        <Facts entries={[["Key exposed by result",false],["Network requests",0],
          ["Integrity verified",hmacResult.verified??null]]}/>
        <p className={notice}>{hmacResult.caveat}</p>
      </div>}
    </div>}

    {selected==="cidrcheck"&&<div className="space-y-4">
      <p className={notice}>Check IPv4 or IPv6 address membership against a CIDR range using exact local mathematics. This does not check a firewall rule, scan addresses, or authorize a connection.</p>
      <label htmlFor="identity-cidr" className="block text-sm font-semibold">IPv4/IPv6 CIDR range</label>
      <input id="identity-cidr" className={field} maxLength={96} spellCheck={false} value={cidr}
        onChange={e=>{setCidr(e.target.value);setCidrResult(null);setError(null);}}/>
      <label htmlFor="identity-ip" className="block text-sm font-semibold">Address to check</label>
      <input id="identity-ip" className={field} maxLength={64} spellCheck={false} value={ip}
        onChange={e=>{setIp(e.target.value);setCidrResult(null);setError(null);}}/>
      <button type="button" className={action} onClick={()=>{setCidrResult(null);run(()=>setCidrResult(checkCidrMembershipLocally(cidr,ip)));}}>
        <Network className="h-4 w-4"/> Check membership locally
      </button>
      {cidrResult&&<div aria-live="polite" className="space-y-3">
        <Facts entries={[["Address family",cidrResult.family],["Prefix","/"+cidrResult.prefix],
          ["Canonical tested address",cidrResult.address],["Network",cidrResult.network],
          ["Last address",cidrResult.rangeEnd],["Address in CIDR",cidrResult.contained],
          ["Actual network probes",cidrResult.probesSent],["ACL enforced",cidrResult.aclEnforced]]}/>
        <p className={notice}>{cidrResult.caveat}</p>
      </div>}
    </div>}

    {selected==="hsts"&&<div className="space-y-4">
      <p className={notice}>Review Strict-Transport-Security policy text locally. Check max-age and includeSubDomains, and see why preload needs independent verification. No live HTTPS site is checked.</p>
      <label htmlFor="identity-hsts" className="block text-sm font-semibold">HSTS header value</label>
      <textarea id="identity-hsts" className={field} rows={4} maxLength={1024} spellCheck={false} value={hstsInput}
        onChange={e=>{setHstsInput(e.target.value);setHstsResult(null);setError(null);}}/>
      <button type="button" className={action} onClick={()=>{setHstsResult(null);run(()=>setHstsResult(inspectHstsLocally(hstsInput)));}}>
        <ShieldCheck className="h-4 w-4"/> Analyze HSTS directives
      </button>
      {hstsResult&&<div aria-live="polite" className="space-y-3">
        <Facts entries={[["max-age seconds",hstsResult.maxAgeSeconds],["includeSubDomains",hstsResult.includeSubDomains],
          ["preload requested",hstsResult.preloadRequested],["Warnings",hstsResult.warningCount],
          ["Preload status verified",hstsResult.preloadStatusVerified]]}/>
        <Warnings items={hstsResult.warnings}/><p className={notice}>{hstsResult.caveat}</p>
      </div>}
    </div>}

    {selected==="dmarc"&&<div className="space-y-4">
      <p className={notice}>Inspect a synthetic DMARC TXT record. Understand enforcement policy, subdomain policy, percentage rollout and alignment. Aggregate-report email addresses are never exposed by the analysis. No DNS or mail is queried.</p>
      <label htmlFor="identity-dmarc" className="block text-sm font-semibold">Synthetic DMARC TXT content</label>
      <textarea id="identity-dmarc" className={field} rows={5} maxLength={2048} spellCheck={false} value={dmarcInput}
        onChange={e=>{setDmarcInput(e.target.value);setDmarcResult(null);setError(null);}}/>
      <button type="button" className={action} onClick={()=>{setDmarcResult(null);run(()=>setDmarcResult(inspectDmarcLocally(dmarcInput)));}}>
        <MailCheck className="h-4 w-4"/> Lint DMARC policy
      </button>
      {dmarcResult&&<div aria-live="polite" className="space-y-3">
        <Facts entries={[["Domain policy",dmarcResult.policy],["Subdomain policy",dmarcResult.subdomainPolicy],
          ["Policy percentage",dmarcResult.percentage],["DKIM alignment",dmarcResult.dkimAlignment],
          ["SPF alignment",dmarcResult.spfAlignment],["Aggregate report endpoints",dmarcResult.aggregateReportCount],
          ["DNS queries",dmarcResult.dnsQueriesSent],["Email authenticated",dmarcResult.emailAuthenticated]]}/>
        <Warnings items={dmarcResult.warnings}/><p className={notice}>{dmarcResult.caveat}</p>
      </div>}
    </div>}
    {error&&<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-3 text-sm text-destructive">{error}</p>}
  </div>;
}
