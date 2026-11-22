import { useEffect, useRef, useState } from "react";
import { ArrowRight, Compass, LockKeyhole, Pause, Play, Sparkles, Workflow, Zap } from "lucide-react";
import "./eternal-constellation.css";

/**
 * Eternal Constellation V3.
 * The core remains stable while slow orbital layers resonate around it.
 * The six original ecosystem labels are intentionally decorative: navigation
 * belongs to the accessible pillar cards immediately below this illustration.
 */
const nodes = [
  { label: "SECURITY", icon: LockKeyhole, position: "security" },
  { label: "DEVELOP", icon: Zap, position: "develop" },
  { label: "AI", icon: Sparkles, position: "ai" },
  { label: "WORKSPACE", icon: Compass, position: "workspace" },
  { label: "CLOUD", icon: Workflow, position: "cloud" },
  { label: "AUTOMATE", icon: ArrowRight, position: "automate" },
] as const;

const MOTION_STORAGE_KEY = "eternyx-constellation-paused";

function readPausedPreference(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(MOTION_STORAGE_KEY) === "true"; }
  catch { return false; }
}

export function EternalConstellation() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [userPaused, setUserPaused] = useState(readPausedPreference);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" || !document.hidden
  );

  // Freeze the expensive repeating transforms when the illustration is offscreen.
  useEffect(() => {
    const element = sceneRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.01 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Persist the user's explicit motion choice, without requiring sign-in.
  const toggleMotion = () => {
    const next = !userPaused;
    setUserPaused(next);
    try { window.localStorage.setItem(MOTION_STORAGE_KEY, String(next)); }
    catch { /* Storage may be disabled; in-memory control still works. */ }
  };

  // Keep multiple ETERNYX tabs consistent without touching unrelated preferences.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOTION_STORAGE_KEY || event.key === null) {
        setUserPaused(readPausedPreference());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // No needless animation while the browser tab is hidden.
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return (
    <div
      ref={sceneRef}
      data-motion={inView && pageVisible && !userPaused ? "running" : "paused"}
      className="eternyx-constellation relative mx-auto aspect-square w-full max-w-[500px] lg:ml-auto"
    >
      <div
        className="eternyx-constellation__scene"
        role="img"
        aria-label="ETERNYX connected by design: six ecosystem nodes named Security, Develop, AI, Workspace, Cloud, and Automate orbit a stable central ETERNYX mark"
      >
        <div className="eternyx-constellation__ambient" aria-hidden="true" />
      <div className="eternyx-constellation__orbit-layers" aria-hidden="true">
        <div className="eternyx-constellation__aura" />
        <div className="eternyx-constellation__ring eternyx-constellation__ring--outer" />
        <div className="eternyx-constellation__ring eternyx-constellation__ring--dashed" />
        <div className="eternyx-constellation__ring eternyx-constellation__ring--inner" />
        <div className="eternyx-constellation__ellipse eternyx-constellation__ellipse--front" />
        <div className="eternyx-constellation__ellipse eternyx-constellation__ellipse--back" />
        <div className="eternyx-constellation__track eternyx-constellation__track--outer"><span className="eternyx-constellation__particle" /></div>
        <div className="eternyx-constellation__track eternyx-constellation__track--inner"><span className="eternyx-constellation__particle" /></div>

        <div className="eternyx-constellation__core">
          <Zap className="eternyx-constellation__mark" strokeWidth={2.5} />
          <span className="eternyx-constellation__wordmark">ETERNYX</span>
          <span className="eternyx-constellation__tagline">Connected by design</span>
        </div>

        {nodes.map(({ label, icon: Icon, position }) => (
          <div
            key={label}
            className={`eternyx-constellation__node eternyx-constellation__node--${position}`}
          >
            <Icon className="eternyx-constellation__node-icon" strokeWidth={2} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      </div>
      <button
        type="button"
        className="eternyx-constellation__motion-toggle"
        onClick={toggleMotion}
        aria-label={userPaused ? "Resume ETERNYX orbital animation" : "Pause ETERNYX orbital animation"}
        aria-pressed={userPaused}
        title={userPaused ? "Resume orbital motion" : "Pause orbital motion"}
      >
        {userPaused ? <Play aria-hidden="true" size={15} /> : <Pause aria-hidden="true" size={15} />}
        <span>{userPaused ? "Resume" : "Pause"}</span>
      </button>
    </div>
  );
}

export default EternalConstellation;
