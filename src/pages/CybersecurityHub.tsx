import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowRight, BookOpen, Bug, ChevronRight, Cloud, FileCheck2,
  Fingerprint, Globe2, KeyRound, LockKeyhole, Network, Radar, Search,
  Shield, ShieldAlert, ShieldCheck, Siren, Workflow, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Destination = {
  name: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  kind: "Workbench" | "Learning";
};

const domains = [
  {
    id: "intelligence",
    number: "01",
    title: "Security intelligence",
    description: "Build context around domains, assets, exposure, and the signals defenders can verify.",
    icon: Radar,
    href: "/vulnerability-scanner",
    capabilities: ["Exposure review", "Public CVE references", "HTTP signals"],
  },
  {
    id: "web",
    number: "02",
    title: "Web & application security",
    description: "Review application security posture, browser-facing controls, and architecture threats.",
    icon: Globe2,
    href: "/cybersecurity/web-security",
    capabilities: ["Security headers", "Threat modeling", "Web assessment"],
  },
  {
    id: "network",
    number: "03",
    title: "Network & infrastructure",
    description: "Structure authorized assessments, preserve evidence, and drive findings to closure.",
    icon: Network,
    href: "/cybersecurity/assessment-remediation",
    capabilities: ["Assessment register", "Evidence tracking", "Remediation ownership"],
  },
  {
    id: "cloud",
    number: "04",
    title: "Cloud identity & access",
    description: "Inspect IAM policies and trust relationships before excessive permissions become exposure.",
    icon: Cloud,
    href: "/cybersecurity/aws-iam-policy",
    capabilities: ["Wildcard permissions", "Role trust", "Least privilege"],
  },
  {
    id: "operations",
    number: "05",
    title: "Response & operations",
    description: "Coordinate incident playbooks and review the limited, verified security events ETERNYX records.",
    icon: Siren,
    href: "/cybersecurity/incident-playbooks",
    capabilities: ["Response playbooks", "Event review", "Operational evidence"],
  },
  {
    id: "learning",
    number: "06",
    title: "Labs & knowledge",
    description: "Strengthen defensive thinking with structured learning and practical security exercises.",
    icon: BookOpen,
    href: "/knowledge",
    capabilities: ["Security fundamentals", "Guided learning", "Knowledge checks"],
  },
];

const destinations: Destination[] = [
  {
    name: "Vulnerability exposure review",
    description: "Check basic HTTPS and security-header signals and look up public CVE references associated with a hostname.",
    href: "/vulnerability-scanner",
    icon: Bug,
    category: "Security intelligence",
    kind: "Workbench",
  },
  {
    name: "Web application security readiness",
    description: "Review browser-facing security controls and application configuration signals.",
    href: "/cybersecurity/web-security",
    icon: ShieldCheck,
    category: "Application security",
    kind: "Workbench",
  },
  {
    name: "STRIDE threat modeling",
    description: "Map assets, entry points, trust boundaries, and security threats.",
    href: "/cybersecurity/threat-modeling",
    icon: Workflow,
    category: "Architecture security",
    kind: "Workbench",
  },
  {
    name: "Assessment & remediation",
    description: "Record findings, evidence, accountable owners, severity, and validation notes.",
    href: "/cybersecurity/assessment-remediation",
    icon: FileCheck2,
    category: "Security governance",
    kind: "Workbench",
  },
  {
    name: "AWS IAM policy review",
    description: "Inspect policy scope, wildcard permissions, sensitive actions, and role trust.",
    href: "/cybersecurity/aws-iam-policy",
    icon: LockKeyhole,
    category: "Cloud security",
    kind: "Workbench",
  },
  {
    name: "Incident response playbooks",
    description: "Coordinate response checklists, ownership, timelines, and incident reports.",
    href: "/cybersecurity/incident-playbooks",
    icon: Siren,
    category: "Security operations",
    kind: "Workbench",
  },
  {
    name: "Platform security events",
    description: "Review selected authorization events recorded by ETERNYX backend services.",
    href: "/threat-monitoring",
    icon: Activity,
    category: "Platform monitoring",
    kind: "Workbench",
  },
  {
    name: "Security knowledge hub",
    description: "Build security knowledge through the learning resources currently available.",
    href: "/knowledge",
    icon: BookOpen,
    category: "Learning",
    kind: "Learning",
  },
];

