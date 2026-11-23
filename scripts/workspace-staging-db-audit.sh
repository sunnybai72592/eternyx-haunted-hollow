#!/usr/bin/env bash
# Workspace Phase 28: explicit isolated-staging approval; zero database writes.
set -euo pipefail
if [[ "${WORKSPACE_AUDIT_CONFIRM:-}" != "I_APPROVE_READ_ONLY_WORKSPACE_STAGING" ]]; then
  echo "workspace_staging_audit_consent_required" >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "workspace_staging_audit_psql_missing" >&2
  exit 2
fi
# Check the exact staging host, database, project ref and role before secrets.
node scripts/workspace-staging-db-audit.mjs --check-config >/dev/null
if [[ -z "${WORKSPACE_AUDIT_PGPASSWORD:-}" ]] ||
   [[ -z "${WORKSPACE_AUDIT_CA_PEM:-}" ]]; then
  echo "workspace_staging_audit_missing_protected_secrets" >&2
  exit 2
fi
# Block inherited libpq profiles, host bypasses, and TLS downgrades.
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
printf '%s\n' "$WORKSPACE_AUDIT_CA_PEM" > "$ca_file"
export PGHOST="$WORKSPACE_AUDIT_PGHOST"
export PGUSER="$WORKSPACE_AUDIT_PGUSER"
export PGPASSWORD="$WORKSPACE_AUDIT_PGPASSWORD"
export PGPORT="$WORKSPACE_AUDIT_PGPORT"
export PGDATABASE="$WORKSPACE_AUDIT_PGDATABASE"
export PGSSLROOTCERT="$ca_file"
export PGSSLMODE="verify-full"
export PGCONNECT_TIMEOUT=8
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000"
if ! psql --no-psqlrc --quiet --no-align --tuples-only --set ON_ERROR_STOP=1 \
    --file scripts/sql/workspace-staging-db-audit.sql \
    > "$result_file" 2> "$error_file"; then
  node --input-type=module - "$error_file" <<'NODE'
import {readFileSync} from "node:fs";
import {classifyStagingPgFailure} from "./scripts/workspace-staging-db-audit.mjs";
const raw=readFileSync(process.argv[2],"utf8");
process.stderr.write("workspace_staging_db_probe_failed:"+
  classifyStagingPgFailure(raw)+"\n");
NODE
  exit 1
fi
node --input-type=module - "$result_file" <<'NODE'
import {readFileSync} from "node:fs";
import {parseWorkspaceStagingAudit} from "./scripts/workspace-staging-db-audit.mjs";
try{
  const report=parseWorkspaceStagingAudit(readFileSync(process.argv[2],"utf8"));
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(report.release_gate!=="manual_review_required")process.exitCode=1;
}catch{
  process.stderr.write("workspace_staging_db_probe_untrusted_or_incomplete\n");
  process.exitCode=1;
}
NODE
