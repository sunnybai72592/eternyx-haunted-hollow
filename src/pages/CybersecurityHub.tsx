import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import WorkspaceCaptureLink from "@/components/workspace/WorkspaceCaptureLink";
import {
  Activity, ArrowRight, BookOpen, Bug, ChevronRight, Cloud, Crosshair, FileCheck2,
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
  mode: "Local review" | "Provider-backed" | "Account workspace" | "Limited telemetry" | "Local lab" | "Deployment-gated" | "Learning resources";
  limitation: string;
};

const domains = [
  {
    id: "intelligence",
    number: "01",
    title: "Security intelligence",
    description: "Build context around domains, assets, exposure, and the signals defenders can verify.",
    icon: Radar,
    href: "/vulnerability-scanner",
    capabilities: ["Public CVE records", "CVSS data", "CPE version criteria"],
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
    description: "Link authorized engagement scope, private evidence snapshots, and analyst-owned remediation workflows.",
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
    title: "Hands-on labs & knowledge",
    description: "Practice web development, defensive security analysis, and vulnerability concepts in isolated browser exercises.",
    icon: BookOpen,
    href: "/labs",
    capabilities: ["Interactive workstations", "Isolated previews", "Guided security practice"],
  },
];

const destinations: Destination[] = [
  {
    name: "CVE research workbench",
    description: "Search public NVD CVE records by vendor, software product, and version; review CPE criteria before confirming applicability.",
    href: "/vulnerability-scanner",
    icon: Bug,
    category: "Security intelligence",
    kind: "Workbench",
    mode: "Provider-backed",
    limitation: "NVD research requires a working authenticated backend; it does not inspect a live target.",
  },
  {
    name: "Black Hat Pentesting",
    description: "Plan authorized security engagements and launch the real assessment workbenches currently available in ETERNYX.",
    href: "/black-hat-pentesting",
    icon: Crosshair,
    category: "Authorized offensive security",
    kind: "Workbench",
    mode: "Account workspace",
    limitation: "Sign-in required. Engagement metadata and evidence are recorded; active tests require separate authorization.",
  },
  {
    name: "Web application security readiness",
    description: "Review browser-facing security controls and application configuration signals.",
    href: "/cybersecurity/web-security",
    icon: ShieldCheck,
    category: "Application security",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Offline analysis of pasted configuration only; no live request, crawler, or exploit test.",
  },
  {
    name: "STRIDE threat modeling",
    description: "Map assets, entry points, trust boundaries, and security threats.",
    href: "/cybersecurity/threat-modeling",
    icon: Workflow,
    category: "Architecture security",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Local STRIDE model and export; not a discovered or verified deployment weakness.",
  },
  {
    name: "Security case intelligence & version review",
    description: "Review private case snapshots, triage overdue findings, and compare remediation changes between versions.",
    href: "/cybersecurity/case-intelligence",
    icon: Activity,
    category: "Security governance",
    kind: "Workbench",
    mode: "Account workspace",
    limitation: "Authenticated, owner-scoped snapshot reviews only. Priority points reflect analyst inputs; no live scanning, SOC, or independently verified risk scoring.",
  },
  {
    name: "Indexed security case ledger (staging gated)",
    description: "Manage owner-scoped relational assets, findings, remediation status and history once the reviewed database schema is deployed.",
    href: "/cybersecurity/case-ledger",
    icon: FileCheck2,
    category: "Security governance",
    kind: "Workbench",
    mode: "Deployment-gated",
    limitation: "This route checks for reviewed database tables and fails closed when unavailable. Production migration has not been deployed or verified.",
  },
  {
    name: "Unified private security cases",
    description: "Review real private assessment and investigation versions together by the same declared in-scope target, with analyst-only triage and history.",
    href: "/cybersecurity/unified-cases",
    icon: FileCheck2,
    category: "Security governance",
    kind: "Workbench",
    mode: "Account workspace",
    limitation: "Only validated, explicitly reviewed versions contribute to counts. Matching target strings are not a formal case link; no live scanning, alerts, or response automation.",
  },
  {
    name: "Private security investigations",
    description: "Track an authorized investigation timeline, assigned actions, linked private evidence and documented closure decisions.",
    href: "/cybersecurity/investigations",
    icon: FileCheck2,
    category: "Security operations",
    kind: "Workbench",
    mode: "Account workspace",
    limitation: "Owner-scoped private case versions using existing evidence storage. Events and outcomes are analyst-entered; no live detection or automated containment.",
  },
  {
    name: "Private assessment cases",
    description: "Work from attested pentest scope, manage analyst findings and remediation, and save versioned private evidence snapshots.",
    href: "/cybersecurity/cases",
    icon: FileCheck2,
    category: "Security governance",
    kind: "Workbench",
    mode: "Account workspace",
    limitation: "Requires signed-in, attested engagement; snapshots are owner-protected but findings and retests are analyst-reported, not independently verified.",
  },
  {
    name: "Assessment & remediation",
    description: "Record findings, evidence, accountable owners, severity, and validation notes.",
    href: "/cybersecurity/assessment-remediation",
    icon: FileCheck2,
    category: "Security governance",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Local findings register and export; it is not an automatic scanner or shared persistent case system.",
  },
  {
    name: "AWS IAM policy review",
    description: "Inspect policy scope, wildcard permissions, sensitive actions, and role trust.",
    href: "/cybersecurity/aws-iam-policy",
    icon: LockKeyhole,
    category: "Cloud security",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Analyzes pasted policies offline; does not access an AWS account or verify effective permissions.",
  },
  {
    name: "Incident response playbooks",
    description: "Coordinate response checklists, ownership, timelines, and incident reports.",
    href: "/cybersecurity/incident-playbooks",
    icon: Siren,
    category: "Security operations",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Manual coordination and local report export; no automatic containment or live incident feed.",
  },
  {
    name: "Platform security events",
    description: "Review selected authorization events recorded by ETERNYX backend services.",
    href: "/threat-monitoring",
    icon: Activity,
    category: "Platform monitoring",
    kind: "Workbench",
    mode: "Limited telemetry",
    limitation: "Only selected ETERNYX authorization events may be stored; administrator access is restricted.",
  },
  {
    name: "ETERNYX Labs",
    description: "Ten browser-based development and security workstations, including XSS, headers, SQL parameterization, and access-control exercises.",
    href: "/labs",
    icon: BookOpen,
    category: "Hands-on learning",
    kind: "Learning",
    mode: "Local lab",
    limitation: "Browser workstations run locally; they do not expose a live remote vulnerable service.",
  },
  {
    name: "Security knowledge hub",
    description: "Build security knowledge through the learning resources currently available.",
    href: "/knowledge",
    icon: BookOpen,
    category: "Learning",
    kind: "Learning",
    mode: "Learning resources",
    limitation: "Educational content, not operational detection or certification.",
  },
  {
    name: "API security configuration review",
    description: "Analyze pasted OpenAPI 3.x, CORS, JWT, headers and authorization settings with exportable findings.",
    href: "/developer-studio/api-security",
    icon: Globe2,
    category: "API security",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Offline review of supplied JSON/configuration; no API traffic or credential testing.",
  },
  {
    name: "CI/CD pipeline security review",
    description: "Review workflow configuration for unsafe permissions and supply-chain practices.",
    href: "/developer-studio/cicd-security",
    icon: Workflow,
    category: "DevSecOps",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Static analysis of pasted CI workflows; does not execute pipelines or access repositories.",
  },
  {
    name: "PostgreSQL RLS policy review",
    description: "Review supplied SQL policies for likely row-level security gaps and export a report.",
    href: "/developer-studio/rls-security",
    icon: LockKeyhole,
    category: "Database security",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Offline SQL heuristics, not a live database RLS or tenant-isolation test.",
  },
  {
    name: "Zero-day response checklist",
    description: "Prepare patching, containment, visibility, and recovery procedures.",
    href: "/zero-day-protection",
    icon: ShieldAlert,
    category: "Security readiness",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Manual checklist only; no live zero-day protection or detection.",
  },
  {
    name: "Local AES encryption utility",
    description: "Encrypt and decrypt text locally in the browser using AES-256-GCM.",
    href: "/quantum-encryption",
    icon: KeyRound,
    category: "Cryptography",
    kind: "Workbench",
    mode: "Local review",
    limitation: "Historical route name: classical local encryption, not quantum or post-quantum cryptography.",
  },
  {
    name: "AI security question assistant",
    description: "Ask defensive security questions through the access-controlled backend assistant.",
    href: "/ai-powered-security",
    icon: Shield,
    category: "Security guidance",
    kind: "Workbench",
    mode: "Provider-backed",
    limitation: "Backend configuration required; not a malware scanner, live threat detector, or SOC.",
  },
  {
    name: "Server-verified CTF casefiles",
    description: "Practice forensic challenges with authenticated server-side flag verification.",
    href: "/labs/verified",
    icon: Fingerprint,
    category: "Hands-on learning",
    kind: "Learning",
    mode: "Provider-backed",
    limitation: "Sign-in and deployed CTF backend required; this is not an internet-exposed vulnerable target.",
  },
  {
    name: "Local HTTP cyber range",
    description: "Explore isolated, intentional vulnerabilities using an opt-in local Docker runtime.",
    href: "/labs/range",
    icon: Network,
    category: "Hands-on learning",
    kind: "Learning",
    mode: "Local lab",
    limitation: "Requires local Docker and supervised opt-in; no public hosted attack range.",
  },
  {
    name: "Hosted range session readiness",
    description: "Inspect authenticated cyber-range reservations and provider readiness.",
    href: "/labs/sessions",
    icon: LockKeyhole,
    category: "Range operations",
    kind: "Workbench",
    mode: "Deployment-gated",
    limitation: "Public hosted session start/access remains disabled until independently approved and deployed.",
  },
  {
    name: "Authenticated DNS analysis",
    description: "Inspect DNS records with the existing backend analyzer and its stated coverage limits.",
    href: "/cybersecurity/dns",
    icon: Radar,
    category: "Domain security",
    kind: "Workbench",
    mode: "Provider-backed",
    limitation: "Sign-in and a deployed DNS Edge Function required; reports do not prove domain security.",
  },
];


