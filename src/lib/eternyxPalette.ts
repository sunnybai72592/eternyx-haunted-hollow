import { useEffect, useState } from 'react';

export const ETERNYX_PALETTES = [
  { id: 'cyan', name: 'Electric cyan' },
  { id: 'violet', name: 'Cosmic violet' },
  { id: 'emerald', name: 'Blue-green' },
  { id: 'bronze', name: 'Warm bronze' },
  { id: 'rose', name: 'Rose pink' },
] as const;

export type EternyxPalette = (typeof ETERNYX_PALETTES)[number]['id'];
const STORAGE_KEY = 'eternyx-auth-palette'; // Reuse the existing auth choice.
const EVENT = 'eternyx:palette-changed';

export function normalizeEternyxPalette(value: unknown): EternyxPalette {
  return ETERNYX_PALETTES.some((item) => item.id === value)
    ? value as EternyxPalette
    : 'cyan';
}

export function readEternyxPalette(): EternyxPalette {
  if (typeof window === 'undefined') return 'cyan';
  try { return normalizeEternyxPalette(window.localStorage.getItem(STORAGE_KEY)); }
  catch { return 'cyan'; }
}

export function applyEternyxPalette(value: unknown): EternyxPalette {
  const palette = normalizeEternyxPalette(value);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.eternyxPalette = palette;
  }
  return palette;
}

export function chooseEternyxPalette(value: unknown): EternyxPalette {
  const palette = applyEternyxPalette(value);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, palette); }
    catch { /* In-memory changes remain available when storage is blocked. */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: palette }));
  }
  return palette;
}

/** Shared state for auth/header swatches and every route; same-tab sync included. */
export function useEternyxPalette() {
  const [palette, setPalette] = useState<EternyxPalette>(readEternyxPalette);
  useEffect(() => {
    applyEternyxPalette(readEternyxPalette());
    const onPalette = (event: Event) =>
      setPalette(normalizeEternyxPalette((event as CustomEvent).detail));
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        const updated = readEternyxPalette();
        setPalette(updated);
        applyEternyxPalette(updated);
      }
    };
    window.addEventListener(EVENT, onPalette);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onPalette);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return { palette, choosePalette: chooseEternyxPalette };
}
