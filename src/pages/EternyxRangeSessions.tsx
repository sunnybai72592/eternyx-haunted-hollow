import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Clock3, CloudOff, Container, LockKeyhole,
  Power, RefreshCcw, ShieldAlert, ShieldCheck, ShieldOff, Terminal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";

type SessionStatus = "queued" | "provisioning" | "running" | "stopping" | "stopped" | "expired" | "failed";
type RangeSession = {
  id: string;
  challenge_pack: string;
  status: SessionStatus;
  requested_at: string;
  updated_at: string;
  expires_at: string;
  started_at: string | null;
  finished_at: string | null;
};
type ProviderStatus = {
  providerOnline: boolean;
  maxConcurrentSessions: number;
  sessionDurationMinutes: number;
  hostedAccessAvailable: boolean;
  message: string;
};

const cta = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const outlined = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-semibold transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const activeStates = new Set<SessionStatus>(["queued", "provisioning", "running", "stopping"]);
const safelyFormatted = (input: string) => {
  const d = new Date(input);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "Unknown";
};

const statuses: Record<SessionStatus, string> = {
  queued: "Request accepted; waiting for an isolated provider to claim the job. No target is available yet.",
  provisioning: "Provider is preparing the target. There is no safe browser ingress in this milestone.",
  running: "Provider marked the workload running. Secure access is not available through ETERNYX yet.",
  stopping: "Stop or expiry has been requested. Capacity stays reserved until worker cleanup is confirmed.",
  stopped: "This session was stopped and no longer reserves capacity.",
  expired: "The session lifetime elapsed. No further access should be permitted.",
  failed: "The provider reported that this session could not be started or completed.",
};

async function rangeCall(action: string, fields: Record<string, string> = {}) {
  const { data, error } = await supabase.functions.invoke("ctf-range-control", {
    body: { action, ...fields },
  });
  if (error) {
    let text = error.message || "The range controller is unavailable.";
    try {
      const response = error.context;
      if (response && typeof response.json === "function") {
        const detail = await response.json();
        if (typeof detail?.error === "string" && detail.error.length <= 240) text = detail.error;
      }
    } catch {
      // Keep the transport error when a response body is not available.
    }
    throw new Error(text);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The cyber range returned an invalid response.");
  }
  return data as Record<string, unknown>;
}

function readSessionList(raw: unknown): RangeSession[] {
  if (!Array.isArray(raw)) throw new Error("The session list returned an invalid response.");
  return raw.filter((record): record is RangeSession =>
    !!record && typeof record === "object" &&
    typeof record.id === "string" &&
    typeof record.challenge_pack === "string" &&
    typeof record.requested_at === "string" &&
    typeof record.expires_at === "string" &&
    typeof record.updated_at === "string" &&
    typeof record.status === "string" &&
    Object.hasOwn(statuses, record.status));
}

