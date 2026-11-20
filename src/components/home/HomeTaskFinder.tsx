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
  return <div className="mt-6">
    <form onSubmit={event => { event.preventDefault(); if (query.trim()) submit(query.trim()); }}>
      <label htmlFor="home-task" className="block text-xl font-semibold text-cyan-100">What would you like to do?</label>
      <div className="mt-3 flex gap-2 rounded-xl border border-cyan-200/30 bg-slate-950 p-2 focus-within:border-cyan-200">
        <input id="home-task" value={query} onChange={event => {setQuery(event.target.value); setChoices(null);}} maxLength={240} placeholder="Describe a task…" className="min-w-0 flex-1 bg-transparent px-2 text-base text-white" />
        <button disabled={!query.trim()} className="min-h-11 rounded-lg bg-cyan-200 px-4 font-semibold text-slate-950 disabled:opacity-50">Find tool</button>
      </div>
    </form>
    <div className="mt-2 flex flex-wrap gap-x-3">{examples.map(example => <button key={example} type="button" onClick={() => submit(example)} className="min-h-11 text-sm text-cyan-200 hover:underline">{example}</button>)}</div>
    <div aria-live="polite">{choices && <div className="mt-3 space-y-3 rounded-xl border border-white/15 bg-slate-950 p-4">
      {choices.length ? choices.map(choice => <div key={choice.name}>
        {choice.detail && <p className="mb-1 text-sm text-slate-300">{choice.detail}</p>}
        <Link className="inline-flex min-h-11 items-center font-semibold text-cyan-200 underline" to={choice.route}>{choice.name}</Link>
      </div>) : <><p>No matching tool found. Try a shorter description or browse the directory.</p><Link to="/explore" className="inline-flex min-h-11 items-center text-cyan-200 underline">Browse tools</Link></>}
    </div>}</div>
  </div>;
}
