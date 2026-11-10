# ETERNYX Complete Architecture & Experience Inventory

**Audit baseline:** PR #54 merge, commit `9a9a5ed95d0d533b51395ddb7373aa8d7e12acf5`  
**Inventory branch:** `feat/eternyx-architecture-experience-inventory`  
**Scope:** Source-level repository inventory and prioritized findings. No application behavior or production configuration changed.

## 1. Repository snapshot

Counts are derived from the recursive Git tree and route declarations in `src/App.tsx` at the audit baseline.

| Area | Count | Notes |
|---|---:|---|
| Tracked blob files | 407 | Recursive repository tree |
| Page modules | 91 | Includes enhanced, tool, and backup modules |
| React components | 119 | Includes shared UI primitives |
| Explicit route declarations | 73 | Includes wildcard fallback; 72 concrete paths |
| Navigation implementations | 4 | Separate components requiring consumer/behavior mapping |
| Supabase migrations | 22 | Repository migration history |
| Edge Function entry points | 14 | Includes one intentionally retired endpoint |
| Standalone SQL schema files | 4 | Separate from timestamped migrations |
| Node.js test files | 25 | Existing automated utility/workbench tests |

The counts describe repository files and declarations, not verified runtime availability or production deployment state.

## 2. Route inventory

Declared in `src/App.tsx`:

### Core experience and identity
- `/`
- `/login`
- `/auth`
- `/dashboard`
- `/profile`
- `/settings`
- `/reset-password`
- `/help`
- `/explore`

### Cybersecurity and security workbenches
- `/cybersecurity`
- `/cybersecurity/web-security`
- `/cybersecurity/threat-modeling`
- `/cybersecurity/assessment-remediation`
- `/cybersecurity/incident-playbooks`
- `/cybersecurity/aws-iam-policy`
- `/arsenal`
- `/hacked`
- `/black-hat-pentesting`
- `/zero-day-protection`
- `/security-auditing`
- `/incident-response`
- `/penetration-testing`
- `/vulnerability-assessment`
- `/vulnerability-scanner`
- `/quantum-encryption`
- `/ai-powered-security`
- `/threat-monitoring`

### Developer Studio and engineering workbenches
- `/developer-studio`
- `/developer-studio/advanced`
- `/developer-studio/api-workbench`
- `/developer-studio/devops`
- `/developer-studio/deployment-intelligence`
- `/developer-studio/container-infrastructure`
- `/developer-studio/infrastructure-as-code`
- `/developer-studio/observability`
- `/developer-studio/sre-reliability`
- `/developer-studio/cicd-security`
- `/developer-studio/supply-chain`
- `/developer-studio/artifact-provenance`
- `/developer-studio/database-sql`
- `/developer-studio/rls-security`
- `/developer-studio/api-security`
- `/developer-studio/web-security`
- `/developer-studio/github-hub`
- `/developer-studio/github-collaboration`
- `/developer-studio/github-changes`
- `/developer-studio/github-actions`
- `/developer-studio/github-releases`
- `/tools`
- `/tools/category/:categoryId`
- `/tools/network-scanner`
- `/tools/code-analyzer`

### Other ecosystem pillars and platform areas
- `/ai-arsenal`
- `/workspace`
- `/integrations`
- `/automation`
- `/subscriptions`
- `/knowledge`
- `/services-hub`
- `/services`
- `/services/:serviceId`
- `/development`
- `/innovation`
- `/killer-edge`
- `/premium`
- `/elite-development-team`
- `/eternyx-ai`

### Communication and education
- `/bug-report`
- `/contact`
- `/education`
- `/test/:testId`
- `/test-results/:attemptId`

### Fallback
- `*`

**Route audit follow-up:** compare every navigation destination, footer link, CTA, redirect, guard, and generated tool link against this route map. Identify aliases, stale destinations, orphan routes, duplicate concepts, and routes that should be canonical without removing backward compatibility prematurely.

## 3. Application shell and navigation

### Observed files
- `src/App.tsx`
- `src/components/UnifiedNavigation.tsx`
- `src/components/ResponsiveUnifiedNavigation.tsx`
- `src/components/MobileResponsiveNavigation.tsx`
- `src/components/EnhancedNavigation.tsx`
- `src/components/Footer.tsx`
- `src/components/BackButton.tsx`
- `src/components/PageTransitionWrapper.tsx`
- `src/components/AccessibilityProvider.tsx`
- `src/components/ErrorBoundary.tsx`

