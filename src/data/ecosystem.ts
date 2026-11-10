import {
  Shield,
  Code2,
  BrainCircuit,
  FolderKanban,
  Cloud,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type PillarStatus = "Existing foundation" | "Planned";

export interface EcosystemPillar {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  purpose: string;
  href: string;
  status: PillarStatus;
  icon: LucideIcon;
  accent: string;
  domains: string[];
}

export const ecosystemPillars: EcosystemPillar[] = [
  {
    id: "cybersecurity",
    title: "Cybersecurity Hub",
    shortTitle: "Cybersecurity",
    description: "A home for defensive security, authorized testing, threat awareness, and security operations.",
    purpose: "Bring security resources together with responsible-use guidance and transparent tool capabilities.",
    href: "/cybersecurity",
    status: "Existing foundation",
    icon: Shield,
    accent: "cyan",
    domains: ["Security assessment", "Network defense", "Threat intelligence", "Incident response", "Digital forensics", "Security automation"],
  },
  {
    id: "developer-studio",
    title: "Developer Studio",
    shortTitle: "Developer Studio",
    description: "Practical utilities and workspaces for building, testing, debugging, and improving software.",
    purpose: "Give developers one organized place for everyday engineering workflows, from code quality to API work.",
    href: "/developer-studio",
    status: "Planned",
    icon: Code2,
    accent: "violet",
    domains: ["Code utilities", "API workbench", "Web development", "Testing and debugging", "Data formatting", "Performance"],
  },
  {
    id: "ai-arsenal",
    title: "AI Arsenal",
    shortTitle: "AI Arsenal",
    description: "A structured home for AI assistants, document intelligence, and focused productivity workflows.",
    purpose: "Make AI capabilities discoverable while clearly explaining what each assistant can and cannot do.",
    href: "/ai-arsenal",
    status: "Planned",
    icon: BrainCircuit,
    accent: "fuchsia",
    domains: ["AI assistants", "Document intelligence", "Text workflows", "Research support", "Image workflows", "AI productivity"],
  },
  {
    id: "workspace",
    title: "Digital Workspace",
    shortTitle: "Workspace",
    description: "A personal control center for projects, saved work, files, preferences, and activity.",
    purpose: "Connect useful tools to a consistent user experience without exposing private workspace data.",
    href: "/workspace",
    status: "Planned",
    icon: FolderKanban,
    accent: "blue",
    domains: ["Projects", "Saved work", "Files", "Personal dashboard", "Activity", "Preferences"],
  },
  {
    id: "integrations",
    title: "Cloud & Integrations",
    shortTitle: "Integrations",
    description: "A clear directory for connected services, APIs, cloud resources, and integration settings.",
    purpose: "Help users understand available connections, permissions, and setup requirements before connecting accounts.",
    href: "/integrations",
    status: "Planned",
    icon: Cloud,
    accent: "sky",
    domains: ["API connections", "Cloud services", "Webhooks", "Developer access", "Connected apps", "Integration status"],
  },
  {
    id: "automation",
    title: "Automation & Innovation",
    shortTitle: "Automation",
    description: "A future home for repeatable workflows, smart orchestration, and experimental ideas.",
    purpose: "Make automation understandable, controllable, and permission-aware rather than presenting simulations as live actions.",
    href: "/automation",
    status: "Planned",
    icon: Workflow,
    accent: "emerald",
    domains: ["Workflow builder", "Task automation", "Orchestration", "Scheduled tasks", "Experiments", "Innovation lab"],
  },
];
