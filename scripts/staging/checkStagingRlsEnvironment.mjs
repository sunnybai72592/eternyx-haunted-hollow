import { validateStagingRlsConfig } from "./stagingRlsConfig.mjs";

try {
  validateStagingRlsConfig(process.env);
  process.stdout.write("STAGING RLS CONFIG VALID — isolated project, dedicated accounts, anonymous key.\n");
} catch {
  // No secret values, passwords, emails, keys or project references in logs.
  process.stderr.write("STAGING RLS CONFIG REJECTED — check protected environment settings and approval.\n");
  process.exitCode = 1;
}
