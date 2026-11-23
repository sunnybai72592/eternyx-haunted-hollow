# Cybersecurity Universe — Wave 1: Capability integrity and integration

Scope: Hub integration only. No scans, secrets, Supabase policies, backend deployment, or production data changed.

## Implemented in this PR

1. Each Hub destination now advertises a concrete execution mode and its principal limitation, preventing offline analysis, third-party research, and deployment-gated workflows from being described as live testing.
2. Integrates existing API security, CI/CD security, RLS review, zero-day preparedness, real local AES encryption, AI security Q&A, verified CTF, local HTTP range, gated hosted range sessions, and authenticated DNS analysis into the Hub.
3. Adds accessible execution-mode filtering alongside existing text search; no unsupported service is shown as a confirmed deployed scan.
4. Adds a guided evidence-to-remediation journey joining existing workbenches while explicitly saying it does not automatically persist a cross-tool case or execute assessments.
5. Retires the legacy `/arsenal` landing page that embedded randomly generated threat maps, fake quantum encryption, and simulated scans. The compatibility link now redirects to `/cybersecurity`. Real `/quantum-encryption`, `/ai-powered-security`, and `/zero-day-protection` pages remain accessible under their documented, limited scopes.
6. Adds repository-level regression checks for destination modes, caveats, route wiring, guided workflow, and legacy retirement.

## Important non-claims

- No live SOC, continuous threat monitoring, hosted public cyber range, or general-purpose live vulnerability scanner is introduced.
- A routed UI is not proof that an Edge Function, third-party integration, provider secret, or database migration is deployed.
- The existing local assessment register, STRIDE and incident playbooks do not automatically share one durable server-side case. That is a future milestone.

## Release verification

- Run `node --test tests/cybersecurity-hub-destinations.test.mjs tests/cybersecurity-universe-wave1.test.mjs`.
- Run `npm test` and `npm run build`.
- In deployed staging: check keyboard search and execution filter, login redirects, denied provider status, absent DNS/CTF backends, and no fabricated success states.
- Verify `/arsenal` redirects safely and real local AES encryption remains functional.

## Next prioritized wave

Establish authenticated, owner-scoped assessment cases with durable asset inventory, findings, evidence references, audit entries, and explicit authorization before enabling any active target tests.
