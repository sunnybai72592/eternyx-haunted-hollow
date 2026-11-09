# Contributing

Thank you for helping improve ETER NYX.

## Before changing code

1. Read [README.md](README.md) and [SECURITY.md](SECURITY.md).
2. Open an issue for substantial changes so the intended behavior is clear.
3. Never include real credentials, customer data, or private security findings in commits.

## Development workflow

```bash
npm ci
cp .env.example .env
# Fill in local development values
npm run dev
```

Create a focused branch from `main`. Keep changes small and explain why they are needed.

## Before opening a pull request

Run:

```bash
npm run lint
npm run build
```

If a check cannot be run, state that clearly in the pull request. Include relevant manual test steps and screenshots for user-interface changes.

## Pull request expectations

- Describe the problem and the proposed solution.
- List the main files or areas changed.
- Include test results and known limitations.
- Update documentation when setup, configuration, or behavior changes.
- Avoid unrelated formatting or dependency changes.
- Never claim a feature is complete unless its real end-to-end behavior has been verified.