const journey = [
  { step: "01", title: "Research the exposure", href: "/vulnerability-scanner", detail: "Review published CVE evidence; do not mistake a public record for a confirmed target vulnerability." },
  { step: "02", title: "Document the threat", href: "/cybersecurity/threat-modeling", detail: "Map the relevant assets, trust boundaries, and hypotheses before testing." },
  { step: "03", title: "Authorize the engagement", href: "/black-hat-pentesting", detail: "Record ownership, written scope, permitted methods, and evidence in your private engagement." },
  { step: "03A", title: "Save the private case", href: "/cybersecurity/cases", detail: "Record scoped assets, findings and retests, then store an auditable private snapshot." },
  { step: "04", title: "Record remediation", href: "/cybersecurity/assessment-remediation", detail: "Register verified findings, assign an owner, and export a report for retest." },
] as const;

const modes = ["All execution types", "Local review", "Provider-backed", "Account workspace", "Limited telemetry", "Local lab", "Deployment-gated", "Learning resources"] as const;

const CybersecurityHub = () => {
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<(typeof modes)[number]>("All execution types");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredDomains = useMemo(
    () => domains.filter((domain) =>
      [domain.title, domain.description, ...domain.capabilities].join(" ").toLowerCase().includes(normalizedQuery),
    ),
    [normalizedQuery],
  );

  const filteredDestinations = useMemo(
    () => destinations.filter((destination) =>
      (modeFilter === "All execution types" || destination.mode === modeFilter) &&
      [destination.name, destination.description, destination.category, destination.kind, destination.mode, destination.limitation]
        .join(" ").toLowerCase().includes(normalizedQuery),
    ),
    [normalizedQuery, modeFilter],
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-slate-100">
      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-4"><WorkspaceCaptureLink title="Cybersecurity Hub" /></div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-48 top-0 h-[34rem] w-[34rem] rounded-full bg-cyan-500/[0.09] blur-[110px]" />
        <div className="absolute -right-48 top-72 h-[34rem] w-[34rem] rounded-full bg-violet-500/[0.08] blur-[110px]" />
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(hsl(var(--primary)/.12)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/.12)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      </div>

      <div className="relative mx-auto max-w-[1440px] space-y-16 px-4 py-7 sm:px-6 sm:py-10 lg:px-10">
        <section className="grid gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-card/90 p-6 shadow-2xl shadow-black/30 sm:p-9 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)] lg:gap-12 lg:p-12">
          <div className="relative z-10 flex flex-col items-start justify-center">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_hsl(var(--primary)/.9)]" />
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

          <div className="relative flex min-h-[330px] flex-col justify-between overflow-hidden rounded-2xl border border-cyan-300/15 bg-card p-5 sm:p-6">
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
                className="h-11 border-white/10 bg-card pl-9 text-white placeholder:text-slate-500 focus-visible:ring-cyan-300"
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
                  className="group rounded-2xl border border-white/[0.09] bg-card/80 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b13]"
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
            <div className="flex flex-col gap-1.5 sm:items-end">
              <label htmlFor="cyber-execution-filter" className="text-xs text-slate-400">Filter by execution type</label>
              <select id="cyber-execution-filter" aria-label="Filter security workbenches by execution type" value={modeFilter} onChange={(event) => setModeFilter(event.target.value as (typeof modes)[number])} className="h-10 rounded-lg border border-white/15 bg-card px-3 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                {modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
              <span className="text-xs text-slate-500">{filteredDestinations.length} of {destinations.length} destinations</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredDestinations.map((destination) => {
              const Icon = destination.icon;
              return (
                <Link
                  key={destination.href}
                  to={destination.href}
                  className="group flex min-h-[178px] flex-col rounded-2xl border border-white/[0.09] bg-card/75 p-5 transition-all hover:border-violet-300/25 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b13]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-xl border border-violet-300/15 bg-violet-300/[0.08] p-2.5 text-violet-200"><Icon className="h-5 w-5" /></span>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge variant="outline" className="border-white/10 text-[10px] font-medium text-slate-400">{destination.kind}</Badge>
                      <Badge variant="outline" className={destination.mode === "Deployment-gated" ? "border-amber-300/30 text-amber-200" : "border-cyan-300/20 text-cyan-200"}>{destination.mode}</Badge>
                    </div>
                  </div>
                  <h3 className="mt-4 font-semibold text-white">{destination.name}</h3>
                  <p className="mt-2 flex-1 text-xs leading-5 text-slate-400">{destination.description}</p>
                  <p className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-5 text-amber-100/80">{destination.limitation}</p>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{destination.category}</span>
                    <ArrowRight className="h-4 w-4 text-cyan-300 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
            {filteredDestinations.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">
                No workbenches match the current search and execution filter. Clear the search or select another execution type.
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="cyber-journey-heading" className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Connected workflow</p>
            <h2 id="cyber-journey-heading" className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">From evidence to remediation</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A guided route across existing workbenches. These tools do not automatically share a completed case or run unauthorized tests; transfer verified evidence deliberately.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {journey.map((step) => (
              <Link key={step.step} to={step.href} className="group rounded-2xl border border-cyan-300/15 bg-card/80 p-5 transition-colors hover:border-cyan-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                <div className="flex items-center justify-between text-xs font-bold text-cyan-200"><span>{step.step} / STEP</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
                <h3 className="mt-4 font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{step.detail}</p>
              </Link>
            ))}
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
          <Link to="/knowledge" className="group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/80 p-6 transition-colors hover:border-cyan-300/25 hover:bg-card">
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
