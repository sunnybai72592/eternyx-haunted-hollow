# Legacy Tools & Execution Integrity Audit

**Baseline:** `main` at merge commit `613a95bb5f928d1f99d591194f668823993b79a4` (PR #56)  
**Method:** Static source review of the legacy tool registry, dashboard execution path, tool catalogue page, and cyber dashboard.  
**Scope:** Documentation only. No application behavior, Supabase schema, production data, credentials, or deployment settings changed.

## Executive summary

The legacy tools experience has multiple competing catalogues and execution contracts. The current dashboard deliberately refuses to report success when a tool has no attached action, but the action registry is not connected to the objects returned by `fetchTools()`. Separately, many entries in the action registry are explicit “coming soon” responses or write placeholder records rather than performing the operation their names advertise.

This is an integrity and product-trust issue before it is a visual-design issue. ETERNYX should not display fabricated usage metrics, imply that a scan or analysis ran when only a database row was inserted, or show a launch action that cannot launch anything.

## Confirmed findings

### P1 — Dashboard action registry is disconnected

**Evidence**
- `src/lib/tools.tsx` exports both `fetchTools()` and `toolActions`.
- `fetchTools()` maps `baseTools` and returns each tool with usage metadata; it does not attach an `action` property.
- `src/pages/UnifiedDashboard.tsx` imports `toolActions`, but its `handleToolClick()` invokes only `tool.action`.
- When `tool.action` is absent, the dashboard reports that the selected tool has no defined action.

**Impact**
- The exported action map is not the execution path used by the dashboard.
- The dashboard's current behavior is safer than falsely claiming success, but the tool cards appear executable even though the selected item cannot run.

**Safe remediation**
- Define one typed execution contract and explicitly classify each tool as implemented, informational/read-only, request-only, unavailable, or not implemented.
- Connect only independently verified implementations. Never attach a placeholder action simply to make the button work.
- Render the correct action or status label and disable unavailable actions accessibly.

### P1 — Placeholder actions can create false operational records if wired

**Evidence**
- The first five action-map entries in `src/lib/tools.tsx` write records using hard-coded or sample inputs:
  - `vulnerability-scanner` inserts a scan row for `https://example.com`; no scanner is invoked in this action.
  - `ai-threat-analysis` inserts sample log data and a fixed low-risk result/confidence; no model analysis is performed.
  - `quantum-encryption` inserts key metadata; it does not generate cryptographic key material or implement a post-quantum algorithm.
  - `network-mapper` inserts a sample private network and zero anomalies; it does not discover devices or map a network.
  - `code-analyzer` submits a generic project request; it does not analyze source code in this action.
- Many remaining action-map entries return a “feature coming soon” message.

**Impact**
- If these actions are connected without replacement, user history and dashboard metrics could imply that security operations occurred when they did not.
- A database insert is persistence, not proof of a scan, analysis, encryption, or discovery operation.

**Safe remediation**
- Keep mock/sample actions out of production execution paths.
- Separate “submit a request” from “run an analysis” in both UI copy and backend contracts.
- A real scanning workflow must be explicitly authorized and server-side protected, with strict target validation, private/reserved address blocking, redirect re-validation, timeouts, response-size limits, rate limits, and audit logging.
- A cryptographic feature must use a reviewed implementation and must not claim quantum resistance based on metadata labels.

### P2 — Tool card click handling can invoke the same callback twice

**Evidence**
- `src/components/ToolCard.tsx` assigns `handleClick` to the outer `Card` click handler.
- The nested `Button` also assigns `handleClick`.
- The button click bubbles to the card because propagation is not stopped.

**Impact**
- A single button click can trigger the callback twice, producing duplicate notifications today and potentially duplicate operations if execution is later connected.
- The clickable outer card also needs an explicit keyboard-accessible interaction model; a pointer click handler alone is not sufficient.

**Safe remediation**
- Use one semantic button as the action target, or prevent bubbling where the nested control remains.
- Ensure keyboard activation, visible focus, disabled state, and accessible naming.
- Add a regression test proving one activation causes exactly one callback.

### P2 — Legacy catalogue destinations include routes not declared in the app

**Evidence**
- `src/data/tools.ts` includes `/tools/deployment-pipeline` and `/tools/ai-model-tester`.
- The current route inventory in `src/App.tsx` does not declare those paths.
- The same catalogue includes `/tools/network-scanner` and `/tools/code-analyzer`, which are declared.

**Impact**
- Some catalogue cards can navigate to the not-found route instead of a tool experience.

**Safe remediation**
- Reconcile every catalogue destination against the route registry.
- For each missing destination, either add a real page/route or point to an existing, verified destination with clear copy. Do not create empty placeholder pages just to satisfy a link.

### P2 — Multiple independent tool catalogues drift apart

**Evidence**
- `src/lib/tools.tsx` defines a large `baseTools` registry used by `UnifiedDashboard`.
- `src/data/tools.ts` defines a separate `toolCategories` catalogue used by `src/pages/Tools.tsx`.
- `src/pages/CyberDashboard.tsx` contains a third hard-coded list of eight tools.
- These sources have different metadata, route fields, descriptions, and execution behavior.

**Impact**
- Tool names, descriptions, availability, destinations, and status can disagree across pages.
- Fixes and accessibility improvements must be repeated and can drift again.

**Safe remediation**
- Introduce one canonical, typed tool metadata registry after mapping all consumers.
- Keep presentation-specific grouping as derived views, not duplicated tool definitions.
- Preserve existing IDs and route compatibility during migration.

### P2 — Cyber dashboard displays fabricated user metrics and launch feedback

**Evidence**
- `src/pages/CyberDashboard.tsx` labels hard-coded values as user stats (level, XP, tools, missions, streak).
- Its tool click handler only adds a “Launching…” notification; navigation/execution is commented out.
- The page generates random matrix/particle values during render.

**Impact**
- The page can present sample values as personal account activity and communicate a launch that does not happen.
- Randomized render-time effects can change on rerender and make the interface visually unstable.

**Safe remediation**
- Replace hard-coded personal metrics with verified data or explicitly labelled demo values.
- Make every card action navigate to a verified page, open a working workflow, or display an honest unavailable state.
- Use stable decorative values and respect reduced-motion preferences.

### P2 — Tools catalogue contains a toast-only execution helper

**Evidence**
- `src/pages/Tools.tsx` defines `handleExecuteTool()`, which displays an “Executing Tool…” toast and does not execute or navigate.
- The visible catalogue cards use `Link` destinations rather than that helper.

**Impact**
- There are two different concepts of “launch” in the same product: navigation to a route and a toast that only claims initialization.
- The unused helper is misleading maintenance surface and could be wired accidentally later.

**Safe remediation**
- Remove or replace the toast-only helper when the catalogue is next revised.
- Use clear verbs: “Open tool” for navigation, “Run” only for a verified operation, and “Request access” for a real request flow.

## Recommended implementation sequence

1. **Integrity first:** establish canonical availability states and remove false success/launch messaging from legacy tool surfaces.
2. **Execution contract:** map every registry entry to its actual implementation, input requirements, permissions, data writes, and output.
3. **Canonical catalogue:** reconcile IDs, metadata, categories, route destinations, and status across all three legacy catalogues.
4. **Accessible tool cards:** fix duplicate bubbling and keyboard behavior, then add interaction tests.
5. **One real vertical slice at a time:** select a bounded tool with a clear safe use case, implement it end-to-end, and prove that UI success corresponds to real work.
6. **Visual transformation:** once the information and action model is trustworthy, bring catalogues and tool pages into the shared ETERNYX design system.

## Guardrails

- Do not delete existing tools, routes, IDs, or data as part of a visual cleanup.
- Do not wire the current `toolActions` map wholesale into the dashboard.
- Do not present placeholder inserts, sample data, canned results, or “coming soon” handlers as operational security capabilities.
- Do not make production Supabase schema, RLS, storage, or data changes without explicit approval.
- Treat source review as source review: runtime behavior, deployed schema, and production configuration remain unverified until separately tested.

## Validation status

This document records static source findings only. No automated tests, production scans, live external targets, deployed Supabase configuration, or real-device layouts were exercised as part of this audit.
