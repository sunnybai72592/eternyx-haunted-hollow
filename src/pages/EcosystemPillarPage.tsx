import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Compass } from "lucide-react";
import { ecosystemPillars } from "@/data/ecosystem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EcosystemPillarPageProps {
  pillarId: string;
}

const EcosystemPillarPage = ({ pillarId }: EcosystemPillarPageProps) => {
  const pillar = ecosystemPillars.find((item) => item.id === pillarId);

  if (!pillar) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-white">
        <h1 className="text-2xl font-bold">Pillar not found</h1>
        <Button asChild className="mt-5"><Link to="/explore">Back to Explore</Link></Button>
      </div>
    );
  }

  const Icon = pillar.icon;

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Link to="/explore" className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-cyan-300">
          <ArrowLeft className="h-4 w-4" /> All ecosystem pillars
        </Link>

        <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-slate-950 to-violet-950/50 p-7 sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300"><Icon className="h-7 w-7" /></div>
              <Badge variant="outline" className={pillar.status === "Existing foundation" ? "border-emerald-500/30 text-emerald-300" : "border-slate-600 text-slate-400"}>{pillar.status}</Badge>
            </div>
            <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">{pillar.title}</h1>
            <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">{pillar.description}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">{pillar.purpose}</p>
            {pillar.id === "cybersecurity" && (
              <Button asChild className="mt-7 bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                <Link to="/cybersecurity">Open Cybersecurity Hub <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            )}
            {pillar.id === "developer-studio" && (
              <Button asChild className="mt-7 bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                <Link to="/developer-studio">Open Developer Studio <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            )}
          </div>
        </section>

        <section>
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Capability map</p>
            <h2 className="mt-2 text-2xl font-bold">What belongs in this pillar</h2>
            <p className="mt-2 text-sm text-slate-400">These are organized capability areas, not promises that every feature is live today.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pillar.domains.map((domain, index) => (
              <Card key={domain} className="border-slate-800 bg-slate-900/60 text-white">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="rounded-lg bg-cyan-400/10 p-2 text-cyan-300"><Compass className="h-5 w-5" /></div>
                    <span className="text-xs tabular-nums text-slate-600">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <CardTitle className="pt-2 text-base">{domain}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5" /> Capability area</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
          <h2 className="font-semibold">Build status</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {pillar.status === "Existing foundation"
              ? "This pillar has an existing destination in ETERNYX. Its individual tools will be labeled according to their verified implementation status."
              : "This pillar is mapped in the ecosystem architecture. Its features will be implemented and validated in later milestones."}
          </p>
          <Button asChild variant="outline" className="mt-5 border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800">
            <Link to="/explore">Return to Explore <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </section>
      </div>
    </div>
  );
};

export default EcosystemPillarPage;
