import {useEffect,useRef,useState} from "react";
import {FileJson,FileKey2,ShieldCheck,LockKeyhole,Fingerprint} from "lucide-react";
import {
  deriveHkdfLocally,demonstrateEcdsaP256Locally,demonstrateAadLocally,
  redactStructuredJsonLocally,fingerprintJsonLocally,
} from "@/lib/eternyxLabsAdvancedData.mjs";

const field="w-full min-w-0 rounded-xl border border-border/70 bg-background/80 p-3 font-mono text-xs leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const btn="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const panel="min-w-0 rounded-xl border border-border/70 bg-background/50 p-3";
const note="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm leading-6 text-muted-foreground";
function Facts({entries}:{entries:[string,string|number|boolean][]}){
  return <dl className="grid gap-3 sm:grid-cols-2">{entries.map(([k,v])=>
    <div className={panel} key={k}><dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="mt-1 break-all font-mono text-sm">{typeof v==="boolean"?(v?"Yes":"No"):v}</dd></div>)}</dl>;
}
export default function BrowserAdvancedDataDefense({selected}:{selected:string}){
  const [material,setMaterial]=useState("synthetic-key-material-2026");
  const [salt,setSalt]=useState("");
  const [context,setContext]=useState("eternyx-hkdf-training");
  const [hkdf,setHkdf]=useState<Awaited<ReturnType<typeof deriveHkdfLocally>>|null>(null);
  const [signedMessage,setSignedMessage]=useState("Synthetic signed event");
  const [ecdsa,setEcdsa]=useState<Awaited<ReturnType<typeof demonstrateEcdsaP256Locally>>|null>(null);
  const [message,setMessage]=useState("Synthetic transaction");
  const [aad,setAad]=useState("role=viewer;id=demo");
  const [authenticated,setAuthenticated]=useState<Awaited<ReturnType<typeof demonstrateAadLocally>>|null>(null);
  const [json,setJson]=useState('{"user":"student","api_key":101,"profile":{"refresh_token":202,"notes":"public"}}');
  const [redaction,setRedaction]=useState<ReturnType<typeof redactStructuredJsonLocally>|null>(null);
  const [firstJson,setFirstJson]=useState('{"a":1,"b":{"x":true,"y":2}}');
  const [secondJson,setSecondJson]=useState('{"b":{"y":2,"x":true},"a":1}');
  const [digest,setDigest]=useState<Awaited<ReturnType<typeof fingerprintJsonLocally>>|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const sequence=useRef(0);
  useEffect(()=>{++sequence.current;setBusy(false);setError(null);return()=>{++sequence.current;};},[selected]);
  const change=()=>{++sequence.current;setBusy(false);setError(null);};
  const run=async(fn:()=>Promise<void>)=>{
    const ticket=++sequence.current;setBusy(true);setError(null);
    try{await fn();}catch(e){if(ticket===sequence.current)setError(e instanceof Error?e.message:"Local operation failed.");}
    finally{if(ticket===sequence.current)setBusy(false);}
  };
  const runSync=(fn:()=>void)=>{try{fn();setError(null);}catch(e){setError(e instanceof Error?e.message:"Invalid training input.");}};
  if(!["hkdf","ecdsa","aesaad","jsonmask","jsonhash"].includes(selected))return null;
  return <div className="space-y-5">
    {selected==="hkdf"&&<div className="space-y-4">
      <p className={note}>Actual HKDF-SHA256 extraction and expansion for synthetic key material. Use a generated 16-byte salt or a fixed public training salt for reproducible exercises. Not a password KDF.</p>
      <label htmlFor="labs-hkdf-key" className="block text-sm font-semibold">Synthetic key material (not a password)</label>
      <input id="labs-hkdf-key" type="password" autoComplete="off" maxLength={128} className={field} value={material} onChange={e=>{change();setMaterial(e.target.value);setHkdf(null);}}/>
      <label htmlFor="labs-hkdf-salt" className="block text-sm font-semibold">Optional 16-byte salt (32 hex characters; blank generates fresh)</label>
      <input id="labs-hkdf-salt" spellCheck={false} maxLength={32} className={field} value={salt} onChange={e=>{change();setSalt(e.target.value);setHkdf(null);}}/>
      <label htmlFor="labs-hkdf-context" className="block text-sm font-semibold">Application-specific info/context</label>
      <input id="labs-hkdf-context" maxLength={128} className={field} value={context} onChange={e=>{change();setContext(e.target.value);setHkdf(null);}}/>
      <button type="button" className={btn} disabled={busy} onClick={()=>run(async()=>{
        const ticket=sequence.current;const result=await deriveHkdfLocally(material,{saltHex:salt||null,info:context});
        if(ticket===sequence.current)setHkdf(result);
      })}><LockKeyhole className="h-4 w-4"/>{busy?"Deriving…":"Derive real HKDF-SHA256 bytes"}</button>
      {hkdf&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["Derived bytes",hkdf.derivedBytes],["Context bytes",hkdf.contextBytes],["Key exportable",hkdf.keyExportable],["Requests sent",hkdf.requestsSent]]}/>
        <div className={panel}><p className="text-xs text-muted-foreground">Salt hex</p><code className="break-all text-xs">{hkdf.saltHex}</code></div>
        <div className={panel}><p className="text-xs text-muted-foreground">Derived bytes hex</p><code className="break-all text-xs">{hkdf.derivedHex}</code></div>
        <p className={note}>{hkdf.caveat}</p>
      </div>}
    </div>}
    {selected==="ecdsa"&&<div className="space-y-4">
      <p className={note}>Generate a non-exportable P-256 key pair, sign synthetic UTF-8 text with ECDSA/SHA-256 and verify the original and changed messages. Local training only; no certificate authority.</p>
      <label htmlFor="labs-ecdsa-message" className="block text-sm font-semibold">Synthetic message</label>
      <textarea id="labs-ecdsa-message" rows={4} maxLength={2048} spellCheck={false} className={field} value={signedMessage} onChange={e=>{change();setSignedMessage(e.target.value);setEcdsa(null);}}/>
      <button type="button" className={btn} disabled={busy} onClick={()=>run(async()=>{
        const ticket=sequence.current;const result=await demonstrateEcdsaP256Locally(signedMessage);
        if(ticket===sequence.current)setEcdsa(result);
      })}><FileKey2 className="h-4 w-4"/>{busy?"Signing…":"Sign and verify with real ECDSA"}</button>
      {ecdsa&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["Signature bytes",ecdsa.signatureBytes],["Message bytes",ecdsa.messageBytes],["Original verified",ecdsa.verified],["Changed message rejected",ecdsa.modifiedMessageRejected],["Private key exportable",ecdsa.keyExportable],["Requests sent",ecdsa.requestsSent]]}/>
        <div className={panel}><p className="text-xs text-muted-foreground">Ephemeral raw P-256 signature (hex)</p><code className="break-all text-xs">{ecdsa.signatureHex}</code></div>
        <p className={note}>{ecdsa.caveat}</p>
      </div>}
    </div>}
    {selected==="aesaad"&&<div className="space-y-4">
      <p className={note}>AES-256-GCM authenticates additional context (AAD) without encrypting it. Verify that changing the context or ciphertext rejects decryption. A new key and random nonce are used per run.</p>
      <label htmlFor="labs-aad-message" className="block text-sm font-semibold">Synthetic plaintext</label>
      <textarea id="labs-aad-message" rows={3} maxLength={2048} className={field} value={message} onChange={e=>{change();setMessage(e.target.value);setAuthenticated(null);}}/>
      <label htmlFor="labs-aad-context" className="block text-sm font-semibold">Authenticated context (not secret)</label>
      <textarea id="labs-aad-context" rows={3} maxLength={512} className={field} value={aad} onChange={e=>{change();setAad(e.target.value);setAuthenticated(null);}}/>
      <button type="button" className={btn} disabled={busy} onClick={()=>run(async()=>{
        const ticket=sequence.current;const result=await demonstrateAadLocally(message,aad);
        if(ticket===sequence.current)setAuthenticated(result);
      })}><ShieldCheck className="h-4 w-4"/>{busy?"Authenticating…":"Encrypt and verify context tampering"}</button>
      {authenticated&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["Context bytes",authenticated.aadBytes],["Plaintext bytes",authenticated.plaintextBytes],["Ciphertext + tag bytes",authenticated.ciphertextBytes],["Original authenticated",authenticated.authenticated],["Changed context rejected",authenticated.changedAadRejected],["Ciphertext change rejected",authenticated.changedCiphertextRejected]]}/>
        <div className={panel}><p className="text-xs text-muted-foreground">Random nonce hex</p><code className="break-all text-xs">{authenticated.nonceHex}</code></div>
        <p className={note}>{authenticated.caveat}</p>
      </div>}
    </div>}
    {selected==="jsonmask"&&<div className="space-y-4">
      <p className={note}>Apply bounded key-name redaction to nested synthetic JSON, without uploading data. This cannot find every secret or PII: review any exported or shared result manually.</p>
      <label htmlFor="labs-json-redact" className="block text-sm font-semibold">Synthetic JSON training record</label>
      <textarea id="labs-json-redact" rows={8} maxLength={8192} spellCheck={false} className={field} value={json} onChange={e=>{setJson(e.target.value);setRedaction(null);setError(null);}}/>
      <button type="button" className={btn} onClick={()=>runSync(()=>setRedaction(redactStructuredJsonLocally(json)))}><FileJson className="h-4 w-4"/> Redact structured JSON locally</button>
      {redaction&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["Fields visited",redaction.fieldsVisited],["Sensitive key names masked",redaction.redactedFields],["Nodes inspected",redaction.nodeCount],["Requests sent",redaction.requestsSent]]}/>
        <div className={panel}><p className="mb-2 text-xs text-muted-foreground">Key-masked training JSON (review before sharing)</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs" data-testid="masked-json">{redaction.redactedJson}</pre></div>
        <p className={note}>{redaction.caveat}</p>
      </div>}
    </div>}
    {selected==="jsonhash"&&<div className="space-y-4">
      <p className={note}>Calculate real SHA-256 digests over deterministically sorted-key JSON. Equivalent object key order should hash equally, while changed values do not. Not RFC 8785, signatures or a confidentiality protection.</p>
      <label htmlFor="labs-json-first" className="block text-sm font-semibold">First synthetic JSON</label>
      <textarea id="labs-json-first" rows={5} maxLength={8192} spellCheck={false} className={field} value={firstJson} onChange={e=>{change();setFirstJson(e.target.value);setDigest(null);}}/>
      <label htmlFor="labs-json-second" className="block text-sm font-semibold">Second synthetic JSON</label>
      <textarea id="labs-json-second" rows={5} maxLength={8192} spellCheck={false} className={field} value={secondJson} onChange={e=>{change();setSecondJson(e.target.value);setDigest(null);}}/>
      <button type="button" className={btn} disabled={busy} onClick={()=>run(async()=>{
        const ticket=sequence.current;const result=await fingerprintJsonLocally(firstJson,secondJson);
        if(ticket===sequence.current)setDigest(result);
      })}><Fingerprint className="h-4 w-4"/>{busy?"Hashing…":"Compare genuine SHA-256 digests"}</button>
      {digest&&<div className="space-y-3" aria-live="polite">
        <Facts entries={[["Digests equal",digest.sameDigest],["First canonical UTF-8 bytes",digest.firstBytes],["Second canonical UTF-8 bytes",digest.secondBytes],["Digest bytes",digest.digestBytes],["Requests sent",digest.requestsSent]]}/>
        <div className={panel}><p className="text-xs text-muted-foreground">First SHA-256 hex</p><code className="break-all text-xs">{digest.firstDigest}</code></div>
        <div className={panel}><p className="text-xs text-muted-foreground">Second SHA-256 hex</p><code className="break-all text-xs">{digest.secondDigest}</code></div>
        <p className={note}>{digest.caveat}</p>
      </div>}
    </div>}
    {error&&<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-3 text-sm text-destructive">{error}</p>}
  </div>;
}
