# ETERNYX — November 19–25, 2026 Release-Readiness Sprint

**November 23:** target release-candidate review.
**November 25:** final date for go/no-go decision.
This document tracks proposed acceptance criteria; it does not certify production readiness.

A passing frontend build, an open PR, or a route existing in source code does not prove
backend authorization, integration safety, working payments, or successful deployment.

## Verified baseline on November 19

- GitHub main post-merge CI passed after PR #221 (commit fdd3885b28252cb06373582d1f552a2e0b7bb0a6).
- The AI registry lists no active AI providers or models.
- Ecosystem metadata still marks Developer Studio, Digital Workspace,
  Cloud & Integrations, and Automation & Innovation as Planned.
- Local AI Writing, Audio, Coding, Document Intelligence, and Research workspaces
  are present but do not offer live AI generation.
- AI Video and Image have prepared architecture and interfaces, not active generation.
- AI Agents Studio is being prepared as a manual, nonexecuting planner.
- Subscription/billing and credit foundations remain intentionally unactivated.

## Go/no-go release gates

- [ ] Run npm ci, full tests, production build and targeted lint on the final commit.
- [ ] Test a fresh public visitor, sign-in, sign-out, password reset and protected routes.
- [ ] Test each advertised active feature in a real browser and supported mobile layout.
- [ ] Record defects and distinguish genuine tool outputs from local previews and roadmap pages.
- [ ] Test server authorization, user isolation, database RLS and private asset boundaries
      against the actual target deployment before activating services.
- [ ] Verify secrets are server-side, no credentials are in the repository, and external
      links, CSP, security headers, and origin policies are appropriate.
- [ ] Do not activate external writes, security scans of third-party targets, AI generation,
      or paid providers without explicit review and owner approval.
- [ ] Confirm subscription status, entitlements, credit reservations/refunds, webhooks,
      reconciliation and failure modes before any billing go-live.
- [ ] Verify privacy, accessibility, keyboard and error states across core flows.
- [ ] Confirm a deployed URL, HTTPS, domain configuration, logging and rollback plan.
- [ ] Final go/no-go sign-off explicitly lists disabled and incomplete capabilities.

## Checkpoints — targets, not asynchronous commitments

| Date | Priority | Required evidence |
| --- | --- | --- |
| Nov 19 | Complete local Agents Studio foundation and this release checklist | PR tests and build |
| Nov 20 | Inventory all six pillars and prioritize blockers | Tracked defects and real feature status |
| Nov 21 | Fix core flows and run browser/device smoke testing | Reproducible results, regression tests |
| Nov 22 | Security, release configuration, and integration gates | Target-environment checks |
| Nov 23 | Primary release candidate decision | All critical gates passed or explicit preview label |
| Nov 24–25 | Fallback fix window and final decision | Evidence-based launch or defer |

## Honest release scope

A credible preview may include the six-pillar navigation and genuinely working
local tools, with unfinished server-backed functionality disabled and clearly labeled.

The date alone does not imply 100+ production-certified tools, fully operational Kali
Linux equivalents, autonomous AI agents, video generation, live AI providers,
payment activation, or complete connected-app automation.

If required security or payment gates remain open, release only a clearly marked
preview or defer production. Do not fake successful execution to meet a calendar.

## Owner approvals

Do not apply production migrations, charge customers, activate subscriptions, deploy
new functions, configure paid providers or secrets, or grant automated external
execution permissions without explicit owner authorization.
