# ETERNYX Docker Lab Incident Response (manual, owner-only)

## Purpose

This milestone creates **real incident records** when an enrolled Docker agent has an unacknowledged operation (at least 45 seconds after claim), a reported failure, or a reported safety guard denial. This is manual incident tracking, not continuous background monitoring. No remote Docker command is issued by this feature.

## Operator flow

1. An authenticated owner opens Cloud & Integrations → Docker Operation Review. The page loads real signed-claim statuses and existing incident history.
2. For eligible claims only, record a meaningful note (12–500 characters), then open an investigation case. Do not paste private keys, tokens or sensitive logs.
3. Mark the case Investigating with a new note about checks performed. When documentation review is complete, use Mark reviewed with a fresh note.
4. A Reviewed case means **administrative review only**. It is not proof that Docker succeeded, not a reversal of a guard denial, and not an instruction to rerun the command.
5. If new evidence arrives, mark Reviewed cases Investigating again and append a note. All state changes are logged in immutable incident events.

## Controls and limits

- JWT verified by the existing Docker control Edge Function. The user ID comes from Supabase Auth, never from the browser request.
- RLS and composite foreign keys restrict cases to the authenticated owner and a claim already associated with that owner.
- Client tables are read-only; mutations only through service-role-only SECURITY INVOKER SQL RPCs called by the authenticated Edge Function.
- SQL derives case reason from the claim state and age; the browser cannot invent a success/failure or submit an arbitrary incident reason.
- Each claim has at most one investigation case. Identical creation retries return the existing case without creating duplicate events.
- Maximum 50 cases per owner; 12 new cases per rolling 24 hours; 20 appended events per case; bounded recent owner history returned to the browser.
- Case notes are 12–500 trimmed characters without control characters; entries remain visible to the owner. Avoid storing secrets.
- The feature never alters command claims, agent status, Docker controls, owner approvals, or remote lab opt-in flags.

## Security and deployment

Apply migration `20261123090000_docker_lab_incident_triage.sql` **after** the existing Docker claims and recovery migrations on staging. Deploy updated `docker-control` Edge Function only after staging tests. A new React component handles incident notes in the existing authenticated route.

Run `node --test tests/docker-lab-incident.test.mjs` alongside repository CI. Integration-check owner A cannot view/open/triage owner B's claims, anonymous requests fail, duplicate/concurrent opens are idempotent, closed-loop note transitions retain events, and quota boundaries are enforced. Supabase security advisors and full CI should pass before any production migration.

Even a signed agent completion remains an agent assertion; case review status never becomes independent Docker execution attestation. Keep all execution opt-in gates disabled for public production.
