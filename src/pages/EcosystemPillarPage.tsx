import LineWorkflow from "@/components/LineWorkflow";
import DeviceNote from "@/components/DeviceNote";
import { Link } from "react-router-dom";
import { ecosystemPillars } from "@/data/ecosystem";

const links: Record<string, [string, string][]> = {
  workspace: [["Account center", "/account"], ["My bug reports", "/my-bug-reports"], ["Eternyx AI conversations", "/eternyx-ai"], ["Preferences", "/settings"]],
  integrations: [["GitHub repository hub", "/developer-studio/github-hub"], ["API workbench", "/developer-studio/api-workbench"], ["Deployment intelligence", "/developer-studio/deployment-intelligence"]],
  automation: [["GitHub Actions", "/developer-studio/github-actions"], ["Agent studio", "/ai-arsenal/agents"]],
};

export default function EcosystemPillarPage({ pillarId }: { pillarId: string }) {
  const pillar = ecosystemPillars.find(item => item.id === pillarId);
  if (!pillar) return <Link to="/explore">Back to Explore</Link>;
  return <div className="mx-auto max-w-4xl space-y-8 px-4 pb-16">
    <Link className="text-cyan-300 underline" to="/explore">All ecosystem pillars</Link>
    <h1 className="text-4xl font-bold">{pillar.title}</h1>
    {pillarId === "workspace" && <DeviceNote />}
    {pillarId === "automation" && <LineWorkflow />}
    <nav aria-label={pillar.title + " tools"} className="grid gap-3 sm:grid-cols-2">
      {links[pillarId]?.map(([label, path]) => <Link key={path} to={path} className="rounded-xl border border-border bg-card p-5 font-medium hover:border-cyan-400 focus-visible:ring-2">{label}</Link>)}
    </nav>
  </div>;
}
