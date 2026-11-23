import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, History, Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  developerCategories, developerTools, filterDeveloperTools,
  normalizeDeveloperSavedIds, recordDeveloperRecent, toggleDeveloperFavorite,
} from "@/lib/developerStudioCatalog.mjs";

type Tool = (typeof developerTools)[number];
const FAVORITES_KEY = "eternyx:developer-studio:favorites:v1";
const RECENT_KEY = "eternyx:developer-studio:recent:v1";

function readIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? normalizeDeveloperSavedIds(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function saveIds(key: string, value: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable or disabled. State still works for this visit.
  }
}

const modeLabel: Record<string, string> = {
  local: "Local browser tool",
  "public-readonly": "Live public · read-only",
  "browser-request": "Browser HTTP requests",
};

export default function DeveloperCommandCenter() {
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") || "").slice(0, 120);
  const rawCategory = params.get("category") || "all";
  const category = developerCategories.some((item) => item.id === rawCategory) ? rawCategory : "all";
  const [favorites, setFavorites] = useState<string[]>(() => readIds(FAVORITES_KEY));
  const [recent, setRecent] = useState<string[]>(() => readIds(RECENT_KEY));
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveIds(FAVORITES_KEY, favorites); }, [favorites]);
  useEffect(() => { saveIds(RECENT_KEY, recent); }, [recent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const updateFilter = (field: "q" | "category", value: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (!value || (field === "category" && value === "all")) next.delete(field);
      else next.set(field, value);
      return next;
    }, { replace: true });
  };

  const visible = useMemo(() => filterDeveloperTools({ query, category, favoritesOnly, favorites }),
    [query, category, favoritesOnly, favorites]);
  const recentTools = recent.map((id) => developerTools.find((tool) => tool.id === id)).filter((tool): tool is Tool => Boolean(tool));

  const toggleFavorite = (id: string) => setFavorites((current) => toggleDeveloperFavorite(current, id));
  const openTool = (id: string) => setRecent((current) => recordDeveloperRecent(current, id));
  const clearFilters = () => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("q");
      next.delete("category");
      return next;
    }, { replace: true });
    setFavoritesOnly(false);
  };

  return (
    <section aria-labelledby="developer-catalog-heading" className="space-y-5 rounded-3xl border border-cyan-400/20 bg-slate-950/50 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Developer Studio 2.0 · Navigation</p>
          <h2 id="developer-catalog-heading" className="mt-2 text-2xl font-bold text-white">Find your development workbench</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Browse existing tools by task. Capability labels describe execution scope, not production certification.</p>
        </div>
        <p className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300">{developerTools.length} linked capabilities</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <label htmlFor="developer-search" className="sr-only">Search developer tools</label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input ref={searchRef} id="developer-search" value={query}
            onChange={(event) => updateFilter("q", event.target.value.slice(0, 120))}
            onKeyDown={(event) => { if (event.key === "Escape") { updateFilter("q", ""); searchRef.current?.blur(); } }}
            placeholder="Search GitHub, SQL, APIs, DevOps… (press /)"
            className="border-slate-700 bg-slate-950 pl-10 text-white placeholder:text-slate-500" />
        </div>
        <div>
          <label htmlFor="developer-category" className="sr-only">Filter developer tools by category</label>
          <select id="developer-category" value={category} onChange={(event) => updateFilter("category", event.target.value)}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
            {developerCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={favoritesOnly ? "default" : "outline"}
          onClick={() => setFavoritesOnly((value) => !value)} aria-pressed={favoritesOnly}
          className="gap-2"><Star aria-hidden="true" className="h-4 w-4" /> Favorites ({favorites.length})</Button>
        {(query || category !== "all" || favoritesOnly) && <Button type="button" size="sm" variant="ghost" onClick={clearFilters}
          className="gap-1"><X aria-hidden="true" className="h-4 w-4" /> Clear filters</Button>}
        <p role="status" aria-live="polite" className="ml-auto text-xs text-slate-400">{visible.length} of {developerTools.length} tools shown</p>
      </div>

      {recentTools.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><History aria-hidden="true" className="h-4 w-4" /> Recently opened on this device</p>
          <div className="flex flex-wrap gap-2">
            {recentTools.map((tool) => <Link key={tool.id} to={tool.route} onClick={() => openTool(tool.id)}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-cyan-200 hover:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{tool.title}</Link>)}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
          <p className="font-medium text-white">No matching workbenches</p>
          <p className="mt-1 text-sm text-slate-400">Try another keyword or clear the active filters.</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={clearFilters}>Show all tools</Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((tool) => (
            <article key={tool.id} className="flex min-w-0 flex-col rounded-xl border border-slate-700/80 bg-slate-900/70 p-4 transition-colors hover:border-cyan-400/50">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">{developerCategories.find((item) => item.id === tool.category)?.label}</p>
                <button type="button" onClick={() => toggleFavorite(tool.id)}
                  aria-label={favorites.includes(tool.id) ? "Remove " + tool.title + " from favorites" : "Add " + tool.title + " to favorites"}
                  aria-pressed={favorites.includes(tool.id)}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                  <Star aria-hidden="true" className={"h-4 w-4 " + (favorites.includes(tool.id) ? "fill-amber-300 text-amber-300" : "")} />
                </button>
              </div>
              <h3 className="mt-1 text-base font-semibold text-white">{tool.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{tool.description}</p>
              <p className="mt-3 text-xs text-slate-400">{modeLabel[tool.mode] || "Check individual tool scope"}</p>
              <Link to={tool.route} onClick={() => openTool(tool.id)}
                className="mt-3 inline-flex w-fit items-center gap-1 rounded-md text-sm font-medium text-cyan-300 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                Open workbench <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      )}
      <p className="text-xs leading-5 text-slate-500">Favorites and recent tool names are stored only in this browser, not synced to an account. Search and category filters can be shared through the page URL. No code or tool inputs are stored by this catalog.</p>
    </section>
  );
}
