import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import tools from "@/data/toolRegistry.json";

const examples = ["Check my domain", "Make a video", "Learn something"];
type Choice = { name: string; route: string; detail?: string };
const domains: Choice = { name: "Check a domain’s DNS", route: "/cybersecurity/dns", detail: "Sign in to run a live DNS review for your domain." };
const video: Choice = { name: "Open Video Studio", route: "/ai-arsenal/video", detail: "Sign in to plan shots and export a storyboard. Video rendering is currently unavailable." };
const education: Choice = { name: "Explore education", route: "/education" };

function findChoices(input: string): Choice[] {
  const words = input.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const matches = (pattern: RegExp) => words.some(word => pattern.test(word));
  const choices: Choice[] = [];
  if (matches(/^(domains?|dns|nameservers?|dmarc|spf)$/)) choices.push(domains);
  if (matches(/^(videos?|movies?|clips?|storyboards?|films?)$/)) choices.push(video);
  if (matches(/^(learn|learning|study|studying|courses?|lessons?|quizzes|quiz|education|exams?|cbt)$/)) choices.push(education);
  if (choices.length) return choices;
  const ignored = new Set(["a","an","i","my","the","to","can","you","me","please","want","make","with","how","do","help","and","in","for","is","on"]);
  const terms = [...new Set(words.filter(word => !ignored.has(word)))];
  const ranked = tools.map(tool => {
    const name = tool.name.toLowerCase().split(/[^a-z0-9]+/);
    return {tool, score: terms.filter(term => name.includes(term)).length};
  }).filter(row => row.score > 0).sort((a,b) => b.score - a.score);
  if (ranked.length === 0) return [];
  return ranked.filter(row => row.score === ranked[0].score).slice(0,4).map(({tool}) => ({
    name: tool.name, route: tool.route, detail: tool.description + " " + tool.access + ".",
  }));
}

export default function HomeTaskFinder() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<Choice[] | null>(null);
  function submit(value: string) {
    setQuery(value);
    const found = findChoices(value);
    if (found.length === 1 && !found[0].detail) navigate(found[0].route);
    else setChoices(found);
  }
  const resultCount = choices?.length ?? 0;
  return <div className="mt-6">
    <form onSubmit={event => { event.preventDefault(); if (query.trim()) submit(query.trim()); }}>
      <label htmlFor="home-task" className="block text-xl font-semibold text-foreground">What would you like to do?</label>
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-2 focus-within:border-primary sm:flex-row">
        <input id="home-task" type="search" autoComplete="off" aria-describedby="home-task-hint" aria-controls="home-task-results" value={query} onChange={event => {setQuery(event.target.value); setChoices(null);}} maxLength={240} placeholder="Describe a task…" className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        <button type="submit" disabled={!query.trim()} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">Find tool</button>
      </div>
    </form>
    <p id="home-task-hint" className="mt-2 text-xs text-muted-foreground">Search by task or try a quick example. Results are suggestions, not executed tools.</p>
    <div className="mt-2 flex flex-wrap gap-x-3">{examples.map(example => <button key={example} type="button" onClick={() => submit(example)} className="min-h-11 rounded-md px-1 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{example}</button>)}</div>
    <div id="home-task-results" aria-live="polite" aria-atomic="true">{choices && <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{resultCount ? `${resultCount} suggested ${resultCount === 1 ? "tool" : "tools"}` : "No suggestions found"}</p>
      {choices.length ? choices.map(choice => <div key={choice.name}>
        {choice.detail && <p className="mb-1 text-sm text-muted-foreground">{choice.detail}</p>}
        <Link className="inline-flex min-h-11 items-center rounded-md font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" to={choice.route}>{choice.name}</Link>
      </div>) : <><p className="text-sm text-foreground">No matching tool found. Try a shorter description or browse the directory.</p><Link to="/explore" className="inline-flex min-h-11 items-center rounded-md text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Browse tools</Link></>}
    </div>}</div>
  </div>;
}
