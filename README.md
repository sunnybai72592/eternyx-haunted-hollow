# ETERNYX

**A digital workspace for cybersecurity, developer productivity, AI-assisted workflows, and technical learning.**

ETERNYX is being developed as a unified platform for practical online tools and learning experiences. This repository contains the web application and its supporting backend/integration code.

> **Project status:** Active development. Features may have different levels of completeness. Do not rely on a tool for security, compliance, or operational decisions until its implementation and results have been independently verified.

## Product direction

- **Cybersecurity workspace** — responsible, authorized security utilities and analysis.
- **Developer hub** — practical tools for web development, APIs, and troubleshooting.
- **AI workspace** — integrations and AI-assisted workflows.
- **Learning center** — CBT-style assessments and technical learning resources.
- **Personal workspace** — accounts, saved work, and progress features as they become available.

The roadmap is intentionally staged: security and reliability first, feature expansion second.

## Technology

The current application is built around:

- React 18 and TypeScript
- Vite
- Tailwind CSS and shadcn/ui components
- Supabase for selected backend services
- Capacitor for mobile packaging

Check `package.json` for the authoritative dependency and script list.

## Getting started

### Requirements

- Node.js (use an active LTS release)
- npm
- Access to the required Supabase project for features that depend on it

### Install and run

```bash
git clone https://github.com/sunnybai72592/eternyx-haunted-hollow.git
cd eternyx-haunted-hollow
npm ci
cp .env.example .env
npm run dev
```

Vite prints the local development URL after the server starts.

### Environment configuration

Copy `.env.example` to `.env` and provide the correct values for your own development environment.

- Variables prefixed with `VITE_` are bundled into client-side code. Treat them as public.
- Supabase publishable/anon keys are designed for client use only when database access is correctly protected by Row Level Security (RLS).
- Private API keys, service-role keys, signing secrets, and provider credentials must remain server-side. Never prefix private values with `VITE_`.
- Never commit `.env`, production credentials, access tokens, or private keys.

See [SECURITY.md](SECURITY.md) before configuring or deploying the project.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run build:dev` | Create a development-mode build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

## Quality and release checks

Before proposing or deploying a change:

```bash
npm ci
npm run lint
npm run build
```

A successful frontend build does not prove that backend authorization, payment flows, security scanners, or third-party integrations are safe. Those require dedicated tests and configuration reviews.

## Security and responsible use

Use security utilities only against systems you own or have explicit permission to assess. Findings should be validated before being treated as confirmed vulnerabilities.

Please do not publish vulnerabilities, credentials, personal data, or exploit details in public issues. Follow the private reporting guidance in [SECURITY.md](SECURITY.md).

## Contributing

Changes should be focused, documented, and tested. See [CONTRIBUTING.md](CONTRIBUTING.md) for the expected workflow.

## Roadmap

1. Protect credentials, database access, and privileged operations.
2. Establish reliable CI, automated tests, and dependency hygiene.
3. Verify existing tools and remove misleading or simulated success states.
4. Improve accessibility, performance, mobile experience, and product design.
5. Expand integrations and capabilities only when they can be supported safely.

## License

No license is currently declared in this repository. Unless a license is added, standard copyright applies and reuse is not automatically permitted.
