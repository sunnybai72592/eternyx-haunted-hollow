import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ServicePulseItem = {
  id: string;
  label: string;
  count: number | null;
  description: string;
  active: boolean;
  onSelect: () => void;
};

export default function ServiceActionPulse({
  heading, description, items, refreshing, onRefresh,
}: {
  heading: string;
  description: string;
  items: ServicePulseItem[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section aria-label={heading} className="mb-6 rounded-2xl border border-border bg-card/30 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{heading}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className="mr-2 h-4 w-4" />{refreshing ? 'Checking…' : 'Load / refresh counts'}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.active}
            onClick={item.onSelect}
            className={[
              'flex min-h-28 min-w-0 flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              item.active
                ? 'border-primary bg-primary/[0.07] text-foreground'
                : 'border-border bg-background/60 text-foreground hover:border-primary/40',
            ].join(' ')}
          >
            <span className="text-xs font-medium leading-5">{item.label}</span>
            <span className="text-2xl font-bold tabular-nums">{item.count === null ? '—' : item.count}</span>
            <span className="text-xs leading-4 text-muted-foreground">
              {item.count === null ? 'Not loaded or unavailable · filter still works' : item.description}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Counts are exact database results for requests, not message totals. A dash means not loaded or unavailable, never zero.
        Filters use the server and never bypass account permissions.
      </p>
    </section>
  );
}
