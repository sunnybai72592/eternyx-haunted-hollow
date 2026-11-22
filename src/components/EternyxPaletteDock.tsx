import { Check } from 'lucide-react';
import { ETERNYX_PALETTES, useEternyxPalette } from '@/lib/eternyxPalette';
import '@/styles/eternyx-palettes.css';

/** Reusable swatch controls for /auth and the global upper-right corner. */
export function EternyxPaletteDock({ floating = false }: { floating?: boolean }) {
  const { palette, choosePalette } = useEternyxPalette();
  return (
    <div
      className={floating ? 'eternyx-palette-floating auth-palette-dock' : 'auth-palette-dock'}
      role="group"
      aria-label="ETERNYX color palette"
    >
      {ETERNYX_PALETTES.map((item) => (
        <button
          key={item.id}
          type="button"
          className="auth-palette-button"
          data-swatch={item.id}
          title={item.name}
          aria-label={item.name}
          aria-pressed={palette === item.id}
          onClick={() => choosePalette(item.id)}
        >
          <span className="auth-liquid-swatch" aria-hidden="true">
            {palette === item.id && <Check />}
          </span>
        </button>
      ))}
    </div>
  );
}
