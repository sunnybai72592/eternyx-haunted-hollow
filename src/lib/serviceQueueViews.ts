// Privacy-first URL presets for ETERNYX Services queue navigation.
// Only named task categories are encoded. No user IDs, customer search,
// contact emails, request UUIDs or other private records enter these links.
export type OwnerQueuePreset = 'all' | 'activity' | 'answers' | 'brief-reviews';
export type AdminQueuePreset = 'all' | 'follow-up' | 'brief-reviews' | 'clarifications' | 'unassigned';

const ownerPresets: readonly OwnerQueuePreset[] = ['all', 'activity', 'answers', 'brief-reviews'];
const adminPresets: readonly AdminQueuePreset[] = ['all', 'follow-up', 'brief-reviews', 'clarifications', 'unassigned'];

export function readQueuePreset(search: string, mode: 'customer'): OwnerQueuePreset | null;
export function readQueuePreset(search: string, mode: 'admin'): AdminQueuePreset | null;
export function readQueuePreset(search: string, mode: 'customer' | 'admin'): OwnerQueuePreset | AdminQueuePreset | null {
  const query = new URLSearchParams(search);
  if (query.has('request') || query.getAll('queue').length !== 1) return null;
  const value = query.get('queue');
  if (mode === 'customer') return ownerPresets.find((preset) => preset === value) ?? null;
  return adminPresets.find((preset) => preset === value) ?? null;
}

export function buildQueuePresetLink(origin: string, mode: 'customer', preset: OwnerQueuePreset): string;
export function buildQueuePresetLink(origin: string, mode: 'admin', preset: AdminQueuePreset): string;
export function buildQueuePresetLink(
  origin: string, mode: 'customer' | 'admin', preset: OwnerQueuePreset | AdminQueuePreset,
): string {
  const allowed = mode === 'admin' ? adminPresets : ownerPresets;
  if (!allowed.some((value) => value === preset)) throw new Error('Unsupported Services queue preset');
  const path = mode === 'admin' ? '/admin/service-requests' : '/my-service-requests';
  const url = new URL(path, origin);
  url.search = '';
  url.hash = '';
  url.searchParams.set('queue', preset);
  return url.toString();
}

// Spreadsheet programs can interpret CSV cells as formulas even when the
// value is quoted. Prefix dangerous cells with a plain-text apostrophe.
// Commas, quotes and line breaks are escaped using RFC-style CSV quoting.
export function escapeServiceCsvCell(input: string | number | null | undefined): string {
  const raw = input === null || input === undefined ? '' : String(input);
  const firstSignificant = raw.replace(/^[\u0000-\u0020\u00a0\u200b\uFEFF]*/u, '');
  const couldBeFormula = /^[=+\-@]/u.test(firstSignificant);
  const safe = couldBeFormula ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function buildServiceQueueCsv(headers: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  if (headers.length === 0) throw new Error('Services export requires at least one header');
  if (rows.some((row) => row.length !== headers.length)) throw new Error('Services export column mismatch');
  const records = [headers, ...rows];
  return '\uFEFF' + records.map((row) => row.map(escapeServiceCsvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadServiceQueueCsv(filename: string, headers: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): void {
  // Call only in response to a deliberate authenticated user interaction.
  const blob = new Blob([buildServiceQueueCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
