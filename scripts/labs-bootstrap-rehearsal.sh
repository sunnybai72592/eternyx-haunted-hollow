#!/usr/bin/env bash
# CI ONLY: create a new networkless local PG17 container. No project URLs or remote DB credentials.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == "true" ]] || { echo "CI-only rehearsal" >&2; exit 2; }
name="eternyx-labs-bootstrap-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
[[ "$name" =~ ^eternyx-labs-bootstrap-[0-9]+-[0-9]+$ ]] || exit 2
docker container inspect "$name" >/dev/null 2>&1 && { echo "Refusing existing container" >&2; exit 2; }
password="$(openssl rand -hex 32)"
docker run --detach --rm --network none --name "$name" -e POSTGRES_PASSWORD="$password" postgres:17-alpine >/dev/null
unset password
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
ready=false
for i in $(seq 1 45); do
  if docker exec "$name" psql -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    sleep 2
    if docker exec "$name" psql -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
      ready=true; break
    fi
  fi
  sleep 1
done
test "$ready" = true
sql(){ docker exec -i "$name" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1; }
install(){ echo "Install $1"; sql < "$1"; }
smoke(){
  echo "Rollback-isolated smoke $1"
  { printf 'BEGIN;\n'; cat "$1"; printf '\nROLLBACK;\n'; } | sql
}
install tests/sql/ctf-range-db-bootstrap.sql
install supabase/migrations/20261122170000_ctf_verified_missions.sql
smoke tests/sql/eternyx-labs-verified-ctf-smoke.sql
install supabase/migrations/20261122180000_ctf_range_session_control.sql
smoke tests/sql/ctf-range-db-smoke.sql
install supabase/migrations/20261122190000_ctf_range_access_grants.sql
smoke tests/sql/ctf-range-access-db-smoke.sql
install supabase/migrations/20261122200000_ctf_worker_fencing_budget.sql
smoke tests/sql/ctf-range-worker-fencing-smoke.sql
install supabase/migrations/20261123041000_ctf_hosted_spend_reservations.sql
smoke tests/sql/ctf-hosted-spend-reservations-smoke.sql
sql < tests/sql/eternyx-labs-composed-catalog-smoke.sql
echo "Offline composition complete; no staging or production deployment performed."
