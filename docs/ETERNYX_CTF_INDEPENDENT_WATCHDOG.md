# ETERNYX Cyber Range — Independent Local Orphan Watchdog

**Status: trusted-operator local Docker prototype. Not a public or cloud-deployed feature.**

## Seven delivered safeguards

1. **Verified labels and UUIDs:** Both services in compose.managed.yaml carry `org.eternyx.range.managed=v1` and a fixed 900-second TTL label. The watchdog checks the exact Compose project/service labels and derives a valid UUIDv4 from the project name.
2. **All-member Docker project safety:** It inspects *all* containers belonging to each candidate project, not only the initially tagged ones. Missing labels, unknown services, malformed IDs/timestamps or inconsistent membership stop the entire sweep without deleting anything. There is no wildcard pruning.
3. **Conservative age-based policy:** Normal cleanup waits until the newest managed container reaches 900 seconds plus 120 seconds grace. A newer restart postpones cleanup. Invalid/future clock values fail closed.
4. **Non-destructive by default:** Without --apply, the watchdog only previews. Applying changes requires ETERNYX_RANGE_WATCHDOG_ACK=LOCAL_OPERATOR_ONLY. Container IDs are rechecked before each mutation to detect races.
5. **Independent operator loop:** With --loop --apply, an operator-supervised process checks the local Docker host every 30 seconds, without any Supabase token or database connectivity. Merging a PR does not start or schedule a service.
6. **Persistent emergency local halt:** --emergency-stop --apply first writes ~/.eternyx-range-launches-halted (private file), then removes only verified managed projects regardless of age. The provider refuses new Docker starts while the file exists; clearing it requires human review.
7. **Independent tests:** Unit tests cover all label, TTL, preview, authorization, stale state, cleanup failure and halt paths. An actual Docker CI test launches a managed lab alongside an unrelated Alpine container and verifies that emergency teardown leaves the unrelated container alone.

## Local operator commands

    npm run range:watchdog
    npm run range:watchdog -- --dry-run

For an explicitly approved cleanup:

    ETERNYX_RANGE_WATCHDOG_ACK=LOCAL_OPERATOR_ONLY npm run range:watchdog -- --apply

For a manually supervised loop:

    ETERNYX_RANGE_WATCHDOG_ACK=LOCAL_OPERATOR_ONLY npm run range:watchdog -- --loop --apply

For a local emergency:

    ETERNYX_RANGE_WATCHDOG_ACK=LOCAL_OPERATOR_ONLY npm run range:watchdog -- --emergency-stop --apply

The emergency launch stop stays active after the command exits. Inspect the host and sessions before manually removing ~/.eternyx-range-launches-halted. There is deliberately no one-click resume control. Independently disable the *database* provider enabled flag during a real incident.

## Trust boundaries

- No paid compute, production Supabase migration, background service or public target URL is created by the PR.
- A Docker daemon is a privileged local trust boundary. Anyone with direct Docker socket access can bypass these safeguards. Production still needs stronger host fencing and independently reviewed multi-tenant sandbox isolation.
- The watchdog does not modify Supabase session rows when the backend is unreachable. Its job is to remove old host containers; the fenced worker must later reconcile persisted reservations. A stopped container is not falsely reported as a completed remote database session.
- The local stop marker is not a global infrastructure/billing kill switch. It only prevents future launches through this operator runtime. A race with another privileged process remains possible.
- This watchdog does not guarantee cleanup when its host is down or the operator-invoked process is not running. A separate supervised watchdog and external alerting remain future work.
- Invalid Docker metadata forces manual investigation; the watchdog does not guess which non-matching projects are safe to remove.
- The conservative time-based policy is limited to managed Compose containers tagged with our exact labels. It does not stop unrelated images, remove an arbitrary Docker project, or run docker system prune.
- No currency-based cloud budget enforcement is added. Default-zero launch budgets from the prior milestone remain.

## Verification and staging review

Run `node --test tests/ctf-range-watchdog.test.mjs`, `npm test`, and `npm run build`. GitHub Actions job **CTF Watchdog Local Docker Smoke** starts a disposable managed range, proves dry-run is non-destructive, verifies cleanup requires approval, invokes a local emergency halt, and checks an unrelated container still runs. Its final cleanup removes all CI-only artifacts.

Before enabling any staging host, review: strict labels on both services, project member verification, Docker socket locality, dry-run default, recheck-before-delete policy, operator-only apply flag, persistent halt state, absence of leaked access credentials, and no public ingress.

Next milestones: external watchdog operations/alerts, secure microVM or equivalent isolation, browser-native TLS proxy and cloud-provider monetary spending controls.
