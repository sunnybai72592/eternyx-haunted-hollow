import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, Compass,
  LockKeyhole, Sparkles, Workflow, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ecosystemPillars } from "@/data/ecosystem";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

interface SectionSelectorProps {
  className?: string;
}

const quickLinks = [
  {
    title: "Explore the ecosystem",
    description: "Find the capabilities and workspaces taking shape across ETERNYX.",
    href: "/explore",
    icon: Compass,
  },
  {
    title: "Cybersecurity Hub",
    description: "Explore the security foundation and responsible security workflows.",
    href: "/cybersecurity",
    icon: LockKeyhole,
  },
  {
    title: "Education",
    description: "Build knowledge through the learning experiences available today.",
    href: "/education",
    icon: BookOpen,
  },
];

export const SectionSelector: React.FC<SectionSelectorProps> = ({ className = "" }) => {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuthStore();

  return (
    <main className={cn("relative isolate overflow-hidden bg-[#050914] text-white", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-72 left-[45%] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-cyan-400/[0.13] blur-[130px]" />
        <div className="absolute right-[-18rem] top-[28rem] h-[38rem] w-[38rem] rounded-full bg-violet-600/[0.13] blur-[130px]" />
        <div className="absolute bottom-[-18rem] left-[-15rem] h-[34rem] w-[34rem] rounded-full bg-blue-500/[0.09] blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.13]" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px)", backgroundSize: "72px 72px", maskImage: "linear-gradient(to bottom, black, transparent 88%)" }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-7 sm:px-6 sm:pt-10 lg:px-8">
        <section className="relative grid items-center gap-12 pb-16 pt-5 lg:min-h-[590px] lg:grid-cols-[1.08fr_.92fr] lg:gap-8 lg:pb-20">
          <div className="relative z-10 max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-cyan-200/20 bg-cyan-200/[0.06] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[.2em] text-cyan-100 sm:text-xs">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-50 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" /></span>
              A new digital ecosystem
            </div>

            <div className="mb-5 flex items-center gap-3 text-cyan-200">
              <Zap className="h-7 w-7 sm:h-8 sm:w-8" />
              <span className="text-xs font-bold uppercase tracking-[.34em] text-slate-400">Meet your next digital universe</span>
            </div>
            <h1 className="max-w-3xl text-[clamp(3.25rem,8vw,6.8rem)] font-black leading-[.91] tracking-[-.075em] text-white">
              One ecosystem.
              <span className="mt-2 block bg-gradient-to-r from-cyan-200 via-sky-300 to-violet-300 bg-clip-text pb-2 text-transparent">Endless possibilities.</span>
            </h1>
            <p className="mt-7 max-w-xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
              Security, software creation, AI, productivity, cloud connections, and automation — brought together in one evolving digital world. Discover what works today and what we're building next.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => navigate("/explore")} className="h-12 rounded-xl bg-cyan-200 px-6 font-bold text-slate-950 shadow-[0_10px_34px_rgba(34,211,238,.18)] transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-100">
                Explore the ecosystem <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              {isAuthenticated ? (
                <Button size="lg" variant="outline" onClick={() => navigate("/account")} className="h-12 rounded-xl border-white/15 bg-white/[0.04] px-6 text-white transition hover:border-white/25 hover:bg-white/[0.08]">
                  Open my account <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button size="lg" variant="outline" onClick={() => navigate("/auth?mode=signup")} className="h-12 rounded-xl border-white/15 bg-white/[0.04] px-6 text-white transition hover:border-white/25 hover:bg-white/[0.08]">
                  Join ETERNYX <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
            {isAuthenticated && (
              <p className="mt-4 text-xs text-slate-500">Welcome back{profile?.username ? `, ${profile.username}` : ""}. Pick up where your journey continues.</p>
            )}

            <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-white/[0.08] pt-6 text-xs text-slate-400">
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Built around real capabilities</span>
              <span className="inline-flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-cyan-200" /> Trust and control by design</span>
            </div>
          </div>

          <div className="relative mx-auto flex aspect-square w-full max-w-[500px] items-center justify-center lg:ml-auto" aria-label="Abstract illustration of the connected ETERNYX ecosystem">
            <div className="absolute inset-[5%] rounded-full border border-cyan-200/[0.13]" />
            <div className="absolute inset-[15%] rounded-full border border-dashed border-sky-200/[0.17]" />
            <div className="absolute inset-[27%] rounded-full border border-violet-200/[0.16]" />
            <div className="absolute inset-[8%] rounded-full bg-cyan-300/[0.04] blur-3xl" />
            <div className="absolute h-[72%] w-[72%] rounded-full border border-cyan-100/[0.08] [transform:rotateX(68deg)_rotateZ(-24deg)]" />
            <div className="absolute h-[54%] w-[92%] rounded-full border border-violet-200/[0.12] [transform:rotateX(68deg)_rotateZ(32deg)]" />
            <div className="relative z-10 flex h-36 w-36 flex-col items-center justify-center rounded-[2rem] border border-cyan-100/25 bg-[#0b1b2b]/90 shadow-[0_0_90px_rgba(34,211,238,.20),inset_0_0_40px_rgba(34,211,238,.07)] sm:h-44 sm:w-44">
              <Zap className="mb-2 h-9 w-9 text-cyan-200 sm:h-11 sm:w-11" />
              <span className="text-lg font-black tracking-[.2em] text-white sm:text-xl">ETERNYX</span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-[.25em] text-cyan-100/60">Connected by design</span>
            </div>
            {[
              { label: "SECURITY", icon: LockKeyhole, position: "left-[4%] top-[23%]", tone: "text-cyan-200 border-cyan-200/20" },
              { label: "DEVELOP", icon: Zap, position: "right-[1%] top-[28%]", tone: "text-violet-200 border-violet-200/20" },
              { label: "AI", icon: Sparkles, position: "right-[8%] bottom-[17%]", tone: "text-fuchsia-200 border-fuchsia-200/20" },
              { label: "WORKSPACE", icon: Compass, position: "left-[0%] bottom-[22%]", tone: "text-sky-200 border-sky-200/20" },
              { label: "CLOUD", icon: Workflow, position: "left-[38%] top-[0%]", tone: "text-blue-200 border-blue-200/20" },
              { label: "AUTOMATE", icon: ArrowRight, position: "right-[34%] bottom-[0%]", tone: "text-emerald-200 border-emerald-200/20" },
            ].map(({ label, icon: Icon, position, tone }) => (
              <div key={label} className={cn("absolute z-20 inline-flex items-center gap-2 rounded-xl border bg-[#0a1221]/90 px-3 py-2.5 text-[9px] font-bold tracking-[.15em] shadow-xl backdrop-blur-xl sm:px-3.5 sm:text-[10px]", position, tone)}>
                <Icon className="h-3.5 w-3.5" />{label}
              </div>
            ))}
            <div className="absolute left-[17%] top-[12%] h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(103,232,249,.9)]" />
            <div className="absolute bottom-[12%] right-[18%] h-1.5 w-1.5 rounded-full bg-violet-200 shadow-[0_0_16px_rgba(196,181,253,.9)]" />
          </div>
        </section>

        <section className="border-t border-white/[0.08] pt-14 sm:pt-16" aria-labelledby="pillars-heading">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[.25em] text-cyan-300 sm:text-xs">The architecture of possibility</p>
              <h2 id="pillars-heading" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Six pillars. One connected vision.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Every part has a purpose. We're growing the ecosystem in stages and staying clear about what's available today.</p>
            </div>
            <Link to="/explore" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 transition hover:text-white">Explore all capabilities <ArrowRight className="h-4 w-4" /></Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ecosystemPillars.map((pillar, index) => {
              const Icon = pillar.icon;
              const isActive = pillar.status === "Existing foundation";
              const accentClasses: Record<string, string> = {
                cyan: "text-cyan-200 bg-cyan-200/[0.08] border-cyan-200/20",
                violet: "text-violet-200 bg-violet-200/[0.08] border-violet-200/20",
                fuchsia: "text-fuchsia-200 bg-fuchsia-200/[0.08] border-fuchsia-200/20",
                blue: "text-blue-200 bg-blue-200/[0.08] border-blue-200/20",
                sky: "text-sky-200 bg-sky-200/[0.08] border-sky-200/20",
                emerald: "text-emerald-200 bg-emerald-200/[0.08] border-emerald-200/20",
              };
              return (
                <Link key={pillar.id} to={pillar.href} className="group relative flex min-h-[238px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.055] to-white/[0.015] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-200/30 hover:from-cyan-200/[0.07] hover:to-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl border", accentClasses[pillar.accent] || accentClasses.cyan)}><Icon className="h-6 w-6" /></div>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider", isActive ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200" : "border-white/10 bg-white/[0.035] text-slate-400")}>
                      {isActive ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />}
                      {isActive ? "Foundation live" : "In development"}
                    </span>
                  </div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">0{index + 1} / 06</p>
                  <h3 className="mb-2 text-lg font-bold text-white">{pillar.title}</h3>
                  <p className="mb-5 flex-1 text-sm leading-6 text-slate-400">{pillar.description}</p>
                  <div className="flex items-center justify-between border-t border-white/[0.07] pt-4 text-xs font-semibold text-slate-300">
                    <span>{pillar.domains.slice(0, 2).join(" · ")}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-cyan-200 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-3" aria-label="Quick access">
          {quickLinks.map(({ title, description, href, icon: Icon }) => (
            <Link key={href} to={href} className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition duration-200 hover:border-cyan-200/20 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/[0.06] text-cyan-200"><Icon className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-cyan-200" />
            </Link>
          ))}
        </section>

        <section className="mt-12 overflow-hidden rounded-2xl border border-cyan-200/15 bg-gradient-to-r from-cyan-200/[0.08] via-blue-300/[0.04] to-violet-300/[0.08] p-6 sm:p-9">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-cyan-100 sm:text-xs"><Sparkles className="h-4 w-4" /> Built with intention</div>
              <h2 className="text-xl font-bold text-white sm:text-2xl">A bigger vision. Real progress. No shortcuts.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">We distinguish working foundations from planned experiences. Every capability should earn its place through usefulness, transparency, and trust.</p>
            </div>
            <Button onClick={() => navigate("/explore")} className="shrink-0 rounded-xl bg-white px-6 font-semibold text-slate-950 hover:bg-cyan-50">Discover ETERNYX <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </section>
      </div>
    </main>
  );
};

export default SectionSelector;
