import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight, BookOpen, ChevronDown, FlaskConical, Menu,
  PanelsTopLeft, ShieldCheck, Sparkles, X, Zap
} from "lucide-react";
import { ecosystemPillars } from "@/data/ecosystem";
import { UserProfile } from "@/components/auth/UserProfile";
import { useAuthStore } from "@/store/authStore";

interface NavigationProps {
  className?: string;
}

export const MobileResponsiveNavigation = ({ className = "" }: NavigationProps) => {
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const platformTrigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ecosystemOpen, setEcosystemOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setEcosystemOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen && !ecosystemOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        (mobileOpen ? mobileTrigger : platformTrigger).current?.focus();
        setMobileOpen(false);
        setEcosystemOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, ecosystemOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnResize = () => {
      setMobileOpen(false);
      setEcosystemOpen(false);
    };
    desktop.addEventListener("change", closeOnResize);
    return () => desktop.removeEventListener("change", closeOnResize);
  }, []);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname === path || location.pathname.startsWith(path + "/");

  const closeMenus = () => {
    setMobileOpen(false);
    setEcosystemOpen(false);
  };

  return (
    <header className={`fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 ${className}`}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-5 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-slate-950">Skip to main content</a>
      <nav aria-label="Main navigation" className="relative mx-auto max-w-7xl rounded-2xl border border-white/[0.10] bg-card/85 shadow-[0_16px_60px_rgba(0,0,0,.34)] backdrop-blur-2xl">
        <div className="flex h-[68px] items-center justify-between gap-3 px-4 sm:px-5">
          <Link to="/" onClick={closeMenus} aria-label="ETERNYX home" className="group inline-flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.09] text-primary shadow-[0_0_24px_hsl(var(--primary)/.10)] transition group-hover:border-primary/50 group-hover:bg-primary/[0.14]">
              <Zap className="h-[19px] w-[19px]" />
            </span>
            <span className="text-lg font-black tracking-[0.13em] text-white sm:text-xl">ETERNYX</span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            <div className="relative" onMouseEnter={() => setEcosystemOpen(true)} onMouseLeave={() => setEcosystemOpen(false)}>
              <button ref={platformTrigger} type="button" aria-expanded={ecosystemOpen} onClick={() => setEcosystemOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setEcosystemOpen(true); } }} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${ecosystemOpen || ecosystemPillars.some((pillar) => isActive(pillar.href)) ? "bg-white/[0.09] text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"}`}>
                Platform <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${ecosystemOpen ? "rotate-180" : ""}`} />
              </button>
              {ecosystemOpen && (
                <div className="absolute left-1/2 top-full z-50 w-[min(780px,calc(100vw-2rem))] -translate-x-1/2 pt-4">
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/[.98] p-5 shadow-[0_24px_80px_rgba(0,0,0,.58)] backdrop-blur-2xl">
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[.24em] text-primary">One ecosystem</p>
                        <h2 className="mt-1 text-lg font-semibold text-white">Explore the six pillars</h2>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                      {ecosystemPillars.map((pillar, index) => {
                        const Icon = pillar.icon;
                        return (
                          <Link key={pillar.id} to={pillar.href} onClick={closeMenus} className="group flex min-h-[112px] gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.07] text-primary"><Icon className="h-[18px] w-[18px]" /></span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-white group-hover:text-primary">{pillar.shortTitle}</span>
                              <span className="mt-1 block text-xs leading-5 text-slate-400">{pillar.description}</span>
                              <span className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">0{index + 1} · {pillar.status === "Existing foundation" ? "Foundation" : "In development"}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <Link to="/education" aria-current={isActive("/education") ? "page" : undefined} className={`rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${isActive("/education") ? "bg-white/[0.09] text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"}`}>Education</Link>
            <Link to="/labs" aria-current={isActive("/labs") ? "page" : undefined} className={`rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${isActive("/labs") ? "bg-white/[0.09] text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"}`}>Labs</Link>
            <Link to="/services-hub" aria-current={isActive("/services-hub") ? "page" : undefined} className={`rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${isActive("/services-hub") ? "bg-white/[0.09] text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"}`}>Services</Link>
            <Link to="/contact" aria-current={isActive("/contact") ? "page" : undefined} className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white">Contact</Link>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            {isAuthenticated ? (
              <UserProfile />
            ) : (
              <>
                <Link to="/auth" className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-300 transition hover:text-white">Sign in</Link>
                <Link to="/auth?mode=signup" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_8px_28px_hsl(var(--primary)/.14)] transition hover:-translate-y-0.5 hover:bg-primary/90">Get started <ArrowUpRight className="h-4 w-4" /></Link>
              </>
            )}
          </div>

          <button ref={mobileTrigger} type="button" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileOpen} aria-controls="eternyx-mobile-menu" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-primary/30 hover:bg-white/[0.08] lg:hidden">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 top-[88px] z-40 bg-background/95 px-3 pb-6 pt-3 backdrop-blur-2xl lg:hidden" id="eternyx-mobile-menu">
          <div className="mx-auto flex h-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-card p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary">Navigate ETERNYX</p><p className="mt-1 text-sm text-slate-400">One ecosystem. Endless possibilities.</p></div>
              <span className="rounded-lg border border-primary/15 bg-primary/[0.06] p-2 text-primary"><PanelsTopLeft className="h-5 w-5" /></span>
            </div>
                        <button type="button" onClick={() => setEcosystemOpen((open) => !open)} aria-expanded={ecosystemOpen} className="mt-1 flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]"><Sparkles className="h-4 w-4 text-primary" /> Platform <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${ecosystemOpen ? "rotate-180" : ""}`} /></button>
            {ecosystemOpen && (
              <div className="mb-2 ml-3 grid gap-1 border-l border-primary/20 pl-3">
                {ecosystemPillars.map((pillar) => {
                  const Icon = pillar.icon;
                  return <Link key={pillar.id} to={pillar.href} onClick={closeMenus} className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm text-slate-300 transition hover:bg-primary/[0.06] hover:text-white"><Icon className="h-4 w-4 text-primary" />{pillar.shortTitle}<ArrowUpRight className="ml-auto h-3.5 w-3.5 text-slate-600" /></Link>;
                })}
              </div>
            )}
            <Link to="/education" onClick={closeMenus} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"><BookOpen className="h-4 w-4 text-primary" /> Education</Link>
            <Link to="/labs" onClick={closeMenus} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"><FlaskConical className="h-4 w-4 text-primary" /> Labs</Link>
            <Link to="/services-hub" onClick={closeMenus} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"><ShieldCheck className="h-4 w-4 text-primary" /> Services</Link>
            <Link to="/contact" onClick={closeMenus} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white">Contact</Link>
            <div className="mt-auto space-y-2 border-t border-white/[0.08] pt-4">
              {isAuthenticated ? (
                <>
                  <Link to="/account" onClick={closeMenus} className="flex min-h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white">Account center</Link>
                  <Link to="/profile" onClick={closeMenus} className="flex min-h-12 items-center justify-center rounded-xl border border-white/10 text-sm font-semibold text-slate-300">My profile</Link>
                  <Link to="/settings" onClick={closeMenus} className="flex min-h-12 items-center justify-center rounded-xl border border-white/10 text-sm font-semibold text-slate-300">Settings</Link>
                </>
              ) : (
                <>
                  <Link to="/auth" onClick={closeMenus} className="flex min-h-12 items-center justify-center rounded-xl border border-white/10 text-sm font-semibold text-white">Sign in</Link>
                  <Link to="/auth?mode=signup" onClick={closeMenus} className="flex min-h-12 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">Create your account <ArrowUpRight className="ml-2 h-4 w-4" /></Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default MobileResponsiveNavigation;
