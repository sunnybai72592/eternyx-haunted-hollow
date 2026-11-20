import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Globe2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

type Snapshot = { total: number; countries: { code: string; count: number }[]; networkAvailable: boolean };
const Presence = createContext<{ snapshot?: Snapshot; failed: boolean; updatedAt: number; included: boolean; locked: boolean; toggle: () => void } | null>(null);
const preference = "eternyx.presence.include";
const names = new Intl.DisplayNames(undefined, { type: "region" });

async function loadPresence(contribute: boolean, signal: AbortSignal): Promise<Snapshot> {
  const response = await fetch(import.meta.env.VITE_SUPABASE_URL + "/rest/v1/rpc/visitor_presence", {
    method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ contribute: contribute && document.visibilityState === "visible" }),
  });
  if (!response.ok) throw new Error("Presence unavailable");
  const data = await response.json();
  if (!Number.isSafeInteger(data?.total) || data.total < 0 || typeof data.networkAvailable !== "boolean" ||
      !Array.isArray(data.countries) || !data.countries.every((row: { code?: string; count?: number }) =>
        row && /^[A-Z]{2}$/.test(row.code ?? "") && Number.isSafeInteger(row.count) && Number(row.count) > 0)) {
    throw new Error("Invalid presence response");
  }
  return data;
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const home = useLocation().pathname === "/";
  const restoring = useAuthStore(state => state.isLoading || (!!state.user && !state.profile));
  const analytics = useAuthStore(state => state.profile?.preferences?.analytics);
  const locked = analytics === false || navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  const [allowed, setAllowed] = useState(() => {
    try { return localStorage.getItem(preference) !== "off"; } catch { return false; }
  });
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === preference || event.key === null) setAllowed(event.newValue !== "off");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const included = allowed && !locked && !restoring;
  const query = useQuery({
    queryKey: ["visitor-presence", included],
    queryFn: ({ signal }) => loadPresence(included, signal),
    enabled: included || home, refetchInterval: 30000, refetchIntervalInBackground: false,
    networkMode: "always", staleTime: 0, retry: false,
  });
  function toggle() {
    const next = !allowed;
    setAllowed(next);
    try { localStorage.setItem(preference, next ? "on" : "off"); } catch { /* This tab still honors the choice. */ }
  }
  return <Presence.Provider value={{ included, locked, toggle, snapshot: query.data, updatedAt: query.dataUpdatedAt, failed: query.isError }}>{children}</Presence.Provider>;
}

export function VisitorPresence() {
  const presence = useContext(Presence);
  if (!presence) return null;
  const { snapshot, failed, updatedAt, included, locked, toggle } = presence;
  const unavailable = failed || (snapshot?.total === 0 && !snapshot.networkAvailable);
  return <section aria-labelledby="presence-heading" className="mt-12 rounded-2xl border border-white/10 bg-slate-950/70 p-5 text-slate-100 sm:p-8">
    <div className="flex items-center gap-3"><Globe2 aria-hidden="true" className="size-6 text-cyan-300" />
      <h2 id="presence-heading" className="text-2xl font-semibold tracking-tight">Around Eternyx now</h2></div>
    <p className="mt-2 text-sm text-slate-400">Approximate visitor locations from network addresses active this minute or the previous minute. Shared connections can represent several people.</p>
    <div className="mt-5" role="status">
      {unavailable ? <p>Live visitor data is temporarily unavailable.</p> : !snapshot ? <p>Checking activity…</p> : <>
        <p className="text-lg"><strong className="tabular-nums text-cyan-200">{snapshot.total.toLocaleString()}</strong> estimated active {snapshot.total === 1 ? "network" : "networks"}</p>
        {snapshot.countries.length > 0 ? <ul aria-label="Most active countries" className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {snapshot.countries.map(row => <li key={row.code} className="flex items-baseline justify-between gap-3 border-b border-white/10 py-2">
            <span>{names.of(row.code) ?? row.code}</span><span className="tabular-nums text-slate-300">{row.count.toLocaleString()}</span>
          </li>)}</ul> : <p className="mt-1 text-sm text-slate-400">{snapshot.total ? "Country information is unavailable for these networks." : "No recent activity recorded."}</p>}
      </>}
    </div>
    {snapshot && !unavailable && <p className="mt-3 text-xs text-slate-400">Updated <time dateTime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time> · Refreshes every 30 seconds</p>}
    <label className="mt-5 flex min-h-11 items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" checked={included} disabled={locked} onChange={toggle} />Include my network in the estimate
    </label>
    {locked && <p className="text-xs text-slate-400">Your privacy preferences disable participation.</p>}
  </section>;
}
