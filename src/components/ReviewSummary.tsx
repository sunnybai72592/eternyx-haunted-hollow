import { useRef, useState } from "react";

type Counts = { Baseline: number; Candidate: number; Tie: number };
const counts = (): Counts => ({ Baseline: 0, Candidate: 0, Tie: 0 });

async function summarize(files: File[]) {
  if (files.length > 200) throw new Error("Choose up to 200 review files.");
  const seen = new Map<string, string>();
  const questions = new Map<string, Counts>();
  const total = counts();
  let duplicates = 0, legacy = 0;
  for (const file of files) {
    if (file.size > 16384) throw new Error(file.name + " exceeds the review size limit.");
    let report;
    try { report = JSON.parse(await file.text()); }
    catch { throw new Error(file.name + " could not be read as JSON."); }
    const a = report?.sources?.A, b = report?.sources?.B;
    if (report?.version !== 1 || typeof report.question !== "string" || !report.question.trim() ||
        report.question.length > 300 || !["Baseline","Candidate"].includes(a) ||
        !["Baseline","Candidate"].includes(b) || a === b || !["Clip A","Clip B","Tie"].includes(report.verdict)) {
      throw new Error(file.name + " is not a valid video review.");
    }
    const question = report.question.trim();
    if (report.reviewId !== undefined) {
      if (typeof report.reviewId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(report.reviewId)) {
        throw new Error(file.name + " contains an invalid review ID.");
      }
      const key = report.reviewId.toLowerCase();
      const signature = JSON.stringify([question, a, b, report.verdict]);
      if (seen.has(key)) {
        if (seen.get(key) !== signature) throw new Error("Two files disagree about the same review. Check your selection.");
        duplicates++;
        continue;
      }
      seen.set(key, signature);
    } else legacy++;
    const winner: keyof Counts = report.verdict === "Tie" ? "Tie" : report.verdict === "Clip A" ? a : b;
    const group = questions.get(question) ?? counts();
    group[winner]++;
    total[winner]++;
    questions.set(question, group);
  }
  return { total, groups: Array.from(questions), duplicates, legacy, count: files.length - duplicates };
}

export default function ReviewSummary() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof summarize>> | null>(null);
  const [status, setStatus] = useState("");
  const attempt = useRef(0);
  async function open(files: File[]) {
    const version = ++attempt.current;
    setSummary(null);
    if (!files.length) { setStatus(""); return; }
    setStatus("Reading reviews…");
    try {
      const result = await summarize(files);
      if (version === attempt.current) { setSummary(result); setStatus(""); }
    } catch (error) {
      if (version === attempt.current) setStatus(error instanceof Error ? error.message : "Couldn’t read the reviews.");
    }
  }
  return <details className="border-t border-slate-700 pt-3">
    <summary className="cursor-pointer text-violet-200">Compare saved verdicts</summary>
    <p className="my-2 text-sm text-slate-300">Choose reviews of the same baseline and candidate. Files are read on this device.</p>
    <label className="block">Review files (.json)<input type="file" multiple accept=".json,application/json" className="block w-full text-sm" onChange={e => void open(Array.from(e.target.files ?? []))} /></label>
    <p role="status">{status}</p>
    {summary && <div className="mt-3 space-y-2">
      <p>{summary.count} counted · {summary.duplicates} duplicate downloads skipped</p>
      <p>Candidate wins {summary.total.Candidate} · Baseline wins {summary.total.Baseline} · Ties {summary.total.Tie}</p>
      {summary.legacy > 0 && <p className="text-sm text-amber-200">{summary.legacy} older reviews lack IDs. Each selected file was counted.</p>}
      <ul className="space-y-2">{summary.groups.map(([question, row]) => <li key={question} className="break-words border-t border-slate-800 pt-2">
        <strong>{question}</strong><p className="text-sm">Candidate {row.Candidate} · Baseline {row.Baseline} · Ties {row.Tie}</p>
      </li>)}</ul>
    </div>}
  </details>;
}
