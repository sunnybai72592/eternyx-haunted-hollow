import { useEffect, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

type Asset = { name: string; duration: number; start: number };

function completedAsset(entry: PerformanceEntry): Asset[] {
  const url = new URL(entry.name, window.location.origin);
  if (url.origin !== window.location.origin) return [];
  const match = /^\/assets\/([\w.-]+\.(?:js|css))$/.exec(url.pathname);
  return match ? [{ name: match[1], duration: Math.round(entry.duration), start: entry.startTime }] : [];
}

export default function RouteTerminal() {
  const location = useLocation();
  const action = useNavigationType();
  const [elapsed, setElapsed] = useState(0);
  const [assets, setAssets] = useState<Asset[]>([]);
  useEffect(() => {
    const start = performance.now();
    const clock = window.setInterval(() => setElapsed(Math.round(performance.now() - start)), 200);
    const initial = performance.getEntriesByType("resource").flatMap(completedAsset);
    setAssets(initial.slice(-5));
    const observer = typeof PerformanceObserver === "function" ? new PerformanceObserver(list => {
      const entries = list.getEntries().flatMap(completedAsset);
      if (entries.length) setAssets(previous => [...previous, ...entries].slice(-5));
    }) : undefined;
    observer?.observe({ entryTypes: ["resource"] });
    return () => { window.clearInterval(clock); observer?.disconnect(); };
  }, []);

  const section = location.pathname.split("/")[1];
  const destination = /^[a-z]+(?:-[a-z]+)*$/.test(section) ? section.replace(/-/g, " ") : "page";
  return <section className="mx-auto grid min-h-[50vh] w-full max-w-3xl items-center px-1 py-6">
    <p role="status" className="sr-only">Loading {section ? destination : "home"}</p>
    {elapsed > 0 && <div aria-hidden="true" className="overflow-hidden rounded-xl border border-emerald-400/25 bg-[#040c08] font-mono text-emerald-200 shadow-xl">
      <div className="flex items-center justify-between gap-2 border-b border-emerald-300/15 px-4 py-3 text-xs sm:px-6">
        <span className="tracking-widest text-emerald-400">ETERNYX / RUNTIME</span>
        <span className="tabular-nums">{(elapsed / 1000).toFixed(1)} s</span>
      </div>
      <div className="p-4 sm:p-6">
        <p className="break-words text-base sm:text-lg"><span className="text-emerald-500">&gt; </span>Opening {section ? destination : "home"}<span className="ml-2 inline-block h-4 w-2 bg-emerald-300 align-middle motion-safe:animate-pulse" /></p>
        <p className="mt-2 text-xs text-emerald-300/80">router · {action.toLowerCase()} · waiting for page</p>
        {assets.length > 0 && <div className="mt-6 border-t border-emerald-300/15 pt-3">
          <div className="mb-2 flex justify-between text-xs text-emerald-400"><span>Recent page assets</span><span>Load time</span></div>
          {assets.map((asset, index) => <div key={asset.start + ":" + index} className="flex min-w-0 justify-between gap-3 py-0.5 text-xs">
            <span className="truncate">{asset.name}</span><span className="shrink-0 tabular-nums">{asset.duration} ms</span>
          </div>)}
        </div>}
      </div>
    </div>}
  </section>;
}
