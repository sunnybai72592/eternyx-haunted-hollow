# ETERNYX Docker: audit integrity and owner-only reconciliation

This milestone extends the signed Docker lab dispatch and crash-recovery features. **It does not enable public remote Docker control.** The dispatcher and operator execution flags remain disabled unless separately configured on staging lab systems.

## Operator-owned local audit verification

- Every claim journal must follow exactly one of the approved transitions: reserved → attempted → completed/failed → receipt_accepted, or reserved → guard_denied → receipt_accepted. Intermediate states are valid, but event reordering and unknown fields/timestamps fail closed.
- Sign the exact current journal bytes using the **already enrolled agent Ed25519 private key** on a trusted operator machine. No private keys or journal contents are sent to the ETERNYX web app.
- A verifier must pin the **already enrolled public key**, not trust an unverified public key shipped alongside an audit export.
- The signature proves that the signing key authenticated the hash and status of a local journal at the time of signing. It **does not independently prove** the Docker Engine executed an operation, prove machine ownership, or make a journal tamper-proof to a key holder.

### Sign (operator host)

```sh
node scripts/docker-lab-audit.mjs sign CLAIM_UUID /ABSOLUTE/AGENT-PRIVATE.pem > /ABSOLUTE/CLAIM-AUDIT.json
```

Save the JSON in an operator-private folder. It includes no private keys, Docker environment variables, logs or HTTP authorization data. It does identify a claim, an agent, and a full container identifier: handle as restricted operational metadata.

### Verify against exact local journal and pinned key

```sh
node scripts/docker-lab-audit.mjs verify /ABSOLUTE/CLAIM-AUDIT.json /ABSOLUTE/ENROLLED-PUBLIC.key
```

Verification requires the exact original journal under `~/.eternyx/docker-lab-journal/` and a trusted pinned Ed25519 public key containing one canonical base64url line (32 bytes). On a different trusted machine, the operator must securely provide that journal file and the public key via an independently authenticated channel. A changed journal, changed outcome, altered signature, or wrong public key fails verification. If the journal grows after signing (e.g., receipt_accepted), create a new signed proof.

## Account-owned recent dispatch monitoring

The authenticated `docker-control` list response now supplies `reconciliation` for the 30 most recent owner-owned requests, a recent-window `dispatchOverview`, and a sample timestamp. These distinguish:

- Never dispatched: no claim exists for the request.
- Claim pending permit: no signed result or permit.
- Permit issued without receipt: authorization was issued, but actual execution is **unknown**.
- Receipt pending: the short claim window elapsed without a signed receipt.
- Manual reconciliation required: no report after five minutes. **Never auto-retry an unknown Docker operation.**
- Agent-reported completed, failed, or guard denied: signed agent assertion, not an independently verified Engine observation.

The dashboard is a snapshot requiring manual refresh, not live telemetry. Data remains filtered by authenticated owner identity and subject to existing RLS. Only derived statuses are added; the feature creates no new privileged routes or tables.

## Recovery protocol

1. Review `node scripts/docker-lab-recovery.mjs` and the specific claim.
2. Verify available signed audit proof offline with the previously trusted enrolled public key.
3. If the local journal records a terminal outcome but receipt acknowledgement was lost, use the explicit `--resend-receipt CLAIM_UUID` path from the previous milestone. **Never rerun Docker based on a stale claim**.
4. If the journal records an attempt without a terminal state, treat the outcome as unknown. Inspect the disposable lab container independently and reconcile manually. Do not invent an executed or failed status.
5. Keep per-agent locks and journals intact until a trusted operator has confirmed the work.

## Validation and limits

Run `node --test tests/docker-lab-audit.test.mjs` and existing Docker tests; staging acceptance must test owner A vs owner B, signed receipt replay, invalid keys, record corruption, stale claims, and postcondition handling. The owner console's counts cover only the latest 30 requests and cannot be used as billing, SLA, or production engine availability evidence.

No paid GPU/API/compute resources, recurring jobs, hosted Docker sockets or production customer execution are introduced.
