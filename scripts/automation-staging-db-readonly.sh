#!/usr/bin/env bash
# ETERNYX: OWNER-APPROVED ISOLATED STAGING ONLY. Never connect to production.
# No DML, no migration repair, no function deploy, no session reuse.
set -euo pipefail
if [[ "${ETERNYX_AUTOMATION_STAGING_DB_CONSENT:-}" != "I_APPROVE_READONLY_ISOLATED_STAGING" ]]; then
  echo "staging_db_explicit_approval_required" >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "staging_db_psql_client_unavailable" >&2
  exit 2
fi
# Validate target identifiers BEFORE accessing any credential or CA secret.
node scripts/automation-staging-db-readonly.mjs --check-config > /dev/null
if [[ -z "${ETERNYX_AUTOMATION_STAGING_PGPASSWORD:-}" ]] ||
   [[ -z "${ETERNYX_AUTOMATION_STAGING_CA_PEM:-}" ]]; then
  echo "staging_db_missing_operator_protected_secret" >&2
  exit 2
fi
# Avoid inherited libpq profiles and TLS overrides. Secure cleanup on error.
# PGHOSTADDR can bypass the DNS host selected by the target-ref check.
# Clearing inherited libpq settings blocks implicit connection, credential,
# certificate, transport, and routing overrides before explicit pinning.
unset PGSERVICE PGSERVICEFILE PGPASSFILE PGSSLKEY PGSSLCERT PGOPTIONS PGREQUIRESSL \
  PGHOSTADDR PGSSLPASSWORD PGSSLCRL PGSSLCRLDIR PGGSSENCMODE PGTARGETSESSIONATTRS \
  PGREQUIREAUTH PGCHANNELBINDING PGSSLMINPROTOCOLVERSION PGSSLMAXPROTOCOLVERSION \
  PGHOST PGUSER PGPORT PGDATABASE PGSSLROOTCERT PGSSLMODE PGCONNECT_TIMEOUT
umask 077
ca_file="$(mktemp)"
result_file="$(mktemp)"
error_file="$(mktemp)"
cleanup(){ rm -f "$ca_file" "$result_file" "$error_file"; }
trap cleanup EXIT
printf '%s\n' "$ETERNYX_AUTOMATION_STAGING_CA_PEM" > "$ca_file"
export PGHOST="$ETERNYX_AUTOMATION_STAGING_PGHOST"
export PGUSER="$ETERNYX_AUTOMATION_STAGING_PGUSER"
export PGPASSWORD="$ETERNYX_AUTOMATION_STAGING_PGPASSWORD"
export PGPORT="$ETERNYX_AUTOMATION_STAGING_PGPORT"
export PGDATABASE="$ETERNYX_AUTOMATION_STAGING_PGDATABASE"
export PGSSLROOTCERT="$ca_file"
export PGSSLMODE="verify-full"
export PGCONNECT_TIMEOUT="8"
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000"
# Fixed, reviewed SQL; never echo raw stderr or connection strings.
if ! psql --no-psqlrc --quiet --no-align --tuples-only \
  --set ON_ERROR_STOP=1 \
  --file scripts/sql/automation-staging-db-readonly.sql \
  > "$result_file" 2> "$error_file"; then
  node --input-type=module - "$error_file" <<'NODE'
import {readFileSync} from "node:fs";
import {classifyStagingPgFailure} from "./scripts/automation-staging-db-readonly.mjs";
const raw=readFileSync(process.argv[2],"utf8");
process.stderr.write("staging_db_probe_failed:"+classifyStagingPgFailure(raw)+"\n");
NODE
  exit 1
fi
# Parse only allowlisted metadata and migration timestamps.
node --input-type=module - "$result_file" <<'NODE'
import {readFileSync} from "node:fs";
import {parseProbeLines} from "./scripts/automation-staging-db-readonly.mjs";
try{
  const report=parseProbeLines(readFileSync(process.argv[2],"utf8"));
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
}catch{
  process.stderr.write("staging_db_malformed_readonly_result\n");
  process.exitCode=1;
}
NODE
