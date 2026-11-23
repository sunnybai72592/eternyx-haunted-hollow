# Education: run the exact hosted SQL security audit in isolated PostgreSQL

This adds **real SQL execution** of `scripts/sql/education-hosted-db-metadata.sql` to the existing network-disconnected, disposable PostgreSQL 17 CI workflow. The 31 fixed checks execute against the actual staged Education migrations and functions, not merely a mocked JavaScript object.

The runner then attempts five adversarial database changes, each wrapped in **BEGIN / ROLLBACK**: giving students score-writing rights, giving anonymous callers answer-key access, switching off attempt RLS, disabling the trusted finalizer's security-definer status, and disabling the reviewed-grade lock trigger. Each change must make precisely its intended SQL check fail. After every rollback, all 31 checks must pass again. This verifies both accurate detection and restoration of the original permissions.

The CLI uses a fixed Docker container named `eternyx-education-db-ci`, without public network access. It never takes a Supabase URL, hosted credential, real account or real grade. It is also run by a targeted PR workflow on changes to the metadata SQL or verifier.

**Limitations:** This improves executable CI coverage, but does not prove live Supabase deployment parity, hosted Auth JWT policies, remote migrations, browser journeys, or production safety. The protected manual staging workflow and release review are still required. No hosted database is modified by these tests.