const CybersecurityHub = () => {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredDomains = useMemo(
    () => domains.filter((domain) =>
      [domain.title, domain.description, ...domain.capabilities].join(" ").toLowerCase().includes(normalizedQuery),
    ),
    [normalizedQuery],
  );

  const filteredDestinations = useMemo(
    () => destinations.filter((destination) =>
      [destination.name, destination.description, destination.category, destination.kind]
        .join(" ").toLowerCase().includes(normalizedQuery),
    ),
    [normalizedQuery],
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b13] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-48 top-0 h-[34rem] w-[34rem] rounded-full bg-cyan-500/[0.09] blur-[110px]" />
        <div className="absolute -right-48 top-72 h-[34rem] w-[34rem] rounded-full bg-violet-500/[0.08] blur-[110px]" />
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(148,163,184,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.12)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      </div>

      <div className="relative mx-auto max-w-[1440px] space-y-16 px-4 py-7 sm:px-6 sm:py-10 lg:px-10">
        <section className="grid gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0c1421]/90 p-6 shadow-2xl shadow-black/30 sm:p-9 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)] lg:gap-12 lg:p-12">
          <div className="relative z-10 flex flex-col items-start justify-center">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.9)]" />
              ETERNYX / PILLAR 01
            </div>
            <div className="mb-5 flex items-center gap-3 text-slate-400">
              <Shield className="h-5 w-5 text-cyan-300" />
              <span className="text-xs font-semibold uppercase tracking-[0.24em]">Cybersecurity ecosystem</span>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
              See the exposure.
              <span className="block bg-gradient-to-r from-cyan-200 via-sky-300 to-violet-300 bg-clip-text text-transparent">Understand the risk.</span>
              <span className="block text-slate-300">Act with confidence.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              A connected workspace for defensive security intelligence, application review,
              cloud access analysis, assessment workflows, and incident readiness.
              Built around evidence, responsible testing, and honest results.
            </p>
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild className="h-11 bg-cyan-300 px-5 font-semibold text-slate-950 hover:bg-cyan-200">
                <Link to="/vulnerability-scanner">Open exposure review <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" className="h-11 border-white/15 bg-white/[0.03] px-5 text-slate-200 hover:bg-white/[0.08]">
                <Link to="/cybersecurity/assessment-remediation">Go to assessment workspace</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Defensive by design</span>
              <span className="inline-flex items-center gap-2"><Fingerprint className="h-4 w-4 text-cyan-300" /> Evidence-led workflows</span>
              <span className="inline-flex items-center gap-2"><Zap className="h-4 w-4 text-violet-300" /> Practical capabilities</span>
            </div>
          </div>

          <div className="relative flex min-h-[330px] flex-col justify-between overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#080f1b] p-5 sm:p-6">
            <div aria-hidden="true" className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-cyan-300/10" />
            <div aria-hidden="true" className="absolute -right-2 -top-6 h-44 w-44 rounded-full border border-cyan-300/10" />
            <div className="relative flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Workspace overview</p>
                <p className="mt-1 text-sm font-semibold text-white">Security operations map</p>
              </div>
              <Badge className="border border-emerald-300/20 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/10">Evidence first</Badge>
            </div>
            <div className="relative my-8 grid grid-cols-2 gap-3">
              {[
                { icon: Radar, label: "Intelligence", note: "Observe signals", tone: "text-cyan-200 bg-cyan-300/10 border-cyan-300/15" },
                { icon: Globe2, label: "Application", note: "Review controls", tone: "text-sky-200 bg-sky-300/10 border-sky-300/15" },
                { icon: Cloud, label: "Cloud access", note: "Inspect permissions", tone: "text-violet-200 bg-violet-300/10 border-violet-300/15" },
                { icon: Siren, label: "Response", note: "Coordinate action", tone: "text-amber-200 bg-amber-300/10 border-amber-300/15" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className={`rounded-xl border p-3 ${item.tone}`}>
                    <Icon className="h-4 w-4" />
                    <p className="mt-3 text-xs font-semibold text-white">{item.label}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{item.note}</p>
                  </div>
                );
              })}
            </div>
            <div className="relative rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <LockKeyhole className="h-4 w-4 text-cyan-300" />
                Responsible testing boundary
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Use active security checks only on assets you own or are explicitly authorized to assess.
                Tool output reflects only the checks actually performed.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Navigate by mission</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Six connected security domains</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Move from intelligence to assessment, from prevention to response. Each destination opens a focused workspace.</p>
            </div>
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a domain or capability..."
                aria-label="Search cybersecurity domains and tools"
                className="h-11 border-white/10 bg-[#0c1421] pl-9 text-white placeholder:text-slate-500 focus-visible:ring-cyan-300"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredDomains.map((domain) => {
              const Icon = domain.icon;
              return (
                <Link
                  key={domain.id}
                  to={domain.href}
                  className="group rounded-2xl border border-white/[0.09] bg-[#0c1421]/80 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-[#101c2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b13]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold tracking-[0.2em] text-slate-600">{domain.number} / DOMAIN</span>
                    <span className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-cyan-200 transition-colors group-hover:border-cyan-300/20 group-hover:bg-cyan-300/10"><Icon className="h-5 w-5" /></span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">{domain.title}</h3>
                  <p className="mt-2 min-h-[4.5rem] text-sm leading-6 text-slate-400">{domain.description}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {domain.capabilities.map((capability) => (
                      <span key={capability} className="rounded-md border border-white/[0.08] bg-black/20 px-2 py-1 text-[10px] text-slate-500">{capability}</span>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-4 text-xs font-semibold text-cyan-200">
                    Open domain <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
            {filteredDomains.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">
                No domains match “{query}”. Try a different search.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300">Go straight to work</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Security workbenches</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Focused tools and workflows with clearly defined purposes.</p>
            </div>
            <span className="text-xs text-slate-500">{filteredDestinations.length} destinations</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredDestinations.map((destination) => {
              const Icon = destination.icon;
              return (
                <Link
                  key={destination.href}
                  to={destination.href}
                  className="group flex min-h-[178px] flex-col rounded-2xl border border-white/[0.09] bg-[#0c1421]/75 p-5 transition-all hover:border-violet-300/25 hover:bg-[#111a2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b13]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-xl border border-violet-300/15 bg-violet-300/[0.08] p-2.5 text-violet-200"><Icon className="h-5 w-5" /></span>
                    <Badge variant="outline" className="border-white/10 text-[10px] font-medium text-slate-400">{destination.kind}</Badge>
                  </div>
                  <h3 className="mt-4 font-semibold text-white">{destination.name}</h3>
                  <p className="mt-2 flex-1 text-xs leading-5 text-slate-400">{destination.description}</p>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{destination.category}</span>
                    <ArrowRight className="h-4 w-4 text-cyan-300 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
            {filteredDestinations.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">
                No workbenches match “{query}”. Try a different search.
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
          <div className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.08] to-transparent p-6 sm:p-7">
            <div className="flex items-center gap-2 text-cyan-200"><ShieldAlert className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.18em]">Trust over theatrics</span></div>
            <h2 className="mt-4 max-w-xl text-xl font-semibold text-white sm:text-2xl">Security results should mean something.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              ETERNYX distinguishes observed signals, user-provided evidence, and analysis from checks it does not perform.
              No invented scan results, fictional incidents, or unsupported security guarantees.
            </p>
          </div>
          <Link to="/knowledge" className="group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0c1421]/80 p-6 transition-colors hover:border-cyan-300/25 hover:bg-[#111a2a]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Keep building skill</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Explore the knowledge hub</h3>
              <p className="mt-2 text-xs leading-5 text-slate-400">Learn the principles behind stronger defensive decisions.</p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-cyan-200 transition-transform group-hover:translate-x-1" />
          </Link>
        </section>
      </div>
    </main>
  );
};

export default CybersecurityHub;
