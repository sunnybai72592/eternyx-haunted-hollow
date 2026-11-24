# LABS Phase 31 — reconcile complete dormant deployment evidence

The Phase 30 PR #782 passed all four applicable checks. A fresh staging-only
management read confirms five ACTIVE LABS functions and the same five bundle
digests recorded after Phase 29. A read-only SQL catalog check passed again,
and Auth users, solves, sessions, grants and reservations are zero. Provider
and spending locks remain disabled. The historic Phase 19 and 27 records
are kept intact; a new observation records the full five-function inventory.
It incorporates the earlier 15/15 retrieved source file copies, not a new
physical hardware or live HTTP claim.

The offline release assessment now checks 19 distinct source blobs:
six migrations, six original local bundle files and seven additional
unique files from the dormant deployment. A known bundle or JWT setting
mismatch is rejected. The assessment still reports no live checks and no
release authorization, and explicitly lists live dormant HTTP verification
as pending. Source matching is not remote runtime attestation.

Next operator action: open Actions > LABS dormant staging HTTP acceptance,
run on main, select I_APPROVE_LABS_DORMANT_HTTP_CHECK. The connected GitHub
tool cannot dispatch or enumerate manual workflow runs. This PR does not
pretend that the five endpoint probes ran. Then create two dedicated confirmed
staging accounts, configure the CTF flag secret securely, and complete fresh
Auth acceptance and separately approved fixtures. No production or live
configuration changes, no paid infrastructure and no provider activation.
