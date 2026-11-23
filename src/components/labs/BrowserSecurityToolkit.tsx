import { useEffect, useRef, useState } from "react";
import { Binary, FileKey2, Fingerprint, Link2, ScanText } from "lucide-react";
import {
  encodeTextLocally, decodeTextLocally, inspectUrlLocally,
  inspectJwtStructureLocally, redactTrainingLogLocally, hashTextLocally,
  sampleTrainingJwt,
} from "@/lib/eternyxLabsUtilities.mjs";

const inputClass = "w-full rounded-xl border border-border/70 bg-background/80 px-3 py-3 font-mono text-xs leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const primaryClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60";
const secondaryClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-border/70 bg-card/80 px-5 py-2.5 text-sm font-semibold transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const resultClass = "whitespace-pre-wrap break-all rounded-xl border border-border/70 bg-background/50 p-4 font-mono text-xs leading-6";
const noticeClass = "rounded-xl border border-primary/15 bg-primary/[0.05] p-3 text-sm leading-6 text-muted-foreground";

export default function BrowserSecurityToolkit({ selected }: { selected: string }) {
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("Hello, ETERNYX! 🌍");
  const [encoded, setEncoded] = useState<ReturnType<typeof encodeTextLocally> | null>(null);
  const [encodedInput, setEncodedInput] = useState("SGVsbG8sIEVURVJOWVgh");
  const [format, setFormat] = useState<"base64" | "hex">("base64");
  const [decoded, setDecoded] = useState<ReturnType<typeof decodeTextLocally> | null>(null);
  const [urlInput, setUrlInput] = useState("https://example.org/demo?topic=labs&topic=security#overview");
  const [urlResult, setUrlResult] = useState<ReturnType<typeof inspectUrlLocally> | null>(null);
  const [jwtInput, setJwtInput] = useState(sampleTrainingJwt);
  const [jwtResult, setJwtResult] = useState<ReturnType<typeof inspectJwtStructureLocally> | null>(null);
  const [logInput, setLogInput] = useState([
    "Authorization: Bearer synthetic-training-token",
    "Cookie: session=demo-only",
    "API_KEY=example-not-a-real-secret",
    "status=200",
  ].join("\n"));
  const [logResult, setLogResult] = useState<ReturnType<typeof redactTrainingLogLocally> | null>(null);
  const [hashInput, setHashInput] = useState("ETERNYX Labs");
  const [hashResult, setHashResult] = useState<Awaited<ReturnType<typeof hashTextLocally>> | null>(null);
  const [hashBusy, setHashBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => { setError(null); }, [selected]);

  const run = (operation: () => void) => {
    try { operation(); setError(null); }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check the local training input.");
    }
  };
  const compute = async () => {
    const ticket = ++generation.current;
    setHashBusy(true);
    setHashResult(null);
    setError(null);
    try {
      const output = await hashTextLocally(hashInput);
      if (generation.current === ticket) setHashResult(output);
    } catch (reason) {
      if (generation.current === ticket) {
        setError(reason instanceof Error ? reason.message : "Local digest calculation failed.");
      }
    } finally {
      if (generation.current === ticket) setHashBusy(false);
    }
  };
  if (!["codec", "urls", "jwt", "redact", "sha"].includes(selected)) return null;

  return (
    <div className="space-y-5">
      {selected === "codec" && (
        <div className="space-y-5">
          <p className={noticeClass}>Base64 and hexadecimal are reversible encodings, not encryption. All processing occurs in your browser and no input is uploaded or saved.</p>
          <div>
            <label htmlFor="lab-encode-input" className="mb-2 block text-sm font-semibold">Text to encode (UTF-8)</label>
            <textarea id="lab-encode-input" className={inputClass} rows={4} maxLength={4096} spellCheck={false} value={text}
              onChange={event => { setText(event.target.value); setEncoded(null); setError(null); }} />
          </div>
          <button type="button" className={primaryClass} onClick={() => { setEncoded(null); run(() => setEncoded(encodeTextLocally(text))); }}>
            <Binary className="h-4 w-4" /> Encode locally
          </button>
          {encoded && (
            <div aria-live="polite" className="space-y-3">
              <p className="text-xs text-muted-foreground">{encoded.byteCount} UTF-8 bytes · reversible encoding</p>
              <div><h3 className="mb-2 text-sm font-semibold">Base64</h3><pre className={resultClass}>{encoded.base64 || "(empty)"}</pre></div>
              <div><h3 className="mb-2 text-sm font-semibold">Hexadecimal</h3><pre className={resultClass}>{encoded.hex || "(empty)"}</pre></div>
            </div>
          )}
          <div className="space-y-3 border-t border-border/70 pt-5">
            <h3 className="text-sm font-semibold">Decode UTF-8 from Base64 or hex</h3>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
              <div><label htmlFor="lab-decode-input" className="sr-only">Encoded text</label><input id="lab-decode-input" className={inputClass} maxLength={8192} spellCheck={false} value={encodedInput}
                onChange={event => { setEncodedInput(event.target.value); setDecoded(null); setError(null); }} /></div>
              <div><label htmlFor="lab-decode-format" className="sr-only">Encoding</label><select id="lab-decode-format" className={inputClass} value={format}
                onChange={event => { setFormat(event.target.value as "base64" | "hex"); setDecoded(null); setError(null); }}>
                <option value="base64">Base64</option><option value="hex">Hex</option>
              </select></div>
            </div>
            <button type="button" className={secondaryClass} onClick={() => { setDecoded(null); run(() => setDecoded(decodeTextLocally(encodedInput,format))); }}>Decode locally</button>
            {decoded && <div aria-live="polite"><p className="mb-2 text-xs text-muted-foreground">{decoded.byteCount} decoded bytes</p><pre className={resultClass}>{decoded.text || "(empty)"}</pre></div>}
          </div>
        </div>
      )}

      {selected === "urls" && (
        <div className="space-y-5">
          <p className={noticeClass}>Parse a complete HTTP(S) URL without visiting it. No DNS lookups, requests or redirects. Query values and embedded credentials are not displayed.</p>
          <div><label htmlFor="lab-url" className="mb-2 block text-sm font-semibold">URL to inspect</label>
            <input id="lab-url" className={inputClass} type="text" spellCheck={false} maxLength={2048} value={urlInput}
              onChange={event => { setUrlInput(event.target.value); setUrlResult(null); setError(null); }} />
          </div>
          <button type="button" className={primaryClass} onClick={() => { setUrlResult(null); run(() => setUrlResult(inspectUrlLocally(urlInput))); }}>
            <Link2 className="h-4 w-4" /> Inspect URL locally
          </button>
          {urlResult && (
            <div aria-live="polite" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Protocol",urlResult.scheme],["Hostname",urlResult.host],["Port",urlResult.port],
                  ["Path segments",String(urlResult.pathSegments)],["Query parameters",String(urlResult.queryParameters)],
                  ["Fragment",urlResult.fragmentPresent ? "Present" : "Absent"],
                ].map(([label,value]) => <div key={label} className="rounded-xl border border-border/70 bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all font-mono text-sm">{value}</p>
                </div>)}
              </div>
              <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                <h3 className="text-sm font-semibold">Query field names (values hidden)</h3>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{urlResult.queryKeys.join(", ") || "(none)"}{urlResult.moreQueryKeys ? " · remaining keys hidden" : ""}</p>
              </div>
              {urlResult.warnings.map((warning,index) => <p key={index} className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-3 text-sm">{warning}</p>)}
              <p className="text-xs text-muted-foreground">Network requests sent: {urlResult.requestsSent}. This parser does not certify a website as safe.</p>
            </div>
          )}
        </div>
      )}

      {selected === "jwt" && (
        <div className="space-y-5">
          <p className={noticeClass}>Inspect JWT structure only. The signature, issuer, audience and authorization are <strong>never verified</strong>. Do not paste real bearer tokens; the starter token is synthetic and unsigned.</p>
          <div><label htmlFor="lab-jwt" className="mb-2 block text-sm font-semibold">Three-part JWT</label>
            <textarea id="lab-jwt" className={inputClass} rows={4} spellCheck={false} maxLength={8192} value={jwtInput}
              onChange={event => { setJwtInput(event.target.value); setJwtResult(null); setError(null); }} />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primaryClass} onClick={() => { setJwtResult(null); run(() => setJwtResult(inspectJwtStructureLocally(jwtInput))); }}>
              <FileKey2 className="h-4 w-4" /> Inspect structure
            </button>
            <button type="button" className={secondaryClass} onClick={() => { setJwtInput(sampleTrainingJwt); setJwtResult(null); setError(null); }}>Restore synthetic example</button>
          </div>
          {jwtResult && (
            <div aria-live="polite" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Header algorithm",jwtResult.algorithm],["Header type",jwtResult.type],
                  ["Expiry field",jwtResult.expiresAt || "(missing or invalid)"],
                  ["Issuer and audience field presence",(jwtResult.hasIssuer ? "iss present" : "iss absent") + " · " + (jwtResult.hasAudience ? "aud present" : "aud absent")],
                ].map(([label,value]) => <div key={label} className="rounded-xl border border-border/70 bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm">{value}</p>
                </div>)}
              </div>
              <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                <h3 className="text-sm font-semibold">Claim names (values hidden)</h3>
                <p className="mt-2 break-all font-mono text-xs">{jwtResult.claimNames.join(", ") || "(none)"}{jwtResult.claimsTruncated ? " (additional names hidden)" : ""}</p>
              </div>
              {jwtResult.warnings.map((warning,index) => <p key={index} className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-3 text-sm">{warning}</p>)}
              <p className="text-xs font-semibold text-destructive">Signature verified: No · Authorization verified: No</p>
            </div>
          )}
        </div>
      )}

      {selected === "redact" && (
        <div className="space-y-5">
          <p className={noticeClass}>Practice with synthetic logs only. These pattern-based rules recognize common authorization headers, cookies and credential key/value fields; they cannot guarantee removal of every secret. Inspect all output manually before sharing.</p>
          <div><label htmlFor="lab-redact" className="mb-2 block text-sm font-semibold">Local log snippet</label>
            <textarea id="lab-redact" className={inputClass} rows={7} spellCheck={false} maxLength={4096} value={logInput}
              onChange={event => { setLogInput(event.target.value); setLogResult(null); setError(null); }} />
          </div>
          <button type="button" className={primaryClass} onClick={() => { setLogResult(null); run(() => setLogResult(redactTrainingLogLocally(logInput))); }}>
            <ScanText className="h-4 w-4" /> Redact locally
          </button>
          {logResult && <div aria-live="polite" className="space-y-3">
            <p className="text-xs text-muted-foreground">{logResult.replacements} pattern replacement(s) · no upload · not exhaustive</p>
            <pre className={resultClass + " max-h-80 overflow-auto"}>{logResult.redactedText || "(empty)"}</pre>
          </div>}
        </div>
      )}

      {selected === "sha" && (
        <div className="space-y-5">
          <p className={noticeClass}>Compute SHA-256 locally using browser Web Crypto. A digest is a text fingerprint, not encryption, origin authentication or proof that a file is safe. No input is uploaded.</p>
          <div><label htmlFor="lab-sha" className="mb-2 block text-sm font-semibold">Text to fingerprint</label>
            <textarea id="lab-sha" className={inputClass} rows={4} spellCheck={false} maxLength={4096} value={hashInput}
              onChange={event => { ++generation.current; setHashInput(event.target.value); setHashResult(null); setHashBusy(false); setError(null); }} />
          </div>
          <button type="button" disabled={hashBusy} className={primaryClass} onClick={compute}>
            <Fingerprint className="h-4 w-4" /> {hashBusy ? "Computing locally…" : "Compute SHA-256"}
          </button>
          {hashResult && <div aria-live="polite" className="space-y-2 rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
            <p className="text-xs text-muted-foreground">{hashResult.algorithm} · {hashResult.byteCount} UTF-8 bytes · no upload</p>
            <p className="break-all font-mono text-sm">{hashResult.hex}</p>
          </div>}
        </div>
      )}
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
