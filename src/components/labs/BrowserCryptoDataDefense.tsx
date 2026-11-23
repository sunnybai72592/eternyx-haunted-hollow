import {useEffect,useRef,useState} from "react";
import {ShieldCheck,LockKeyhole,Clock3,Globe2,FileSpreadsheet} from "lucide-react";
import {
  derivePbkdf2Locally,demonstrateAesGcmLocally,calculateTotpLocally,
  compareWebOriginsLocally,neutralizeCsvFormulasLocally,
} from "@/lib/eternyxLabsCryptoDefense.mjs";

const field="w-full min-w-0 rounded-xl border border-border/70 bg-background/80 p-3 font-mono text-xs leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const btn="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const callout="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm leading-6 text-muted-foreground";
const resultBox="min-w-0 rounded-xl border border-border/70 bg-background/40 p-3";
const format=(v:string|number|boolean|null)=>v===null?"(not provided)":typeof v==="boolean"?(v?"Yes":"No"):String(v);
function Facts({entries}:{entries:[string,string|number|boolean|null][]}){
  return <dl className="grid gap-3 sm:grid-cols-2">
    {entries.map(([label,value])=><div key={label} className={resultBox}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-mono text-sm">{format(value)}</dd>
    </div>)}
  </dl>;
}
export default function BrowserCryptoDataDefense({selected}:{selected:string}){
  const [password,setPassword]=useState("synthetic-example-only");
  const [iterations,setIterations]=useState(10000);
  const [pbkdf,setPbkdf]=useState<Awaited<ReturnType<typeof derivePbkdf2Locally>>|null>(null);
  const [plaintext,setPlaintext]=useState("Synthetic message; no real secrets");
  const [aes,setAes]=useState<Awaited<ReturnType<typeof demonstrateAesGcmLocally>>|null>(null);
  const [totpSecret,setTotpSecret]=useState("12345678901234567890");
  const [totpTime,setTotpTime]=useState(59);
  const [totpDigits,setTotpDigits]=useState(8);
  const [totp,setTotp]=useState<Awaited<ReturnType<typeof calculateTotpLocally>>|null>(null);
  const [originA,setOriginA]=useState("https://example.test/path?training=redacted");
  const [originB,setOriginB]=useState("https://example.test:443/other");
  const [origins,setOrigins]=useState<ReturnType<typeof compareWebOriginsLocally>|null>(null);
  const [cells,setCells]=useState("=SUM(1,2)\nhello, world\n+100\n\"Quoted\" text");
  const [csv,setCsv]=useState<ReturnType<typeof neutralizeCsvFormulasLocally>|null>(null);
  const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
  const sequence=useRef(0);
  useEffect(()=>{++sequence.current;setBusy(false);setError(null);
    return ()=>{++sequence.current;};
  },[selected]);
  const reset=()=>{++sequence.current;setBusy(false);setError(null);};
  const local=(fn:()=>void)=>{try{fn();setError(null);}
    catch(e){setError(e instanceof Error?e.message:"Invalid local training input.");}};
  const asynchronous=async(fn:()=>Promise<void>)=>{
    const ticket=++sequence.current;
    setError(null);setBusy(true);
    try{await fn();}
    catch(e){if(ticket===sequence.current)setError(e instanceof Error?e.message:"Web Crypto is unavailable.");}
    finally{if(ticket===sequence.current)setBusy(false);}
  };
  if(!["pbkdf2","aesgcm","totp","origins","csvsafe"].includes(selected))return null;
  return <div className="space-y-5">
    {selected==="pbkdf2"&&<div className="space-y-4">
      <p className={callout}>Real PBKDF2-HMAC-SHA256 derives 32 bytes from a synthetic example passphrase using a fresh 16-byte salt. It does not authenticate anyone or create a safe production password database. Never enter your real password.</p>
      <label htmlFor="labs-pbkdf2-secret" className="block text-sm font-semibold">Synthetic training passphrase</label>
      <input id="labs-pbkdf2-secret" className={field} type="password" autoComplete="off"
        maxLength={128} value={password} onChange={e=>{reset();setPassword(e.target.value);setPbkdf(null);}}/>
      <label htmlFor="labs-pbkdf2-iterations" className="block text-sm font-semibold">PBKDF2 iterations (1,000–150,000)</label>
      <input id="labs-pbkdf2-iterations" className={field} type="number" min={1000} max={150000} step={1000}
        value={iterations} onChange={e=>{reset();setIterations(Number(e.target.value));setPbkdf(null);}}/>
      <button type="button" className={btn} disabled={busy} onClick={()=>asynchronous(async()=>{
        const ticket=sequence.current;
        const result=await derivePbkdf2Locally(password,{iterations});
        if(ticket===sequence.current)setPbkdf(result);
      })}><LockKeyhole className="h-4 w-4"/>{busy?"Deriving locally…":"Derive real PBKDF2 bytes"}</button>
      {pbkdf&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["Iterations",pbkdf.iterations],["Derived bytes",pbkdf.derivedBytes],
          ["Saved to account",pbkdf.passwordSaved],["Requests sent",pbkdf.requestsSent]]}/>
        <div className={resultBox}><p className="mb-2 text-xs text-muted-foreground">Fresh salt (hex)</p><code className="break-all text-xs">{pbkdf.saltHex}</code></div>
        <div className={resultBox}><p className="mb-2 text-xs text-muted-foreground">Derived training bytes (hex)</p><code className="break-all text-xs">{pbkdf.derivedHex}</code></div>
        <p className={callout}>{pbkdf.caveat}</p>
      </div>}
    </div>}
    {selected==="aesgcm"&&<div className="space-y-4">
      <p className={callout}>Run a genuine Web Crypto AES-256-GCM encrypt/decrypt roundtrip, then deliberately modify the ciphertext to check authentication failure. A fresh non-exportable key and nonce are used for one click only and are not saved. Synthetic text only.</p>
      <label htmlFor="labs-aes-input" className="block text-sm font-semibold">Synthetic plaintext</label>
      <textarea id="labs-aes-input" rows={5} maxLength={2048} className={field} spellCheck={false}
        value={plaintext} onChange={e=>{reset();setPlaintext(e.target.value);setAes(null);}}/>
      <button type="button" className={btn} disabled={busy} onClick={()=>asynchronous(async()=>{
        const ticket=sequence.current;
        const result=await demonstrateAesGcmLocally(plaintext);
        if(ticket===sequence.current)setAes(result);
      })}><ShieldCheck className="h-4 w-4"/>{busy?"Testing locally…":"Encrypt, decrypt and test tampering"}</button>
      {aes&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["Plaintext bytes",aes.messageBytes],["Ciphertext + tag bytes",aes.ciphertextBytes],
          ["AES-GCM tag bits",aes.authenticationTagBits],["Decrypted correctly",aes.decryptedSuccessfully],
          ["Modified ciphertext rejected",aes.tamperingRejected],["Key exportable",aes.keyExportable],
          ["Requests sent",aes.requestsSent]]}/>
        <div className={resultBox}><p className="mb-2 text-xs text-muted-foreground">Fresh random 96-bit nonce (hex)</p><code className="break-all text-xs">{aes.nonceHex}</code></div>
        <div className={resultBox}><p className="mb-2 text-xs text-muted-foreground">Real AES-GCM ciphertext and authentication tag (hex)</p><code className="break-all text-xs">{aes.ciphertextHex}</code></div>
        <p className={callout}>{aes.caveat}</p>
      </div>}
    </div>}
    {selected==="totp"&&<div className="space-y-4">
      <p className={callout}>Calculate a real RFC 6238 TOTP from a synthetic ASCII test secret and an explicit Unix timestamp. Uses HMAC-SHA1 as specified by the common TOTP profile. Do not enter a real authenticator seed or use this tool to enroll an account.</p>
      <label htmlFor="labs-totp-secret" className="block text-sm font-semibold">Synthetic test secret</label>
      <input id="labs-totp-secret" className={field} type="password" autoComplete="off" maxLength={128}
        value={totpSecret} onChange={e=>{reset();setTotpSecret(e.target.value);setTotp(null);}}/>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="labs-totp-seconds" className="mb-2 block text-sm font-semibold">Unix timestamp (seconds)</label>
          <input id="labs-totp-seconds" className={field} type="number" min={0} max={4102444800} step={1}
            value={totpTime} onChange={e=>{reset();setTotpTime(Number(e.target.value));setTotp(null);}}/></div>
        <div><label htmlFor="labs-totp-digits" className="mb-2 block text-sm font-semibold">Code digits</label>
          <select id="labs-totp-digits" className={field} value={totpDigits}
            onChange={e=>{reset();setTotpDigits(Number(e.target.value));setTotp(null);}}>
            <option value={6}>6 digits</option><option value={8}>8 digits</option>
          </select></div>
      </div>
      <button type="button" className={btn} disabled={busy} onClick={()=>asynchronous(async()=>{
        const ticket=sequence.current;
        const result=await calculateTotpLocally(totpSecret,{epochSeconds:totpTime,digits:totpDigits});
        if(ticket===sequence.current)setTotp(result);
      })}><Clock3 className="h-4 w-4"/>{busy?"Calculating locally…":"Compute real TOTP"}</button>
      {totp&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["Time counter",totp.counter],["Step seconds",totp.period],
          ["Remaining seconds in step",totp.secondsRemaining],["Digits",totp.digits],
          ["Secret saved",totp.secretSaved],["Requests sent",totp.requestsSent]]}/>
        <div className={resultBox}><p className="mb-2 text-xs text-muted-foreground">Actual RFC-style one-time code for training input</p>
          <code className="break-all text-xl font-semibold" data-testid="totp-code">{totp.code}</code></div>
        <p className={callout}>{totp.caveat}</p>
      </div>}
    </div>}
    {selected==="origins"&&<div className="space-y-4">
      <p className={callout}>Compare real browser URL origins: scheme + normalized hostname + effective port. No URLs are visited, DNS is not resolved, and query values or embedded credentials are never echoed. This is not a CORS, same-site cookie or SSRF authorization decision.</p>
      <label htmlFor="labs-origin-first" className="block text-sm font-semibold">First absolute HTTP(S) URL</label>
      <input id="labs-origin-first" className={field} maxLength={2048} spellCheck={false}
        value={originA} onChange={e=>{setOriginA(e.target.value);setOrigins(null);setError(null);}}/>
      <label htmlFor="labs-origin-second" className="block text-sm font-semibold">Second absolute HTTP(S) URL</label>
      <input id="labs-origin-second" className={field} maxLength={2048} spellCheck={false}
        value={originB} onChange={e=>{setOriginB(e.target.value);setOrigins(null);setError(null);}}/>
      <button type="button" className={btn} onClick={()=>{setOrigins(null);local(()=>setOrigins(compareWebOriginsLocally(originA,originB)));}}>
        <Globe2 className="h-4 w-4"/> Compare origins locally
      </button>
      {origins&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["First origin",origins.firstOrigin],["Second origin",origins.secondOrigin],
          ["Same origin",origins.sameOrigin],["Same hostname",origins.sameHostname],
          ["Scheme differs",origins.schemeDiffers],["Port differs",origins.portDiffers],
          ["URLs visited",origins.requestsSent],["DNS queries sent",origins.dnsQueriesSent]]}/>
        {origins.warnings.map((w,i)=><p className={callout} key={i}>{w}</p>)}
        <p className={callout}>{origins.caveat}</p>
      </div>}
    </div>}
    {selected==="csvsafe"&&<div className="space-y-4">
      <p className={callout}>Create a quoted, single-column CSV from synthetic cell values. Leading spreadsheet formula triggers are prefixed with an apostrophe. No spreadsheet file is written, and every target application needs independent import validation.</p>
      <label htmlFor="labs-csv-input" className="block text-sm font-semibold">Training cells (one cell per line, up to 30)</label>
      <textarea id="labs-csv-input" className={field} rows={7} maxLength={4096} spellCheck={false}
        value={cells} onChange={e=>{setCells(e.target.value);setCsv(null);setError(null);}}/>
      <button type="button" className={btn} onClick={()=>{setCsv(null);local(()=>setCsv(neutralizeCsvFormulasLocally(cells)));}}>
        <FileSpreadsheet className="h-4 w-4"/> Generate neutralized CSV text
      </button>
      {csv&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["Cells",csv.cellCount],["Formula-like cells prefixed",csv.neutralized],
          ["CSV row delimiter",csv.rowsDelimitedBy],["Files written",csv.filesWritten],
          ["Requests sent",csv.requestsSent]]}/>
        <div className={resultBox}><p className="mb-2 text-xs text-muted-foreground">Quoted single-column CSV output</p>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all font-mono text-xs" data-testid="safe-csv">{csv.csv}</pre></div>
        <p className={callout}>{csv.caveat}</p>
      </div>}
    </div>}
    {error&&<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-3 text-sm text-destructive">{error}</p>}
  </div>;
}
