import React from "react";
import ContinueWork from "./ContinueWork";
import EternalConstellation from "./EternalConstellation";
import HomeTaskFinder from "./HomeTaskFinder";
import { VisitorPresence } from "@/components/home/VisitorPresence";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ecosystemPillars } from "@/data/ecosystem";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

interface SectionSelectorProps {
  className?: string;
}

export const SectionSelector: React.FC<SectionSelectorProps> = ({ className = "" }) => {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuthStore();

  return (
    <main className={cn("relative isolate overflow-hidden bg-background text-white", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-72 left-[45%] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-primary/[0.13] blur-[130px]" />
        <div className="absolute right-[-18rem] top-[28rem] h-[38rem] w-[38rem] rounded-full bg-accent/[0.13] blur-[130px]" />
        <div className="absolute bottom-[-18rem] left-[-15rem] h-[34rem] w-[34rem] rounded-full bg-primary/[0.09] blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.13]" style={{ backgroundImage: "linear-gradient(hsl(var(--primary)/.12) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)/.12) 1px, transparent 1px)", backgroundSize: "72px 72px", maskImage: "linear-gradient(to bottom, black, transparent 88%)" }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-7 sm:px-6 sm:pt-10 lg:px-8">
        <section className="relative grid items-center gap-12 pb-16 pt-5 lg:min-h-[590px] lg:grid-cols-[1.08fr_.92fr] lg:gap-8 lg:pb-20">
          <div className="relative z-10 max-w-3xl">
            <h1 className="text-[clamp(2.75rem,6vw,5.5rem)] font-black leading-[1.02] tracking-tight">
              {isAuthenticated ? `Welcome back${profile?.username ? ", " + profile.username : ""}` : "Welcome to Eternyx"}
            </h1>
            <ContinueWork />
            <HomeTaskFinder />
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => document.getElementById("pillars")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })} className="h-12 rounded-xl bg-primary px-6 font-bold text-primary-foreground shadow-[0_10px_34px_hsl(var(--primary)/.18)] transition duration-200 motion-safe:hover:-translate-y-0.5 hover:bg-primary/90">
                Explore the six pillars <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              {isAuthenticated ? (
                <Button size="lg" variant="outline" onClick={() => navigate("/account")} className="h-12 rounded-xl border-border/70 bg-card/50 px-6 text-foreground transition hover:border-primary/40 hover:bg-card">
                  Open my account <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button size="lg" variant="outline" onClick={() => navigate("/auth?mode=signup")} className="h-12 rounded-xl border-border/70 bg-card/50 px-6 text-foreground transition hover:border-primary/40 hover:bg-card">
                  Join ETERNYX <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <EternalConstellation />
        </section>

        <section className="border-t border-white/[0.08] pt-14 sm:pt-16" id="pillars" aria-labelledby="pillars-heading">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[.25em] text-primary sm:text-xs">The architecture of possibility</p>
              <h2 id="pillars-heading" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Six pillars. One connected vision.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Every part has a purpose. We're growing the ecosystem in stages and staying clear about what's available today.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ecosystemPillars.map((pillar, index) => {
              const Icon = pillar.icon;
              const isActive = pillar.status === "Existing foundation";
              return (
                <Link key={pillar.id} to={pillar.href} className="group relative flex min-h-[238px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.055] to-white/[0.015] p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:from-primary/[0.07] hover:to-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.08] text-primary"><Icon className="h-6 w-6" /></div>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider", isActive ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200" : "border-white/10 bg-white/[0.035] text-slate-400")}>
                      {isActive ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />}
                      {isActive ? "Foundation live" : "In development"}
                    </span>
                  </div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">0{index + 1} / 06</p>
                  <h3 className="mb-2 text-lg font-bold text-white">{pillar.title}</h3>
                  <p className="mb-5 flex-1 text-sm leading-6 text-slate-400">{pillar.description}</p>
                  <div className="flex items-center justify-between border-t border-border/40 pt-4 text-xs font-semibold text-slate-300">
                    <span>{pillar.domains.slice(0, 2).join(" · ")}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-primary transition motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <VisitorPresence />

        <section className="mt-12 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/[0.08] via-accent/[0.04] to-primary/[0.08] p-6 sm:p-9">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-primary sm:text-xs"><Sparkles className="h-4 w-4" /> Built with intention</div>
              <h2 className="text-xl font-bold text-white sm:text-2xl">A bigger vision. Real progress. No shortcuts.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">We distinguish working foundations from planned experiences. Every capability should earn its place through usefulness, transparency, and trust.</p>
            </div>
            <Button onClick={() => document.getElementById("pillars")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })} className="shrink-0 rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90">Explore the pillars <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </section>
      </div>
    </main>
  );
};

export default SectionSelector;
