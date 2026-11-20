import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import anchors from "./countryAnchors.json";

type Pin = { city: string; latitude: number; longitude: number; accuracy: number };
type Signal = { key: string; caption: string; lat: number; lon: number; precise?: boolean };
const positions: Record<string, number[]> = anchors;

function validPin(value: Partial<Pin>): value is Pin {
  return typeof value.city === "string" && value.city.trim().length > 0 && value.city.length <= 48 &&
    typeof value.latitude === "number" && Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === "number" && Math.abs(value.longitude) <= 180 &&
    typeof value.accuracy === "number" && Number.isFinite(value.accuracy) && value.accuracy >= 0;
}

export function PresenceMap({ countries, locked }: { countries: {code: string; count: number}[]; locked: boolean }) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [city, setCity] = useState("");
  const [sharing, setSharing] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const room = supabase.channel("homepage-public-pins-v1");
    channel.current = room;
    room.on("presence", {event: "sync"}, () => {
      if (active) setPins(Object.values(room.presenceState<Pin>()).flat().filter(validPin).slice(0, 100));
    }).subscribe(status => {
      if (!active) return;
      setReady(status === "SUBSCRIBED");
      if (status !== "SUBSCRIBED") {
        generation.current++;
        setBusy(false); setPins([]); setSharing(false);
      }
    });
    return () => {
      active = false; generation.current++; channel.current = null;
      void supabase.removeChannel(room);
    };
  }, [locked]);

  async function shareLocation() {
    const room = channel.current;
    if (!room || locked || !ready || busy) return;
    if (!navigator.geolocation) { setMessage("Location is unavailable in this browser."); return; }

    const attempt = ++generation.current;
    setBusy(true);
    setMessage("Waiting for your device location…");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, maximumAge: 0, timeout: 15000,
        })
      );
      if (attempt !== generation.current) return;
      const { latitude, longitude, accuracy } = position.coords;
      const pin = {
        city: city.trim() || "Shared location",
        latitude: +latitude.toFixed(5),
        longitude: +longitude.toFixed(5),
        accuracy: Math.ceil(accuracy),
      };
      setMessage("Publishing your pin…");
      const result = await room.track(pin);
      if (attempt !== generation.current) return;
      if (result !== "ok") throw new Error("presence");
      setSharing(true);
      setMessage("Your location is on the public map.");
    } catch (error) {
      if (attempt !== generation.current) return;
      if (error && typeof error === "object" && "code" in error) {
        setMessage(error.code === 1 ? "Location access was denied. Your pin was not published." : "Your device location is unavailable. Try again.");
      } else {
        setMessage("Couldn’t confirm publication. Close this page to disconnect your pin.");
      }
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  }

  async function stop() {
    const room = channel.current;
    if (!room) return;
    setBusy(true);
    try {
      if (await room.untrack() !== "ok") throw new Error();
      setSharing(false); setMessage("Your pin has been removed.");
    } catch { setMessage("Couldn’t confirm removal. Close this page to disconnect your pin."); }
    finally { setBusy(false); }
  }

  const signals: Signal[] = countries.flatMap(({code,count}) => positions[code] ? [{
    key: code, caption: code + " · " + count, lat: positions[code][0], lon: positions[code][1]
  }] : []);
  const unique = Array.from(new Map(pins.map(pin => [JSON.stringify([pin.city,pin.latitude,pin.longitude]),pin])).values());
  unique.forEach(pin => signals.push({key: JSON.stringify([pin.city,pin.latitude,pin.longitude]), caption: pin.city, lat: pin.latitude, lon: pin.longitude, precise: true}));
  const labels: {x: number; y: number; width: number}[] = [];
  return <div className="mt-4">
    <svg viewBox="0 0 720 360" role="img" aria-label="Live visitor map with country estimates and voluntarily shared device pins" className="block w-full rounded-xl border border-cyan-300/20">
      <image href="/maps/presence-world.svg" width="720" height="360" />
      {signals.map(signal => {
        const x = (signal.lon + 180) * 2, y = (90 - signal.lat) * 2;
        const label = signal.caption.length > 14 ? signal.caption.slice(0,13) + "…" : signal.caption;
        const width = label.length * 7 + 14;
        const options = [-18,18,-42,42,-66,66].flatMap(dy => [x+9,x-width-9].map(left => ({
          x: Math.max(2,Math.min(718-width,left)), y: Math.max(11,Math.min(349,y+dy)), width
        })));
        const tag = options.find(t => labels.every(p => Math.abs(t.y-p.y)>20 || t.x>p.x+p.width+2 || p.x>t.x+width+2));
        if (tag) labels.push(tag);
        const color = signal.precise ? "#f0abfc" : "#67e8f9";
        return <g key={signal.key + signal.caption} fill={color}>
          <circle cx={x} cy={y} r="7" fill="none" stroke={color} opacity=".55" className="motion-safe:animate-[ping_1.2s_ease-out_1]" style={{transformBox:"fill-box",transformOrigin:"center"}} />
          <circle cx={x} cy={y} r="3" />
          {tag && <g><path d={`M${x} ${y} L${tag.x + width/2} ${tag.y}`} stroke={color} opacity=".6"/>
            <rect x={tag.x} y={tag.y-9} width={width} height="18" rx="3" fill="#071823" stroke={color} strokeWidth=".6"/>
            <text x={tag.x+7} y={tag.y+4} fontSize="11" fontFamily="monospace">{label}</text></g>}
        </g>;
      })}
    </svg>
    <p className="mt-2 text-xs text-slate-400">Cyan marks a country estimate. Violet marks a device location shared by its visitor.</p>
    {!!unique.length && <ul aria-label="Public device pins" className="mt-3 space-y-1 text-sm text-fuchsia-200">{unique.map(pin =>
      <li key={JSON.stringify([pin.city,pin.latitude,pin.longitude])}>{pin.city} · {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)} · accuracy about {pin.accuracy} m</li>)}</ul>}
    {!locked && <details className="mt-4 rounded-lg border border-white/10 p-3 text-sm"><summary className="cursor-pointer">Share my location on the map</summary>
      <p className="my-2 text-slate-300">Anyone on the homepage can see and copy your city and coordinates while your pin is shared. Your IP address stays off the map.</p>
      {sharing ? <button type="button" disabled={busy} onClick={stop} className="min-h-11 text-cyan-200">Remove my public pin</button> : <>
        <label className="block">City (optional) <input disabled={busy} value={city} maxLength={48} onChange={e => setCity(e.target.value)} className="rounded bg-slate-900 p-2" /></label>
        <button type="button" disabled={!ready || busy} onClick={shareLocation} className="min-h-11 text-cyan-200 disabled:opacity-50">Share my location publicly</button>
      </>}
      {!ready && <p>Live pin sharing is unavailable.</p>}
      {message && <p role="status">{message}</p>}
    </details>}
  </div>;
}
