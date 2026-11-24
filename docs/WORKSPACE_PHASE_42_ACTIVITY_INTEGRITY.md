# Workspace Phase 42 — Activity and notification integrity

- Acknowledge the already displayed server snapshot rather than a newer cursor fetched after click. New arrivals remain unread unless another client acknowledges them.
- Guard duplicate clicks, recheck identity after reads and writes, invalidate older snapshot responses and hide unread badges while totals are unavailable.
- Reset history pagination locks on changed head or account scope; prevent duplicate page requests.
- Add inclusive UTC date filtering, Other category, bounded search and filter reset. Counts describe loaded rows only.
- Explicit CSV scope and uniqueness validation, compatibility formula protection and reliable URL cleanup.
- Focused CI includes notification and activity history regression suites.

No schema changes or external notification delivery. Existing server-side authorization remains authoritative. Authenticated browser, realtime delivery and multi-client staging verification remain required.
