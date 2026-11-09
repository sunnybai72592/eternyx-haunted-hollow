# Security Policy

## Supported versions

Security fixes are applied to the active development branch. There is no formal versioned release policy yet.

## Reporting a vulnerability

Please do not report security vulnerabilities in public GitHub issues.

Use GitHub's **Report a vulnerability** feature in the repository's Security tab, if enabled. Include:
- A clear description and affected component or endpoint
- Reproduction steps using an account/system you control
- Potential impact and any relevant logs with secrets and personal data removed

Please allow maintainers reasonable time to investigate and prepare a fix before public disclosure.

## Credential exposure

If a credential may have been committed:
1. Revoke or rotate it at the issuing provider immediately.
2. Review provider audit logs and usage for suspicious activity.
3. Replace it through the hosting provider's secret manager.
4. Remove the value from tracked files and, where appropriate, repository history.
5. Do not assume deleting a file invalidates the credential.

## Secure development requirements

- Never commit `.env` files, tokens, private keys, service-role keys, or passwords.
- Treat every `VITE_*` variable as public browser data.
- Enforce authorization on the server/database; hiding a UI control is not authorization.
- Enable and test Supabase Row Level Security for tables exposed to client access.
- Keep privileged Supabase/service-role credentials server-side only.
- Validate and rate-limit all untrusted input and external network requests.
- Restrict scanning features to authorized targets and defend server-side requests against SSRF.
- Do not report simulated or unverified results as confirmed security findings.
- Do not log credentials, session tokens, or unnecessary personal data.
