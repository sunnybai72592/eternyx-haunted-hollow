# Wave 29 — scanner infrastructure and live acceptance

PR #822 merged at 0f41f0d41763704950a586e633dc777d10a181e1; all three reported workflows passed. Staging preflight confirmed two confirmed Auth accounts, zero evidence objects/records, no mediated Storage cutover, no scanner tables, and the required session helper present. The historical RLS-disabling helper was absent.

Rehearsed the exact reviewed scanner history SQL in a transaction with catalog assertions, rolled it back, and confirmed neither table persisted. Applied the reviewed SQL only to Eternyx Staging (mhodwvypfbxafamkrgsk), migration 20261125151124 cybersecurity_wave28_scanner_history_staging; migration statement matches source byte-for-byte. Verified RLS on both tables, anonymous access denied, ordinary SELECT/INSERT enabled, no owner reassignment or ordinary DELETE. Client-written scan history is not independent evidence.

Deployed vulnerability-scanner, dns-analyzer and ssl-analyzer version 1 from the merged source, all with JWT verification enabled; function readback matched each reviewed entrypoint. The SSL shared dependency was included. No production or paid resources changed.

## Actual acceptance
Use the existing cybersecurity-staging GitHub environment and private test account secrets described in Wave 28. Run the Cybersecurity live staging acceptance workflow on main, choose scanners and supply the existing acknowledgement. The runner performs real login, validates two distinct accounts, checks anonymous, invalid and oversized request denial, performs passive NVD keyword research and public DNS configuration research, and checks owner history and foreign-account denial. TLS assessment requires an explicitly authorized hostname and I_AUTHORIZE_TLS_ASSESSMENT_OF_THIS_HOST; absent hostname or provider-in-progress result is incomplete and returns nonzero. No automatic retry loop or production approval. Scan records persist in staging.

The real gateway acceptance workflow remains separately required: configure the two verified disposable owner IDs and activation secret, run pre-cutover, review actual evidence, approve cutover separately, then run post-cutover. No cutover performed.

Offline tests cover configuration refusal, provider result checks and login failures. The isolated PostgreSQL recovery workflow adds scanner history owner-isolation and revoked-session assertions; synthetic tests are not real Auth acceptance. CI pending at PR creation.

Remaining: execute live provider requests, validate timeout and error handling under real upstream failure, add scanner admission/usage quotas before wider rollout (DNS/TLS history RLS does not itself prevent an upstream request from an otherwise valid revoked JWT), complete gateway acceptance, hosted lab and incident integration, hosted backup restore and independent advisor review. Latest staging advisor snapshot: 45 informational no-policy notices, 51 authenticated executable SECURITY DEFINER warnings, one leaked-password protection warning; none named the two scanner tables. Review by pillar, not blanket privilege changes. No production readiness certification.
