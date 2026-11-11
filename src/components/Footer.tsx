import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bug, ClipboardList, Github, Zap } from "lucide-react";

const Footer: React.FC = () => (
  <footer className="relative isolate mt-0 overflow-hidden border-t border-white/[0.08] bg-[#050914] text-slate-300">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
      <div className="absolute -bottom-40 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-cyan-400/[0.045] blur-3xl" />
      <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "radial-gradient(rgba(103,232,249,.8) .7px, transparent .7px)", backgroundSize: "22px 22px" }} />
    </div>
    <div className="mx-auto grid max-w-7xl gap-9 px-5 py-10 sm:px-8 sm:py-12 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center lg:gap-12">
      <div className="min-w-0 text-center lg:text-left">
        <Link to="/" aria-label="ETERNYX home" className="inline-flex items-center justify-center gap-2.5 rounded-lg text-white transition hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 lg:justify-start">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/20 bg-cyan-200/[0.07] text-cyan-200"><Zap className="h-5 w-5" /></span>
          <span className="text-lg font-black tracking-[.18em]">ETERNYX</span>
        </Link>
        <p className="mt-3 text-sm leading-6 text-slate-400">One ecosystem. Endless possibilities.</p>
        <p className="mt-5 text-xs text-slate-500">© {new Date().getFullYear()} ETERNYX. All rights reserved.</p>
      </div>
      <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 text-sm lg:justify-start">
        <Link to="/bug-report" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-slate-300 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><Bug className="h-4 w-4" />Report a bug</Link>
        <Link to="/my-bug-reports" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-slate-300 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><ClipboardList className="h-4 w-4" />My bug reports</Link>
        <Link to="/contact" className="inline-flex min-h-10 items-center rounded-lg px-1 text-slate-300 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">Contact</Link>
        <Link to="/explore" className="inline-flex min-h-10 items-center rounded-lg px-1 text-slate-300 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">Explore</Link>
      </nav>
      <div className="flex items-center justify-center lg:justify-end">
        <a href="https://github.com/sunnybai72592/eternyx-haunted-hollow" target="_blank" rel="noreferrer" aria-label="ETERNYX on GitHub" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-medium text-slate-300 transition hover:border-cyan-200/25 hover:bg-cyan-200/[0.06] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><Github className="h-4 w-4" /> GitHub <ArrowUpRight className="h-3.5 w-3.5" /></a>
      </div>
    </div>
    <div className="border-t border-white/[0.06] px-5 py-3 text-center text-[10px] tracking-[.12em] text-slate-600">BUILT WITH INTENTION · GROWING WITH PURPOSE</div>
  </footer>
);
export default Footer;
