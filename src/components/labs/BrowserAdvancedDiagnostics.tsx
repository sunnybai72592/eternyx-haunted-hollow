import {useEffect,useRef,useState} from "react";
import {Calculator,FileCode2,ShieldCheck,Clock3,KeyRound} from "lucide-react";
import {
  calculateIpv6SubnetLocally,inspectCachePolicyLocally,inspectSpfRecordLocally,
  simulateTokenBucketLocally,generateSriLocally,
} from "@/lib/eternyxLabsAdvanced.mjs";

const field="w-full min-w-0 rounded-xl border border-border/70 bg-background/80 px-3 py-3 font-mono text-xs leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const btn="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60";
const secondary="rounded-xl border border-primary/15 bg-primary/[0.05] p-3 text-sm leading-6 text-muted-foreground";
const card="min-w-0 rounded-xl border border-border/70 bg-background/40 p-3";
const txt=(value:string|number|boolean|null|undefined)=>value==null?"(not specified)":typeof value==="boolean"?(value?"Yes":"No"):String(value);
function Facts({rows}:{rows:[string,string|number|boolean|null|undefined][]}){
  return <dl className="grid gap-3 sm:grid-cols-2">{rows.map(([label,value])=>
    <div className={card} key={label}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-mono text-sm">{txt(value)}</dd>
    </div>
  )}</dl>;
}
function Warnings({items}:{items:string[]}){
  return <div aria-live="polite" className="space-y-2">
    {items.length===0?<p className={secondary}>No selected heuristic warnings, not a security certification.</p>:
      items.map((warning,i)=><p key={i} className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-3 text-sm" role="status">{warning}</p>)}
  </div>;
}
export default function BrowserAdvancedDiagnostics({selected}:{selected:string}){
  const [ipv6,setIpv6]=useState("2001:db8:abcd:2::1234/64");
  const [ipResult,setIpResult]=useState<ReturnType<typeof calculateIpv6SubnetLocally>|null>(null);
  const [cache,setCache]=useState("private, no-store, max-age=0");
  const [sensitive,setSensitive]=useState(true);
  const [cacheResult,setCacheResult]=useState<ReturnType<typeof inspectCachePolicyLocally>|null>(null);
  const [spf,setSpf]=useState("v=spf1 ip4:192.0.2.0/24 include:_spf.example.test -all");
  const [spfResult,setSpfResult]=useState<ReturnType<typeof inspectSpfRecordLocally>|null>(null);
  const [capacity,setCapacity]=useState(3),[refill,setRefill]=useState(1);
  const [times,setTimes]=useState("0,0,0,0,1,2,3");
  const [rateResult,setRateResult]=useState<ReturnType<typeof simulateTokenBucketLocally>|null>(null);
  const [sriText,setSriText]=useState("console.log('synthetic training resource');");
  const [sriAlg,setSriAlg]=useState("sha384");
  const [sriResult,setSriResult]=useState<Awaited<ReturnType<typeof generateSriLocally>>|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const generation=useRef(0);
  useEffect(()=>{setError(null);},[selected]);
  const run=(fn:()=>void)=>{
    try{fn();setError(null);}
    catch(e){setError(e instanceof Error?e.message:"Invalid local training input.");}
  };
  const hash=async()=>{
    const ticket=++generation.current;
    setBusy(true);setError(null);setSriResult(null);
    try{
      const result=await generateSriLocally(sriText,{algorithm:sriAlg});
      if(ticket===generation.current)setSriResult(result);
    }catch(e){
      if(ticket===generation.current)setError(e instanceof Error?e.message:"Local integrity calculation failed.");
    }finally{if(ticket===generation.current)setBusy(false);}
  };
  if(!["ipv6","cache","spf","ratelimit","sri"].includes(selected))return null;
  return <div className="space-y-5">
    {selected==="ipv6"&&<div className="space-y-4">
      <p className={secondary}>IPv6 CIDR subnet math using genuine 128-bit integers, not 32-bit approximations. No ping, DNS, remote connection, or claim that every address is assignable.</p>
      <label htmlFor="adv-ipv6" className="block text-sm font-semibold">IPv6 address/prefix</label>
      <input id="adv-ipv6" className={field} maxLength={96} spellCheck={false} value={ipv6}
        onChange={e=>{setIpv6(e.target.value);setIpResult(null);setError(null);}}/>
      <button className={btn} type="button" onClick={()=>{setIpResult(null);run(()=>setIpResult(calculateIpv6SubnetLocally(ipv6)));}}>
        <Calculator className="h-4 w-4"/> Calculate IPv6 subnet
      </button>
      {ipResult&&<div aria-live="polite" className="space-y-3">
        <Facts rows={[["Normalized address",ipResult.address],["Prefix","/"+ipResult.prefix],
          ["Network",ipResult.network],["Range end",ipResult.last],
          ["Addresses in range",ipResult.addressCount],["Network calls",ipResult.requestsSent]]}/>
        <p className={secondary}>{ipResult.caveat}</p>
      </div>}
    </div>}
    {selected==="cache"&&<div className="space-y-4">
      <p className={secondary}>Inspect a pasted Cache-Control policy without requesting content. Heuristics cover no-store, private/public cache hints, max-age, duplicate/conflicting directives, and confidential-response handling.</p>
      <label htmlFor="adv-cache" className="block text-sm font-semibold">Cache-Control header value</label>
      <textarea id="adv-cache" className={field} rows={4} maxLength={2048} spellCheck={false} value={cache}
        onChange={e=>{setCache(e.target.value);setCacheResult(null);setError(null);}}/>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={sensitive}
        onChange={e=>{setSensitive(e.target.checked);setCacheResult(null);setError(null);}}/>
        Assume the example response contains sensitive data
      </label>
      <button className={btn} type="button" onClick={()=>{setCacheResult(null);run(()=>setCacheResult(inspectCachePolicyLocally(cache,{sensitive})));}}>
        <ShieldCheck className="h-4 w-4"/> Review cache policy
      </button>
      {cacheResult&&<div aria-live="polite" className="space-y-3">
        <Facts rows={[["Directives",cacheResult.directiveCount],
          ["no-store",cacheResult.noStore],["Public caching",cacheResult.publicCachingRequested],
          ["Private caching",cacheResult.privateCachingRequested],
          ["Revalidation requested",cacheResult.requiresRevalidation],
          ["max-age seconds",cacheResult.maxAgeSeconds],
          ["Warnings",cacheResult.warningCount]]}/>
        <p className="break-all font-mono text-xs text-muted-foreground">Directive names: {cacheResult.directiveNames.join(", ")}</p>
        <Warnings items={cacheResult.warnings}/>
        <p className={secondary}>{cacheResult.caveat}</p>
      </div>}
    </div>}
    {selected==="spf"&&<div className="space-y-4">
      <p className={secondary}>Learn simplified SPF TXT syntax and potential over-permission or DNS-lookup budget issues. No DNS queries are made; this never authorizes a real email sender.</p>
      <label htmlFor="adv-spf" className="block text-sm font-semibold">Synthetic SPF record text</label>
      <textarea id="adv-spf" className={field} rows={5} maxLength={2048} spellCheck={false} value={spf}
        onChange={e=>{setSpf(e.target.value);setSpfResult(null);setError(null);}}/>
      <button className={btn} type="button" onClick={()=>{setSpfResult(null);run(()=>setSpfResult(inspectSpfRecordLocally(spf)));}}>
        <FileCode2 className="h-4 w-4"/> Lint SPF locally
      </button>
      {spfResult&&<div aria-live="polite" className="space-y-3">
        <Facts rows={[["Mechanisms",spfResult.mechanismCount],["DNS lookup terms",spfResult.lookupProducingTerms],
          ["all mechanisms",spfResult.allMechanisms],["Warnings",spfResult.warningCount],
          ["DNS queries sent",spfResult.dnsQueriesSent],["Sender authorized",spfResult.senderAuthorized]]}/>
        <p className="break-all font-mono text-xs text-muted-foreground">Types: {spfResult.mechanismNames.join(", ")}</p>
        <Warnings items={spfResult.warnings}/>
        <p className={secondary}>{spfResult.caveat}</p>
      </div>}
    </div>}
    {selected==="ratelimit"&&<div className="space-y-4">
      <p className={secondary}>Simulate an integer-second token bucket using real capacity/refill math, but do not configure or test any server. Requests occur only in the mathematical model.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="adv-capacity" className="mb-2 block text-sm font-semibold">Bucket capacity (1–100)</label>
          <input id="adv-capacity" type="number" min={1} max={100} step={1} className={field} value={capacity}
            onChange={e=>{setCapacity(Number(e.target.value));setRateResult(null);setError(null);}}/></div>
        <div><label htmlFor="adv-refill" className="mb-2 block text-sm font-semibold">Refill tokens/second (1–20)</label>
          <input id="adv-refill" type="number" min={1} max={20} step={1} className={field} value={refill}
            onChange={e=>{setRefill(Number(e.target.value));setRateResult(null);setError(null);}}/></div>
      </div>
      <label htmlFor="adv-times" className="block text-sm font-semibold">Request seconds, comma-separated (0–3600)</label>
      <textarea id="adv-times" className={field} rows={3} maxLength={512} spellCheck={false} value={times}
        onChange={e=>{setTimes(e.target.value);setRateResult(null);setError(null);}}/>
      <button className={btn} type="button" onClick={()=>{setRateResult(null);run(()=>setRateResult(simulateTokenBucketLocally({capacity,refillPerSecond:refill,timestamps:times})));}}>
        <Clock3 className="h-4 w-4"/> Simulate local requests
      </button>
      {rateResult&&<div aria-live="polite" className="space-y-3">
        <Facts rows={[["Simulated requests",rateResult.requests],["Allowed",rateResult.allowed],
          ["Denied",rateResult.denied],["Remaining tokens",rateResult.finalTokens],
          ["Actual network calls",rateResult.requestsSent],["Real API enforcement",rateResult.serverRateLimitEnforced]]}/>
        <div className="max-h-64 overflow-auto rounded-xl border border-border/70 bg-background/60 p-4">
          <table className="w-full text-left text-xs"><thead><tr><th className="pb-2">Second</th><th className="pb-2">Decision</th><th className="pb-2">Tokens left</th></tr></thead>
            <tbody>{rateResult.records.map((r,i)=><tr key={i} className="border-t border-border/50"><td className="py-2">{r.second}</td><td className="py-2">{r.allowed?"Allowed":"Denied"}</td><td className="py-2">{r.tokensRemaining}</td></tr>)}</tbody>
          </table>
        </div><p className={secondary}>{rateResult.caveat}</p>
      </div>}
    </div>}
    {selected==="sri"&&<div className="space-y-4">
      <p className={secondary}>Generate a real cryptographic Subresource Integrity attribute for the exact UTF-8 training text, using browser Web Crypto. No resource is fetched, no integrity attribute is deployed, and publisher identity is not verified. Avoid pasting secrets.</p>
      <label htmlFor="adv-sri" className="block text-sm font-semibold">Synthetic resource content (UTF-8)</label>
      <textarea id="adv-sri" className={field} rows={5} maxLength={4096} spellCheck={false} value={sriText}
        onChange={e=>{++generation.current;setSriText(e.target.value);setSriResult(null);setBusy(false);setError(null);}}/>
      <label htmlFor="adv-sri-alg" className="block text-sm font-semibold">Integrity hash algorithm</label>
      <select id="adv-sri-alg" className={field} value={sriAlg}
        onChange={e=>{++generation.current;setSriAlg(e.target.value);setSriResult(null);setBusy(false);setError(null);}}>
        <option value="sha256">SHA-256</option><option value="sha384">SHA-384</option><option value="sha512">SHA-512</option>
      </select>
      <button className={btn} type="button" disabled={busy} onClick={hash}>
        <KeyRound className="h-4 w-4"/>{busy?"Calculating locally…":"Generate SRI attribute"}
      </button>
      {sriResult&&<div aria-live="polite" className="space-y-3">
        <Facts rows={[["Algorithm",sriResult.algorithm],["Input bytes",sriResult.byteCount],
          ["Requests sent",sriResult.requestsSent],["Source fetched",sriResult.resourceFetched]]}/>
        <div className={card}><p className="mb-2 text-xs text-muted-foreground">Real SHA digest, base64 encoded</p>
          <code className="break-all text-xs">{sriResult.integrity}</code></div>
        <p className={secondary}>{sriResult.caveat}</p>
      </div>}
    </div>}
    {error&&<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-3 text-sm text-destructive">{error}</p>}
  </div>;
}
