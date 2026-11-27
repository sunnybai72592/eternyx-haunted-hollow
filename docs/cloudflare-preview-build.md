# Restore existing Worker PR preview builds

PR #854 commit e9db660: Cloudflare built Vite successfully (37.42 s).
Its non-production deploy command npx wrangler preview resolved Wrangler
4.169.0 and refused the missing previews block. The root has no default
Wrangler config; wrangler.staging.jsonc explicitly targets a different
Worker, eternyx-staging. Do not repurpose that file or set a production
deploy command as a workaround.

For the existing eternyx-haunted-hollow Worker, change only its
non-production branch/preview deploy command in Cloudflare Builds to:

    npx --yes wrangler@4.169.0 preview --config wrangler.preview.jsonc

Set the non-production build command to npm run build:staging if separately
configurable (the explicit config also calls this guard). Configure preview
build-time VITE_SUPABASE_PROJECT_ID and VITE_SUPABASE_URL to the exact
isolated staging project and VITE_SUPABASE_PUBLISHABLE_KEY to that project's
modern public browser key, as documented in cloudflare-staging-deploy.md.
Do not copy private secrets or production values to preview settings.
If build-time settings cannot be scoped to preview, use the separate staging
Worker instead; do not alter production variables to make a preview pass.

The explicit config uses static dist, SPA fallback, no Worker script,
routes, runtime bindings or additional resources, and an empty previews
block. Only invoke it with the preview subcommand, never deploy. It is not
a default config and does not change production or staging deploy commands.
The existing staging asset guard requires explicit staging environment
values and rejects known production references and private-key patterns.
This is defense in depth, not a comprehensive integration isolation audit.
A successful preview still needs access control and hosted acceptance
before use with any real data. Re-run the failed branch build after the
operator updates the preview command. No Cloudflare settings are changed
by this commit; actual preview upload and dashboard access remain pending.
