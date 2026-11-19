import { Link } from "react-router-dom";
import {
  Activity, ArrowLeft, ArrowRight, Bot, Braces, Cloud, Code2, Database,
  FileCheck2, GitBranch, LockKeyhole, Search, Shield, Workflow,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CapabilityStatus = "Local workbench" | "Backend-dependent" | "Planned";
interface Destination {
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly status: CapabilityStatus;
}
const sections: readonly { readonly title: string; readonly items: readonly Destination[] }[] = [
  {
    title: "Cybersecurity & defensive assessment",
    items: [
      {
        title: "Assessment & Remediation",
        description: "Organize authorized security findings, evidence, ownership and remediation follow-up.",
        href: "/cybersecurity/assessment-remediation", icon: FileCheck2, status: "Local workbench",
      },
      {
        title: "Zero-day Response Readiness",
        description: "Run a local preparedness checklist; no active zero-day detector or live threat feed.",
        href: "/zero-day-protection", icon: Shield, status: "Local workbench",
      },
      {
        title: "AES-GCM Text Encryption",
        description: "Encrypt text in the browser with classical AES-GCM. Not quantum-resistant encryption.",
        href: "/quantum-encryption", icon: LockKeyhole, status: "Local workbench",
      },
      {
        title: "AI Security Assistant",
        description: "Existing authenticated, entitlement-gated assistant when its backend is configured. No AI malware scanner.",
        href: "/ai-powered-security", icon: Bot, status: "Backend-dependent",
      },
      {
        title: "Platform Security Monitoring",
        description: "Review available verified platform telemetry; unavailable feeds must stay unavailable.",
        href: "/threat-monitoring", icon: Activity, status: "Backend-dependent",
      },
      {
        title: "CVE Research",
        description: "Look up public vulnerability records; keyword matches do not confirm a target vulnerability.",
        href: "/vulnerability-scanner", icon: Search, status: "Backend-dependent",
      },
    ],
  },
  {
    title: "Developer Studio",
    items: [
      {
        title: "Developer Utilities",
        description: "Browser-based JSON, Base64, URL encoding, UUID and JWT inspection utilities.",
        href: "/developer-studio", icon: Code2, status: "Local workbench",
      },
      {
        title: "API Engineering",
        description: "Inspect and prepare API specifications and requests without inventing server responses.",
        href: "/developer-studio/api-workbench", icon: Braces, status: "Local workbench",
      },
      {
        title: "DevOps Launchpad",
        description: "Prepare deployment and operational workflows using local analysis tools.",
        href: "/developer-studio/devops", icon: Workflow, status: "Local workbench",
      },
      {
        title: "Observability Intelligence",
        description: "Analyze supplied logs and observability configuration locally.",
        href: "/developer-studio/observability", icon: Activity, status: "Local workbench",
      },
      {
        title: "GitHub Integration Hub",
        description: "Inspect GitHub integration readiness; connected actions require authorized access.",
        href: "/developer-studio/github-hub", icon: GitBranch, status: "Backend-dependent",
      },
    ],
  },
  {
    title: "AI, cloud & innovation",
    items: [
      {
        title: "AI Arsenal",
        description: "Open the eight studios and check local capabilities against provider activation status.",
        href: "/ai-arsenal", icon: Bot, status: "Local workbench",
      },
      {
        title: "Document Intelligence",
        description: "Inspect, search and prepare local text document drafts; AI extraction remains disabled.",
        href: "/ai-arsenal/documents", icon: Database, status: "Local workbench",
      },
      {
        title: "Cloud & Integrations",
        description: "View the integration roadmap; this does not connect accounts or deploy cloud resources.",
        href: "/integrations", icon: Cloud, status: "Planned",
      },
      {
        title: "Automation & Innovation",
        description: "Review the automation roadmap; no autonomous jobs or connected writes are active here.",
        href: "/automation", icon: Workflow, status: "Planned",
      },
    ],
  },
];

const ServicesHub = () => (
  <div className="min-h-screen bg-[#070b14] text-white">
    <div className="mx-auto max-w-7xl space-y-10 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" className="text-slate-300">
        <Link to="/explore"><ArrowLeft className="mr-2 h-4 w-4" />Explore ETERNYX</Link>
      </Button>
      <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/40 via-slate-950 to-violet-950/30 p-7 sm:p-10">
        <h1 className="text-3xl font-bold sm:text-5xl">ETERNYX capability directory</h1>
        <p className="mt-4 max-w-3xl text-slate-300">
          Find real workbenches and planned capabilities in one place. This directory does not claim active paid services,
          real-time scanning, deployed AI models or verified consulting capacity.
        </p>
        <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">Preview · status varies by tool</Badge>
      </section>
      {sections.map(section => (
        <section key={section.title} className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {section.items.map(item => {
              const Icon = item.icon;
              return (
                <Card key={item.href} className="flex flex-col border-slate-800 bg-slate-900/70 text-slate-100">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <Icon className="h-6 w-6 text-cyan-300" aria-hidden="true" />
                      <Badge variant="outline" className="border-slate-600 text-slate-300">{item.status}</Badge>
                    </div>
                    <CardTitle className="pt-2 text-lg text-white">{item.title}</CardTitle>
                    <CardDescription className="text-slate-400">{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Button asChild variant="outline" className="w-full justify-between border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10">
                      <Link to={item.href}>Open details <ArrowRight className="h-4 w-4" /></Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  </div>
);
export default ServicesHub;
