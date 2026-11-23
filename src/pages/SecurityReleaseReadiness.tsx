import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, FileCheck2, FileWarning, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateCybersecurityReleaseGate, REQUIRED_STAGING_TABLES, REQUIRED_CHECKS } from "@/lib/securityStagingReadiness.mjs";
import { inspectStagingDossier, EVIDENCE_IDS, DOSSIER_LIMIT } from "@/lib/securityStagingDossier.mjs";
import { validateMigrationObservation } from "@/lib/securityMigrationObservation.mjs";
import { evaluateStagingRecoveryReadiness } from "@/lib/securityStagingRecoveryReadiness.mjs";
import { parseRecoveryPacketJson, RECOVERY_PACKET_MAX_BYTES } from "@/lib/securityRecoveryEvidence.mjs";

const MAX_REPORT_BYTES=48*1024;
type Report={observedAt:string;[key:string]:unknown};
const HTTP_REVOCATION_SCHEMA="eternyx.cybersecurity.http-revocation.v1";
const httpChecks=[
  "distinct-real-jwt-identities","owned-and-revocable-engagements",
  ...REQUIRED_STAGING_TABLES.map(t=>"owned-and-cross-owner:"+t),
  ...REQUIRED_STAGING_TABLES.map(t=>"anonymous-denial:"+t),
  "owned-private-storage","cross-account-storage-denial",
  "authorization-state","revocation-audit","phase-linked-identities",
];
function isRevocationReport(input:unknown):input is Report {
  if(!input||typeof input!=="object"||Array.isArray(input))return false;
  const v=input as Record<string,any>;
  const keys=["schema","phase","stagingRef","productionRef","observedAt","subjects","checks","summary","limitations"];
  if(Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k)))return false;
  if(v.schema!==HTTP_REVOCATION_SCHEMA||v.phase!=="revoked"||!Number.isFinite(Date.parse(v.observedAt)))return false;
  if(typeof v.stagingRef!=="string"||typeof v.productionRef!=="string"||
     !/^[a-z0-9]{8,32}$/.test(v.stagingRef)||! /^[a-z0-9]{8,32}$/.test(v.productionRef)||
     v.stagingRef===v.productionRef)return false;
  if(!v.subjects||typeof v.subjects!=="object"||Array.isArray(v.subjects)||
     Object.keys(v.subjects).length!==5||
     !["a","b","engagementA","engagementB","run"].every(k=>/^[0-9a-f]{64}$/.test(v.subjects[k])))return false;
  if(!Array.isArray(v.checks)||v.checks.length!==httpChecks.length||
     !httpChecks.every((id,i)=>v.checks[i]?.id===id&&v.checks[i]?.status==="pass"&&Object.keys(v.checks[i]).length===2))return false;
  if(!v.summary||Object.keys(v.summary).length!==6||
     v.summary.accounts!==2||v.summary.tables!==REQUIRED_STAGING_TABLES.length||
     v.summary.remoteWrites!==0||v.summary.authMode!=="live-user-JWT"||
     v.summary.engagementState!=="revoked"||v.summary.independentApproval!==false)return false;
  if(!Array.isArray(v.limitations)||v.limitations.length!==3||
     !v.limitations.every((s:unknown)=>typeof s==="string"&&s.length>=12&&s.length<=230))return false;
  return true;
}


