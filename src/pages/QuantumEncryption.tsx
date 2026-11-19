import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, LockKeyhole, ShieldCheck, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LocalEncryptionError, MAX_LOCAL_PLAINTEXT_LENGTH,
  decryptLocalText, encryptLocalText,
} from "@/lib/security/localTextEncryption";

/**
 * Historical /quantum-encryption route retained for existing links.
 * No post-quantum cryptography is implemented or advertised as active.
 */
const QuantumEncryption = () => {
  const [plaintext, setPlaintext] = useState("");
  const [password, setPassword] = useState("");
  const [envelope, setEnvelope] = useState("");
  const [decrypted, setDecrypted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const describe = (failure: unknown): string => {
    if (!(failure instanceof LocalEncryptionError)) return "The browser encryption operation failed.";
    return ({
      unsupported: "Your browser does not support Web Crypto. Use an updated browser over HTTPS.",
      invalid_password: "Use a nonblank password between 12 and 256 characters.",
      invalid_text: "Enter between 1 and 20,000 plaintext characters.",
      invalid_envelope: "Invalid or unsupported encrypted envelope.",
      authentication_failed: "Decryption failed. The password may be incorrect, or the encrypted data was modified.",
    }[failure.code]);
  };

  const encrypt = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setEnvelope("");
    setDecrypted("");
    try {
      const output = await encryptLocalText(plaintext, password);
      setEnvelope(output);
      setNotice("Encrypted locally with AES-256-GCM. Save the envelope and password separately.");
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(false);
    }
  };

  const decrypt = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setDecrypted("");
    try {
      const output = await decryptLocalText(envelope, password);
      setDecrypted(output);
      setNotice("Authenticated decryption completed locally.");
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard. Clipboard history may retain sensitive information.");
      setError(null);
    } catch {
      setError("Clipboard permission was denied. Select the text and copy it manually.");
      setNotice(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/cybersecurity"><ArrowLeft className="mr-2 h-4 w-4" />Cybersecurity Hub</Link>
        </Button>
        <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/50 via-slate-950 to-cyan-950/20 p-7 sm:p-10">
          <div className="flex items-center gap-3 text-violet-200"><LockKeyhole className="h-7 w-7" />BROWSER CRYPTOGRAPHY</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">AES-256-GCM text workbench</h1>
          <p className="mt-4 text-slate-300">Encrypt or decrypt a short text envelope using Web Crypto on your device.</p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">Classical encryption · not post-quantum</Badge>
        </section>
        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            This legacy route previously demonstrated fake quantum encryption using Base64. That simulation has been removed.
            This workbench now uses real AES-256-GCM encryption with PBKDF2-SHA-256 key derivation (210,000 iterations), a random 16-byte salt
            and 12-byte nonce. It is classical encryption, not post-quantum cryptography, a vault, a password manager, or a certified product.
            No plaintext or password is sent to ETERNYX by this tool. Do not rely on it for critical secrets without independent security review.
          </AlertDescription>
        </Alert>
        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Local text encryption</CardTitle>
            <CardDescription className="text-slate-400">No server requests, accounts, logs, or browser storage are used by this tool. Passwords are not recoverable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="crypto-password" className="block space-y-2 text-sm text-slate-300">
              <span>Password · required, 12–256 characters</span>
              <input id="crypto-password" type="password" autoComplete="off" value={password} maxLength={256}
                onChange={e => { setPassword(e.target.value); setDecrypted(""); setError(null); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" />
            </label>
            <label htmlFor="crypto-plaintext" className="block space-y-2 text-sm text-slate-300">
              <span>Plaintext · maximum 20,000 characters</span>
              <textarea id="crypto-plaintext" value={plaintext} maxLength={MAX_LOCAL_PLAINTEXT_LENGTH}
                onChange={e => { setPlaintext(e.target.value); setNotice(null); }}
                rows={5} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" />
            </label>
            <Button type="button" disabled={busy || !plaintext || password.length < 12} onClick={encrypt}>
              <LockKeyhole className="mr-2 h-4 w-4" />{busy ? "Processing locally…" : "Encrypt locally"}
            </Button>
            <label htmlFor="crypto-envelope" className="block space-y-2 text-sm text-slate-300">
              <span>Encrypted JSON envelope · copy or paste for decryption</span>
              <textarea id="crypto-envelope" value={envelope}
                onChange={e => { setEnvelope(e.target.value); setDecrypted(""); setNotice(null); }}
                rows={6} spellCheck={false}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || !envelope || password.length < 12} onClick={decrypt}>
                Decrypt and authenticate locally
              </Button>
              <Button type="button" variant="outline" disabled={!envelope} onClick={() => copy(envelope)}>
                <ClipboardCopy className="mr-2 h-4 w-4" />Copy envelope
              </Button>
            </div>
            {decrypted && (
              <div className="space-y-2">
                <label htmlFor="crypto-decrypted" className="block text-sm text-slate-300">Decrypted plaintext</label>
                <textarea id="crypto-decrypted" readOnly value={decrypted} rows={5}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" />
                <Button type="button" variant="outline" onClick={() => copy(decrypted)}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy plaintext
                </Button>
              </div>
            )}
            {error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
            {notice && <Alert role="status" aria-live="polite"><ShieldCheck className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default QuantumEncryption;
