import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileJson, ShieldAlert, ShieldCheck, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { analyzeAwsIamPolicy, buildAwsIamPolicyReport } from "@/lib/awsIamPolicySecurityUtils.mjs";

const samplePolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    { Sid: "BroadStorageAccess", Effect: "Allow", Action: ["s3:*"], Resource: "*" },
    { Sid: "RoleTrustExample", Effect: "Allow", Principal: "*", Action: "sts:AssumeRole" }
  ]
}, null, 2);
const styles = {
  critical: "border-rose-500/40 bg-rose-950/30 text-rose-200",
  high: "border-orange-500/40 bg-orange-950/30 text-orange-200",
  medium: "border-amber-500/40 bg-amber-950/30 text-amber-200",
  low: "border-cyan-500/40 bg-cyan-950/30 text-cyan-200",
};
export default function AwsIamPolicySecurityWorkbench() {
  const [policyText, setPolicyText] = useState(samplePolicy);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const report = useMemo(() => result ? buildAwsIamPolicyReport(result) : "", [result]);
  const run = () => {
    try { setResult(analyzeAwsIamPolicy({ policyText })); setError(""); }
    catch (caught) { setResult(null); setError(caught instanceof Error ? caught.message : "Unable to review this policy."); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "eternyx-aws-iam-policy-review.md"; anchor.click();
    URL.revokeObjectURL(url);
  };
  return <div className="min-h-screen bg-[#050914] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="h-4 w-4" />Cybersecurity Hub</Link>
      <header className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-[#0a1426] to-violet-950/40 p-6 sm:p-9">
        <Badge className="mb-4 border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">ETERNYX • CLOUD IDENTITY SECURITY</Badge>
        <div className="flex items-center gap-3 text-cyan-300"><Cloud className="h-7 w-7" /><span className="text-xs font-semibold uppercase tracking-[0.25em]">Cloud IAM Workbench</span></div>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">AWS IAM Policy Security Review</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">Inspect policy JSON for excessive permissions, wildcard access, privilege-sensitive actions, and risky role trust relationships. Review locally before deployment.</p>
      </header>
      <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
        <CardHeader><CardTitle className="flex items-center gap-2 text-white"><FileJson className="h-5 w-5 text-cyan-300" />Policy document</CardTitle><CardDescription className="text-slate-400">Paste an AWS IAM identity, resource, or role trust policy in JSON format. A sample is loaded to help you get started.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Label htmlFor="aws-iam-policy" className="text-slate-300">AWS IAM policy JSON</Label>
          <Textarea id="aws-iam-policy" value={policyText} onChange={event => setPolicyText(event.target.value)} spellCheck={false} className="min-h-80 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" />
          <div className="flex flex-wrap gap-3">
            <Button onClick={run} className="bg-cyan-400 font-semibold text-slate-950 hover:bg-cyan-300"><ShieldCheck className="mr-2 h-4 w-4" />Analyze policy</Button>
            <Button variant="outline" onClick={() => { setPolicyText(samplePolicy); setResult(null); setError(""); }} className="border-slate-600 text-slate-200">Load sample</Button>
            {result && <Button variant="outline" onClick={download} className="border-slate-600 text-slate-200"><Download className="mr-2 h-4 w-4" />Export report</Button>}
          </div>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        </CardContent>
      </Card>
      {result && <section className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-slate-800 bg-slate-900/70"><CardContent className="p-4"><p className="text-xs text-slate-400">Statements</p><p className="mt-1 text-2xl font-bold text-white">{result.statementCount}</p></CardContent></Card>
          <Card className="border-slate-800 bg-slate-900/70"><CardContent className="p-4"><p className="text-xs text-slate-400">Allow statements</p><p className="mt-1 text-2xl font-bold text-white">{result.allowCount}</p></CardContent></Card>
          {Object.entries(result.counts).map(([severity, count]) => <Card key={severity} className="border-slate-800 bg-slate-900/70"><CardContent className="p-4"><p className="text-xs capitalize text-slate-400">{severity}</p><p className="mt-1 text-2xl font-bold text-white">{String(count)}</p></CardContent></Card>)}
        </div>
        <Card className="border-slate-800 bg-slate-900/70 text-slate-100"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><ShieldAlert className="h-5 w-5 text-amber-300" />Review findings</CardTitle><CardDescription className="text-slate-400">{result.findings.length} heuristic finding(s). Review context before changing permissions.</CardDescription></CardHeader><CardContent className="space-y-3">
          {result.findings.length === 0 && <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">No configured checks were triggered. This is not proof that the policy is safe.</p>}
          {result.findings.map((item, index) => <article key={item.id + index} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-white">{item.title}</h3><Badge variant="outline" className={styles[item.severity]}>{item.severity}</Badge></div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{item.detail}</p>
            <p className="mt-2 text-sm leading-6 text-cyan-200"><strong>Recommendation:</strong> {item.recommendation}</p>
            {item.evidence && <p className="mt-2 break-all font-mono text-xs text-slate-500">Evidence: {item.evidence}</p>}
          </article>)}
        </CardContent></Card>
      </section>}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-slate-300"><ShieldAlert className="mr-2 inline h-4 w-4 text-amber-300" />Local, rule-based JSON review only. It does not contact AWS or calculate effective permissions across SCPs, permission boundaries, session policies, resource policies, or runtime context. Use AWS IAM Access Analyzer and your approved cloud security process for authoritative validation. Never paste secrets or sensitive account data.</div>
    </div>
  </div>;
}