export default function SecurityReleaseReadiness(){
  const [uploaded,setUploaded]=useState<Report|null>(null);
  const [error,setError]=useState("");
  const [fileLabel,setFileLabel]=useState("");
  const [httpReport,setHttpReport]=useState<Report|null>(null);
  const [httpError,setHttpError]=useState("");
  const [dossier,setDossier]=useState<Awaited<ReturnType<typeof inspectStagingDossier>>|null>(null);
  const [dossierError,setDossierError]=useState("");
  const [dossierBusy,setDossierBusy]=useState(false);
  const [migrationObservation,setMigrationObservation]=useState<Record<string,unknown>|null>(null);
  const [migrationError,setMigrationError]=useState("");
  const [recoveryPacket,setRecoveryPacket]=useState<ReturnType<typeof parseRecoveryPacketJson>|null>(null);
  const [recoveryPacketError,setRecoveryPacketError]=useState("");
  const recovery=evaluateStagingRecoveryReadiness(migrationObservation);
  const gate=evaluateCybersecurityReleaseGate(uploaded);
  async function importReport(file?:File){
    setUploaded(null);setError("");setFileLabel("");
    if(!file)return;
    if(file.size<1||file.size>MAX_REPORT_BYTES){
      setError("Staging report exceeds 48 KiB or is empty.");return;
    }
    try{
      const content:unknown=JSON.parse(await file.text());
      const result=evaluateCybersecurityReleaseGate(content);
      if(result.readOnlyStaging!=="reported-pass-unattested"){
        setError("Report rejected: "+result.details);return;
      }
      setUploaded(content as Report);setFileLabel(file.name);
    }catch{setError("Malformed JSON report. No release approval recorded.");}
  }
  async function importHttpRevocation(file?:File){
    setHttpReport(null);setHttpError("");
    if(!file)return;
    if(file.size<1||file.size>MAX_REPORT_BYTES){
      setHttpError("Revocation report must be a small JSON file (48 KiB maximum).");return;
    }
    try{
      const data:unknown=JSON.parse(await file.text());
      if(!isRevocationReport(data)){
        setHttpError("Unsupported, incomplete or non-revoked staging HTTP report.");return;
      }
      setHttpReport(data);
    }catch{setHttpError("Revocation report JSON is malformed.");}
  }
  async function importDossier(file?:File){
    setDossier(null);setDossierError("");
    if(!file)return;
    if(file.size<1||file.size>DOSSIER_LIMIT){
      setDossierError("Dossier must be a valid JSON file of 128 KiB or less.");return;
    }
    setDossierBusy(true);
    try{
      const checked=await inspectStagingDossier(await file.text());
      setDossier(checked);
    }catch(e){
      setDossierError(e instanceof Error?e.message:"Staging dossier inspection failed.");
    }finally{setDossierBusy(false);}
  }
  async function importMigration(file?:File){
    setMigrationObservation(null);setMigrationError("");
    if(!file)return;
    if(file.size<1||file.size>48*1024){
      setMigrationError("Migration observation JSON must be 48 KiB or less.");return;
    }
    try{
      const parsed:unknown=JSON.parse(await file.text());
      const result=validateMigrationObservation(parsed);
      setMigrationObservation(result as Record<string,unknown>);
    }catch{
      setMigrationError("Migration observation rejected: wrong project, missing checks or unsupported report.");
    }
  }
  async function importRecoveryPacket(file?:File){
    setRecoveryPacket(null);setRecoveryPacketError("");
    if(!file)return;
    if(file.size<1||file.size>RECOVERY_PACKET_MAX_BYTES){
      setRecoveryPacketError("Recovery report must be 48 KiB or less.");return;
    }
    try{
      const validated=parseRecoveryPacketJson(await file.text());
      setRecoveryPacket(validated);
    }catch{
      setRecoveryPacketError("Recovery evidence rejected: malformed, contradictory or elevated claims.");
    }
  }
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
    <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4"/>Cybersecurity Hub</Link>
    <header className="rounded-3xl border border-cyan-300/20 bg-card p-7">
      <div className="flex items-center gap-2 text-cyan-200"><ClipboardCheck className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-widest">Cybersecurity Universe · Wave 10</span></div>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Security Release Readiness</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">Import a genuine staging read-only acceptance report locally and inspect the production release blockers. This screen does not deploy, approve, migrate or write to Supabase.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm"><Link to="/cybersecurity/case-ledger" className="text-cyan-300 underline">Indexed case ledger (deployment gated)</Link><Link to="/cybersecurity/evidence-provenance" className="text-cyan-300 underline">Evidence provenance</Link></div>
    </header>
    <Card><CardHeader><CardTitle>1. Staging read-only acceptance report</CardTitle><CardDescription>Import a JSON from the optional staging CLI after two real accounts have been checked against seven actual private tables. A file can be fabricated and cannot attest to its origin.</CardDescription></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="security-staging-report">Staging JSON report (48 KiB maximum)</Label>
      <Input id="security-staging-report" type="file" accept=".json,application/json" onChange={e=>void importReport(e.target.files?.[0])}/>
      {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
      <div className="rounded-lg border border-border bg-background p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">{uploaded?<FileCheck2 className="h-4 w-4 text-cyan-200"/>:<FileWarning className="h-4 w-4 text-amber-200"/>}{uploaded?"Operator-reported staging read checks passed (unsigned)":"Staging read-only acceptance not established"}</p>
        {uploaded&&<p className="mt-2 text-xs text-muted-foreground">File: {fileLabel} · Captured: {new Date(uploaded.observedAt).toLocaleString()} · {REQUIRED_STAGING_TABLES.length} tables plus private Storage.</p>}
        <p className="mt-2 text-xs text-muted-foreground">{gate.details}</p>
      </div>
      <p className="text-xs text-muted-foreground">Probe covers {REQUIRED_CHECKS.length} categories with two genuine signed-in users. Missing staging schema, RLS, grants, Storage policies or seeded fixtures fail closed.</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>2. Real-account HTTP revocation observations</CardTitle><CardDescription>Import the optional Wave 13 second-phase GET-only staging report. It must include two real account identities (HMAC-bound, not exposed), complete cross-account tests, and a post-baseline revocation audit. The file is unsigned and is never independent proof of execution.</CardDescription></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="security-http-revocation-report">Revoked-phase staging JSON (max 48 KiB)</Label>
      <Input id="security-http-revocation-report" type="file" accept=".json,application/json" onChange={e=>void importHttpRevocation(e.target.files?.[0])}/>
      {httpError&&<p role="alert" className="text-sm text-rose-200">{httpError}</p>}
      <div className="rounded-lg border border-border bg-background p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">{httpReport?<FileCheck2 className="h-4 w-4 text-cyan-200"/>:<FileWarning className="h-4 w-4 text-amber-200"/>}{httpReport?"Operator-reported HTTP revocation checks passed (unsigned)":"Live two-phase HTTP revocation not established"}</p>
        {httpReport&&<p className="mt-2 text-xs text-muted-foreground">{httpChecks.length} reported checks · staged observation {new Date(httpReport.observedAt).toLocaleString()} · no HTTP writes</p>}
        <p className="mt-2 text-xs text-muted-foreground">Engagement-attestation revocation is not JWT/session revocation. The owner may still read historical private evidence under existing policy. No result authorizes deployment.</p>
      </div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>3. Consolidated staging evidence dossier</CardTitle>
      <CardDescription>Review a locally assembled Wave 14 dossier linking existing two-user staging checks, pre/post-revocation observations, PostgreSQL catalog evidence, and transactional rollback. The file digest checks consistency only; no signature, operator identity or real deployment is authenticated.</CardDescription>
    </CardHeader><CardContent className="space-y-4">
      <Label htmlFor="security-staging-dossier">Unsigned local staging evidence dossier (128 KiB maximum)</Label>
      <Input id="security-staging-dossier" type="file" accept=".json,application/json" disabled={dossierBusy} onChange={e=>void importDossier(e.target.files?.[0])}/>
      {dossierError&&<p role="alert" className="text-sm text-rose-200">{dossierError}</p>}
      {!dossier&&<p className="text-sm text-muted-foreground">No combined staging evidence verified. Missing results are not treated as passing checks. Generate a dossier locally with the staging evidence CLI after gathering actual isolated-staging artifacts.</p>}
      {dossier&&<div className="space-y-3">
        <p role="status" className="flex items-center gap-2 text-sm text-amber-200"><ShieldAlert className="h-4 w-4"/>Production BLOCKED · {dossier.core.summary.provided} submitted artifacts · {dossier.core.summary.missing} missing requirements</p>
        <p className="text-xs text-muted-foreground">Project: {dossier.core.stagingRef} · Created: {new Date(dossier.core.createdAt).toLocaleString()} · No independently authenticated attestation</p>
        <div className="rounded-lg border border-border bg-background p-3 text-xs">
          <p className="font-medium">Dossier SHA-256 (content consistency only)</p>
          <p className="mt-1 break-all font-mono">{dossier.checksum}</p>
        </div>
        <ul className="space-y-2">{dossier.core.evidence.map(entry=><li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
          <span>{entry.scope}</span><span className={entry.status==="missing"?"text-amber-200":"text-cyan-200"}>{entry.status==="missing"?"Missing":"Locally validated · unsigned"}</span>
        </li>)}</ul>
        <p className="text-xs text-amber-100">All {EVIDENCE_IDS.length} categories are included in this checklist. {dossier.warning} Source fingerprints cannot prove a migration was deployed to staging.</p>
      </div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>4. Staging migration history and recovery readiness</CardTitle>
      <CardDescription>Import an operator-produced, read-only PostgreSQL migration history observation. This can demonstrate that baseline migration versions were observed on the configured staging connection, but it cannot authenticate migration bytes or prove that the proposed ledger was properly deployed.</CardDescription>
    </CardHeader><CardContent className="space-y-4">
      <Label htmlFor="security-migration-observation">Wave 15 staging migration observation (48 KiB maximum)</Label>
      <Input id="security-migration-observation" type="file" accept=".json,application/json" onChange={e=>void importMigration(e.target.files?.[0])}/>
      {migrationError&&<p role="alert" className="text-sm text-rose-200">{migrationError}</p>}
      <p className="flex items-center gap-2 text-sm font-medium text-amber-100"><FileWarning className="h-4 w-4"/>{migrationObservation?"Baseline migration versions reported as observed; indexed ledger migration UNVERIFIED":"Real staging migration-history observation not established"}</p>
      {migrationObservation&&<p className="text-xs text-muted-foreground">Operator-reported staging reference: {String(migrationObservation.stagingProjectRef)} · Ledger tables: {String(migrationObservation.ledgerTables)} · Observed: {new Date(String(migrationObservation.observedAt)).toLocaleString()}</p>}
      <p className="text-xs text-muted-foreground">A recorded migration version is not proof of matching source SQL, an approved deployment, or a completed backup restore.</p>
      <h3 className="text-sm font-semibold">Separate recovery evidence requirements</h3>
      <ul className="space-y-2">{recovery.requirements.map(item=><li key={item.id} className="flex gap-3 rounded-lg border border-border bg-background p-3 text-sm"><ShieldAlert className="h-4 w-4 shrink-0 text-amber-200"/><span>{item.description} — <strong>not verified</strong></span></li>)}</ul>
      <p className="text-xs text-amber-100">{recovery.conclusion}</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>5. Isolated restore and recovery evidence</CardTitle>
      <CardDescription>Review an optional Wave 16 operator packet. RTO and RPO are calculated from supplied timestamps; there is no independent proof that a restore, data validation or permission check actually ran.</CardDescription>
    </CardHeader><CardContent className="space-y-4">
      <Label htmlFor="security-recovery-evidence">Unsigned recovery packet (48 KiB maximum)</Label>
      <Input id="security-recovery-evidence" type="file" accept=".json,application/json" onChange={e=>void importRecoveryPacket(e.target.files?.[0])}/>
      {recoveryPacketError&&<p role="alert" className="text-sm text-rose-200">{recoveryPacketError}</p>}
      {!recoveryPacket&&<p className="text-sm text-muted-foreground">No isolated restore evidence imported. All eight recovery and approval gates remain unverified.</p>}
      {recoveryPacket&&<div className="space-y-3">
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-amber-200"><ShieldAlert className="h-4 w-4"/>Production BLOCKED · Operator-supplied, unsigned recovery evidence</p>
        <p className="text-xs text-muted-foreground">Staging: {recoveryPacket.stagingRef} · Isolated recovery: {recoveryPacket.recoveryRef} · Review: {new Date(recoveryPacket.observedAt).toLocaleString()}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Reported RTO</p><p className="font-semibold">{recoveryPacket.metrics.rtoSeconds===null?"Not measured":String(recoveryPacket.metrics.rtoSeconds)+" seconds"}</p></div>
          <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Reported RPO</p><p className="font-semibold">{recoveryPacket.metrics.rpoSeconds===null?"Not measured":String(recoveryPacket.metrics.rpoSeconds)+" seconds"}</p></div>
        </div>
        <p className="text-sm">Migration: {recoveryPacket.migration.status} · After-restore PostgreSQL catalog: {recoveryPacket.catalog.status}</p>
        <ul className="space-y-2">{recoveryPacket.requirements.map(item=><li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <span>{item.id.replaceAll("-"," ")}</span><strong className="shrink-0 text-amber-200">{item.status==="missing"?"Missing":"Unsigned claim"}</strong>
        </li>)}</ul>
        <p className="text-xs text-amber-100">Even if every supplied file has a matching SHA-256 digest, no independent backup restore, project identity or production approval is established. Authenticated approval is always missing in this packet.</p>
      </div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>6. Production release safeguards</CardTitle><CardDescription>Even a complete staging read-only report does not authorize production changes. Separate staging write-deny, migrations, rollback and operator review evidence are required.</CardDescription></CardHeader><CardContent className="space-y-3">
      <p role="status" className="flex items-center gap-2 font-semibold text-amber-200"><ShieldAlert className="h-5 w-5"/>Production release: BLOCKED</p>
      <ol className="space-y-3">{gate.blockers.map((item,index)=><li key={item} className="flex gap-3 rounded-lg border border-border bg-background p-3 text-sm"><span className="font-semibold text-amber-200">{index+1}.</span><span>{item}</span></li>)}</ol>
      <p className="text-xs text-muted-foreground">No deployment button, schema write, role change, fake readiness score or release override exists on this page.</p>
    </CardContent></Card>
    <p className="flex items-start gap-2 rounded-xl border border-amber-300/20 p-4 text-sm text-amber-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/>Trust boundary: imported JSON is unsigned. Independent SQL catalog review, actual staging write isolation and revocation tests, migration history, rollback rehearsal and named reviewer sign-off remain mandatory.</p>
  </div></main>;
}
