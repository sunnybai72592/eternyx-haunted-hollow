// Privacy-preserving deep links for the existing service-request workspaces.
// A link is navigation context only. Supabase Auth and RLS still decide access.
export type CustomerRequestPanel = 'conversation' | 'scope' | 'clarifications' | 'brief-changes' | 'journal';
export type AdminRequestPanel = CustomerRequestPanel | 'triage';
export type ServicePanelMode = 'customer' | 'admin';

export const customerRequestPanels: ReadonlyArray<{ key: CustomerRequestPanel; label: string }> = [
  { key: 'conversation', label: 'Conversation' },
  { key: 'scope', label: 'Scope review' },
  { key: 'clarifications', label: 'Clarifications' },
  { key: 'brief-changes', label: 'Brief changes' },
  { key: 'journal', label: 'Activity journal' },
];
export const adminRequestPanels: ReadonlyArray<{ key: AdminRequestPanel; label: string }> = [
  ...customerRequestPanels,
  { key: 'triage', label: 'Private admin triage' },
];
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const matchesMode = (value: string, mode: ServicePanelMode): value is AdminRequestPanel =>
  (mode === 'customer' ? customerRequestPanels : adminRequestPanels).some((panel) => panel.key === value);

export function readRequestPanel(search: string, mode: 'customer'): CustomerRequestPanel | null;
export function readRequestPanel(search: string, mode: 'admin'): AdminRequestPanel | null;
export function readRequestPanel(search: string, mode: ServicePanelMode): AdminRequestPanel | null {
  const query = new URLSearchParams(search);
  if (query.getAll('request').length !== 1
    || query.getAll('panel').length !== 1
    || query.has('queue')) return null;
  const id = query.get('request');
  const panel = query.get('panel');
  if (!id || !requestIdPattern.test(id) || !panel || !matchesMode(panel, mode)) return null;
  return panel;
}

export function buildRequestPanelLink(origin: string, requestId: string, mode: 'customer', panel: CustomerRequestPanel): string;
export function buildRequestPanelLink(origin: string, requestId: string, mode: 'admin', panel: AdminRequestPanel): string;
export function buildRequestPanelLink(origin: string, requestId: string, mode: ServicePanelMode, panel: AdminRequestPanel): string;
export function buildRequestPanelLink(origin: string, requestId: string, mode: ServicePanelMode, panel: AdminRequestPanel): string {
  if (!requestIdPattern.test(requestId)) throw new Error('Invalid request reference');
  if (!matchesMode(panel, mode)) throw new Error('Unsupported Services request panel');
  const url = new URL(mode === 'admin' ? '/admin/service-requests' : '/services/requests', origin);
  url.search = '';
  url.hash = '';
  url.searchParams.set('request', requestId.toLowerCase());
  url.searchParams.set('panel', panel);
  return url.toString();
}
