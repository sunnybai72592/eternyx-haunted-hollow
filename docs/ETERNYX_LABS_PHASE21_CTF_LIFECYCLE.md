# LABS Phase 21 — real CTF lifecycle acceptance

Phase 20 is merged. Staging authentication and CTF secret configuration remain
operator prerequisites; the connector cannot create accounts or configure the
secret. Use the Phase 20 instructions first. Do not use production or personal
accounts. The new manual main-only workflow requires a separate explicit
I_APPROVE_TWO_STAGING_CTF_SOLVES choice. It creates two ordinary Auth sessions
and at most two genuine verified educational solves (one per dedicated staging
account), not artificial database inserts. It runs the read-only gate first,
decodes the fixed server-issued log casefiles locally, checks distinct flags,
submits only missing solves, rereads progress, and repeats the REST/RLS gate.
No brute forcing, range creation, provider enabling, direct database writes,
or paid compute. The two solve records and attempt counters may persist; if
a later check fails, partial writes are possible. Reruns skip existing solves.
No flags, JWTs, raw casefiles or credentials are logged. A successful run
demonstrates that the secret is operational without retrieving its value.

The regular read-only gate now needs positive owner REST reads as well as
foreign-owner empty reads; an empty table cannot prove isolation. Range session
fixture isolation remains separate and explicitly not tested when absent.
Offline tests inject a transport and are not live evidence. No workflow was
dispatched by creating this PR. No production changes.
