#!/usr/bin/env bash
# Services Phase 34: four real PG17 sessions inside disposable Docker ONLY.
set -euo pipefail
container="$1"
case "$container" in
  eternyx-services-replay-*) ;;
  *) echo "BLOCKED: unexpected disposable container" >&2; exit 2 ;;
esac
if [[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container")" != "none" ]] ||
   [[ "$(docker inspect --format '{{.Config.Image}}' "$container")" != "postgres:17-alpine" ]] ||
   [[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$container")" != "null" ]]; then
  echo "BLOCKED: requires networkless, unexposed disposable PG17" >&2
  exit 2
fi
test -n "$RUNNER_TEMP"
workdir="$(mktemp -d "$RUNNER_TEMP/services-phase34.XXXXXX")"
trap 'rm -rf -- "$workdir"' EXIT
sqlgen="scripts/services-pg17-concurrency-sql.mjs"
pg() {
  docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 \
    -v VERBOSITY=verbose -U postgres -d postgres
}
metric() {
  docker exec "$container" psql -X -A -t -v ON_ERROR_STOP=1 \
    -U postgres -d postgres -c "$1"
}
node "$sqlgen" seed | pg > "$workdir/seed.log" 2>&1 || {
  echo "FAIL: disposable seed"; tail -n 8 "$workdir/seed.log"; exit 1;
}

# A separate real DB session takes both lock keys used by the trigger.
node "$sqlgen" holder | pg > "$workdir/holder.log" 2>&1 &
holder_pid=$!
holder_ready=0
for _ in $(seq 1 50); do
  held="$(metric "SELECT count(*) FROM pg_catalog.pg_locks WHERE locktype='advisory' AND granted;")"
  if [[ "$held" == "2" ]]; then holder_ready=1; break; fi
  sleep 0.2
done
if [[ "$holder_ready" != 1 ]]; then
  echo "FAIL: independent advisory locks were not held" >&2; exit 1
fi

declare -A child_pids
for case_id in a1 a2 b1 b2; do
  (node "$sqlgen" "$case_id" | pg) > "$workdir/$case_id.log" 2>&1 &
  child_pids["$case_id"]=$!
done

# Require simultaneous waiters; merely launching jobs does not prove a race.
all_waiting=0
for _ in $(seq 1 45); do
  waiting="$(metric "SELECT count(*) FROM pg_catalog.pg_locks WHERE locktype='advisory' AND NOT granted;")"
  if [[ "$waiting" == "4" ]]; then all_waiting=1; break; fi
  sleep 0.2
done
if [[ "$all_waiting" != 1 ]]; then
  echo "FAIL: four actual simultaneous lock waiters not observed" >&2; exit 1
fi
if ! wait "$holder_pid"; then
  echo "FAIL: advisory lock holder failed" >&2
  tail -n 8 "$workdir/holder.log"; exit 1
fi

a_winners=0; b_winners=0; a_rejected=0; b_rejected=0
for case_id in a1 a2 b1 b2; do
  if wait "${child_pids[$case_id]}"; then
    if [[ "$case_id" == a* ]]; then a_winners=$((a_winners+1))
    else b_winners=$((b_winners+1)); fi
  else
    if ! grep -Fq 'P0001' "$workdir/$case_id.log"; then
      echo "FAIL: unexpected concurrent client error" >&2; exit 1
    fi
    if [[ "$case_id" == a* ]]; then
      grep -Fq 'Too many brief amendments. Try again in ten minutes.' \
        "$workdir/$case_id.log" || {
          echo "FAIL: quota race had wrong denial" >&2; exit 1;
        }
      a_rejected=$((a_rejected+1))
    else
      grep -Fq 'This brief amendment was already submitted recently.' \
        "$workdir/$case_id.log" || {
          echo "FAIL: duplicate race had wrong denial" >&2; exit 1;
        }
      b_rejected=$((b_rejected+1))
    fi
  fi
done
if [[ "$a_winners" != 1 || "$a_rejected" != 1 ||
      "$b_winners" != 1 || "$b_rejected" != 1 ]]; then
  echo "FAIL: incorrect number of winners and denied attempts" >&2
  exit 1
fi
node "$sqlgen" verify | pg > "$workdir/verify.log" 2>&1 || {
  echo "FAIL: persisted race or journal checks"
  tail -n 8 "$workdir/verify.log"; exit 1
}
node "$sqlgen" cleanup | pg > "$workdir/cleanup.log" 2>&1 || {
  echo "FAIL: synthetic cleanup"
  tail -n 8 "$workdir/cleanup.log"; exit 1
}
echo "PASS: four real simultaneous SQL sessions, two lock keys, one quota winner and one duplicate winner; synthetic fixtures cleaned"
