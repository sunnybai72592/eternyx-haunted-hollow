import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Flag,
  FlaskConical, KeyRound, Lightbulb, RotateCcw, ShieldAlert, TerminalSquare, Trophy, XCircle,
} from "lucide-react";
import {
  buildCtfTargetDocument, ctfRooms, CTF_STORAGE_KEY,
  readCtfProgress, tallyCtfProgress, validateCtfFlag,
} from "@/lib/eternyxCtf.mjs";

type Feedback = { valid: boolean; reason: string } | null;
type Filter = "all" | "Beginner" | "Intermediate";

const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const outlineButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function initialSolvedRooms(): string[] {
  try {
    return readCtfProgress(window.localStorage.getItem(CTF_STORAGE_KEY));
  } catch {
    return [];
  }
}

export default function EternyxCtf() {
  const [selectedId, setSelectedId] = useState(ctfRooms[0].id);
  const [solvedIds, setSolvedIds] = useState<string[]>(initialSolvedRooms);
  const [filter, setFilter] = useState<Filter>("all");
  const [flag, setFlag] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [hintCount, setHintCount] = useState(0);
  const [instance, setInstance] = useState(0);

  const current = useMemo(() => ctfRooms.find((room) => room.id === selectedId)!, [selectedId]);
  const summary = useMemo(() => tallyCtfProgress(solvedIds), [solvedIds]);
  const visibleRooms = useMemo(() => ctfRooms.filter((room) => filter === "all" || room.difficulty === filter), [filter]);
  const target = useMemo(() => buildCtfTargetDocument(selectedId), [selectedId]);
  const alreadySolved = solvedIds.includes(selectedId);

  useEffect(() => {
    try {
      window.localStorage.setItem(CTF_STORAGE_KEY, JSON.stringify(solvedIds));
    } catch {
      // Storage can be disabled. The current tab remains fully usable.
    }
  }, [solvedIds]);

  const changeRoom = (id: string) => {
    setSelectedId(id);
    setFlag("");
    setFeedback(null);
    setHintCount(0);
    setInstance((value) => value + 1);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateCtfFlag(selectedId, flag);
    setFeedback(result);
    if (result.valid) {
      setSolvedIds((currentIds) => currentIds.includes(selectedId) ? currentIds : [...currentIds, selectedId]);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-7 px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <Link to="/labs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to ETERNYX Labs
        </Link>

        <header className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.13] via-card to-accent/[0.07] p-6 sm:p-9">
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.09] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Flag className="h-4 w-4" /> ETERNYX CTF · Interactive rooms
            </span>
            <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Find the bug. Capture the flag.</h1>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              Four original, intentionally flawed mini-apps. Explore each target, reproduce its weakness and find
              an ETERNYX{"{...}"} flag. Submit the flag here to track your practice progress on this device.
            </p>
            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground">
              <ShieldAlert className="mr-2 inline h-4 w-4 align-text-bottom text-amber-500" />
              These are browser-only training targets, not separate vulnerable web servers or Kali VMs.
              All targets and answers are included in public client code. Scoring is local, not a trusted or ranked competition.
              Practice only in these isolated targets or systems you are authorized to test.
            </div>
          </div>
        </header>

        <section aria-label="CTF practice progress" className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Flag className="h-4 w-4" /> Rooms solved</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{summary.solved} <span className="text-base font-normal text-muted-foreground">/ {ctfRooms.length}</span></p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Trophy className="h-4 w-4" /> Local practice points</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{summary.points} <span className="text-base font-normal text-muted-foreground">/ {summary.possible}</span></p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your progress</p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: (summary.solved / ctfRooms.length) * 100 + "%" }} />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Saved in this browser when storage is available. Not linked to your account.</p>
          </div>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-3 rounded-2xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center justify-between gap-2 px-2 pt-2">
              <h2 className="text-sm font-semibold">Challenge rooms</h2>
              <span className="text-xs text-muted-foreground">{ctfRooms.length} available</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(["all", "Beginner", "Intermediate"] as Filter[]).map((option) => (
                <button key={option} type="button" aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                  className={"rounded-lg px-2 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                    (filter === option ? "bg-primary/15 text-primary" : "bg-background/40 text-muted-foreground hover:text-foreground")}>
                  {option === "all" ? "All" : option}
                </button>
              ))}
            </div>
            <div className="grid gap-2">
              {visibleRooms.map((room) => {
                const solved = solvedIds.includes(room.id);
                return (
                  <button key={room.id} type="button" aria-pressed={selectedId === room.id}
                    onClick={() => changeRoom(room.id)}
                    className={"flex w-full items-start gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                      (selectedId === room.id ? "border-primary/40 bg-primary/[0.08]" : "border-border/60 bg-background/30 hover:border-primary/30")}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                      {solved ? <CheckCircle2 className="h-4 w-4" /> : String(ctfRooms.indexOf(room) + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{room.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{room.difficulty} · {room.points} pts</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{room.category}</span>
                    </span>
                    <ChevronRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </aside>

          <main aria-labelledby="room-title" className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-primary">
                <span className="rounded-lg bg-primary/10 px-2.5 py-1.5">{current.difficulty}</span>
                <span className="rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground">{current.category}</span>
                <span className="rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground">{current.points} practice points</span>
              </div>
              <h2 id="room-title" className="mt-4 text-2xl font-bold">{current.title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{current.objective}</p>
              <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Skill: {current.skill}</p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold"><TerminalSquare className="h-5 w-5 text-primary" /> Training target</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Interactive in-memory micro-app · isolated opaque-origin iframe</p>
                </div>
                <button type="button" className={outlineButton} onClick={() => setInstance((value) => value + 1)}><RotateCcw className="h-4 w-4" /> Reset target</button>
              </div>
              <iframe
                key={selectedId + ":" + instance}
                title={"Isolated CTF target: " + current.title}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={target}
                className="h-[390px] w-full rounded-xl border border-border bg-white sm:h-[450px]"
              />
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Inspect and interact only with this practice page. If needed, use browser developer tools to investigate source, DOM or JavaScript.
                The sandbox is not a general-purpose secure code runner.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-6">
              <h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5 text-primary" /> Submit discovered flag</h3>
              <p className="mt-2 text-sm text-muted-foreground">Copy the exact token you find inside this room. Format: <code className="rounded bg-muted px-1 py-0.5">ETERNYX{"{...}"}</code></p>
              <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
                <label htmlFor="ctf-flag" className="sr-only">Discovered flag</label>
                <input id="ctf-flag" type="text" required value={flag} onChange={(event) => { setFlag(event.target.value); setFeedback(null); }} placeholder="ETERNYX{...}" maxLength={160} autoComplete="off" spellCheck={false}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-2.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                <button type="submit" className={primaryButton}><Flag className="h-4 w-4" /> Check flag</button>
              </form>
              {feedback && <p role="status" aria-live="polite" className={"mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm " +
                (feedback.valid ? "border-primary/30 bg-primary/[0.06]" : "border-destructive/25 bg-destructive/[0.05]")}>
                {feedback.valid ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /> : <XCircle className="h-5 w-5 shrink-0 text-destructive" />}{feedback.reason}
              </p>}
              {alreadySolved && <p className="mt-3 text-sm font-semibold text-primary">Solved on this device. You can replay this challenge as often as you like.</p>}
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold"><Lightbulb className="h-5 w-5 text-primary" /> Hints</h3>
                <button type="button" className={outlineButton} disabled={hintCount >= current.hints.length}
                  onClick={() => setHintCount((count) => Math.min(count + 1, current.hints.length))}>
                  {hintCount >= current.hints.length ? "All hints revealed" : "Reveal next hint"}
                </button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Hints grow more specific. They don't deduct practice points.</p>
              {hintCount > 0 && (
                <ol className="mt-4 space-y-2">
                  {current.hints.slice(0, hintCount).map((hint, index) => (
                    <li key={index} className="rounded-xl border border-border/70 bg-background/40 p-3 text-sm leading-6">
                      <span className="mr-2 font-semibold text-primary">Hint {index + 1}.</span>{hint}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </main>
        </div>

        <section className="grid gap-3 md:grid-cols-3">
          <Link to="/labs" className="rounded-2xl border border-border/70 bg-card/70 p-5 transition hover:border-primary/40">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">More practical labs</h3><p className="mt-2 text-sm text-muted-foreground">Web coding, headers, SQL defenses and more.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open Labs <ArrowRight className="h-4 w-4" /></span>
          </Link>
          <Link to="/black-hat-pentesting" className="rounded-2xl border border-border/70 bg-card/70 p-5 transition hover:border-primary/40">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">Authorized pentesting</h3><p className="mt-2 text-sm text-muted-foreground">Work with scoped, documented real-world assessments.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open workspace <ArrowRight className="h-4 w-4" /></span>
          </Link>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
            <RotateCcw className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">Practice reset</h3><p className="mt-2 text-sm text-muted-foreground">Start over on this device without affecting your ETERNYX account.</p>
            <button type="button" onClick={() => { setSolvedIds([]); setFlag(""); setFeedback(null); }} className="mt-3 text-sm font-semibold text-primary underline-offset-4 hover:underline">Clear local solves</button>
          </div>
        </section>

        <footer className="rounded-xl border border-border bg-card/60 p-4 text-xs leading-6 text-muted-foreground">
          These starter CTF challenges execute entirely in your browser. Scores are browser-local and can be altered by anyone with developer tools.
          No backend verification, cross-device leaderboard, certificates, shared competition, private target VM, or production data is involved.
          A future isolated cyber range will be needed for server-graded challenges and vulnerable backend applications.
        </footer>
      </div>
    </div>
  );
}
