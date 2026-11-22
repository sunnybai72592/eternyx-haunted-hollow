import { Link } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, ClipboardList, Compass, FileText,
  LockKeyhole, MessageSquareText, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { serviceOfferings } from '@/lib/serviceOfferings';

const steps = [
  { title: 'Send your brief', note: 'Choose an area and describe the outcome you want.', icon: FileText },
  { title: 'Feasibility review', note: 'A verified operator can review the scope and request clarification.', icon: ClipboardList },
  { title: 'Agree before work', note: 'Any proposal, price, schedule and authorization are separate decisions.', icon: MessageSquareText },
] as const;

export default function ServicesHub() {
  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="relative mx-auto max-w-7xl space-y-12 px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-12 -z-0 h-80 w-[min(85vw,850px)] -translate-x-1/2 rounded-full bg-cyan-500/[0.08] blur-[110px]" />
        <header className="relative overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-gradient-to-br from-[#122034] via-[#0b1222] to-[#1a1030] px-6 py-12 sm:px-12 sm:py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/[0.06] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            <Compass className="h-4 w-4" /> ETERNYX / Service gateway
          </div>
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">Bring your next digital project into the universe.</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
            Not another list of tools. Tell us what you need built, reviewed or automated.
            Track your enquiry in your own account while we assess whether the project can be supported.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <Link to="/services/request">Submit a project brief <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/25 bg-white/[0.04] text-white hover:bg-white/[0.1]">
              <Link to="/services/requests">Track my requests</Link>
            </Button>
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-6 text-slate-400">
            This is a request-for-review service, not instant purchase or guaranteed fulfillment.
            No charges are collected here; service availability and pricing require explicit confirmation.
          </p>
        </header>

        <section id="offerings" aria-labelledby="service-offerings" className="relative space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">What can we explore together?</span>
              <h2 id="service-offerings" className="mt-2 text-3xl font-bold tracking-tight">Six directions. One service gateway.</h2>
            </div>
            <Button variant="ghost" asChild className="text-cyan-200 hover:bg-white/10">
              <Link to="/explore">Explore self-service pillars <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {serviceOfferings.map((service, index) => {
              const Icon = service.icon;
              return (
                <Card key={service.key} className="group flex h-full flex-col border-white/10 bg-slate-900/75 p-6 text-slate-100 transition-colors hover:border-cyan-300/30">
                  <div className="flex items-start justify-between">
                    <span className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.07] p-3 text-cyan-200"><Icon className="h-6 w-6" /></span>
                    <span className="text-xs font-semibold tabular-nums text-slate-500">0{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-bold text-white">{service.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{service.summary}</p>
                  <p className="mt-3 text-xs leading-6 text-slate-400">{service.scope}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
                    <Button asChild className="grow bg-white text-slate-950 hover:bg-slate-100">
                      <Link to={'/services/request?service=' + service.key}>Request review <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                    <Button asChild variant="outline" className="border-white/15 bg-transparent text-slate-200 hover:bg-white/10" aria-label={'Explore ' + service.title + ' tools'}>
                      <Link to={service.pillar}><Compass className="h-4 w-4" /></Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section aria-label="How service requests work" className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-9">
          <div className="flex items-center gap-3 text-cyan-200"><BadgeCheck className="h-6 w-6" /><span className="text-xs font-bold uppercase tracking-[0.2em]">A real process, not a pretend checkout</span></div>
          <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">How it works</h2>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                  <div className="mb-4 flex items-center gap-3 text-cyan-200"><Icon className="h-5 w-5" /><span className="text-xs font-semibold">STEP {i + 1}</span></div>
                  <h3 className="font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{step.note}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-6 flex items-start gap-2 text-sm leading-6 text-slate-400"><LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-cyan-200" />Submitted briefs are accessible to the account owner and authorized ETERNYX administrators. Never include passwords, API keys or confidential production data.</p>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm text-slate-400">
          <span><ShieldCheck className="mr-2 inline h-4 w-4 text-cyan-200" />Need technical tools rather than a managed service?</span>
          <Link className="font-semibold text-cyan-200 hover:underline" to="/explore">Open the ETERNYX ecosystem</Link>
        </footer>
      </div>
    </main>
  );
}