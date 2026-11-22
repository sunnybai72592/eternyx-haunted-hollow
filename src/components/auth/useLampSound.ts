import { useEffect, useRef } from 'react';

/** A short mechanical click and warm resonance, generated locally after interaction. */
export function useLampSound() {
  const context = useRef<AudioContext | null>(null);
  useEffect(() => () => { void context.current?.close().catch(() => undefined); }, []);

  return async (turningOn: boolean) => {
    try {
      if (!context.current) context.current = new AudioContext();
      const audio = context.current;
      if (audio.state === 'suspended') await audio.resume();
      const now = audio.currentTime;
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * .035), audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * .006));
      const click = audio.createBufferSource();
      click.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const volume = audio.createGain();
      volume.gain.value = .12;
      click.connect(filter).connect(volume).connect(audio.destination);
      click.start(now);
      click.onended = () => { click.disconnect(); filter.disconnect(); volume.disconnect(); };

      const tone = audio.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(turningOn ? 640 : 420, now);
      tone.frequency.exponentialRampToValueAtTime(turningOn ? 420 : 280, now + .12);
      const resonance = audio.createGain();
      resonance.gain.setValueAtTime(.0001, now);
      resonance.gain.exponentialRampToValueAtTime(.018, now + .009);
      resonance.gain.exponentialRampToValueAtTime(.0001, now + .22);
      tone.connect(resonance).connect(audio.destination);
      tone.start(now);
      tone.stop(now + .24);
      tone.onended = () => { tone.disconnect(); resonance.disconnect(); };
    } catch { /* Sound is optional; switching the lamp must always work. */ }
  };
}