import { Link } from "react-router-dom";
import {
  ArrowRight,
  BrainCircuit,
  FileText,
  Film,
  MessageSquareText,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
              We show implementation and activation status honestly. A visible interface does
              not mean its provider, backend, or paid capability is already enabled.
            </p>
          </div>
        </section>

        <section>
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Current foundation</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">AI experiences</h2>
            <p className="mt-2 text-sm text-slate-400">Open the existing workspace or review what is being prepared next.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
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
                  <span>AI chat now checks the central credit system. Its database and function activation are intentionally still pending.</span>
                </div>
                <Button asChild className="w-full justify-between bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                  <Link to="/eternyx-ai">Open ETERNYX AI <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="rounded-xl border border-violet-400/20 bg-violet-400/10 p-3 text-violet-300">
                    <Film className="h-6 w-6" />
                  </div>
                  <Badge variant="outline" className="border-slate-600 text-slate-300">Planned · provider not configured</Badge>
                </div>
                <CardTitle className="pt-3 text-xl text-white">AI Video Creation</CardTitle>
                <CardDescription className="leading-6 text-slate-400">
                  A future text-to-video and image-to-video workspace with generation history, job status, and controlled outputs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 text-sm text-slate-300">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                  <span>Provider credentials will remain server-side; requests will require authentication and central entitlement checks.</span>
                </div>
                <p className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm leading-6 text-slate-400">
                  No video is generated yet. We have not selected or configured a generation provider, and no paid provider calls are made.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Workflow className="h-5 w-5 text-emerald-300" />
            <h2 className="font-semibold text-white">Connected to the wider ecosystem</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            AI workflows will share the same identity, permissions, and entitlement foundation as the rest of ETERNYX.
            Automation will be built as its own pillar, with explicit user approval and execution history—not simulated actions.
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
