import { useState } from "react";
import { Link } from "react-router-dom";
import tools from "@/data/toolRegistry.json";
import { findHomeTaskChoices } from "@/lib/homeTaskDiscovery.mjs";

type Choice = { name: string; route: string; detail?: string };

const examples = ["Check my domain", "Make a video", "Learn something"];
export default function HomeTaskFinder() {
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<Choice[] | null>(null);
  function submit(value: string) {
    setQuery(value);
    const found = findHomeTaskChoices(value, tools);
    setChoices(found);
  }
  const resultCount = choices?.length ?? 0;
  const canSearch = query.trim().length > 0;
  const clearSearch = () => { setQuery(""); setChoices(null); };
  return <div className="mt-6">
    <form onSubmit={event => { event.preventDefault(); if (canSearch) submit(query.trim()); }}>
      <label htmlFor="home-task" className="block text-xl font-semibold text-foreground">What would you like to do?</label>
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-2 focus-within:border-primary sm:flex-row">
        <input id="home-task" type="search" autoComplete="off" aria-describedby="home-task-hint" aria-controls="home-task-results" value={query} onChange={event => {setQuery(event.target.value); setChoices(null);}} maxLength={240} placeholder="Describe a task…" className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        <button type="submit" disabled={!canSearch} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">Find tool</button>
      </div>
    </form>
    {(query || choices !== null) && (
      <button type="button" onClick={clearSearch} className="mt-2 inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Clear task search and suggestions">
        Clear search
      </button>
    )}
    <p id="home-task-hint" className="mt-2 text-xs text-muted-foreground">Search by task or try a quick example. Results are suggestions, not executed tools.</p>
    <div className="mt-2 flex flex-wrap gap-x-3">{examples.map(example => <button key={example} type="button" onClick={() => submit(example)} className="min-h-11 rounded-md px-1 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{example}</button>)}</div>
    <div id="home-task-results" role="status" aria-live="polite" aria-atomic="true">{choices && <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{resultCount ? `${resultCount} suggested ${resultCount === 1 ? "tool" : "tools"}` : "No suggestions found"}</p>
      {choices.length ? choices.map(choice => <div key={choice.route}>
        {choice.detail && <p className="mb-1 text-sm text-muted-foreground">{choice.detail}</p>}
        <Link className="inline-flex min-h-11 items-center rounded-md font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" to={choice.route}>{choice.name}</Link>
      </div>) : <><p className="text-sm text-foreground">No matching tool found. Try a shorter description or browse the directory.</p><Link to="/explore" className="inline-flex min-h-11 items-center rounded-md text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Browse tools</Link></>}
    </div>}</div>
  </div>;
}