### Confirmed observations
- Four distinct navigation implementations exist.
- `src/App.tsx` imports `ResponsiveUnifiedNavigation` but mounts `MobileResponsiveNavigation`. The unused import and intended desktop/mobile composition must be resolved after mapping all consumers and visual behavior.
- The mounted `MobileResponsiveNavigation` itself contains desktop and mobile breakpoints; its name alone does not establish that it is mobile-only.
- The global shell applies `main` padding and a top offset, plus a fixed back button on non-home routes. This needs viewport and route-level validation to avoid duplicated spacing or content overlap.
- The footer uses placeholder `#` links for Privacy Policy, Terms of Service, Contact Us, GitHub, Twitter, and LinkedIn.
- The footer generates decorative content with `Math.random()` during render. Review for unnecessary rerender work, visual consistency, and reduced-motion behavior.
- Route transitions, overlays, fixed navigation, and global effects need keyboard, screen-reader, contrast, reduced-motion, and mobile QA.

### Target
One authoritative responsive navigation system, shared route metadata, consistent active states, keyboard/touch behavior, and a footer with verified destinations. Consolidation must preserve all working destinations.

## 4. Homepage and pillar experience

### Observed files
- `src/pages/Index.tsx`
- `src/components/ResponsiveMainContent.tsx`
- `src/components/home/SectionSelector.tsx`
- `src/components/home/SectionCard.tsx`
- `src/pages/Explore.tsx`
- `src/pages/EcosystemPillarPage.tsx`
- `src/data/ecosystem.ts`

### Confirmed observations
- The homepage delegates to `ResponsiveMainContent`, which delegates to `SectionSelector`.
- Pillar metadata is centralized in `src/data/ecosystem.ts`.
- `EcosystemPillarPage` currently renders a capability map and only provides direct open-destination CTAs for Cybersecurity Hub and Developer Studio. The other pillar experiences need clear, honest next actions and status messaging.
- The pillar page itself states that capability areas are not promises that every feature is live. Preserve this honest distinction and apply consistent status semantics throughout the product.
- The six pillars are Cybersecurity Hub, Developer Studio, AI Arsenal, Digital Workspace, Cloud & Integrations, and Automation & Innovation.

### Target
A unified information architecture, consistent pillar layouts, accurate capability status, clear paths into available experiences, responsive alignment, and cross-pillar discovery.

## 5. Identity, authentication, and account state

### Observed files
- `src/store/authStore.ts`
- `src/hooks/useAuth.ts`
- `src/contexts/AuthContext.tsx`
- `src/pages/AuthPage.tsx`
- `src/pages/ResetPassword.tsx`
- `src/pages/Profile.tsx`
- `src/pages/Settings.tsx`
- `src/components/ProfileSettings.tsx`
- `src/components/ProfileAvatarUploader.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/components/auth/SignupForm.tsx`
- `src/components/auth/GoogleAuthButton.tsx`
- `src/components/auth/UserProfile.tsx`
- `src/components/AdminGuard.tsx`

### Confirmed observations
- The app shell initializes the Zustand auth store.
- A separate custom `useAuth` hook maintains its own user/session/loading state and Supabase auth subscription.
- A separate context-based auth implementation also exists. Its provider/consumer usage and relationship to the active store must be traced before any removal.
- The Zustand store persists only the `isAuthenticated` flag; Supabase is configured to persist and refresh the actual auth session. Verify initialization races, loading states, stale flags, and all auth events.
- Profile creation is attempted after session restoration/sign-in if no profile is found. Verify idempotency, duplicate handling, email-confirmation behavior, and profile fetch failure recovery.
- Account deletion, password recovery, Google OAuth callback, logout failure, and multi-tab session behavior require end-to-end tests.

### Target
One clearly owned authentication state model, one profile contract, predictable session restoration, consistent error handling, and documented account lifecycle behavior. Preserve OAuth and existing users during migration.

## 6. Profiles, data, storage, and backend

