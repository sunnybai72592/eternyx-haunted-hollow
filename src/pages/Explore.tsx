import React, { useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { ecosystemPillars } from "@/data/ecosystem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import tools from "@/data/toolRegistry.json";
import { filterToolRegistry, summarizeToolRegistry, READINESS_LABELS, READINESS_VALUES } from "@/lib/toolRegistryUtils.mjs";

const Explore = () => {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const pillarFilter = params.get("pillar") ?? "all";
  const readinessFilter = params.get("readiness") ?? "all";
  const field = useRef<HTMLInputElement>(null);
  const registrySummary = useMemo(() => summarizeToolRegistry(tools), []);
  function setFilterParam(key: "pillar" | "readiness", value: string) {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  }
  function setQuery(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next, { replace: true, preventScrollReset: true });
  }

  const matchingTools = useMemo(
    () => filterToolRegistry(tools, { q: query, pillar: pillarFilter, readiness: readinessFilter }),
    [query, pillarFilter, readinessFilter],
  );

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
              <label htmlFor="ecosystem-search" className="sr-only">Search pillars, domains, and tools</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  ref={field}
                  id="ecosystem-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search pillars, domains, and capabilities..."
                  className="h-12 border-slate-700 bg-slate-950/80 pl-12 pr-16 text-white placeholder:text-slate-500 focus-visible:ring-cyan-400"
                />
                {query && <button type="button" className="absolute inset-y-0 right-2 rounded px-2 text-sm text-cyan-300 focus-visible:ring-2" onClick={() => { setQuery(""); field.current?.focus(); }}>Clear</button>}
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Tool catalogue filters" className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-white">Master tool registry</h2>
              <p className="mt-1 text-sm text-slate-400">A source-audited inventory, not a certificate that tools work in production.</p>
            </div>
            <p role="status" className="text-sm text-slate-300">
              {matchingTools.length} shown / {registrySummary.indexed} indexed · {registrySummary.productionVerified} production-verified
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-300">
              <span className="block">Pillar</span>
              <select aria-label="Filter tools by pillar" value={pillarFilter} onChange={event => setFilterParam("pillar", event.target.value)}
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white focus-visible:ring-2 focus-visible:ring-cyan-400">
                <option value="all">All six pillars</option>
                {ecosystemPillars.map(pillar => <option value={pillar.id} key={pillar.id}>{pillar.title}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-300">
              <span className="block">Readiness</span>
              <select aria-label="Filter tools by readiness" value={readinessFilter} onChange={event => setFilterParam("readiness", event.target.value)}
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white focus-visible:ring-2 focus-visible:ring-cyan-400">
                <option value="all">All maturity levels</option>
                {READINESS_VALUES.map(status => (
                  <option key={status} value={status}>{READINESS_LABELS[status]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400" aria-label="Registry readiness distribution">
            {READINESS_VALUES.map(status => (
              <span key={status} className="rounded-full border border-slate-700 px-3 py-1">
                {READINESS_LABELS[status]}: {registrySummary.byReadiness[status]}
              </span>
            ))}
          </div>
          <p className="text-xs text-amber-200">A source file and unit test are evidence of a code foundation, not evidence of completed deployed browser testing. No indexed tool is certified production-ready by this registry.</p>
        </section>

        <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">The platform map</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Six connected pillars</h2>
            <p className="mt-2 text-sm text-slate-400">Choose a pillar to see its purpose and planned capability areas.</p>
          </div>
          <p role="status" className="text-sm text-slate-400">{filteredPillars.length} matching pillars · {matchingTools.length} matching tools</p>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredPillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <Card key={pillar.id} className="group flex h-full flex-col border-slate-800 bg-slate-900/70 text-slate-100 motion-safe:transition-all duration-200 motion-safe:hover:-translate-y-1 hover:border-cyan-400/40 hover:shadow-xl hover:shadow-cyan-950/20">
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
          {filteredPillars.length === 0 && matchingTools.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-700 p-10 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-500" />
              <p className="mt-3 font-medium text-white">No matching areas found</p>
              <p className="mt-1 text-sm text-slate-400">Try a broader search term.</p>
            </div>
          )}
        </section>

        {(matchingTools.length === 0 && (query.trim() || pillarFilter !== "all" || readinessFilter !== "all")) && (
          <p role="status" className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-300">
            No indexed capabilities match these filters. Clear the search or change the pillar/readiness filters.
          </p>
        )}

        {matchingTools.length > 0 && (
          <section aria-labelledby="indexed-tools">
            <h2 id="indexed-tools" className="text-2xl font-bold">Indexed tools · {matchingTools.length} matching</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {matchingTools.map(tool => (
                <li key={tool.name}>
                  <Link to={tool.route} state={{ fromExplore: true, exploreQuery: query }} className="block h-full rounded-xl border border-slate-700 bg-slate-900 p-4 hover:border-cyan-400 focus-visible:ring-2">
                    <span className="font-semibold text-cyan-300">{tool.name}</span>
                    <p className="mt-1 text-sm text-slate-300">{tool.description}</p>
                    <p className="mt-2 text-xs text-slate-300">{READINESS_LABELS[tool.readiness] ?? "Status unreviewed"}</p>
                    <p className="mt-1 text-xs text-slate-400">{tool.execution} · {tool.access}</p>
                    <p className="mt-1 text-xs text-amber-200">{tool.verification} · No production verification claimed</p>
                    <p className="mt-1 text-xs text-slate-500">Evidence: {tool.test ?? "Source review only"} · {tool.securityScope}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};

export default Explore;
