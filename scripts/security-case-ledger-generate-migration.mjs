#!/usr/bin/env node
// Generates a canonical Supabase migration file LOCALLY, only with explicit staging opt-in.
// It never applies migrations or contacts a database. SQL always originates in the reviewed stage proposal.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const filename = "security_case_indexed_ledger";
const migrations = join(root, "supabase", "migrations");
const proposal = join(root, "scripts", "sql", "staged-security-case-ledger.sql");
const enabled = process.argv.includes("--generate");
const approved = process.argv.includes("--staging-only-acknowledged");
const isStaging = process.env.ETERNYX_MIGRATION_ENV === "staging";

if (!enabled) {
  process.stdout.write("Dry run only. To generate a LOCAL Supabase migration candidate, set ETERNYX_MIGRATION_ENV=staging and pass --generate --staging-only-acknowledged. Nothing is applied.\n");
  process.exit(0);
}
if (!approved || !isStaging) {
  process.stderr.write("Refusing to generate: explicit staging-only acknowledgement and ETERNYX_MIGRATION_ENV=staging are required.\n");
  process.exit(2);
}
if (!existsSync(proposal) || !existsSync(migrations)) {
  process.stderr.write("Reviewed proposal or migrations folder missing. No file generated.\n");
  process.exit(2);
}
const before = new Set(readdirSync(migrations));
const result = spawnSync("supabase", ["migration", "new", filename], { cwd: root, encoding: "utf8", timeout: 20000 });
if (result.error || result.status !== 0) {
  process.stderr.write("Supabase CLI migration new failed; check CLI version/help. " + (result.stderr || result.error?.message || "") + "\n");
  process.exit(2);
}
const created = readdirSync(migrations).filter((name) =>
  !before.has(name) && new RegExp("^\\d{14}_" + filename + "\\.sql$").test(name));
if (created.length !== 1) {
  process.stderr.write("Cannot identify exactly one CLI-generated migration; inspect the working tree before proceeding.\n");
  process.exit(2);
}
const target = join(migrations, created[0]);
if (readFileSync(target, "utf8").trim()) {
  process.stderr.write("Refusing to overwrite nonempty generated migration: " + created[0] + "\n");
  process.exit(2);
}
const sql = readFileSync(proposal, "utf8");
if (!sql.includes("STAGED SQL PROPOSAL ONLY") || sql.includes("DISABLE ROW LEVEL SECURITY")) {
  process.stderr.write("Candidate source failed static safety markers. No contents written.\n");
  process.exit(2);
}
writeFileSync(target, "-- CLI-generated candidate; not reviewed or applied. Deploy only after staged acceptance.\n" + sql);
process.stdout.write("Created local staging migration candidate: supabase/migrations/" + created[0] + "\nNever deploy or commit until schema and two-account staging acceptance are reviewed.\n");