### Observed files and services
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `src/lib/supabase.ts`
- `src/lib/supabaseClient.ts`
- `src/lib/supabaseService.ts`
- `src/store/authStore.ts`
- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/functions/`
- `supabase-schema.sql`
- `cbt_schema.sql`
- `eternyx_ai_schema.sql`
- `tsms_schema.sql`

### Inventory
- 22 timestamped migrations.
- 14 Edge Function entry points.
- 4 standalone SQL schema files.
- The main browser client uses the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the code comments explicitly prohibit privileged keys in the browser.
- `src/lib/supabase.ts` re-exports the shared client and also contains a `SupabaseAPI` abstraction, including a contact submission helper.
- `src/lib/supabaseClient.ts` re-exports the same shared client.
- Profile avatar upload uses the `user-avatars` bucket and obtains a public URL in the inspected profile settings component.
- The local Supabase config contains local-development settings and placeholder site/redirect URLs. Do not treat those values as proof of deployed project settings.
- The `disable-rls` Edge Function currently returns HTTP 410 and explicitly states that privileged RLS disabling is retired. Preserve this retirement; do not restore it.

### Database security review requirements
- Build a table-by-table matrix of schema, owner column, RLS enabled state, policies by operation, grants, and service-role usage.
- Reconcile all 22 migrations and four standalone schema files with the actual deployed schema before proposing changes.
- Three early migration files contain overlapping definitions for core tables including `profiles` and `contact_submissions`. Determine their intended migration history and deployed status; do not assume they were all applied successfully or alter them blindly.
- Recent migrations add trusted admin authorization and tighten subscriber writes, thread messaging, and threat-monitoring access. Review their functions, policies, grants, and dependent application flows together.
- Verify profile public/private field behavior against SQL policies and actual public profile queries. UI privacy switches alone do not enforce access control.
- Verify the `user-avatars` bucket's actual visibility, object policies, MIME/type and size limits, filename ownership, overwrite behavior, and deletion lifecycle.
- Verify all Edge Function authentication, authorization, CORS, input validation, rate limits, resource limits, error handling, and secret handling.
- Review user data export, account deletion, retention, backups, and orphaned storage cleanup.

**Important:** Repository SQL and local config are not proof of current production state. No production queries, migrations, or settings changes are authorized by this inventory.

## 7. Contact, bug reports, suggestions, and legal

### Confirmed contact finding
- `src/pages/Contact.tsx` currently simulates a delay and displays a success toast; its inspected submit handler does not call the backend.
- `src/lib/supabase.ts` contains `SupabaseAPI.submitContactForm`, which inserts into `contact_submissions`.
- The initial migration defines `contact_submissions`, enables RLS, allows public inserts, and restricts reads/updates to admins. This is a useful existing foundation, but deployed schema/policies must still be verified.
- The contact UI and backend helper are disconnected. The future implementation should use the existing validated contract where safe, return success only after a confirmed insert, and include abuse protection and privacy disclosures.
- `src/pages/BugReport.tsx` renders a form but the inspected implementation does not establish a working submission/persistence flow.
- No dedicated legal page modules or routes for Terms of Service or Privacy Policy were found in the route/page inventory.
- No dedicated feedback/suggestion submission workflow was identified in the inspected route inventory. Search results for the word "suggestions" were unrelated tool metadata, not a submission feature.

### Target
Real submission workflows with server-confirmed outcomes, validation, spam/abuse controls, accessible success/error states, clear retention and privacy handling, and support/admin workflows. Legal content must be reviewed for the actual business, jurisdiction, data practices, and third-party services; do not publish placeholder legal claims.

## 8. Tools and workbenches

### Initial scope
The repository contains dedicated Developer Studio, Cybersecurity, DevOps, GitHub, API, database, infrastructure, observability, SRE, supply-chain, incident-response, threat-modeling, and IAM workbench pages, alongside legacy tools and backup page modules.

### Required per-tool audit fields
- Canonical route and pillar ownership.
- Actual implementation state: available, preview/limited, or coming soon.
- Inputs, validation, execution location, outputs, and export behavior.
- External network/API behavior and CORS limitations.
- Authentication and authorization requirements.
- Sensitive data handling and retention.
- Loading, empty, success, error, disabled, and permission-denied states.
- Keyboard, screen-reader, touch, and small-screen behavior.
- Tests, known limitations, and reproducible defects.

A card, route, mock result, or successful local calculation is not proof that an advertised external operation occurred.

## 9. Design system, accessibility, and device experience

### Existing foundation
The repository includes Tailwind, Radix/shadcn UI primitives, Lucide icons, Framer Motion, an accessibility provider, responsive navigation components, mobile viewport helpers, and Capacitor Android/iOS dependencies.

### Required audit
- Design tokens: colors, typography, spacing, radii, shadows, borders, focus rings, layering, and motion.
- Shared page containers, headers, breadcrumbs, cards, tool shells, forms, tables, tabs, dialogs, notifications, and empty states.
- Consistent content width, alignment, vertical rhythm, responsive grids, and safe-area behavior.
- Desktop keyboard and pointer behavior; mobile touch targets, scrolling, viewport changes, orientation, and keyboard overlap.
- WCAG-oriented semantic structure, accessible names, contrast, focus visibility, keyboard navigation, screen-reader announcements, and reduced motion.
- Performance budgets for route bundles, heavy editors, charts, animation, image loading, and repeated data requests.
- Verify web browser and Capacitor native wrapper behavior separately; dependencies alone do not prove native readiness.

## 10. Initial prioritized findings register

Severity is provisional and based on source evidence. It must be refined with reproduction and runtime testing.

| ID | Priority | Finding | Evidence / next action |
|---|---|---|---|
| UX-001 | P1 | Contact form reports success without submitting | Connect page to existing contact helper; validate confirmed persistence and anti-spam controls |
| UX-002 | P1 | Bug-report form has no verified submission workflow | Trace intended destination and implement a real, permission-aware flow |
| UX-003 | P1 | Legal and footer destinations are placeholders | Create reviewed legal pages and correct footer destinations |
| ARCH-001 | P1 | Multiple auth state abstractions exist | Map consumers and auth lifecycle; design a safe consolidation plan |
| ARCH-002 | P1 | Migration/schema history has overlapping core table definitions | Reconcile migration history and deployed schema before database work |
| SEC-001 | P1 | Profile visibility and avatar storage guarantees need verification | Inspect actual RLS and storage policies; test cross-user access |
| NAV-001 | P2 | Four navigation implementations coexist | Map consumers and behavior; select one authoritative responsive implementation |
| NAV-002 | P2 | App shell imports one navigation but mounts another | Verify intended component and remove unused/duplicate wiring safely |
| NAV-003 | P2 | Footer has placeholder policy, contact, and social links | Replace only with verified destinations |
| PILLAR-001 | P2 | Pillar landing pages have uneven action depth | Give all six pillars consistent, honest status and navigation |
| DOC-001 | P2 | Architecture document's status descriptions lag current code | Update only after capabilities are verified |
| UX-004 | P2 | Global shell spacing and fixed controls need viewport validation | Test all major route templates and breakpoints |
| A11Y-001 | P2 | Global effects and motion need full accessibility review | Check reduced motion, focus, contrast, screen readers, and performance |

No P0 issue is asserted by this source inventory. A deeper security review may change severity if reproducible evidence supports it.

## 11. Proposed implementation sequence

1. Finish route/navigation link reconciliation and classify route ownership.
2. Complete auth/profile consumer map and end-to-end lifecycle test plan.
3. Complete schema/RLS/storage/Edge Function security matrix; compare with deployed state only through approved read-only access.
4. Fix the contact and bug-report workflows, with user approval for any schema or production configuration changes.
5. Deliver legal page requirements and approved copy.
6. Establish the shared design system and application shell.
7. Modernize the homepage and all six pillar pages.
8. Progressively migrate old tools and workbenches to shared patterns.
9. Introduce cross-pillar workspace contracts and user-controlled artifact sharing.
10. Complete desktop, mobile web, iOS/Android, accessibility, performance, and regression QA.

## 12. Guardrails

- This PR is documentation-only.
- Do not restart or broadly rewrite the platform.
- Preserve existing routes, data, integrations, and user accounts.
- Do not remove duplicated-looking code until all consumers and runtime behavior are mapped.
- Do not treat local SQL or repository config as production truth.
- Do not run production migrations, change RLS, alter storage, or modify auth settings without explicit user approval.
- Never expose service-role/secret keys to browser code.
- Do not claim tests, builds, or device QA passed unless they were actually run and the results were reviewed.
- Every implementation PR should be small enough to review, tested, reversible, and manually merged by the repository owner.

## 13. Audit completion criteria

- All declared routes and all navigation/CTA destinations are reconciled.
- All six pillar pages and their real capabilities are classified.
- Auth state providers/hooks/stores and consumers are mapped.
- Profile, account deletion, avatar storage, and preferences flows are documented.
- Tables, migrations, RLS policies, storage buckets, and Edge Functions have an evidence-backed security matrix.
- Contact, bug report, suggestions, and legal destinations are classified with real workflows and ownership.
- Every tool has a capability status and quality checklist.
- A shared design-system contract and phased migration plan are approved before broad redesign work.
