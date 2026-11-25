# Integrated release phase 3 — 2026-11-25

PR #838 merged; both CI and evidence contract workflows completed successfully.
Live read-only inventory: staging has 75 migration records, 13 deployed functions; production has 39 functions. Production ledger retrieval still timed out. Four staging-only slugs are not present: automation-control, automation-webhook, automation-scheduler-worker, ctf-verified; the remaining nine staging slugs are shared. Production has 30 additional slugs. Compare exact source digests and environment config before promotion. DNS and vulnerability scanner JWT gateway settings differ (staging true, production false); review source and deployed auth checks before interpreting exposure. No deployments made.

The shared error boundary previously rendered raw exception messages and a stack line and logged the raw objects. It now displays a local random reference, accessible recovery and an uncertain-action warning. React/browser diagnostics elsewhere are not covered; no external monitoring service configured.

New local built frontend browser smoke runs 11 public routes and 8 auth-protected routes at 1440px and 390px. It checks document status, route rendering or signed-out redirect, unhandled page errors, recovery screen absence and document overflow. Browser remote requests are blocked and Supabase config is synthetic. It is not hosted staging acceptance, authenticated role acceptance, live provider testing, full accessibility or billing proof. The workflow uses a pinned standalone browser dependency without changing app dependencies. CI pending. Production remains HOLD.

Operator next actions: use the actual protected pillar workflows for dedicated identities and approved fixtures (Workspace #839, Education #840/#841, Automation #834, Services #832, Cybersecurity #828/#837); confirm current merge and config before dispatching. No credentials in chat or repository. Full production reconciliation and independent release approval still required.
