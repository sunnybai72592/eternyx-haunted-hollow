# Trusted security-event ingestion

The administrator threat-monitoring workspace reads `threat_monitoring_events` under the existing admin-only RLS policy. Browser clients must not write to this table.

## Current event source

The shared Edge Function helper at `supabase/functions/_shared/security-events.ts` writes a narrowly defined event using the server-only Supabase secret key. It is called only after the caller's access token has been verified, for these authorization violations:

- AI chat request supplies a user ID that differs from the verified identity.
- AI chat attempts to pair a verified conversation with a different document.
- Document processing supplies a storage reference that differs from the owner's database record.

The event payload contains only the function name, a fixed reason code, and the verified actor UUID. It does not store request bodies, access tokens, document contents, storage paths, or forwarded IP headers.

## Reliability and security boundaries

- The helper constructs the event type and payload from fixed values; clients cannot choose severity or event contents.
- Invalid/anonymous requests are intentionally not persisted, avoiding an unauthenticated event-flooding path.
- Event persistence is best-effort and cannot interrupt the protected operation's response.
- The helper uses the server-side `SUPABASE_SECRET_KEYS` value and never returns it to a client.
- The existing RLS policy remains unchanged: authenticated browser reads are admin-only; browser writes remain revoked.

This is a first, deliberately narrow source of verified authorization events—not a claim that every platform security signal is monitored. Additional event sources should be integrated only at trusted backend decision points.
