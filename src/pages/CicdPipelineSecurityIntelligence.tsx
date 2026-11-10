import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, ShieldAlert, ScanSearch, Copy, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { analyzeWorkflowSecurity } from "@/lib/cicdPipelineSecurityUtils.mjs";

const starterWorkflow = "name: CI\non: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          persist-credentials: true\n      - run: echo " + "${{ github.event.pull_request.title }}" + "\n";
const severityStyle: Record<string, string> = {
 critical: "border-rose-500/40 bg-rose-950/30 text-rose-200",
 high: "border-orange-500/40 bg-orange-950/30 text-orange-200",
 medium: "border-amber-500/40 bg-amber-950/30 text-amber-200",
 low: "border-slate-600 bg-slate-900 text-slate-300"
};

export default function CicdPipelineSecurityIntelligence() {
 const [workflow,setWorkflow]=useState(starterWorkflow);
 const [result,setResult]=useState<ReturnType<typeof analyzeWorkflowSecurity> | null>(null);
 const [error,setError]=useState("");
 const [copyMessage,setCopyMessage]=useState("");
 const analyze=()=>{try{setResult(analyzeWorkflowSecurity(workflow));setError("");setCopyMessage("");}catch(e){setResult(null);setError(e instanceof Error?e.message:"Unable to analyze workflow.");}};
 const copyReport=async()=>{
  if(!result)return;
  const report=["# ETERNYX CI/CD Pipeline Security Review","","Findings: "+result.summary.total+" | Critical: "+result.summary.critical+" | High: "+result.summary.high+" | Medium: "+result.summary.medium,"",...result.findings.map(item=>["## ["+item.severity.toUpperCase()+"] "+item.title,"Rule: "+item.id+" | Line: "+item.line,item.description,"Evidence: "+item.evidence,"Recommendation: "+item.recommendation].join("\n\n"))].join("\n\n");
  try{await navigator.clipboard.writeText(report);setCopyMessage("Security review copied as Markdown.");}catch{setCopyMessage("Clipboard access was blocked. Review the findings below.");}
 };
 return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
  <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4"/>Developer Studio</Link>
  <section className="rounded-3xl border border-rose-400/20 bg-gradient-to-br from-rose-950/70 via-slate-950 to-cyan-950/60 p-7 sm:p-10"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">ETERNYX · Secure software delivery</p><h1 className="mt-3 text-4xl font-bold sm:text-5xl">CI/CD Pipeline <span className="text-rose-300">Security Intelligence</span></h1><p className="mt-4 max-w-3xl leading-7 text-slate-300">Inspect GitHub Actions workflows for excessive permissions, mutable action references, unsafe pull-request patterns, shell injection risks, and secret exposure.</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">{["GitHub Actions","Least privilege","Supply-chain hygiene","Secret handling","Local-only analysis"].map(item=><span key={item} className="rounded-full border border-slate-700 px-3 py-1.5">{item}</span>)}</div></section>
  <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
   <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Workflow className="h-5 w-5 text-rose-300"/>Workflow source</CardTitle><CardDescription className="text-slate-400">Paste a GitHub Actions YAML workflow. Maximum input size: 100 KB.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="workflow-source">Workflow YAML</Label><Textarea id="workflow-source" value={workflow} onChange={e=>setWorkflow(e.target.value)} spellCheck={false} className="min-h-[440px] border-slate-700 bg-slate-950 font-mono text-xs text-slate-100"/><div className="flex flex-wrap gap-2"><Button onClick={analyze} className="bg-rose-400 text-slate-950 hover:bg-rose-300"><ScanSearch className="mr-2 h-4 w-4"/>Analyze workflow</Button><Button variant="outline" onClick={()=>{setWorkflow("");setResult(null);setError("");}}>Clear</Button><Button variant="outline" onClick={()=>{setWorkflow(starterWorkflow);setResult(null);setError("");}}>Load sample</Button></div>{error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}</CardContent></Card>
   <div className="space-y-6">
    <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-300"/>Review results</CardTitle><CardDescription className="text-slate-400">Prioritized findings with line references and remediation guidance.</CardDescription></CardHeader><CardContent className="space-y-4">{result?<><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Total",result.summary.total],["Critical",result.summary.critical],["High",result.summary.high],["Medium",result.summary.medium]].map(([label,value])=><div key={label} className="rounded-xl border border-slate-800 bg-slate-950 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div><p className="text-xs text-slate-500">Scanned {result.scannedCharacters.toLocaleString()} characters.</p><Button variant="outline" size="sm" onClick={copyReport} disabled={!result.findings.length}><Copy className="mr-2 h-4 w-4"/>Copy Markdown report</Button>{copyMessage&&<p role="status" className="text-xs text-emerald-300">{copyMessage}</p>}</>:<div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400"><ShieldAlert className="mx-auto mb-2 h-8 w-8 text-slate-500"/>No analysis yet. Paste a workflow and run the review.</div>}</CardContent></Card>
    {result&&<section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">Findings</h2><span className="text-xs text-slate-500">{result.findings.length} detected</span></div>{result.findings.length?result.findings.map((item,index)=><Card key={item.id+"-"+item.line+"-"+index} className={"border "+severityStyle[item.severity]}><CardContent className="space-y-2 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wider">{item.severity} · {item.id}</span><span className="text-xs opacity-75">Line {item.line}</span></div><h3 className="font-semibold">{item.title}</h3><p className="text-sm leading-6 opacity-90">{item.description}</p><pre className="overflow-x-auto rounded-lg bg-black/30 p-2 text-xs">{item.evidence}</pre><p className="text-sm leading-6"><strong>Fix:</strong> {item.recommendation}</p></CardContent></Card>):<div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-200">No configured checks were triggered. This does not prove the workflow is secure; review workflow and repository settings manually.</div>}</section>}
   </div>
  </div>
  <div className="rounded-xl border border-amber-500/20 bg-slate-900/40 p-4 text-sm leading-6 text-slate-400"><ShieldAlert className="mr-2 inline h-4 w-4 text-amber-300"/>Static heuristic review only — not a full YAML parser, GitHub policy evaluation, secret scanner, or vulnerability database. Findings need human validation; no findings do not certify security. No network requests are made and pasted content stays in your browser.</div>
 </div></div>;
}
