# ETERNYX Reality Audit — Phase 1

**Audit date:** 2026-11-10  
**Baseline branch:** `main`  
**Baseline commit:** `2668e0c822e6039cab26bee8aef30b42d82e3dab` (PR #60 merge)  
**Status:** In progress — source-level findings register, not a production security certification.

## 1. Purpose and rules

This audit evaluates the ETERNYX repository as it exists after the merged capability and cleanup milestones. The objective is to evolve the existing product, not restart it.

- Preserve working authentication, account, Developer Studio, Cybersecurity workbench, and other verified capabilities.
- Do not present a mock, placeholder, local heuristic, or simulated response as a real external operation.
- Repair real functionality where the underlying implementation exists.
- Retire obsolete surfaces only after checking routes, imports, data dependencies, and compatibility requirements.
- Do not apply production database changes, migrations, or provider configuration changes as part of this audit.
- Treat client-side visibility and tier checks as presentation, never as authorization.

## 2. Repository baseline and audit limits

The current Git tree contains **399 tracked files**, including:

| Area | Count |
|---|---:|
| Page modules under `src/pages` | 85 |
| Component modules under `src/components` | 115 |
| Explicit route declarations in `src/App.tsx` | 73 (including wildcard) |
| Supabase migration files | 22 |
| Supabase Edge Function entry points | 14 |
| Node test files under `tests` | 26 |

The application router directly imports 63 page modules. Twenty-two page modules are not directly imported by `App.tsx`; this is an investigation list, **not proof that every one is dead code**, because another page or component may import them. Three filenames are explicit backups.

This first pass inspected the application shell, active route map, pillar metadata, key account/contact surfaces, tool execution paths, security-focused pages, selected shared services, Edge Functions, and migration history. It is not yet a line-by-line review of all 399 files, nor a runtime/device or deployed-infrastructure assessment. The audit remains open until every page family, component family, migration, function, and user workflow is classified.

**Validation limits:**
- No local `npm test`, `npm run build`, or `npm run lint` was executed during this source review.
- No GitHub Actions workflow run was returned for the baseline merge commit.
- No access to the deployed Supabase project, live RLS catalog, deployed Edge Function settings, Stripe dashboard, or production browser session was used.
- The tracked `.env` file was not opened or echoed. Repository guidance says only public `VITE_` configuration belongs there; verify privately that no server-side secrets have ever been committed. Any `VITE_` value is public in the built browser bundle.

## 3. Highest-priority security findings

### R-01 — Privileged AI Edge Functions lack caller and ownership verification

**Severity:** Critical candidate — confirm deployed configuration immediately  
**Files:** `supabase/functions/process-document/index.ts`, `supabase/functions/eternyx-ai-chat/index.ts`, `ETERNYX_AI_INTEGRATION_GUIDE.md`

Both functions create a Supabase client using `SUPABASE_SERVICE_ROLE_KEY`. The request handlers accept identifiers supplied by the caller, but the inspected handlers do not call Supabase Auth to verify the caller or prove that the caller owns the referenced data.

- `process-document` accepts `documentId` and `storagePath`, then uses a service-role client to retrieve/update the document and process its storage object.
- `eternyx-ai-chat` accepts `userId`, `sessionId`, and `documentId`; it uses a service-role client to retrieve document chunks and chat history and to write messages.
- The integration guide explicitly instructs deploying both functions with `--no-verify-jwt`.

If deployed using that guide, the gateway does not require a user JWT and the handlers do not replace that protection themselves. This creates a serious risk of unauthorized processing, cross-user document/chat access, and service-role writes. The repository alone cannot prove the current remote deployment setting.

**Required remediation:** verify the live function settings first; then require a valid user JWT, derive the user ID from the verified token rather than the request body, enforce ownership for every document/session/storage path, validate file type and size, and add rate/cost limits. Remove the `--no-verify-jwt` deployment instructions for user-facing functions. Never expose the service-role key to the browser.

### R-02 — SQL function capable of disabling RLS remains in migration history

**Severity:** High / urgent privilege review  
**Files:** `supabase/migrations/20250902154309_disable_rls_vulnerability_scans_function.sql`, `supabase/migrations/20250902160015_enable_rls_vulnerability_scans.sql`

The first migration creates `disable_rls_vulnerability_scans()` as a `SECURITY DEFINER` function that executes `ALTER TABLE public.vulnerability_scans DISABLE ROW LEVEL SECURITY`. The follow-up migration file inspected for re-enabling RLS is empty. Repository search found no later `DROP FUNCTION` or explicit `REVOKE EXECUTE` for this function.

The retired `disable-rls` Edge Function returning HTTP 410 is a good safeguard, but it does not remove this separate SQL function.

**Required remediation:** inspect effective function privileges and the live database catalog. If no approved administrative use exists, revoke execution from `PUBLIC`, `anon`, and `authenticated`, then remove the function in a reviewed migration. Do not execute this against production as part of the audit.

### R-03 — Third-party API keys are read from browser-exposed Vite variables

**Severity:** High if configured  
**File:** `src/lib/securityAPIs.ts`

The browser bundle reads `VITE_VIRUSTOTAL_API_KEY` and `VITE_SHODAN_API_KEY` and sends them directly to VirusTotal and Shodan. Vite intentionally exposes `VITE_` variables to client-side code. If real keys are supplied, users can extract them from the built application and reuse them.

**Required remediation:** move all third-party secret-key requests behind authenticated Edge Functions, store keys as server-side Supabase secrets, apply per-user quotas, and rotate any key that has already been shipped in a public build.

### R-04 — Public-profile row visibility does not enforce the column-level privacy switches

**Severity:** High privacy review  
**Files:** `supabase/migrations/20251228120908_b951c371-3534-4604-94a2-1f86cc70c515.sql`, `supabase/migrations/20251004122829_a8554bfe-efa3-4057-858d-edee58f73e61.sql`

The later profile policy correctly limits row visibility to the owner or profiles with `is_profile_public = true`. However, the migration explicitly notes that `show_email` and `show_phone` require application-level filtering or a view; row-level security does not hide individual columns. A public query against a public profile can otherwise request every granted column, including phone data.

**Required remediation:** use a restricted public-profile view or column-level grants and ensure every public profile query uses it. Verify the live grants and actual public query paths before changing policy.

### R-05 — Security scanner endpoints and browser scanners need a strict authorization/target boundary

**Severity:** High  
**Files:** `supabase/functions/web-scanner/index.ts`, `supabase/functions/port-scanner/index.ts`, `supabase/functions/dns-analyzer/index.ts`, `src/lib/securityAPIs.ts`, `src/pages/BlackHatPentesting.tsx`

The web-scanner accepts a caller-supplied URL and performs server-side fetches and directory/content checks. The inspected handler validates URL syntax but does not establish that the target is public or authorized by the user. Other scanner handlers accept caller-supplied `user_id` values without consistently deriving ownership from a verified user identity. The browser vulnerability scanner also sends test payloads to a supplied target.

**Required remediation:** require authenticated identity, derive ownership server-side, block loopback/private/link-local/reserved destinations after DNS resolution, defend against redirects and DNS rebinding, cap requests/time/depth, and require explicit authorization scope. A syntax-valid URL is not proof of permission to scan it.

## 4. Data, identity, and migration integrity

### R-06 — Initial migration sequence contains duplicate non-idempotent table creation

**Severity:** High reproducibility blocker  
**Files:** the first three migrations beginning `20250828011106`, `20250828011234`, and `20250828011357`

All three timestamped migrations attempt to create core tables such as `public.profiles` without `IF NOT EXISTS` or a prior drop. A clean migration run will create the table in the first migration and then encounter the same table creation in the next migration. This is a likely fresh-database reset/push failure, even if an existing remote project has already been provisioned.

**Required remediation:** reproduce with a disposable local Supabase database, compare the migration ledger to the deployed schema, then consolidate/repair only through a carefully reviewed forward migration strategy. Do not rewrite already-applied migration history.

### R-07 — Multiple profile models and authentication abstractions coexist

**Severity:** Medium architecture risk  
**Files:** `src/store/authStore.ts`, `src/lib/auth.ts`, `src/hooks/useAuth.ts`, `src/contexts/AuthContext.tsx`

The active application store reads and updates `public.profiles`. A separate legacy `AuthService` reads/writes `public.user_profiles`; a custom auth hook and separate context also exist. The project therefore has multiple profile/auth abstractions and two profile tables with different schemas and RLS histories.

**Required remediation:** map every import and consumer before consolidation. Keep the working Zustand/Supabase auth path intact; migrate data only after the canonical profile contract and deployed database state are confirmed.

### R-08 — Avatar upload paths do not match the storage ownership policies

**Severity:** Medium / user-facing defect  
**Files:** `src/components/ProfileAvatarUploader.tsx`, `src/components/ProfileSettings.tsx`, `src/lib/auth.ts`, avatar storage migrations

The repository creates both `avatars` and `user-avatars` buckets. The policies for both require the first storage folder to equal `auth.uid()`. The active `ProfileAvatarUploader` uploads to `avatars` using a flat filename, while the other upload paths use `avatars/<user-id>.<ext>` in `user-avatars`. Neither path format satisfies the corresponding first-folder ownership rule.

**Required remediation:** select one canonical bucket, use a path such as `<auth.uid()>/<filename>`, align all upload/read/delete code and policies, and add tests for cross-user upload denial and file type/size constraints.

### R-09 — User-writable profile fields must not become authorization

**Severity:** Medium authorization design risk  
**Files:** profile migrations, `src/store/authStore.ts`, `src/components/tools/ToolCard.tsx`

The owner-update policy on `profiles` is row-based, while `access_level` is a profile field. Legacy tool components use the client profile's access level for tier gating. Client-side checks can be bypassed and must not authorize paid or privileged operations. The recent trusted-admin migration correctly moves administrator decisions to protected assignments; premium entitlements need the same server-authoritative treatment.

**Required remediation:** derive subscription entitlements from server-managed billing state and enforce them in Edge Functions/database policies. Treat profile access-level values as display-only unless protected by a server-owned mechanism.

### R-10 — Security-definer statistic RPCs accept arbitrary user IDs

**Severity:** Medium integrity review  
**File:** `supabase/migrations/20251002000000_add_profile_fields.sql`

`update_login_stats(user_uuid)` and `increment_project_count(user_uuid)` are `SECURITY DEFINER` functions granted to `authenticated`, but the inspected function bodies do not compare the argument to `auth.uid()`. A caller may be able to modify another user's counters through RPC.

**Required remediation:** verify effective grants and callers; derive the user ID from `auth.uid()` inside the function or restrict execution to a trusted server role.

## 5. Capability truthfulness and tool integrity

### R-11 — Security intelligence is mixed with generated simulation data

**Severity:** High product-integrity issue  
**File:** `src/lib/securityAPIs.ts`

When API keys are absent, VirusTotal and Shodan methods return random simulated results. `getThreatIntelligence()` appends generated simulated threats to database-backed threat intelligence. The Nmap and port-scan helpers explicitly simulate results, and the browser vulnerability scanner uses random booleans after sending requests in `no-cors` mode. Those opaque responses cannot validate the claimed SQLi/XSS/CSRF findings.

**Required remediation:** never merge generated examples into real threat feeds or scan history. Return an explicit `unavailable` state when a provider is not configured. Keep deterministic examples in a clearly labeled demo mode, separate from operational results.

### R-12 — Active cybersecurity pages make unsupported operational claims

**Severity:** High product-integrity issue  
**Files:** `src/pages/AIPoweredSecurity.tsx`, `src/pages/ZeroDayProtection.tsx`, `src/pages/ThreatMonitoring.tsx`, `src/pages/BlackHatPentesting.tsx`, `src/pages/enhanced/CyberArsenal.tsx`, `src/components/enhanced/ThreatMapVisualization.tsx`, `src/components/enhanced/VulnerabilityLab.tsx`

Examples found:
- AI security page labels local rule-based heuristics as real AI/ML models and displays fabricated model accuracy/sample counts.
- Zero-day protection seeds dated sample threats and adds randomly generated “live” threats.
- Threat monitoring generates simulated events while describing a continuous SOC service.
- Cyber Arsenal displays a hard-coded “ALL SYSTEMS OPERATIONAL” status and fixed operational-style statistics.
- Threat Map generates random countries, IPs, attack types, and locations.
- Vulnerability Lab displays canned findings after a timer, independent of the supplied target.

**Required remediation:** remove fabricated live/operational claims. Either connect each capability to a real, permission-checked data source with provenance and timestamps, or clearly label and isolate it as an educational demonstration.

### R-13 — Quantum encryption interfaces do not perform the advertised cryptography

**Severity:** High safety/trust issue  
**Files:** `src/pages/QuantumEncryption.tsx`, `src/components/enhanced/QuantumEncryptionUtility.tsx`, `src/components/tools/CryptoTool.tsx`

The quantum screens label Base64 or reversed Base64 text as Kyber/Dilithium/AES/RSA or quantum-encrypted output. The general CryptoTool includes XOR/Caesar demonstration ciphers and a non-cryptographic custom MD5-like routine. These are not secure encryption or post-quantum cryptography.

**Required remediation:** retire these from operational security categories or relabel them as educational toy demonstrations with explicit warnings. Do not let users rely on these routines to protect real secrets.

### R-14 — Performance and AI analysis pages fabricate measurements

**Severity:** High product-integrity issue  
**Files:** `src/pages/PerformanceOptimization.tsx`, `src/components/AIAdvisor.tsx`, `src/components/CyberMetrics.tsx`, `src/lib/enhanced/authService.ts`

Performance, SEO, keyword, image optimization, security scores, system metrics, and suspicious-activity results are generated from random values, fixed sample data, or simulated delays. They are not measurements of the supplied site, account, or system.

**Required remediation:** remove fabricated metrics and success states. Implement real browser measurements where technically valid, or mark the tool unavailable/preview until a reliable backend or data source exists.

### R-15 — Several tool interfaces advertise more execution than their handlers support

**Severity:** Medium functionality issue  
**Files:** `src/components/tools/ToolExecutor.tsx`, `src/data/cybersecurityTools.ts`, `src/components/tools/NetworkScanner.tsx`, `src/components/tools/QRCodeTool.tsx`

The tool catalogue includes many entries, while `ToolExecutor` implements only five IDs and returns “not implemented” for others. The browser Network Scanner simulates non-web ports and cannot reliably infer host status from opaque `no-cors` responses. QR generation sends the entered content to a third-party QR service, while QR decoding is a stated demo placeholder. The QR upload/data disclosure should be explicit.

**Required remediation:** define one canonical capability registry with status, execution location, permissions, inputs, outputs, data destinations, and tests. Hide or disable tools that have no real handler. Disclose third-party processing before sending user content externally.

## 6. Contact, navigation, and experience

### R-16 — Contact and bug-report workflows do not submit data

**Severity:** High user-trust issue  
**Files:** `src/pages/Contact.tsx`, `src/pages/BugReport.tsx`, `src/lib/supabase.ts`

The Contact page shows success after a simulated delay instead of invoking the existing contact-submission helper/table. The Bug Report page has no verified persistence/submission handler. Users can believe a message was delivered when it was not.

**Required remediation:** wire validated forms to a protected, spam-resistant backend and show success only after confirmed persistence. If submission is not ready, clearly disable the action and state that it is unavailable.

### R-17 — Footer legal/contact/social destinations are placeholders

**Severity:** Medium launch-readiness issue  
**File:** `src/components/Footer.tsx`

Privacy Policy, Terms of Service, Contact Us, and social destinations include placeholder `#` links. No dedicated Terms or Privacy routes were found in the inspected router/page inventory.

**Required remediation:** publish reviewed legal pages and verified destinations; do not link to placeholder anchors.

### R-18 — Several service links do not resolve correctly

**Severity:** Medium navigation issue  
**Files:** `src/pages/ServicesHub.tsx`, `src/pages/Development.tsx`, `src/App.tsx`

Development cards link to paths such as `/frontend-development`, `/backend-development`, `/mobile-development`, `/cloud-solutions`, and `/performance-optimization`, but those pages are not wired as direct routes in the active router. The Services Hub also passes external URLs and a `mailto:` destination to React Router's `navigate()` rather than using appropriate external anchors.

**Required remediation:** map every internal CTA to a declared route and use real anchors for external/mail destinations. Add a route-link integrity test.

### R-19 — Navigation implementations and compatibility destinations have drifted

**Severity:** Medium architecture/UX issue  
**Files:** `src/App.tsx`, `src/components/MobileResponsiveNavigation.tsx`, `src/components/ResponsiveUnifiedNavigation.tsx`, `src/components/UnifiedNavigation.tsx`, `src/components/EnhancedNavigation.tsx`

Multiple navigation implementations coexist. The app mounts `MobileResponsiveNavigation`; other navigation files retain legacy XP/level values and stale destinations. The current home/dashboard and tools compatibility routes redirect to Explore, so some old navigation labels do not lead to a distinct dashboard or tools workspace.

**Required remediation:** trace imports and usage, then converge on one accessible navigation system without removing compatibility redirects prematurely.

### R-20 — Pillar status metadata is inconsistent with delivered functionality

**Severity:** Low/medium content issue  
**File:** `src/data/ecosystem.ts`

Developer Studio has a live route and working browser utilities, but its pillar status is marked `Planned`. Status metadata should describe the actual foundation and distinguish live sub-capabilities from planned domains.

**Required remediation:** align pillar-level status and per-capability availability with verified functionality, not the aspirational roadmap.

### R-21 — Some interactive cards are not keyboard-semantic

**Severity:** Medium accessibility issue  
**Files:** `src/components/home/SectionCard.tsx`, `src/pages/ServicesHub.tsx`, `src/pages/enhanced/CyberArsenal.tsx`

Some cards use click handlers on non-interactive Card/motion containers rather than links or buttons. Keyboard users may not be able to activate them consistently. Confirm which components are mounted before changing them.

**Required remediation:** use semantic links/buttons, visible focus states, and keyboard tests.

## 7. Positive foundations to preserve

- PR #60 removed the fabricated legacy Unified Dashboard, disconnected legacy tool catalogue/actions, and decorative scanner pages while retaining the Developer Studio and Cybersecurity workbenches.
- The active auth store uses Supabase Auth and persists only the authentication boolean in Zustand; do not rebuild the working signup/login/OAuth flow without evidence.
- Trusted administrator assignments are separated from user-editable profile roles in the recent trusted-admin migration.
- The subscriber migration revokes browser writes and makes billing state server-managed.
- The thread-messaging migration applies RLS and tightens client grants.
- The retired `disable-rls` Edge Function returns HTTP 410; keep it retired.
- The SSL analyzer verifies the caller JWT and validates public hostnames before analysis.
- Subscription-check and customer-portal functions verify user identity; test-grading service functions use a dedicated service-auth helper.
- Developer Studio's JSON, Base64, URL encoding, UUID, and JWT-decoding utilities are genuine browser-side utilities with explicit local-processing limitations.
- The profile visibility row policy was later tightened to respect `is_profile_public`; preserve that behavior while fixing column-level privacy.

## 8. Recommended remediation order

1. **Contain security risk:** verify and secure AI function deployment/auth/ownership, inspect and revoke the RLS-disabling SQL function if unneeded, remove browser API secrets, and harden scanner target boundaries.
2. **Protect user data:** fix avatar storage paths, enforce column-level privacy, review self-writable entitlement fields and security-definer RPCs.
3. **Restore data integrity:** repair the migration chain using a disposable database and a forward-only strategy.
4. **Restore user trust:** wire Contact and Bug Report to real persistence; remove false success states and placeholder legal destinations.
5. **Retire or rebuild fabricated capabilities:** security intelligence, AI claims, threat feeds, quantum crypto, performance analytics, and unimplemented tool catalogue entries.
6. **Unify navigation and routes:** one canonical shell, verified route targets, semantic interactions, accurate pillar status.
7. **Experience and quality pass:** shared design system, responsive layouts, accessibility, performance, reduced motion, and end-to-end tests across desktop/mobile.

## 9. Next audit passes

- Complete route-to-page-to-component reachability mapping for all 85 page modules.
- Inspect every remaining page and tool component for real behavior, mock data, unused controls, duplicate logic, privacy, and accessibility.
- Review every migration and standalone schema file for ordering, idempotency, grants, RLS, SECURITY DEFINER safety, and schema drift.
- Review every Edge Function's JWT behavior, user ownership, input validation, external requests, quotas, secrets, and error handling.
- Map every table/storage bucket to its owner, policies, client/server access, retention, and user-facing workflows.
- Review every design token, shared shell, mobile viewport, reduced-motion behavior, and navigation pattern.
- Add reproducible tests for route integrity, authorization contracts, tool execution contracts, and real submission workflows.


## 10. Additional findings from the dormant-page and documentation pass

### R-22 — AI document ingestion and retrieval do not match the documented RAG pipeline

**Severity:** High functionality issue  
**Files:** `supabase/functions/process-document/index.ts`, `supabase/functions/eternyx-ai-chat/index.ts`, `eternyx_ai_architecture.md`, `ETERNYX_AI_INTEGRATION_GUIDE.md`

The implementation does not currently deliver the vector RAG behavior described in the guides:

- `chunkText()` advances with `start = end - overlap` but does not stop when `end` reaches the end of the text. With a positive overlap, the final chunk repeats indefinitely instead of terminating.
- `extractTextFromPDF()` decodes raw PDF bytes with `TextDecoder`; it does not use a PDF parser to extract page text.
- `generateEmbedding()` currently returns `null` for every chunk.
- `retrieveRelevantChunks()` ignores the query argument and returns the first chunks ordered by `chunk_index`, rather than performing vector similarity search.

As a result, PDF ingestion can fail to terminate, PDF content is not reliably extracted, embeddings are not generated, and retrieval is not query-relevant.

**Required remediation:** fix and unit-test chunk termination, use a maintained PDF parser with size/page limits, generate real embeddings, implement and test vector similarity retrieval, and clearly expose processing failure states. Complete this only alongside R-01's authentication and ownership protections.

### R-23 — Dormant dashboard and service pages still contain fabricated operational data

**Severity:** Medium / high if reintroduced  
**Files:** `src/pages/Dashboard.tsx`, `src/pages/DashboardGodMode.tsx`, `src/pages/enhanced/EnhancedDashboard.tsx`, `src/pages/BackendDevelopment.tsx`, `src/pages/CloudSolutions.tsx`, `src/pages/MobileDevelopment.tsx`, `src/pages/PerformanceOptimization.tsx`, `src/pages/CustomSolutions.tsx`

These modules are not directly imported by the current App router and should not be treated as current working product surfaces. They nevertheless contain behaviors that must not be reactivated unchanged:

- Dashboard pages show fixed security/performance scores, threat counts, uptime, network usage, recent activity, and simulated loading.
- The legacy Dashboard includes a commented-out authentication guard.
- Backend Development labels code execution as simulated and returns canned “executed successfully” output.
- Cloud Solutions returns a fabricated successful deployment endpoint and static simulated IAM/RBAC policy templates.
- Mobile Development reports that push notifications were sent without invoking a push service.
- Performance Optimization fabricates SEO, keyword, backlinks, domain-authority, and Core Web Vitals values.
- Custom Solutions selects a random canned idea; it is a simple idea picker, not AI analysis.

**Required remediation:** keep these modules out of active navigation until each capability has a real implementation or a clear demo/preview label. Map references before deleting files.

### R-24 — Dormant education flows contain credential and workflow defects

**Severity:** High if reactivated  
**Files:** `src/pages/AddStudents.tsx`, `src/pages/CreateTest.tsx`, `src/pages/RoleSelection.tsx`, `src/pages/TeacherDashboard.tsx`

These education pages are not directly imported by the current App router, but they contain important issues:

- `AddStudents` writes the submitted results password directly into a column named `results_password_hash`; its own comment says hashing is deferred. Student IDs and passwords are generated with `Math.random()`, which is not appropriate for security credentials.
- `RoleSelection` attaches the same role-selection action to both a clickable Card and its nested button, which can trigger duplicate submissions through event bubbling.
- `TeacherDashboard` calls `loadTests()` and `loadStats()` back-to-back; `loadStats()` reads the previous `tests` state when building the attempt query, so the initial attempt count can be incorrect.
- The TSMS schema enables RLS on `user_roles` and `teachers` but defines no INSERT policy for either table; `RoleSelection` attempts to insert into both, so that onboarding flow is blocked by the inspected policies.
- Teacher/student tables, password verification, ownership policies, and role assignment need a separate schema/RLS review before these flows are exposed.

**Required remediation:** do not reactivate until credentials are generated/hashed server-side, role assignment is protected, all table ownership policies are verified, and education workflows have end-to-end tests.

### R-25 — Legacy tool directories and backup pages duplicate catalogue concepts

**Severity:** Medium cleanup/architecture issue  
**Files:** `src/pages/CybersecurityTools.tsx`, `src/pages/DigitalInnovationTools.tsx`, `src/pages/UniversalWebAppUtilities.tsx`, `src/pages/WebDevelopmentTools.tsx`, their `.backup.tsx` counterparts, `src/data/cybersecurityTools.ts`, `src/data/webDevelopmentTools.ts`, `src/data/innovationTools.ts`, `src/data/allTools.ts`

The current route map no longer directly mounts these older catalogue pages. The repository still contains several overlapping lists of external products/libraries, embedded local utilities, and tool definitions, including three explicit backup page copies. Some pages are directories of third-party products rather than tools executed by ETERNYX itself.

**Required remediation:** distinguish external resource directories from first-party executable tools, select one canonical registry for real ETERNYX tools, and remove backup/duplicate catalogues only after all imports and links have been checked.

### R-26 — Product documentation contains outdated architecture and capability claims

**Severity:** Medium / high trust issue  
**Files:** `ETERNYX_PLATFORM_DOCUMENTATION.md`, `ETERNYX_AI_INTEGRATION_GUIDE.md`, `eternyx_ai_architecture.md`, `docs/ECOSYSTEM_ARCHITECTURE.md`, `docs/ETERNYX_COMPLETE_ARCHITECTURE_EXPERIENCE_INVENTORY.md`, `docs/ETERNYX_UNIVERSAL_TRANSFORMATION_AUDIT.md`, `README.md`, `.gitignore`

- The 2025 Platform 3.0 document describes Kubernetes, multi-cloud microservices, Redis, Elasticsearch, WAF, blockchain identity, and enterprise SOC capabilities without evidence that these are deployed. It should be marked historical/aspirational or archived, not treated as the current architecture.
- The AI integration guide instructs disabling JWT verification and describes vector RAG/PDF parsing that the current functions do not implement.
- The ecosystem architecture document still marks Developer Studio as planned and describes the old tools directory/category routes that PR #60 retired or redirected.
- The architecture inventory and transformation audit contain historical file counts and baseline commits; they must be labeled historical or refreshed after the audit.
- README says never to commit `.env`, while `.gitignore` explicitly tracks the root `.env` for public `VITE_` build-time values. The policy must be made consistent: no private secrets may be committed, and every `VITE_` value is public.
- README recommends `npm run lint` before release, but the current CI workflow runs tests, selected Node syntax checks, and the Vite build; it does not run ESLint or a dedicated TypeScript typecheck.

**Required remediation:** designate one current architecture source of truth, archive obsolete aspirational docs, correct the AI deployment guide before anyone follows it, reconcile route and capability statuses, and align documented release gates with CI.



### R-27 — Active CBT flow exposes answer keys through the options policy

**Severity:** High assessment-integrity issue  
**Files:** `supabase/migrations/20251221200912_d6870136-afdc-4c62-bd71-adb4bd852f76.sql`, `src/pages/TestInterface.tsx`

The migration allows users to select option rows for any active test. The `options` table includes the `is_correct` column, and the Test Interface requests `select('*')`. Row-level security controls which rows can be read; it does not hide the `is_correct` column. A client can therefore retrieve correct answers for active tests if the migration and grants are deployed as written.

**Required remediation:** expose student-safe options through a view or server endpoint that omits correctness fields. Keep correct-answer data available only to the trusted grading function. Add a regression test proving that a student cannot retrieve answer keys through REST or the app client.

### R-28 — Manual CBT submission is inconsistent with the attempt RLS policy and grading flow

**Severity:** High workflow issue  
**Files:** `supabase/migrations/20251221200912_d6870136-afdc-4c62-bd71-adb4bd852f76.sql`, `src/pages/TestInterface.tsx`, `supabase/functions/auto-submit-tests/index.ts`, `supabase/functions/grade-test/index.ts`

The user-facing submit flow updates an attempt from `in_progress` to `submitted`. The RLS update policy's `USING` condition requires `status = 'in_progress'` and does not provide a separate `WITH CHECK`; PostgreSQL uses the policy expression to validate the new row as well, so the submitted status may fail the policy check. The UI also does not invoke `grade-test` after manual submission. The grading function is currently invoked by the trusted auto-submit function, not the manual-submit path.

Additional limits:
- The timer starts from the full configured duration on each page load rather than a server-owned attempt deadline, so refreshing can reset the timer.
- The browser Visibility API detects a hidden tab, not a device screen lock or proof of cheating.
- The grading function awards points only for multiple-choice/true-false selections; short answers receive no automated score.
- No scheduled invocation for `auto-submit-tests` was found in the repository configuration. An external scheduler may exist, but it was not verified.

**Required remediation:** make the server authoritative for attempt deadlines and status transitions; use a trusted submission/grading operation; add an explicit manual-grade path for short answers; and test manual, timed, refresh, and concurrent submission cases. Keep the shared service-auth protection on both Edge Functions.

### R-29 — Standalone SQL schemas are required by later migrations but are outside migration automation

**Severity:** High deployment/reproducibility and identity risk  
**Files:** `cbt_schema.sql`, `tsms_schema.sql`, `supabase-schema.sql`, `eternyx_ai_schema.sql`, `supabase/config.toml`, migrations `20251221200912` and `20251225095322`

The timestamped migration history alters/enables RLS on CBT and AI tables, but their `CREATE TABLE` statements are in standalone root-level SQL files rather than timestamped migrations. The Supabase config has `db.migrations.schema_paths = []`; those root files are not automatically applied by the migration runner. A clean database reset/push can therefore fail when the later migrations attempt to alter tables that have not been created, unless an operator manually applies the standalone files first.

There is also an identity-model mismatch:
- `supabase-schema.sql` creates a custom `public.users` table with a `password_hash` column and no visible RLS enablement or auth-user synchronization trigger.
- `eternyx_ai_schema.sql` and `cbt_schema.sql` reference that custom `users` table.
- The current frontend authenticates with Supabase Auth and passes `auth.users.id` as the `user_id` for AI documents and attempts.
- `tsms_schema.sql` instead references `auth.users` directly for teacher/role records.

If these standalone schemas are applied as written without an explicit mapping, foreign-key ownership and RLS comparisons may not align with the active Supabase Auth user IDs. The repository cannot confirm which files were manually applied to the live project.

**Required remediation:** inventory the live schema and migration ledger in a non-production environment, choose `auth.users` as the canonical identity source, remove or isolate the legacy password table if unused, and move required table creation into ordered forward migrations. Do not replay or rewrite production migration history blindly.


**No application source, database migration, production data, secret, or deployment setting was changed by this audit document.**