export default function EternyxRangeSessions() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [sessions, setSessions] = useState<RangeSession[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [errorText, setErrorText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [status, results] = await Promise.all([rangeCall("status"), rangeCall("sessions")]);
    if (typeof status.providerOnline !== "boolean" ||
        typeof status.hostedAccessAvailable !== "boolean" ||
        typeof status.sessionDurationMinutes !== "number" ||
        !Array.isArray(results.sessions) ||
        results.source !== "authenticated_server") {
      throw new Error("The provider and session service returned an invalid response.");
    }
    setProvider({
      providerOnline: status.providerOnline,
      maxConcurrentSessions: typeof status.maxConcurrentSessions === "number" ? status.maxConcurrentSessions : 0,
      hostedAccessAvailable: status.hostedAccessAvailable,
      sessionDurationMinutes: status.sessionDurationMinutes,
      message: typeof status.message === "string" ? status.message : "Provider status checked.",
    });
    setSessions(readSessionList(results.sessions));
    setErrorText("");
    setState("ready");
  }, []);

  useEffect(() => {
    let alive = true;
    if (!isAuthenticated || !user) {
      setState("idle"); setSessions([]); setProvider(null); return;
    }
    setState("loading"); setMessage("");
    Promise.all([rangeCall("status"), rangeCall("sessions")]).then(([status, results]) => {
      if (!alive) return;
      if (typeof status.providerOnline !== "boolean" ||
          typeof status.hostedAccessAvailable !== "boolean" ||
          !Array.isArray(results.sessions) || results.source !== "authenticated_server") {
        throw new Error("Invalid range controller response.");
      }
      setProvider({
        providerOnline: status.providerOnline,
        maxConcurrentSessions: typeof status.maxConcurrentSessions === "number" ? status.maxConcurrentSessions : 0,
        hostedAccessAvailable: status.hostedAccessAvailable,
        sessionDurationMinutes: typeof status.sessionDurationMinutes === "number" ? status.sessionDurationMinutes : 15,
        message: typeof status.message === "string" ? status.message : "Provider status checked.",
      });
      setSessions(readSessionList(results.sessions));
      setState("ready"); setErrorText("");
    }).catch((error) => {
      if (!alive) return;
      setState("unavailable");
      setErrorText(error instanceof Error ? error.message : "Session controller is unavailable.");
    });
    return () => { alive = false; };
  }, [isAuthenticated, user?.id]);

  const active = useMemo(() => sessions.filter((session) => activeStates.has(session.status)), [sessions]);
  const canRequest = state === "ready" && provider?.providerOnline === true &&
    provider?.hostedAccessAvailable === true && active.length === 0;

  const refresh = async () => {
    setBusy(true); setMessage("");
    try { await load(); }
    catch (error) {
      setState("unavailable");
      setErrorText(error instanceof Error ? error.message : "Cannot check range controller.");
    } finally { setBusy(false); }
  };

  const request = async () => {
    if (!canRequest) return; // Not a security boundary; backend independently enforces quotas.
    setBusy(true); setMessage("");
    try {
      const reply = await rangeCall("request", { pack: "http-basics-v1" });
      if (reply.accepted !== true) throw new Error("Reservation was not accepted.");
      setMessage("Reservation stored, pending the isolated provider. There is no direct access URL yet.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create a session.");
    } finally { setBusy(false); }
  };

  const stop = async (sessionId: string) => {
    setBusy(true); setMessage("");
    try {
      const reply = await rangeCall("stop", { sessionId });
      if (typeof reply.status !== "string") throw new Error("Stop confirmation was invalid.");
      setMessage(reply.status === "stopping"
        ? "Stop requested. Worker cleanup must finish before the slot is released."
        : "Queued reservation cancelled.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request session stop.");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-7 px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <Link to="/labs/range" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> Back to local cyber range</Link>

        <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-card to-accent/[0.07] p-6 sm:p-9">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Container className="h-4 w-4" /> ETERNYX Cyber Range · Session Control</p>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">My Lab Sessions</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Account-scoped session reservations, capacity checks, expiration and stop requests.
            This is the control-plane foundation; it does not currently provide a hosted vulnerable target or a working cloud terminal.
          </p>
        </header>

        {!isAuthenticated && (
          <section className="rounded-2xl border border-border/70 bg-card/70 p-6">
            <h2 className="flex items-center gap-2 text-xl font-bold"><LockKeyhole className="h-5 w-5 text-primary" /> Sign in to manage your sessions</h2>
            <p className="mt-2 text-sm text-muted-foreground">Cyber range reservations require a verified ETERNYX account.</p>
            <Link to="/auth?redirect=%2Flabs%2Fsessions" className={cta + " mt-4"}>Sign in <ArrowRight className="h-4 w-4" /></Link>
          </section>
        )}

        {isAuthenticated && (
          <>
            {state === "loading" && <p role="status" className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm text-muted-foreground">Checking your sessions and provider readiness...</p>}

            {state === "unavailable" && <section role="alert" className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-5">
              <h2 className="flex items-center gap-2 font-semibold"><CloudOff className="h-5 w-5 text-amber-500" /> Session controller unavailable</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{errorText}</p>
              <p className="mt-2 text-xs text-muted-foreground">The database migration and Edge Function must be installed separately. Nothing is launched or billed when the service is unavailable.</p>
              <button type="button" className={outlined + " mt-4"} onClick={() => void refresh()} disabled={busy}><RefreshCcw className="h-4 w-4" /> Recheck controller</button>
            </section>}

            {state === "ready" && provider && (
              <>
                <section className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                    <ShieldCheck className="h-5 w-5 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider availability</p>
                    <p className="mt-2 text-xl font-bold">{provider.providerOnline ? "Provider approved and responsive" : "Provider offline / not approved"}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                    <Clock3 className="h-5 w-5 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Maximum reservation lifetime</p>
                    <p className="mt-2 text-xl font-bold">{provider.sessionDurationMinutes} minutes</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                    <Container className="h-5 w-5 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">My active reservations</p>
                    <p className="mt-2 text-xl font-bold">{active.length} / 1</p>
                  </div>
                </section>

                <section className="rounded-2xl border border-border/70 bg-card/70 p-5 sm:p-7">
                  <h2 className="flex items-center gap-2 text-xl font-bold"><ShieldOff className="h-5 w-5 text-primary" /> Hosted target access</h2>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {provider.hostedAccessAvailable
                      ? "An approved provider reports hosted access capability. Reservations still require server-side capacity authorization."
                      : "Not available yet. No reviewed remote provisioner, authorized gateway or per-user browser terminal has been connected. We will not create fake running instances."}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button className={cta} type="button" onClick={() => void request()} disabled={!canRequest || busy}>
                      <Power className="h-4 w-4" /> Request isolated session
                    </button>
                    <button className={outlined} type="button" onClick={() => void refresh()} disabled={busy}>
                      <RefreshCcw className="h-4 w-4" /> Refresh status
                    </button>
                  </div>
                  {!canRequest && <p className="mt-3 text-xs leading-6 text-muted-foreground">
                    Session start is disabled until the isolated provider and secure ingress pass deployment checks and are explicitly enabled.
                    Limits are enforced server-side: one active session per account, up to three requests in 24 hours, and at most three concurrent reservations globally.
                  </p>}
                  {message && <p role="status" className="mt-4 rounded-xl border border-border bg-background/70 p-3 text-sm">{message}</p>}
                </section>

                <section className="rounded-2xl border border-border/70 bg-card/70 p-5 sm:p-7">
                  <h2 className="text-xl font-bold">My recent reservations</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Records come from the authenticated server. Instance credentials and internal provider IDs are never returned.</p>
                  {sessions.length === 0
                    ? <p className="mt-5 rounded-xl border border-border bg-background/50 p-4 text-sm text-muted-foreground">No sessions are registered for this account.</p>
                    : <div className="mt-5 space-y-3">
                      {sessions.map((session) => (
                        <article key={session.id} className="rounded-xl border border-border/70 bg-background/45 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold">HTTP Basics · {session.status}</h3>
                            {["queued", "provisioning", "running"].includes(session.status) && (
                              <button type="button" className={outlined} disabled={busy}
                                onClick={() => void stop(session.id)}><Power className="h-4 w-4" /> Request stop</button>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">{statuses[session.status]}</p>
                          <p className="mt-2 text-xs text-muted-foreground">Requested: {safelyFormatted(session.requested_at)} · Expires: {safelyFormatted(session.expires_at)}</p>
                        </article>
                      ))}
                    </div>}
                </section>
              </>
            )}
          </>
        )}

        <section className="grid gap-3 md:grid-cols-2">
          <Link to="/labs/range" className="rounded-xl border border-border/70 bg-card/70 p-5 transition hover:border-primary/40">
            <Terminal className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">Run a real local target now</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the separately tested, Docker-based local HTTP range on your own computer.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary">Local setup <ArrowRight className="h-4 w-4" /></span>
          </Link>
          <Link to="/labs/ctf" className="rounded-xl border border-border/70 bg-card/70 p-5 transition hover:border-primary/40">
            <ShieldAlert className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">Browser CTF practice</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Practice source inspection, IDOR, XSS and traversal without Docker.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary">CTF rooms <ArrowRight className="h-4 w-4" /></span>
          </Link>
        </section>
        <footer className="rounded-xl border border-border/70 bg-card/70 p-4 text-xs leading-6 text-muted-foreground">
          Session queue and provider status are not equivalent to an actual deployed vulnerability lab. Intentionally vulnerable containers must run only on a separate, security-reviewed, budget-controlled host; the ETERNYX frontend and Supabase Edge Functions must never expose the Docker socket, secret keys, or direct untrusted workloads.
        </footer>
      </div>
    </div>
  );
}
