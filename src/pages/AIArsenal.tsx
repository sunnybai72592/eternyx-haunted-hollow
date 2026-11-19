import { Link } from "react-router-dom";
import {
  ArrowRight,
  AudioLines,
  Bot,
  BrainCircuit,
  Code2,
  FileSearch,
  FileText,
  Film,
  Image,
  MessageSquareText,
  PenLine,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const plannedStudios = [
  {
    name: "AI Image Studio",
    description: "Image generation and editing workflows, with model selection, asset history, and controlled private outputs.",
    icon: Image,
  },
  {
    name: "AI Writing Studio",
    description: "Local drafting, rewriting, summarization and translation request preparation; AI execution remains disabled.",
    icon: PenLine,
  },
  {
    name: "AI Audio Studio",
    description: "Private audio inspection and browser speech preview; AI transcription and provider generation remain disabled.",
    icon: AudioLines,
  },
  {
    name: "AI Coding Studio",
    description: "Local code inspection, JSON formatting, and AI coding request drafts. No code execution or AI calls.",
    icon: Code2,
  },
  {
    name: "AI Document Intelligence",
    description: "A dedicated document-analysis experience for extracting, searching, and understanding user-provided files.",
    icon: FileSearch,
  },
  {
    name: "AI Research Studio",
    description: "Research workflows for gathering, comparing, and organizing evidence with transparent source handling.",
    icon: Search,
  },
  {
    name: "AI Agents Studio",
    description: "Configure task-focused AI agents, their goals, tools, boundaries, and approval requirements.",
    icon: Bot,
  },
];

const AIArsenal = () => {
  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl space-y-10 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-950/50 via-slate-950 to-cyan-950/40 p-7 sm:p-10 lg:p-14">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-fuchsia-400/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <Badge variant="outline" className="border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-200">
              AI ARSENAL · CAPABILITY HUB
            </Badge>
            <h1 className="mt-5 flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-5xl">
              <BrainCircuit className="h-9 w-9 shrink-0 text-fuchsia-300 sm:h-12 sm:w-12" />
              AI Arsenal
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg">
              A single home for ETERNYX AI experiences: conversation, document intelligence,
              creative media, and responsible AI-powered workflows.
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Explore the eight planned studios below. We show implementation and activation status honestly;
              a roadmap card does not mean its provider, backend, or paid capability is enabled.
            </p>
          </div>
        </section>

        <section>
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Current foundation</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Existing AI workspace</h2>
            <p className="mt-2 text-sm text-slate-400">The current conversation and document workspace remains available while the dedicated studios are built.</p>
          </div>

          <Card className="border-cyan-400/20 bg-slate-900/70 text-slate-100">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300">
                  <MessageSquareText className="h-6 w-6" />
                </div>
                <Badge variant="outline" className="border-amber-400/30 text-amber-200">Backend activation pending</Badge>
              </div>
              <CardTitle className="pt-3 text-xl text-white">ETERNYX AI & Document Workspace</CardTitle>
              <CardDescription className="leading-6 text-slate-400">
                The existing AI workspace includes conversational chat, saved sessions, and PDF/image document upload flows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 text-sm text-slate-300">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                <span>Document-assisted workflows are represented in the existing interface and processing functions.</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-slate-300">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                <span>AI chat checks the central credit system. Its database and function activation are intentionally still pending.</span>
              </div>
              <Button asChild className="w-full justify-between bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                <Link to="/eternyx-ai">Open ETERNYX AI <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">The studio roadmap</p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Eight AI studios</h2>
              <p className="mt-2 text-sm text-slate-400">One shared foundation, eight focused experiences. Planned studios are visible for orientation, not presented as live tools.</p>
            </div>
            <Badge variant="outline" className="border-violet-400/30 text-violet-200">8 studios · multi-provider architecture</Badge>
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <Card className="border-violet-400/30 bg-slate-900/70 text-slate-100">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="rounded-xl border border-violet-400/20 bg-violet-400/10 p-3 text-violet-300">
                    <Film className="h-6 w-6" />
                  </div>
                  <Badge variant="outline" className="border-amber-400/30 text-amber-200">Planned · provider not configured</Badge>
                </div>
                <CardTitle className="pt-3 text-xl text-white">AI Video Studio</CardTitle>
                <CardDescription className="leading-6 text-slate-400">
                  The flagship text-to-video and image-to-video workspace, designed for generation history, durable job status, and controlled outputs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm leading-6 text-slate-400">
                  No video is generated yet. A generation provider has not been selected or configured, and no paid provider calls are made.
                </p>
                <Button asChild variant="outline" className="w-full justify-between border-violet-400/30 bg-transparent text-violet-100 hover:bg-violet-400/10">
                  <Link to="/ai-arsenal/video">Review AI Video Studio <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
            {plannedStudios.slice(0, 1).map((studio) => {
              const Icon = studio.icon;
              return (
                <Card key={studio.name} className="border-slate-800 bg-slate-900/60 text-slate-100">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300">
                        <Icon className="h-6 w-6" />
                      </div>
                      <Badge variant="outline" className="border-slate-600 text-slate-300">Planned · not available</Badge>
                    </div>
                    <CardTitle className="pt-3 text-xl text-white">{studio.name}</CardTitle>
                    <CardDescription className="leading-6 text-slate-400">{studio.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline" className="w-full justify-between border-cyan-400/30 bg-transparent text-cyan-100 hover:bg-cyan-400/10">
                      <Link to="/ai-arsenal/image">Review AI Image Studio <ArrowRight className="h-4 w-4" /></Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {plannedStudios.slice(1).map((studio) => {
              const Icon = studio.icon;
              return (
                <Card key={studio.name} className="border-slate-800 bg-slate-900/60 text-slate-100">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300">
                        <Icon className="h-6 w-6" />
                      </div>
                      <Badge variant="outline" className="border-slate-600 text-slate-300">{["AI Writing Studio", "AI Audio Studio", "AI Coding Studio"].includes(studio.name) ? "Local workspace ready · AI disabled" : "Planned · not available"}</Badge>
                    </div>
                    <CardTitle className="pt-3 text-xl text-white">{studio.name}</CardTitle>
                    <CardDescription className="leading-6 text-slate-400">{studio.description}</CardDescription>
                  </CardHeader>
                  {["AI Writing Studio", "AI Audio Studio", "AI Coding Studio"].includes(studio.name) && (
                    <CardContent>
                      <Button asChild variant="outline" className="w-full justify-between border-cyan-400/30 bg-transparent text-cyan-100 hover:bg-cyan-400/10">
                        {studio.name === "AI Coding Studio" ? (
                          <Link to="/ai-arsenal/coding">Review AI Coding Studio <ArrowRight className="h-4 w-4" /></Link>
                        ) : studio.name === "AI Audio Studio" ? (
                          <Link to="/ai-arsenal/audio">Review AI Audio Studio <ArrowRight className="h-4 w-4" /></Link>
                        ) : (
                          <Link to="/ai-arsenal/writing">Review AI Writing Studio <ArrowRight className="h-4 w-4" /></Link>
                        )}
                      </Button>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Workflow className="h-5 w-5 text-emerald-300" />
            <h2 className="font-semibold text-white">Connected to the wider ecosystem</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            All AI studios will share the same identity, permissions, and entitlement foundation as the rest of ETERNYX.
            AI Agents will define plans and boundaries; Automation will handle external execution with explicit user approval and execution history—not simulated actions.
          </p>
          <Button asChild variant="outline" className="mt-4 border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800">
            <Link to="/explore">Explore all six pillars <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </section>
      </div>
    </div>
  );
};

export default AIArsenal;
