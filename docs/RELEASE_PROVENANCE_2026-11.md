# ETERNYX — Hosted release provenance and first user-facing verification milestone

**Date:** November 20, 2026  
**Scope:** Build artifact identification, **not** paid-access release approval.

## Starting point

The manually triggered hosted read-only audit on November 20
([GitHub Actions #44769298652](https://github.com/sunnybai72592/eternyx-haunted-hollow/actions/runs/44769298652))
passed **16/16** ETERNYX public UI journeys at mobile and desktop sizes,
with no unapproved HTTP writes, no observed browser JavaScript startup errors,
and no first-party script/document HTTP errors.

The hosted app's exact build revision was NOT observable. A Lovable project
being published or reporting a GitHub HEAD does not prove that the public URL
serves that exact source. Neither Stripe nor Polar billing, AI model execution,
authenticated project isolation, or live scanning has been verified.

## This PR: one public stamp across three actual build outputs

Vite generates a fresh, non-secret **128-bit random build ID** for each build.
The same ID appears in:

1. HTML: the named meta tag \`eternyx-build-id\`;
2. Executed app JavaScript: the \`data-eternyx-build-id\` attribute set on
   the document element before the application renders;
3. Public static GET \`/release-info.json\`, emitted from the same Vite build
   (not hand-written in the \`public\` folder).

The release JSON includes:

- \`schema: 1\`, \`project: eternyx\`;
- \`build_id\` — exact 32-character lowercase hexadecimal marker;
- \`source_sha\` — the checked-out Git HEAD if available, otherwise \`null\`;
- \`source_sha_origin\` — either \`git-checkout\` or \`unavailable\`;
- \`built_at\` — the build timestamp in UTC;
- \`production_verified: false\` — deliberately NOT a release claim.

The generator reads only \`git rev-parse --verify HEAD\`. It does not
read secrets, access your Supabase project, or call third-party services.
If Lovable builds without a Git checkout, the source SHA must remain NULL.
Never substitute a manually guessed commit from GitHub metadata.

## Exact release audit rules

The existing **Hosted ETERNYX read-only acceptance** browser workflow now
attempts one additional **same-origin, GET-only** \`/release-info.json\`
request using \`credentials: omit\`. The fetch is subject to exactly the
same host restrictions as the other browser requests. It does not make
write requests or gather private user data.

The report marks the public release provenance as:

| Status | What was actually observed | What cannot yet be concluded |
| --- | --- | --- |
| \`unavailable\` | No valid public stamp could be read | Published source cannot be identified |
| \`inconsistent\` | The stamp exists but HTML and/or JavaScript marker differs | Mixed/stale deployment or cache requires investigation |
| \`build-matched\` | HTML, JavaScript and manifest match the **same build** | Exact Git revision not verified |
| \`source-matched\` | Those three markers match AND stamp's Git SHA equals the GitHub Actions source checkout SHA | Full production readiness, auth, AI or billing **not** proven |

The JSON artifact and GitHub summary disclose only the **public** build ID,
public Git SHA when known, booleans and enumerated statuses. No personal IDs,
HTTP bodies, cookie values, tokens, secret keys, screenshots or raw exception
traces are recorded.

A self-reported SHA is **stronger evidence than no version**, but not a
cryptographically signed build attestation or independent deployment-owner
acceptance. A CDN serving the correct manifest but mismatched JS/HTML will
report \`inconsistent\`. A cached prior release matching itself but not the
checkout will report \`build-matched\`, not \`source-matched\`.

The release stamp does **not** change registry \`releaseVerified\` fields.
All 32 source-audited tools remain uncertified for production until the
actual deployed version, a relevant browser acceptance run, and owner
sign-off are recorded. Backend-dependent features require their own
real, authorized provider/user-isolation acceptance tests.

## How to verify the release

1. **Merge this PR after all CI checks are green**. CI also runs
   \`node scripts/assertReleaseArtifact.mjs\` against the generated
   \`dist/index.html\`, \`dist/assets/*.js\` and \`dist/release-info.json\`.
2. Publish the latest ETERNYX source version through the connected Lovable
   project. GitHub merging alone does not guarantee the public Lovable site
   has been republished.
3. Manually run GitHub Actions → **Hosted ETERNYX read-only acceptance** →
   choose \`public-domain-candidate\`.
4. Inspect the GitHub Actions summary and artifact fields:
   \`release_evidence.status\`, \`build_id\`, \`source_sha\`, and
   \`matches_checkout\` alongside the sixteen real browser test results.
5. If \`source-matched\`, record the exact observed SHA and run ID for
   an independent release-review decision. If \`build-matched\`, contact
   Lovable to confirm whether Git metadata is exposed at build time before
   claiming an exact revision. If \`unavailable\` or \`inconsistent\`,
   inspect republishing and cached asset consistency.

**No real payments or AI model activation in this PR.** This is the next
reproducible step from passing public browser checks to validating a specific
published ETERNYX build. Additional authenticated workflows are a separate
milestone requiring permissioned test accounts.
