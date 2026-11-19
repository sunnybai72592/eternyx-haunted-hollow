import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, ClipboardCheck, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const readinessChecks = [
  { id: "assets", title: "Know your assets", detail: "Maintain an inventory of critical devices, software versions and owners." },
  { id: "patches", title: "Plan emergency patching", detail: "Identify patch testing, rollout and rollback contacts before an incident." },
  { id: "isolation", title: "Prepare containment", detail: "Document how authorized responders can isolate affected systems." },
  { id: "logging", title: "Validate visibility", detail: "Confirm useful logs, alert routing and retention in your own systems." },
  { id: "backups", title: "Test recovery", detail: "Verify backup restoration, not just the presence of backup jobs." },
  { id: "exercise", title: "Rehearse incident response", detail: "Assign responsibilities and conduct a tabletop exercise." },
] as const;

const ZeroDayProtection = () => {
  const [checked, setChecked] = useState<string[]>([]);
  const completeCount = checked.length;
  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/cybersecurity"><ArrowLeft className="mr-2 h-4 w-4" />Cybersecurity Hub</Link>
        </Button>
        <section className="rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-950/40 via-slate-950 to-cyan-950/30 p-7 sm:p-10">
          <div className="flex items-center gap-3 text-amber-200"><AlertTriangle className="h-7 w-7" />SECURITY READINESS</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">Zero-day response readiness</h1>
          <p className="mt-4 text-slate-300">A practical preparedness checklist for defenders—not an active protection or monitoring service.</p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">No live threat detection enabled</Badge>
        </section>
        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            An older version of this page displayed generated threats, fictional timestamps, and simulated detection scores.
            Those claims have been removed. ETERNYX is not detecting zero-day exploits or monitoring your network on this page.
            The checklist below runs only in browser memory and is not a security assessment or proof of protection.
          </AlertDescription>
        </Alert>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Your defensive preparedness checklist</CardTitle>
            <CardDescription className="text-slate-400">
              Mark steps as you review your own processes. {completeCount} of {readinessChecks.length} items marked;
              self-reported completion is not independently verified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {readinessChecks.map(item => (
              <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
                <input type="checkbox" className="mt-1" checked={checked.includes(item.id)}
                  onChange={e => setChecked(current => e.target.checked
                    ? [...current, item.id] : current.filter(id => id !== item.id))} />
                <span>
                  <strong className="block text-sm text-white">{item.title}</strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">{item.detail}</span>
                </span>
              </label>
            ))}
            <p role="status" aria-live="polite" className="text-xs text-amber-200">
              {completeCount}/{readinessChecks.length} items marked locally; no evaluation or protection score was produced.
            </p>
            <Button type="button" variant="outline" disabled={checked.length === 0}
              onClick={() => setChecked([])}><ClipboardCheck className="mr-2 h-4 w-4" />Reset checklist</Button>
          </CardContent>
        </Card>
        <section className="grid gap-4 sm:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
            <CardHeader>
              <CardTitle className="text-white">Threat modeling workbench</CardTitle>
              <CardDescription className="text-slate-400">Document likely attack paths and safeguards for systems you are authorized to assess.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline"><Link to="/cybersecurity/threat-modeling">Open threat modeling <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
            <CardHeader>
              <CardTitle className="text-white">Incident response playbooks</CardTitle>
              <CardDescription className="text-slate-400">Plan containment, escalation, evidence handling and recovery actions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline"><Link to="/cybersecurity/incident-playbooks">Open playbooks <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};
export default ZeroDayProtection;
