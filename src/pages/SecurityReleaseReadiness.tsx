import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, FileCheck2, FileWarning, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateCybersecurityReleaseGate, REQUIRED_STAGING_TABLES, REQUIRED_CHECKS } from "@/lib/securityStagingReadiness.mjs";

const MAX_REPORT_BYTES=48*1024;
type Report={observedAt:string;[key:string]:unknown};

export default function SecurityReleaseReadiness(){
  const [uploaded,setUploaded]=useState<Report|null>(null);
  const [error,setError]=useState("");
  const [fileLabel,setFileLabel]=useState("");
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
    <Card><CardHeader><CardTitle>2. Production release safeguards</CardTitle><CardDescription>Even a complete staging read-only report does not authorize production changes. Separate staging write-deny, migrations, rollback and operator review evidence are required.</CardDescription></CardHeader><CardContent className="space-y-3">
      <p role="status" className="flex items-center gap-2 font-semibold text-amber-200"><ShieldAlert className="h-5 w-5"/>Production release: BLOCKED</p>
      <ol className="space-y-3">{gate.blockers.map((item,index)=><li key={item} className="flex gap-3 rounded-lg border border-border bg-background p-3 text-sm"><span className="font-semibold text-amber-200">{index+1}.</span><span>{item}</span></li>)}</ol>
      <p className="text-xs text-muted-foreground">No deployment button, schema write, role change, fake readiness score or release override exists on this page.</p>
    </CardContent></Card>
    <p className="flex items-start gap-2 rounded-xl border border-amber-300/20 p-4 text-sm text-amber-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/>Trust boundary: imported JSON is unsigned. Independent SQL catalog review, actual staging write isolation and revocation tests, migration history, rollback rehearsal and named reviewer sign-off remain mandatory.</p>
  </div></main>;
}
