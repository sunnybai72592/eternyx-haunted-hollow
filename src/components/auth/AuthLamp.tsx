import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export function AuthLamp({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const startY = useRef<number | null>(null);
  const pulled = useRef(false);
  const [pulling, setPulling] = useState(false);

  return (
    <div className={`auth-lamp ${pulling ? 'is-pulling' : ''}`}>
      <div className="auth-light-beam" aria-hidden="true" />
      <svg className="auth-lamp-object" viewBox="0 0 420 500" aria-hidden="true">
        <defs>
          <linearGradient id="lamp-metal" x1="0" x2="1">
            <stop offset="0" stopColor="var(--lamp-metal-dark)" />
            <stop offset="0.4" stopColor="var(--lamp-metal-light)" />
            <stop offset="0.6" stopColor="var(--lamp-metal-mid)" />
            <stop offset="1" stopColor="var(--lamp-metal-dark)" />
          </linearGradient>
          <linearGradient id="lamp-shade" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--lamp-shade-light)" />
            <stop offset="0.55" stopColor="var(--lamp-shade-mid)" />
            <stop offset="1" stopColor="var(--lamp-shade-dark)" />
          </linearGradient>
          <radialGradient id="lamp-bulb">
            <stop stopColor="var(--lamp-bulb-center)" />
            <stop offset="1" stopColor="var(--lamp-glow)" />
          </radialGradient>
        </defs>
        <ellipse cx="192" cy="456" rx="114" ry="12" className="lamp-floor-shadow" />
        <path d="M193 422 L144 260 L215 161" fill="none" stroke="url(#lamp-metal)" strokeWidth="12" strokeLinecap="round" />
        <path d="M206 420 L158 263 L225 166" fill="none" stroke="url(#lamp-metal)" strokeWidth="4" />
        <circle cx="150" cy="262" r="14" fill="url(#lamp-metal)" />
        <circle cx="150" cy="262" r="5" className="lamp-joint" />
        <ellipse cx="195" cy="432" rx="84" ry="15" fill="url(#lamp-metal)" />
        <path d="M111 431 Q113 410 195 410 Q277 410 279 431" fill="url(#lamp-shade)" />
        <ellipse cx="195" cy="414" rx="48" ry="5" className="lamp-base-line" />
        <path d="M189 149 Q206 84 246 94 Q281 107 289 176 L308 208 Q253 225 186 184 Z" fill="url(#lamp-shade)" stroke="var(--lamp-edge)" strokeWidth="2" />
        <path d="M210 119 Q230 99 249 111" fill="none" stroke="var(--lamp-edge)" strokeWidth="2" opacity="0.6" />
        <ellipse cx="247" cy="196" rx="64" ry="15" transform="rotate(13 247 196)" fill="var(--lamp-shade-dark)" stroke="var(--lamp-edge)" strokeWidth="2" />
        <ellipse cx="247" cy="196" rx="54" ry="10" transform="rotate(13 247 196)" fill="url(#lamp-bulb)" className="lamp-bulb" />
      </svg>
      <Button
        type="button" variant="ghost" className="auth-pull-cord" aria-label={on ? 'Turn lamp off' : 'Turn lamp on'} aria-pressed={on}
        onPointerDown={(event) => { startY.current = event.clientY; pulled.current = false; setPulling(true); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={(event) => { if (startY.current !== null && event.clientY - startY.current > 12) { onToggle(); pulled.current = true; } startY.current = null; setPulling(false); }}
        onPointerCancel={() => { startY.current = null; setPulling(false); }}
        onClick={() => { if (!pulled.current) onToggle(); pulled.current = false; }}
      >
        <span className="auth-cord-line" /><span className="auth-cord-bead" />
      </Button>
      <span className="auth-lamp-caption" aria-hidden="true">{on ? 'A little light. A world of possibility.' : 'Your world, waiting to light up.'}</span>
    </div>
  );
}