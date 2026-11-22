import {
  Bot, Cloud, Code2, Workflow, ShieldCheck, Building2,
  type LucideIcon,
} from 'lucide-react';

export const serviceOfferings = [
  {
    key: 'security-review',
    title: 'Cybersecurity assessments',
    summary: 'Request a scoped security posture review or authorized application assessment.',
    scope: 'Asset ownership and written authorization are required before any active testing.',
    icon: ShieldCheck,
    pillar: '/cybersecurity',
  },
  {
    key: 'web-app-development',
    title: 'Web & application development',
    summary: 'Discuss a new website, application, backend or API integration.',
    scope: 'Describe the product, target users and important technical constraints.',
    icon: Code2,
    pillar: '/developer-studio',
  },
  {
    key: 'ai-solutions',
    title: 'AI solutions',
    summary: 'Explore an AI-enabled workflow, assistant or document automation use case.',
    scope: 'Model availability, privacy and compute cost must be assessed before acceptance.',
    icon: Bot,
    pillar: '/ai-arsenal',
  },
  {
    key: 'cloud-devops',
    title: 'Cloud & DevOps',
    summary: 'Scope infrastructure setup, CI/CD, containerization or reliability work.',
    scope: 'Production access, deployment permissions and costs are reviewed separately.',
    icon: Cloud,
    pillar: '/integrations',
  },
  {
    key: 'workflow-automation',
    title: 'Automation & integrations',
    summary: 'Describe an operational process you want to connect, improve or automate.',
    scope: 'Third-party access and write permissions are not requested at intake.',
    icon: Workflow,
    pillar: '/automation',
  },
  {
    key: 'enterprise-projects',
    title: 'Enterprise & custom projects',
    summary: 'Outline a multi-workstream digital solution that crosses ETERNYX pillars.',
    scope: 'Complex projects require feasibility review, a written scope and a separate agreement.',
    icon: Building2,
    pillar: '/explore',
  },
] as const satisfies readonly {
  key: string;
  title: string;
  summary: string;
  scope: string;
  icon: LucideIcon;
  pillar: string;
}[];

export type ServiceKey = (typeof serviceOfferings)[number]['key'];

export const serviceRequestStatuses = {
  submitted: { label: 'Submitted', description: 'Your brief was stored and is waiting for review.' },
  reviewing: { label: 'Under review', description: 'An administrator marked this request as being reviewed.' },
  more_info: { label: 'More information needed', description: 'Check the client update for the next step.' },
  proposal_sent: { label: 'Proposal shared', description: 'A proposal or next-step discussion has been recorded; no purchase is automatic.' },
  in_progress: { label: 'In progress', description: 'An administrator marked this request as in progress.' },
  completed: { label: 'Completed', description: 'An administrator marked this request as completed.' },
  declined: { label: 'Not proceeding', description: 'The request was declined or closed without proceeding.' },
} as const;
export type ServiceRequestStatus = keyof typeof serviceRequestStatuses;

export const getServiceOffering = (value: string | null) =>
  serviceOfferings.find((item) => item.key === value);