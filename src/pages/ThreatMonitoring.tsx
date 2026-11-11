import { Link } from "react-router-dom";
import { Activity, ArrowRight, LockKeyhole, ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const monitoringCapabilities = [
  {
    icon: ShieldCheck,
    title: "Verified authorization checks",
    description: "Selected backend authorization mismatches are recorded only after the caller's access token has been verified.",
  },
  {
    icon: LockKeyhole,
    title: "Restricted event access",
    description: "Security telemetry is written by trusted backend functions. Browser clients cannot create or modify monitoring events.",
  },
  {
    icon: Workflow,
    title: "Best-effort event capture",
    description: "Monitoring writes are isolated from the primary request path, so an event-storage issue does not interrupt AI chat or document processing.",
  },
];

const ThreatMonitoring = () => (
  <main className="relative min-h-screen overflow-hidden bg-[#050914] px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.025)_1px,transparent_1px)] bg-[size:48px_48px]" />
    </div>

    <div className="relative mx-auto max-w-6xl space-y-10">
      <section className="max-w-3xl">
        <Badge className="mb-5 border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 hover:bg-cyan-300/10">
          ETERNYX · PLATFORM SECURITY
        </Badge>
        <div className="mb-4 flex items-center gap-3 text-cyan-300">
          <Activity className="h-6 w-6" />
          <span className="text-xs font-semibold uppercase tracking-[0.25em]">Threat monitoring</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Security signals with <span className="text-cyan-300">trusted origins.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
          ETERNYX records selected security events at trusted backend authorization boundaries and provides a restricted workspace for administrators to review those records.
        </p>
      </section>

      <section className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-amber-200">Coverage note</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
              This is platform telemetry, not a managed 24/7 security operations center. Current event capture is limited to selected verified authorization mismatches in AI chat and document processing; it does not monitor customer infrastructure or represent comprehensive threat detection.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-amber-300/30 text-amber-200">Limited event coverage</Badge>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {monitoringCapabilities.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="border-slate-800 bg-slate-900/70 text-slate-100">
            <CardHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                <Icon className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg text-white">{title}</CardTitle>
              <CardDescription className="leading-6 text-slate-400">{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold text-white">Review platform security events</h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Authorized administrators can inspect recorded events in the protected security workspace. Access is independently checked by the application and enforced by database row-level security.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="bg-cyan-400 font-semibold text-slate-950 hover:bg-cyan-300">
              <Link to="/admin/security">Open admin security workspace <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" className="border-slate-700 bg-slate-950/40 text-slate-200 hover:bg-slate-800">
              <Link to="/cybersecurity">Explore Cybersecurity Hub</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  </main>
);

export default ThreatMonitoring;
