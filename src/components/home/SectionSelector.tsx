import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Compass,
  LockKeyhole,
  Sparkles,
  Terminal,
  Zap,
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
    description: "Browse the growing directory of ETERNYX capabilities.",
    href: "/explore",
    icon: Compass,
  },
  {
    title: "Cybersecurity Hub",
    description: "Visit the active security foundation.",
    href: "/cybersecurity",
    icon: LockKeyhole,
  },
  {
    title: "Education Hub",
    description: "Keep learning through the existing education experience.",
    href: "/education",
    icon: BookOpen,
  },
];

export const SectionSelector: React.FC<SectionSelectorProps> = ({ className = "" }) => {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuthStore();

  return (
    <main className={cn("relative min-h-screen overflow-hidden bg-[#050711] text-white", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-56 left-1/2 h-[34rem] w-[56rem] -translate-x-1/2 rounded-full bg-cyan-500/[0.12] blur-[120px]" />
        <div className="absolute right-[-12rem] top-[34rem] h-[28rem] w-[28rem] rounded-full bg-violet-600/[0.10] blur-[110px]" />
        <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px)", backgroundSize: "64px 64px" }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8">
        <section className="mx-auto max-w-4xl text-center">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.9)]" />
            The digital ecosystem is taking shape
          </div>

          <div className="mb-5 flex items-center justify-center gap-3">
            <Zap className="h-7 w-7 text-cyan-300 sm:h-9 sm:w-9" />
            <h1 className="text-5xl font-black tracking-[-0.08em] sm:text-7xl md:text-8xl">ETERNYX</h1>
          </div>

          <p className="mb-5 text-xl font-medium tracking-tight text-white sm:text-2xl md:text-3xl">
            One ecosystem. <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">Endless possibilities.</span>
          </p>
          <p className="mx-auto mb-9 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            A connected digital world for security, software creation, artificial intelligence, productivity, cloud services, and automation — built with clarity, usefulness, and trust at its core.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => navigate("/explore")} className="h-12 rounded-full bg-cyan-300 px-7 font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-200">
              Explore ETERNYX <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {isAuthenticated ? (
              <Button size="lg" variant="outline" onClick={() => navigate("/dashboard")} className="h-12 rounded-full border-white/15 bg-white/[0.04] px-7 text-white hover:bg-white/10">
                <Terminal className="mr-2 h-4 w-4" /> Open dashboard
              </Button>
            ) : (
              <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="h-12 rounded-full border-white/15 bg-white/[0.04] px-7 text-white hover:bg-white/10">
                Sign in <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
          {isAuthenticated && (
            <p className="mt-4 text-xs text-slate-500">
              Welcome back{profile?.username ? `, ${profile.username}` : ""}. Your next destination is waiting.
            </p>
          )}
        </section>

        <section className="mt-20 sm:mt-28" aria-labelledby="pillars-heading">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">The ETERNYX universe</p>
              <h2 id="pillars-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">Six pillars. One connected vision.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Each pillar has a clear purpose. We’ll grow them in stages and be transparent about what is available today.</p>
            </div>
            <Link to="/explore" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 transition hover:text-cyan-200">
              View directory <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ecosystemPillars.map((pillar, index) => {
              const Icon = pillar.icon;
              const isActive = pillar.status === "Existing foundation";
              const accentClasses: Record<string, string> = {
                cyan: "text-cyan-300 bg-cyan-300/10 border-cyan-300/20",
                violet: "text-violet-300 bg-violet-300/10 border-violet-300/20",
                fuchsia: "text-fuchsia-300 bg-fuchsia-300/10 border-fuchsia-300/20",
                blue: "text-blue-300 bg-blue-300/10 border-blue-300/20",
                sky: "text-sky-300 bg-sky-300/10 border-sky-300/20",
                emerald: "text-emerald-300 bg-emerald-300/10 border-emerald-300/20",
              };
              return (
                <Link
                  key={pillar.id}
                  to={pillar.href}
                  className="group relative flex min-h-[245px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-slate-900/55 p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl border", accentClasses[pillar.accent] || accentClasses.cyan)}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", isActive ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-slate-400")}>
                      {isActive ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />}
                      {isActive ? "Foundation live" : "Planned"}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-white">{pillar.title}</h3>
                  <p className="mb-5 flex-1 text-sm leading-6 text-slate-400">{pillar.description}</p>
                  <div className="flex items-center justify-between border-t border-white/[0.07] pt-4 text-xs font-semibold text-slate-300">
                    <span>{pillar.domains.slice(0, 2).join(" · ")}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-cyan-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <span className="sr-only">Open {pillar.title}</span>
                  <span className="pointer-events-none absolute -bottom-16 -right-12 h-36 w-36 rounded-full bg-cyan-400/[0.04] blur-3xl transition group-hover:bg-cyan-400/[0.10]" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-3" aria-label="Quick access">
          {quickLinks.map(({ title, description, href, icon: Icon }) => (
            <Link key={href} to={href} className="group flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-5 transition hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-cyan-300">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-cyan-300" />
            </Link>
          ))}
        </section>

        <section className="mt-16 rounded-2xl border border-cyan-300/15 bg-gradient-to-r from-cyan-300/[0.07] via-blue-400/[0.04] to-violet-400/[0.07] p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-200"><Sparkles className="h-4 w-4" /> Built in the open</div>
              <h2 className="text-xl font-bold sm:text-2xl">A bigger vision, built one real capability at a time.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">We distinguish working foundations from planned experiences. No inflated tool counts, fake monitoring claims, or pretend integrations — just a platform that earns its future.</p>
            </div>
            <Button onClick={() => navigate("/explore")} className="shrink-0 rounded-full bg-white px-6 font-semibold text-slate-950 hover:bg-slate-200">
              Discover the pillars <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        <footer className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-white/[0.07] pt-6 text-center text-xs text-slate-500 sm:flex-row sm:text-left">
          <span>© {new Date().getFullYear()} ETERNYX. One ecosystem. Endless possibilities.</span>
          <span>Designed for the digital world ahead.</span>
        </footer>
      </div>
    </main>
  );
};

export default SectionSelector;
