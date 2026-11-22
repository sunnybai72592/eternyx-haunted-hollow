import LineWorkflow from "@/components/LineWorkflow";
import AutomationWorkflowStudio from "@/components/AutomationWorkflowStudio";
import { Link } from "react-router-dom";
import WorkspaceCaptureLink from "@/components/workspace/WorkspaceCaptureLink";
import { ecosystemPillars } from "@/data/ecosystem";

const links: Record<string, [string, string][]> = {
  integrations: [["GitHub repository hub", "/developer-studio/github-hub"], ["API workbench", "/developer-studio/api-workbench"], ["Deployment intelligence", "/developer-studio/deployment-intelligence"]],
  automation: [["GitHub Actions", "/developer-studio/github-actions"], ["Agent studio", "/ai-arsenal/agents"]],
};

export default function EcosystemPillarPage({ pillarId }: { pillarId: string }) {
  const pillar = ecosystemPillars.find(item => item.id === pillarId);
  if (!pillar) return <Link to="/explore">Back to Explore</Link>;
  return <div className={"mx-auto space-y-8 px-4 pb-16 " + (pillarId === "automation" ? "max-w-6xl" : "max-w-4xl")}>
    <Link className="text-cyan-300 underline" to="/explore">All ecosystem pillars</Link>
    <h1 className="text-4xl font-bold">{pillar.title}</h1>
    {pillarId === "automation" && <WorkspaceCaptureLink title="Automation" />}
    {pillarId === "automation" && <>
      <AutomationWorkflowStudio />
      <section className="space-y-3"><h2 className="text-xl font-semibold">Quick list cleaner</h2><p className="text-sm text-muted-foreground">Prefer one-step cleanup? The original list cleaner and its local Workspace saving remain available.</p><LineWorkflow /></section>
    </>}
    <nav aria-label={pillar.title + " related tools"} className="grid gap-3 sm:grid-cols-2">
      {links[pillarId]?.map(([label, path]) => <Link key={path} to={path} state={{ fromPillar: pillarId }} className="rounded-xl border border-border bg-card p-5 font-medium hover:border-cyan-400 focus-visible:ring-2">{label}</Link>)}
    </nav>
  </div>;
}
