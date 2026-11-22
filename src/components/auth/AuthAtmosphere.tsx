import { useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthLamp } from './AuthLamp';
import { useLampSound } from './useLampSound';

const palettes = [
  { id: 'cyan', name: 'Electric cyan' },
  { id: 'violet', name: 'Cosmic violet' },
  { id: 'emerald', name: 'Blue-green' },
  { id: 'bronze', name: 'Warm bronze' },
  { id: 'rose', name: 'Rose pink' },
] as const;

export function AuthAtmosphere({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(() => {
    try { const saved = localStorage.getItem('eternyx-auth-palette'); return palettes.some((item) => item.id === saved) ? saved : 'cyan'; }
    catch { return 'cyan'; }
  });
  const [on, setOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const playSwitch = useLampSound();
  const toggleLamp = () => {
    const next = !on;
    setOn(next);
    if (!muted) void playSwitch(next);
  };

  const choose = (id: string) => {
    setPalette(id);
    try { localStorage.setItem('eternyx-auth-palette', id); } catch { /* Color selection also works without storage. */ }
  };

  return (
    <div className="lamp-auth-page" data-palette={palette} data-light={on ? 'on' : 'off'}>
      <header className="lamp-auth-header">
        <Link to="/" className="lamp-auth-brand" aria-label="ETERNYX home"><ShieldCheck aria-hidden="true" /><span>ETERNYX</span></Link>
        <div className="auth-palette-dock" role="group" aria-label="Page color">
          {palettes.map((item) => (
            <Button key={item.id} variant="ghost" size="icon" className="auth-palette-button" data-swatch={item.id} aria-label={item.name} title={item.name} aria-pressed={palette === item.id} onClick={() => choose(item.id)}>
              <span className="auth-liquid-swatch">{palette === item.id && <Check aria-hidden="true" />}</span>
            </Button>
          ))}
        </div>
      </header>
      <main className="lamp-auth-main">
        <aside className="lamp-auth-scene">
          <div className="lamp-auth-intro"><span className="lamp-auth-eyebrow">YOUR ETERNYX IDENTITY</span><h1>A light on.<br /><em>A world open.</em></h1><p>A familiar place for your next big idea.</p></div>
          <AuthLamp on={on} onToggle={toggleLamp} />
        </aside>
        <section className="lamp-auth-form" aria-label="Your account">{children}</section>
      </main>
      <footer className="lamp-auth-footer"><Link to="/"><ArrowLeft aria-hidden="true" /> Back to home</Link><span>Your world. Your ETERNYX.</span><div className="flex items-center gap-3"><Button variant="ghost" size="icon" aria-label={muted ? 'Enable lamp sound' : 'Mute lamp sound'} title={muted ? 'Enable lamp sound' : 'Mute lamp sound'} aria-pressed={muted} onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX /> : <Volume2 />}</Button><span className="auth-light-status"><i />{on ? 'Light on' : 'Light off'}</span></div></footer>
    </div>
  );
}