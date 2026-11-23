import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FileCheck2, FileSearch, Fingerprint, Loader2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  HANDOFF_MAX_BYTES, parseHandoffManifest, createEvidenceHandoff,
  verifyEvidenceHandoff,verifyLocalEvidenceAgainstHandoff,
} from "@/lib/securityEvidenceHandoff.mjs";

type Manifest = ReturnType<typeof parseHandoffManifest>;
type Packet = Awaited<ReturnType<typeof createEvidenceHandoff>>;
type Verified = Awaited<ReturnType<typeof verifyEvidenceHandoff>>;
type ComparedFile = Awaited<ReturnType<typeof verifyLocalEvidenceAgainstHandoff>>;
const maxLocalFile=20*1024*1024;
const sevenDays=()=>new Date(Date.now()+7*86400000).toISOString().slice(0,10);

function downloadPacket(packet: Packet) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)+"\n"],{
    type:"application/json;charset=utf-8",
  }));
  const link=document.createElement("a");
  link.href=url;link.download="eternyx-private-evidence-handoff.json";link.click();
  URL.revokeObjectURL(url);
}

export default function SecurityEvidenceHandoff() {
  const [source,setSource]=useState<Manifest|null>(null);
  const [packet,setPacket]=useState<Packet|null>(null);
  const [recipient,setRecipient]=useState("");
  const [sender,setSender]=useState("");
  const [purpose,setPurpose]=useState("");
  const [expiry,setExpiry]=useState(sevenDays);
  const [verified,setVerified]=useState<Verified|null>(null);
  const [rawPacket,setRawPacket]=useState("");
  const [expectedChecksum,setExpectedChecksum]=useState("");
  const [evidenceId,setEvidenceId]=useState("");
  const [fileMatch,setFileMatch]=useState<ComparedFile|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const taskToken=useRef(0);

  const manifestFromFile=async(file?:File)=>{
    setSource(null);setPacket(null);setError("");setNotice("");
    if(!file)return;
    if(file.size<1||file.size>HANDOFF_MAX_BYTES){setError("Provenance manifest must be at most 128 KiB.");return;}
    const token=++taskToken.current;setBusy(true);
    try{
      const parsed=parseHandoffManifest(await file.text());
      if(token!==taskToken.current)return;
      setSource(parsed);
      setNotice(parsed.totalHashed+" locally observed evidence digests loaded. No private files were uploaded.");
    }catch(e){if(token===taskToken.current)setError(e instanceof Error?e.message:"Manifest import failed.");}
    finally{if(token===taskToken.current)setBusy(false);}
  };

  const create=async()=>{
    if(!source||busy)return;
    const token=++taskToken.current;setBusy(true);setError("");setNotice("");setPacket(null);
    try{
      const created=await createEvidenceHandoff(source,{
        handoffId:crypto.randomUUID(),senderLabel:sender,recipientLabel:recipient,purpose,
        expiresAt:new Date(expiry+"T23:59:00.000Z").toISOString(),
      });
      if(token!==taskToken.current)return;
      setPacket(created);
      setNotice("Local unsigned handoff packet generated. Share only through an independently authorized channel.");
    }catch(e){if(token===taskToken.current)setError(e instanceof Error?e.message:"Handoff generation failed.");}
    finally{if(token===taskToken.current)setBusy(false);}
  };

  const importPacket=async(file?:File)=>{
    ++taskToken.current;setVerified(null);setRawPacket("");setFileMatch(null);setEvidenceId("");
    setError("");setNotice("");
    if(!file)return;
    if(file.size<1||file.size>HANDOFF_MAX_BYTES){setError("Handoff file must be at most 128 KiB.");return;}
    const token=taskToken.current;setBusy(true);
    try{
      const raw=await file.text();if(token!==taskToken.current)return;
      setRawPacket(raw);setNotice("Handoff file loaded locally; select Verify to recompute the checksum.");
    }catch(e){if(token===taskToken.current)setError(e instanceof Error?e.message:"Could not read handoff file.");}
    finally{if(token===taskToken.current)setBusy(false);}
  };

  const review=async()=>{
    if(!rawPacket||busy)return;
    const token=++taskToken.current;setBusy(true);setError("");setNotice("");
    setVerified(null);setFileMatch(null);
    try{
      const result=await verifyEvidenceHandoff(rawPacket,{expectedChecksum:expectedChecksum.trim()||null});
      if(token!==taskToken.current)return;
      setVerified(result);
      if(result.externalChecksumMatched===false){
        setError("Packet checksum is internally valid, but does NOT match the checksum supplied separately. Do not accept this handoff.");
      }else{
        setNotice(result.externalChecksumMatched===true?
          "Packet matches the separately supplied checksum. Sender identity and evidence origin remain unverified.":
          "Packet internal checksum matches. No independently supplied checksum was checked.");
      }
    }catch(e){if(token===taskToken.current)setError(e instanceof Error?e.message:"Handoff verification failed.");}
    finally{if(token===taskToken.current)setBusy(false);}
  };

  const compareFile=async(file?:File)=>{
    setFileMatch(null);setError("");
    if(!file||!verified||verified.externalChecksumMatched===false||!evidenceId)return;
    if(file.size<1||file.size>maxLocalFile){setError("Evidence file must be between 1 byte and 20 MiB.");return;}
    const token=++taskToken.current;setBusy(true);
    try{
      const checked=await verifyLocalEvidenceAgainstHandoff(verified,evidenceId,await file.arrayBuffer());
      if(token!==taskToken.current)return;
      setFileMatch(checked);
      setNotice(checked.match?"Evidence bytes match their locally recorded packet digest.":"Evidence file does not match the packet hash.");
    }catch(e){if(token===taskToken.current)setError(e instanceof Error?e.message:"Local byte comparison failed.");}
    finally{if(token===taskToken.current)setBusy(false);}
  };

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
    <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4"/>Cybersecurity Hub</Link>
    <header className="rounded-3xl border border-cyan-300/25 bg-card p-7">
      <div className="flex items-center gap-2 text-cyan-200"><FileCheck2 className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-widest">Cybersecurity Universe · Wave 9</span></div>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Evidence Handoff & Offline Verification</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">Package metadata-only SHA-256 observations for an authorized reviewer. Verify imported handoff content and compare independently supplied evidence files entirely in this browser; no files are uploaded by this screen.</p>
      <Link to="/cybersecurity/evidence-provenance" className="mt-3 inline-block text-sm text-cyan-300 underline">Open private provenance and export a manifest</Link>
    </header>
    {error && <div role="alert" className="rounded-xl border border-rose-400/40 p-4 text-sm text-rose-200">{error}</div>}
    {notice && <div role="status" aria-live="polite" className="rounded-xl border border-cyan-300/25 p-4 text-sm text-cyan-200">{notice}</div>}
    <Card><CardHeader><CardTitle>1. Prepare a metadata-only handoff</CardTitle>
      <CardDescription>Start with a Wave 8 provenance manifest. A packet includes pseudonymous evidence IDs, hashes and dates only—never file contents, private storage URLs or object paths.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><Label htmlFor="handoff-source">Private provenance manifest JSON (max 128 KiB)</Label>
          <Input id="handoff-source" type="file" accept=".json,application/json" disabled={busy} onChange={(e)=>void manifestFromFile(e.target.files?.[0])}/>
        </div>
        {source && <p className="text-sm text-cyan-200">{source.totalHashed} observed digests · {source.investigationReferences.length} traced investigations · version {source.schema}</p>}
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="handoff-recipient">Reviewer reference</Label><Input id="handoff-recipient" maxLength={120} value={recipient} onChange={(e)=>setRecipient(e.target.value)} placeholder="Team or approved recipient reference"/></div>
          <div className="space-y-2"><Label htmlFor="handoff-sender">Sender reference (optional, unverified)</Label><Input id="handoff-sender" maxLength={120} value={sender} onChange={(e)=>setSender(e.target.value)}/></div>
          <div className="space-y-2"><Label htmlFor="handoff-expiry">Expiration date (UTC, max 30 days)</Label><Input id="handoff-expiry" type="date" value={expiry} onChange={(e)=>setExpiry(e.target.value)}/></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="handoff-purpose">Purpose and review instructions</Label><Textarea id="handoff-purpose" maxLength={500} value={purpose} onChange={(e)=>setPurpose(e.target.value)} placeholder="What should the reviewer reconcile and why?"/></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button disabled={!source||busy||recipient.trim().length<2||purpose.trim().length<12} onClick={()=>void create()}>
          {busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Fingerprint className="mr-2 h-4 w-4"/>}Create local handoff packet
        </Button><Button variant="outline" disabled={!packet||busy} onClick={()=>packet&&downloadPacket(packet)}><Download className="mr-2 h-4 w-4"/>Download packet JSON</Button></div>
        {packet && <div className="rounded-xl border border-border bg-background p-4 text-xs"><p className="font-semibold">Packet SHA-256 — transmit through a separate trusted channel</p><p className="mt-2 break-all font-mono">{packet.checksum.hex}</p><p className="mt-2 text-muted-foreground">This digest detects changes to packet contents; it does not authenticate the sender or transfer private evidence files.</p></div>}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>2. Verify a received packet locally</CardTitle>
      <CardDescription>Import a packet and recompute its canonical SHA-256; optionally enter the digest received via a separate channel to compare. No Supabase access or network calls are made here.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><Label htmlFor="handoff-import">Received handoff packet JSON</Label><Input id="handoff-import" type="file" accept=".json,application/json" disabled={busy} onChange={(e)=>void importPacket(e.target.files?.[0])}/></div>
        <div className="space-y-2"><Label htmlFor="handoff-expected-hash">Expected SHA-256 from independently trusted channel (optional)</Label>
          <Input id="handoff-expected-hash" maxLength={64} value={expectedChecksum} onChange={(e)=>{setExpectedChecksum(e.target.value.trim().toLowerCase());setVerified(null);setFileMatch(null);}} placeholder="Exactly 64 hexadecimal characters"/></div>
        <Button variant="outline" disabled={!rawPacket||busy} onClick={()=>void review()}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileSearch className="mr-2 h-4 w-4"/>}Verify packet consistency and expiry</Button>
        {verified && <div className="rounded-xl border border-border bg-background p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">{verified.externalChecksumMatched===false?<ShieldX className="h-5 w-5 text-rose-300"/>:<ShieldCheck className="h-5 w-5 text-cyan-300"/>}SHA-256 internal checksum valid · {verified.externalChecksumMatched===null?"No external checksum supplied":verified.externalChecksumMatched?"External checksum matches":"External checksum MISMATCH"}</p>
          <p className="mt-2 text-muted-foreground">Recipient: {verified.packet.core.recipientLabel} · Purpose: {verified.packet.core.purpose}</p>
          <p className="mt-1 text-muted-foreground">Expiry (UTC): {new Date(verified.packet.core.expiresAt).toLocaleString()}</p>
          <p className="mt-1 text-muted-foreground">{verified.observations} observed hashes included · packet reference {verified.packet.core.handoffId}</p>
          <p className="mt-2 text-xs text-amber-200">{verified.warning}</p>
        </div>}
      </CardContent>
    </Card>
    {verified && verified.externalChecksumMatched!==false && <Card><CardHeader><CardTitle>3. Compare a separately received evidence file</CardTitle>
      <CardDescription>Pick an evidence ID from the verified packet and select a file you already received through an authorized channel. Byte count and SHA-256 are checked locally; no upload occurs.</CardDescription></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="handoff-evidence-id">Evidence metadata ID</Label>
      <select id="handoff-evidence-id" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" value={evidenceId} onChange={(e)=>{setEvidenceId(e.target.value);setFileMatch(null);}}>
        <option value="">Select digest entry</option>{verified.packet.core.manifest.observations.map((obs)=><option key={obs.evidenceId} value={obs.evidenceId}>{obs.evidenceId} · {obs.bytes} bytes</option>)}
      </select>
      <Label htmlFor="handoff-evidence-file">Locally transferred evidence file</Label>
      <Input id="handoff-evidence-file" type="file" disabled={!evidenceId||busy} onChange={(e)=>void compareFile(e.target.files?.[0])}/>
      {fileMatch && <p role={fileMatch.match?"status":"alert"} className={"flex items-start gap-2 text-sm "+(fileMatch.match?"text-cyan-200":"text-rose-200")}>
        {fileMatch.match?<CheckCircle2 className="h-4 w-4 shrink-0"/>:<ShieldX className="h-4 w-4 shrink-0"/>}{fileMatch.reason}</p>}
    </CardContent></Card>}
    <p className="flex items-start gap-2 rounded-xl border border-amber-300/25 p-4 text-sm text-amber-100">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0"/>No sharing permissions, server-enforced revocation, digital signatures, independent sender identity proof, incident confirmation, or legal chain-of-custody certification is created. Hand-off expiration is checked locally only. Protect packet metadata and use an authorized secure channel for actual files.
    </p>
  </div></main>;
}
