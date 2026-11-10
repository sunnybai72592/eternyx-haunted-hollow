import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowRight, BookOpen, FileSearch, Globe2, KeyRound,
  Network, Search, Shield, ShieldCheck, Siren, Radar, LockKeyhole, GraduationCap
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type HubSection = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tools: string[];
  href: string;
  status: "Available" | "Building";
};

const sections: HubSection[] = [
  {
    id: "intelligence",
    title: "Reconnaissance & Intelligence",
    description: "Understand domains, IP addresses, DNS records, and publicly observable security signals.",
    icon: Radar,
    tools: ["DNS lookup", "WHOIS lookup", "IP intelligence", "Subdomain discovery"],
    href: "/tools",
    status: "Building",
  },
  {
    id: "network",
    title: "Network Security",
    description: "Inspect network exposure and troubleshoot connectivity on systems you own or are authorized to assess.",
    icon: Network,
    tools: ["Network scanner", "Port assessment", "Service discovery", "Connectivity diagnostics"],
    href: "/tools/network-scanner",
    status: "Available",
  },
  {
    id: "web",
    title: "Web & Application Security",
    description: "Review TLS certificates, HTTP security headers, and common web application weaknesses.",
    icon: Globe2,
    tools: ["Vulnerability scanner", "SSL/TLS review", "HTTP header analysis", "Web security checks"],
    href: "/vulnerability-scanner",
    status: "Available",
  },
  {
    id: "crypto",
    title: "Cryptography & Data Protection",
    description: "Work with hashes, encoding, password strength, and practical data-protection utilities.",
    icon: KeyRound,
    tools: ["Hash generator", "Encoding utilities", "Password strength", "Certificate inspection"],
    href: "/tools",
    status: "Building",
  },
  {
    id: "threats",
    title: "Threat Intelligence & Monitoring",
    description: "Review security events and investigate indicators of compromise with clear, traceable context.",
    icon: Siren,
    tools: ["Threat monitoring", "IOC analysis", "Event review", "Incident insights"],
    href: "/threat-monitoring",
    status: "Available",
  },
  {
    id: "labs",
    title: "Cyber Labs & Learning",
    description: "Build practical defensive skills through guided exercises, safe simulations, and learning material.",
    icon: GraduationCap,
    tools: ["Security fundamentals", "Guided labs", "Knowledge checks", "Incident exercises"],
    href: "/knowledge",
    status: "Building",
  },
];

const featuredTools = [
  { name: "Network Scanner", detail: "Explore network discovery and diagnostics.", href: "/tools/network-scanner", icon: Network, tag: "Network" },
  { name: "Vulnerability Scanner", detail: "Assess authorized web targets for security issues.", href: "/vulnerability-scanner", icon: ShieldCheck, tag: "Web security" },
  { name: "Threat Monitoring", detail: "Review platform threat-monitoring capabilities.", href: "/threat-monitoring", icon: Activity, tag: "Monitoring" },
  { name: "Security Auditing", detail: "Explore security review and assessment services.", href: "/security-auditing", icon: FileSearch, tag: "Assessment" },
  { name: "Incident Response", detail: "Explore incident handling and response workflows.", href: "/incident-response", icon: Siren, tag: "Response" },
  { name: "Knowledge Hub", detail: "Continue learning security concepts and practices.", href: "/knowledge", icon: BookOpen, tag: "Learning" },
];

const CybersecurityHub = () => {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(
    () => sections.filter((section) =>
      [section.title, section.description, ...section.tools].join(" ").toLowerCase().includes(normalizedQuery)
    ),
    [normalizedQuery],
  );

  const filteredTools = useMemo(
    () => featuredTools.filter((tool) =>
      [tool.name, tool.detail, tool.tag].join(" ").toLowerCase().includes(normalizedQuery)
    ),
    [normalizedQuery],
  );

  return (
    <div className="min-h-screen bg-[#050914] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-[#0a1426] to-violet-950/40 p-6 shadow-2xl shadow-cyan-950/20 sm:p-10">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <Badge className="mb-5 border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 hover:bg-cyan-300/10">
              ETERNYX • PILLAR 01
            </Badge>
            <div className="mb-4 flex items-center gap-3 text-cyan-300">
              <Shield className="h-7 w-7" />
              <span className="text-xs font-semibold uppercase tracking-[0.28em]">Cybersecurity Hub</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Understand. Assess. <span className="text-cyan-300">Defend.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              Your central workspace for security intelligence, network assessment, web security,
              threat monitoring, and hands-on learning — built for responsible, authorized use.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="bg-cyan-400 font-semibold text-slate-950 hover:bg-cyan-300">
                <Link to="/tools">Explore security tools <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" className="border-slate-600 bg-slate-950/30 text-slate-200 hover:bg-slate-800">
                <Link to="/knowledge">Visit learning hub <BookOpen className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
          <div className="relative mt-9 grid grid-cols-2 gap-3 border-t border-white/10 pt-6 sm:mt-10 sm:grid-cols-3">
            <div><p className="text-2xl font-bold text-white">6</p><p className="text-xs text-slate-400">Core domains</p></div>
            <div><p className="text-2xl font-bold text-white">Authorized</p><p className="text-xs text-slate-400">Security-first approach</p></div>
            <div className="col-span-2 sm:col-span-1"><p className="text-2xl font-bold text-white">Growing</p><p className="text-xs text-slate-400">Tools and learning paths</p></div>
          </div>
        </section>

        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Explore the ecosystem</p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Six security domains</h2>
            <p className="mt-2 text-sm text-slate-400">Choose a domain to explore its capabilities and tools.</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search domains or tools..." className="border-slate-700 bg-slate-900/80 pl-9 text-white placeholder:text-slate-500 focus-visible:ring-cyan-400" />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.id} className="group border-slate-800 bg-slate-900/70 text-slate-100 transition-all duration-200 hover:-translate-y-1 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-950/30">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300"><Icon className="h-6 w-6" /></div>
                    <Badge variant="outline" className={section.status === "Available" ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-200"}>
                      {section.status}
                    </Badge>
                  </div>
                  <CardTitle className="pt-2 text-lg text-white">{section.title}</CardTitle>
                  <CardDescription className="leading-6 text-slate-400">{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-5 flex flex-wrap gap-2">
                    {section.tools.map((tool) => <span key={tool} className="rounded-md border border-slate-700/80 bg-slate-950/70 px-2 py-1 text-xs text-slate-400">{tool}</span>)}
                  </div>
                  <Button asChild variant="ghost" className="w-full justify-between text-cyan-300 hover:bg-cyan-400/10 hover:text-cyan-200">
                    <Link to={section.href}>Explore domain <ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {filteredSections.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
              No domains match “{query}”. Try another search.
            </div>
          )}
        </section>

        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-300">Start here</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Featured destinations</h2>
            </div>
            <Link to="/tools" className="hidden items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200 sm:flex">All tools <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.name} to={tool.href} className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-violet-400/40 hover:bg-slate-900">
                  <div className="rounded-lg bg-violet-400/10 p-3 text-violet-300"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">{tool.name}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{tool.detail}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" />
                </Link>
              );
            })}
            {filteredTools.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
                No featured destinations match “{query}”.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 sm:p-6">
          <div className="flex gap-3">
            <LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h3 className="font-semibold text-amber-100">Use security tools responsibly</h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Only scan systems, networks, and applications you own or have explicit permission to test.
                Tool availability does not imply authorization. ETERNYX will prioritize safe defaults,
                transparent results, and clear limitations.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CybersecurityHub;
