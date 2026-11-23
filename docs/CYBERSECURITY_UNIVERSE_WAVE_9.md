# Cybersecurity Universe — Wave 9: Verified Handoff and Staging Release Gate

Wave 9 adds a local metadata-only handoff studio for SHA-256 evidence observations from Wave 8 and a separately gated, non-mutating two-account staging acceptance probe.

## Ten bundled improvements

1. Strict Wave 8 provenance manifest import with 128 KiB cap and no unknown or object-path fields.
2. Recipient and sender reference labels, purpose, unique handoff ID and expiry limited to 30 days.
3. Canonical JSON encoding and SHA-256 digest over the complete handoff packet body.
4. Downloadable JSON packet containing hashes, pseudonymous IDs, timestamp and reference metadata, but no original evidence files or private storage URLs.
5. Independent recipient-side import, checksum recomputation and expiry checks.
6. Optional comparison with a SHA-256 checksum received by a separately trusted channel.
7. Local, offline evidence file comparison against an imported digest and exact byte count; no upload.
8. A read-only two-real-account staging test requiring distinct JWTs, own evidence and private Storage access, and cross-owner denies.
9. Explicit staging-only opt-in, distinct project refs, GET-only requests and no logging of tokens or object IDs.
10. Protected route, Cybersecurity Hub navigation and security regression coverage.

## Workflow

On the existing private provenance page, hash actual evidence files and export the provenance JSON manifest. In the new Evidence Handoff Studio at /cybersecurity/evidence-handoff, import that manifest and provide an approved reviewer reference, purpose and expiry. Download the packet and transmit it via an authorized channel. Send its digest through a separate trusted channel. A reviewer imports the packet, checks its digest and optionally compares a separately supplied evidence file.

The handoff packet **does not include, transfer or grant access to the actual evidence bytes**. All file reads and hashing on this screen happen locally in the browser.

## Trust boundaries

- A checksum proves packet content consistency, **not sender identity or original evidence authenticity**.
- A separately supplied checksum is useful only if that out-of-band channel is independently trusted.
- Expiry is checked locally. It is not server-enforced revocation and cannot prevent someone keeping a copy.
- Pseudonymous IDs, digests and dates remain potentially sensitive. Protect the packet as confidential.
- The existing Supabase private bucket and owner RLS remain unchanged. Neither a migration nor a remote write is included.
- No legal chain-of-custody claim, SOC alerting, threat containment, or automated incident detection is provided.

## Two-account staging acceptance

Supply all environment variables to a secure ephemeral staging runner, never to Git or browser bundles:

- ETERNYX_STAGING_ONLY=yes
- ETERNYX_STAGING_URL=https://YOUR_STAGING_REF.supabase.co/
- ETERNYX_STAGING_PROJECT_REF=YOUR_STAGING_REF
- ETERNYX_PRODUCTION_PROJECT_REF=YOUR_DISTINCT_PRODUCTION_REF
- ETERNYX_STAGING_PUBLIC_KEY=STAGING_PUBLISHABLE_KEY
- ETERNYX_STAGING_JWT_A=FIRST_USER_ACCESS_TOKEN
- ETERNYX_STAGING_JWT_B=SECOND_USER_ACCESS_TOKEN

Run the config-only check using:

    node scripts/security-evidence-staging-readonly.mjs --check-config

After seeding **one real private evidence row and file per staging account** and confirming the correct isolated staging project, run:

    node scripts/security-evidence-staging-readonly.mjs --run

The runtime issues GET requests only to the exact Supabase staging host. It validates distinct user identities, each user's own evidence metadata and private Storage, and cross-owner metadata and file access denial. It prints counts and results, not IDs or secrets.

**Not yet performed:** Running this script with real staging accounts, validating a full remote migration lifecycle, server-side immutable digest receipts, or independently trusted signing. Those are release blockers, not implied successes.
