# ETERNYX Ecosystem Architecture

## Product direction

**Tagline:** One ecosystem. Endless possibilities.

ETERNYX is organized as one connected digital platform with focused pillars, a shared discovery experience, and a consistent account/workspace layer. The visual direction is deep navy, near-black, electric cyan, and violet, with responsive layouts and clear hierarchy.

## Six ecosystem pillars

| Pillar | Route | Purpose | Initial status |
|---|---|---|---|
| Cybersecurity Hub | `/cybersecurity` | Defensive security, authorized testing, threat awareness, security operations | Existing landing-page foundation |
| Developer Studio | `/developer-studio` | Code utilities, APIs, web development, testing, debugging | Planned |
| AI Arsenal | `/ai-arsenal` | AI assistants, document intelligence, focused productivity | Planned |
| Digital Workspace | `/workspace` | Projects, saved work, files, personal dashboard, preferences | Planned |
| Cloud & Integrations | `/integrations` | Connected services, APIs, cloud resources, webhooks | Planned |
| Automation & Innovation | `/automation` | Repeatable workflows, orchestration, scheduled tasks, experiments | Planned |

Education is intentionally outside this milestone and remains unchanged.

## Shared platform routes

- `/` — existing home page (to be redesigned in a later milestone)
- `/explore` — central searchable directory of the six pillars
- `/tools` — existing tools directory
- `/tools/category/:categoryId` — existing category route
- `/dashboard` — existing personal dashboard
- `/profile`, `/settings` — existing account destinations
- `/tools/:toolId` — future canonical individual-tool route; do not introduce until tool identity, execution, and status handling are verified

## Navigation principles

1. Keep the primary navigation concise; use Explore as the discovery entry point.
2. Preserve existing destinations and authentication behavior.
3. Avoid duplicate routes and migrate legacy destinations only when redirects are verified.
4. Make every pillar discoverable from Explore.
5. Keep Education routes and components untouched during this phase.

## Capability status policy

Every capability must be labeled honestly:
- **Available:** implemented, permission-checked, and tested for its stated behavior.
- **Preview:** partially implemented or limited; disclose limitations.
- **Coming soon:** planned but not executable.

A card, label, database write, simulated response, or placeholder is not proof that a tool is operational. Security features must state authorization requirements and scope.

## Implementation sequence

1. Ecosystem data model, Explore directory, reusable pillar page, and routes.
2. Homepage redesign around the six pillars.
3. Pillar-specific content and tool directories, starting with verified existing functionality.
4. Individual tool experience with consistent status, permissions, input validation, and result handling.
5. Unified workspace and project/file experiences.
6. Integrations and automation after permission and security models are defined.
7. Testing, accessibility, responsive QA, and performance checks.

## Scope and safety for this foundation

- Frontend information architecture only.
- No database migrations, Edge Functions, secrets, OAuth changes, billing changes, or production configuration changes.
- Existing authentication, Cybersecurity Hub, tools, and Education are preserved.
- The new pages describe planned capability areas without pretending those capabilities are already implemented.
