import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { ecosystemPillars } from "@/data/ecosystem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const Explore = () => {
  const [query, setQuery] = useState("");

  const filteredPillars = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return ecosystemPillars;

    return ecosystemPillars.filter((pillar) =>
      [
        pillar.title,
        pillar.description,
        pillar.purpose,
        ...pillar.domains,
      ].join(" ").toLowerCase().includes(normalizedQuery)
    );
  }, [query]);

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl space-y-10 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/70 via-slate-950 to-violet-950/60 p-6 sm:p-10 lg:p-14">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              One ecosystem. Endless possibilities.
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Explore <span className="text-cyan-300">ETERNYX</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Discover a connected ecosystem for cybersecurity, development, AI, digital work, integrations, and automation.
            </p>
            <div className="mt-8 max-w-xl">
              <label htmlFor="ecosystem-search" className="sr-only">Search ecosystem pillars and domains</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  id="ecosystem-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search pillars, domains, and capabilities..."
                  className="h-12 border-slate-700 bg-slate-950/80 pl-12 text-white placeholder:text-slate-500 focus-visible:ring-cyan-400"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">The platform map</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Six connected pillars</h2>
            <p className="mt-2 text-sm text-slate-400">Choose a pillar to see its purpose and planned capability areas.</p>
          </div>
          <p className="text-sm text-slate-500">{filteredPillars.length} of {ecosystemPillars.length} pillars</p>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredPillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <Card key={pillar.id} className="group flex h-full flex-col border-slate-800 bg-slate-900/70 text-slate-100 transition-all duration-200 hover:-translate-y-1 hover:border-cyan-400/40 hover:shadow-xl hover:shadow-cyan-950/20">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300">
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge variant="outline" className={pillar.status === "Existing foundation" ? "border-emerald-500/30 text-emerald-300" : "border-slate-600 text-slate-400"}>
                      {pillar.status}
                    </Badge>
                  </div>
                  <CardTitle className="pt-3 text-xl text-white">{pillar.title}</CardTitle>
                  <CardDescription className="min-h-[4.5rem] leading-6 text-slate-400">{pillar.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <p className="text-sm leading-6 text-slate-300">{pillar.purpose}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {pillar.domains.map((domain) => (
                      <span key={domain} className="rounded-md border border-slate-700/80 bg-slate-950/70 px-2.5 py-1 text-xs text-slate-400">{domain}</span>
                    ))}
                  </div>
                  <Button asChild variant="ghost" className="mt-6 w-full justify-between text-cyan-300 hover:bg-cyan-400/10 hover:text-cyan-200">
                    <Link to={pillar.href}>
                      Explore pillar <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {filteredPillars.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-700 p-10 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-500" />
              <p className="mt-3 font-medium text-white">No matching areas found</p>
              <p className="mt-1 text-sm text-slate-400">Try a broader search term.</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
          <p className="text-sm leading-6 text-slate-400">
            ETERNYX is being built in stages. A pillar marked Planned describes the platform direction, not a claim that its tools or integrations are already operational. Each capability will be clearly labeled as available, preview, or coming soon as it is implemented.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Explore;
