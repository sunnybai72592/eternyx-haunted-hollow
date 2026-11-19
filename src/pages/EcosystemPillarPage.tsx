import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ecosystemPillars } from "@/data/ecosystem";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const links: Record<string, [string, string][]> = {
  workspace: [["Account center", "/account"], ["My bug reports", "/my-bug-reports"], ["Eternyx AI conversations", "/eternyx-ai"], ["Preferences", "/settings"]],
  integrations: [["GitHub repository hub", "/developer-studio/github-hub"], ["API workbench", "/developer-studio/api-workbench"], ["Deployment intelligence", "/developer-studio/deployment-intelligence"]],
  automation: [["GitHub Actions", "/developer-studio/github-actions"], ["Agent studio", "/ai-arsenal/agents"]],
};

const noteKey = "eternyx.workspace.device-note";

function DeviceNote() {
  const [note, setNote] = useState(() => {
    try { return localStorage.getItem(noteKey) ?? ""; } catch { return ""; }
  });
  const [status, setStatus] = useState("");
  function save() {
    try {
      if (note) localStorage.setItem(noteKey, note);
      else localStorage.removeItem(noteKey);
      setStatus("Saved in this browser.");
    } catch { setStatus("Browser storage is unavailable. Copy your note before leaving."); }
  }
  return <section className="space-y-3">
    <label htmlFor="device-note" className="text-xl font-semibold">Device scratchpad</label>
    <p className="text-sm text-muted-foreground">Notes are shared by people using this browser profile.</p>
    <Textarea id="device-note" rows={6} value={note} onChange={e => { setNote(e.target.value); setStatus("Unsaved changes"); }} />
    <Button onClick={save}>Save note</Button>
    <p role="status">{status}</p>
  </section>;
}

function LineWorkflow() {
  const [source, setSource] = useState("");
  const [deduplicate, setDeduplicate] = useState(true);
  const [sort, setSort] = useState(false);
  const resultField = useRef<HTMLTextAreaElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const trimmed = source.split(/\r\n|[\r\n]/).map(line => line.trim()).filter(Boolean);
  const lines = deduplicate ? Array.from(new Set(trimmed)) : trimmed;
  if (sort) lines.sort((a, b) => a.localeCompare(b));
  const result = lines.join("\n");

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      setCopyStatus("Copied.");
    } catch {
      resultField.current?.focus();
      resultField.current?.select();
      setCopyStatus("Result selected. Use your device’s Copy command.");
    }
  }

  function downloadResult() {
    const url = URL.createObjectURL(new Blob([result], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-clean-list.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="space-y-3" onChange={() => setCopyStatus("")}>
    <h2 className="text-xl font-semibold">Clean a list</h2>
    <label htmlFor="workflow-input">Input lines</label>
    <Textarea id="workflow-input" value={source} onChange={e => setSource(e.target.value)} />
    <p className="text-sm text-muted-foreground">Blank lines and surrounding spaces are removed automatically.</p>
    <div className="flex flex-wrap gap-4">
      <label><input type="checkbox" checked={deduplicate} onChange={e => setDeduplicate(e.target.checked)} /> Remove duplicates</label>
      <label><input type="checkbox" checked={sort} onChange={e => setSort(e.target.checked)} /> Sort alphabetically</label>
    </div>
    <label htmlFor="workflow-output">Result ({lines.length} lines)</label>
    <Textarea id="workflow-output" ref={resultField} readOnly value={result} />
    <div className="flex flex-wrap gap-3">
      <Button disabled={!result} onClick={copyResult}>Copy result</Button>
      <Button variant="outline" disabled={!result} onClick={downloadResult}>Download .txt</Button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{copyStatus}</p>
  </section>;
}

export default function EcosystemPillarPage({ pillarId }: { pillarId: string }) {
  const pillar = ecosystemPillars.find(item => item.id === pillarId);
  if (!pillar) return <Link to="/explore">Back to Explore</Link>;
  return <div className="mx-auto max-w-4xl space-y-8 px-4 pb-16">
    <Link className="text-cyan-300 underline" to="/explore">All ecosystem pillars</Link>
    <h1 className="text-4xl font-bold">{pillar.title}</h1>
    {pillarId === "workspace" && <DeviceNote />}
    {pillarId === "automation" && <LineWorkflow />}
    <nav aria-label={pillar.title + " tools"} className="grid gap-3 sm:grid-cols-2">
      {links[pillarId]?.map(([label, path]) => <Link key={path} to={path} className="rounded-xl border border-border bg-card p-5 font-medium hover:border-cyan-400 focus-visible:ring-2">{label}</Link>)}
    </nav>
  </div>;
}
