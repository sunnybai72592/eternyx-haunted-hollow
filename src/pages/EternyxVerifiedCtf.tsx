import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, FileSearch2, Flag, KeyRound, Lightbulb, LockKeyhole,
  RefreshCcw, ShieldCheck, Trophy, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { tallyVerifiedCtfSolves, VERIFIED_CTF_MISSIONS } from "@/lib/eternyxVerifiedCtf.mjs";

const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

type SolveRow = { mission_id: string; solved_at: string };
type ResponseData = Record<string, unknown>;

async function requestCtf(action: string, missionId?: string, flag?: string): Promise<ResponseData> {
  const { data, error } = await supabase.functions.invoke("ctf-verified", {
    body: { action, ...(missionId ? { missionId } : {}), ...(flag ? { flag } : {}) },
  });
  if (error) {
    let reason = error.message;
    try {
      const response = error.context;
      if (response && typeof response.json === "function") {
        const detail = await response.json();
        if (detail && typeof detail.error === "string" && detail.error.length <= 200) {
          reason = detail.error;
        }
      }
    } catch {
      // Preserve the original transport error.
    }
    throw new Error(reason);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The verified CTF service returned an invalid response.");
  }
  return data as ResponseData;
}

export default function EternyxVerifiedCtf() {
  const { isAuthenticated, user } = useAuthStore();
  const [selectedId, setSelectedId] = useState(VERIFIED_CTF_MISSIONS[0].id);
  const [solves, setSolves] = useState<SolveRow[]>([]);
  const [serverStatus, setServerStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [serviceError, setServiceError] = useState("");
  const [casefile, setCasefile] = useState("");
  const [casefileError, setCasefileError] = useState("");
  const [answer, setAnswer] = useState("");
  const [hintCount, setHintCount] = useState(0);
  const [busy, setBusy] = useState<"artifact" | "submit" | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const selected = useMemo(() => VERIFIED_CTF_MISSIONS.find((mission) => mission.id === selectedId)!, [selectedId]);
  const knownIds = useMemo(() => VERIFIED_CTF_MISSIONS.map(({ id }) => id), []);
  const solvedIds = useMemo(() => solves.map(({ mission_id }) => mission_id).filter((id) => knownIds.includes(id)), [solves, knownIds]);
  const summary = useMemo(() => tallyVerifiedCtfSolves(solvedIds), [solvedIds]);

  const refreshProgress = async () => {
    const response = await requestCtf("progress");
    if (response.verifiedByServer !== true || !Array.isArray(response.solves)) {
      throw new Error("Verified progress could not be authenticated.");
    }
    const rows: SolveRow[] = [];
    for (const item of response.solves) {
      if (item && typeof item === "object" && typeof item.mission_id === "string" &&
          typeof item.solved_at === "string" && knownIds.includes(item.mission_id)) {
        rows.push({ mission_id: item.mission_id, solved_at: item.solved_at });
      }
    }
    setSolves(rows);
    setServerStatus("ready");
    setServiceError("");
  };

  useEffect(() => {
    let active = true;
    if (!isAuthenticated || !user) {
      setServerStatus("idle");
      setSolves([]);
      setCasefile("");
      return;
    }
    setServerStatus("loading");
    requestCtf("progress").then((response) => {
      if (!active) return;
      if (response.verifiedByServer !== true || !Array.isArray(response.solves)) {
        throw new Error("Verified progress response is invalid.");
      }
      const rows = response.solves.filter((item): item is SolveRow =>
        !!item && typeof item === "object" &&
        typeof item.mission_id === "string" && typeof item.solved_at === "string" &&
        knownIds.includes(item.mission_id));
      setSolves(rows);
      setServerStatus("ready");
      setServiceError("");
    }).catch((error) => {
      if (!active) return;
      setServerStatus("unavailable");
      setServiceError(error instanceof Error ? error.message : "Verified CTF is unavailable.");
    });
    return () => { active = false; };
  }, [isAuthenticated, user?.id, knownIds]);

  const chooseMission = (id: string) => {
    setSelectedId(id);
    setCasefile("");
    setCasefileError("");
    setAnswer("");
    setHintCount(0);
    setFeedback(null);
  };

  const loadCasefile = async () => {
    setBusy("artifact");
    setCasefileError("");
    setFeedback(null);
    try {
      const response = await requestCtf("artifact", selectedId);
      if (response.missionId !== selectedId || typeof response.casefile !== "string") {
        throw new Error("The server returned an invalid training casefile.");
      }
      setCasefile(response.casefile);
    } catch (error) {
      setCasefile("");
      setCasefileError(error instanceof Error ? error.message : "Casefile could not be loaded.");
    } finally {
      setBusy(null);
    }
  };

  const submitFlag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("submit");
    setFeedback(null);
    try {
      const result = await requestCtf("submit", selectedId, answer.trim());
      if (result.accepted !== true || result.verifiedByServer !== true) {
        throw new Error("Flag submission did not return a verified result.");
      }
      await refreshProgress();
      setFeedback({ success: true, message: "Flag verified and your account's solve saved by the server." });
      setAnswer("");
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : "Flag verification failed." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-7 px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <Link to="/labs/ctf" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> Back to browser CTF rooms</Link>

        <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-card to-accent/[0.07] p-6 sm:p-9">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary"><ShieldCheck className="h-4 w-4" /> ETERNYX · Server-verified CTF</p>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Forensic Challenge Missions</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Investigate original training casefiles, decode evidence, and submit user-specific flags for server-verified progress.
            These missions require a signed-in account and a configured backend. They are not exploitable websites or virtual machines.
          </p>
        </header>

        {!isAuthenticated && (
          <section className="rounded-2xl border border-border/70 bg-card/70 p-6">
            <h2 className="flex items-center gap-2 text-xl font-bold"><LockKeyhole className="h-5 w-5" /> Sign in to begin</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Flag verification and progress belong to your ETERNYX account, not local storage.</p>
            <Link to="/auth?redirect=%2Flabs%2Fverified" className={buttonClass + " mt-4"}>Sign in to ETERNYX</Link>
          </section>
        )}

        {isAuthenticated && (
          <>
            {serverStatus === "loading" && <p role="status" className="rounded-xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">Checking verified mission service and account progress...</p>}
            {serverStatus === "unavailable" && (
              <div role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-5">
                <h2 className="font-semibold">Verified missions are not available yet</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{serviceError}</p>
                <p className="mt-2 text-xs text-muted-foreground">The database migration, CTF verification function and CTF_FLAG_SECRET must be installed by a trusted administrator. This page will not invent successful solves while unavailable.</p>
                <button className={secondaryButton + " mt-3"} type="button" onClick={() => { setServerStatus("loading"); void refreshProgress().catch((error) => { setServerStatus("unavailable"); setServiceError(error instanceof Error ? error.message : "Service unavailable."); }); }}>
                  <RefreshCcw className="h-4 w-4" /> Recheck service
                </button>
              </div>
            )}

            {serverStatus === "ready" && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Server-verified solves</p><p className="mt-2 text-3xl font-bold">{summary.solved} <span className="text-sm font-normal text-muted-foreground">/ {summary.total}</span></p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Verified training points</p><p className="mt-2 text-3xl font-bold">{summary.points} <span className="text-sm font-normal text-muted-foreground">/ {summary.possible}</span></p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                    <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Trophy className="h-4 w-4" /> Progress source</p><p className="mt-2 text-sm font-semibold text-primary">Your authenticated account</p>
                    <p className="mt-1 text-xs text-muted-foreground">Read from server storage; not browser points.</p>
                  </div>
                </div>

                <div className="grid items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
                  <nav aria-label="Verified CTF missions" className="space-y-2 rounded-2xl border border-border/70 bg-card/70 p-3">
                    <h2 className="px-2 py-2 text-sm font-semibold">Casefile missions</h2>
                    {VERIFIED_CTF_MISSIONS.map((mission) => (
                      <button key={mission.id} type="button" onClick={() => chooseMission(mission.id)} aria-pressed={selectedId === mission.id}
                        className={"flex w-full items-start gap-2 rounded-xl border p-3 text-left transition focus-visible:ring-2 focus-visible:ring-primary " +
                          (mission.id === selectedId ? "border-primary/40 bg-primary/[0.08]" : "border-border/70 bg-background/40 hover:border-primary/30")}>
                        {solvedIds.includes(mission.id) ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> : <FileSearch2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
                        <span><span className="block text-sm font-semibold">{mission.title}</span><span className="mt-1 block text-xs text-muted-foreground">{mission.difficulty} · {mission.points} points</span></span>
                      </button>
                    ))}
                  </nav>

                  <div className="min-w-0 space-y-4">
                    <section className="rounded-2xl border border-border/70 bg-card/70 p-5 sm:p-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{selected.category} · {selected.difficulty}</p>
                      <h2 className="mt-2 text-2xl font-bold">{selected.title}</h2>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{selected.objective}</p>
                      {solvedIds.includes(selectedId) && <p className="mt-3 flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="h-4 w-4" /> Server-verified solve recorded.</p>}
                    </section>

                    <section className="rounded-2xl border border-border/70 bg-card/70 p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold">Your server-generated casefile</h3>
                        <button className={secondaryButton} type="button" onClick={() => void loadCasefile()} disabled={busy !== null}>
                          <FileSearch2 className="h-4 w-4" /> {casefile ? "Reload casefile" : "Load casefile"}
                        </button>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">The flag belongs to your account and is hidden in the casefile using a simple reversible encoding. The grading key is not delivered to the browser.</p>
                      {casefileError && <p role="alert" className="mt-3 text-sm text-destructive">{casefileError}</p>}
                      {casefile && <pre className="mt-4 max-h-[380px] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border bg-background/80 p-4 font-mono text-xs leading-6">{casefile}</pre>}
                    </section>

                    <section className="rounded-2xl border border-border/70 bg-card/70 p-5 sm:p-6">
                      <h3 className="flex items-center gap-2 font-semibold"><Flag className="h-5 w-5 text-primary" /> Submit flag for verification</h3>
                      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void submitFlag(event)}>
                        <label htmlFor="verified-flag" className="sr-only">Recovered casefile flag</label>
                        <input id="verified-flag" type="text" required maxLength={120} autoComplete="off" spellCheck={false}
                          placeholder="ETERNYX{...}" value={answer} onChange={(event) => { setAnswer(event.target.value); setFeedback(null); }}
                          className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                        <button className={buttonClass} type="submit" disabled={busy !== null}><KeyRound className="h-4 w-4" /> {busy === "submit" ? "Verifying..." : "Verify flag"}</button>
                      </form>
                      {feedback && <p role="status" className={"mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm " + (feedback.success ? "border-primary/30 bg-primary/[0.05]" : "border-destructive/30 bg-destructive/[0.05]")}>
                        {feedback.success ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /> : <XCircle className="h-5 w-5 shrink-0 text-destructive" />}{feedback.message}
                      </p>}
                    </section>

                    <section className="rounded-2xl border border-border/70 bg-card/70 p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold"><Lightbulb className="h-5 w-5 text-primary" /> Hints</h3>
                        <button className={secondaryButton} type="button" disabled={hintCount === selected.hints.length} onClick={() => setHintCount((current) => Math.min(current + 1, selected.hints.length))}>Reveal next hint</button>
                      </div>
                      {hintCount > 0 && <ol className="mt-3 space-y-2">{selected.hints.slice(0, hintCount).map((hint, index) => <li key={index} className="rounded-lg border border-border bg-background/60 p-3 text-sm leading-6"><span className="font-semibold text-primary">Hint {index + 1}. </span>{hint}</li>)}</ol>}
                    </section>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <footer className="rounded-xl border border-border/70 bg-card/70 p-4 text-xs leading-6 text-muted-foreground">
          These are server-verified forensic training tasks, not live vulnerable network servers. Flags are user-specific but can still be extracted from training casefiles without exploiting a vulnerability. Points reflect account-linked casefile solves only; they do not certify pentesting skills. Disposable per-user vulnerability targets require a dedicated, isolated cyber range.
        </footer>
      </div>
    </div>
  );
}
