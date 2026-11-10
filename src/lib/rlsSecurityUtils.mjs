const MAX_SQL_LENGTH = 250000;
const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function maskSql(source) {
  const input = String(source);
  const output = input.split("");
  let i = 0;
  const blank = index => { if (output[index] !== "\n" && output[index] !== "\r") output[index] = " "; };
  while (i < input.length) {
    if (input[i] === "-" && input[i + 1] === "-") {
      while (i < input.length && input[i] !== "\n") blank(i++);
    } else if (input[i] === "/" && input[i + 1] === "*") {
      blank(i++); blank(i++);
      let depth = 1;
      while (i < input.length && depth) {
        if (input[i] === "/" && input[i + 1] === "*") { blank(i++); blank(i++); depth++; }
        else if (input[i] === "*" && input[i + 1] === "/") { blank(i++); blank(i++); depth--; }
        else blank(i++);
      }
    } else if (input[i] === "'") {
      blank(i++);
      while (i < input.length) {
        if (input[i] === "'" && input[i + 1] === "'") { blank(i++); blank(i++); continue; }
        if (input[i] === "'") { blank(i++); break; }
        if (input[i] === "\\\\" && i + 1 < input.length) { blank(i++); blank(i++); continue; }
        blank(i++);
      }
    } else if (input[i] === "$") {
      const match = /^\\$[a-zA-Z_][\\w]*\\$|^\\$\\$/.exec(input.slice(i));
      if (match) {
        const delimiter = match[0];
        for (let j = 0; j < delimiter.length; j++) blank(i++);
        const end = input.indexOf(delimiter, i);
        const stop = end < 0 ? input.length : end;
        while (i < stop) blank(i++);
        if (end >= 0) for (let j = 0; j < delimiter.length; j++) blank(i++);
      } else i++;
    } else i++;
  }
  return output.join("");
}

function splitStatements(source, masked) {
  const statements = [];
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === ";") {
      const value = masked.slice(start, i).trim();
      if (value) statements.push({ masked: value, original: source.slice(start, i).trim(), line: source.slice(0, start).split("\n").length });
      start = i + 1;
    }
  }
  const tail = masked.slice(start).trim();
  if (tail) statements.push({ masked: tail, original: source.slice(start).trim(), line: source.slice(0, start).split("\n").length });
  return statements;
}

function cleanIdentifier(value) {
  return String(value || "").replaceAll('"', "").trim().toLowerCase();
}

function add(findings, id, severity, title, detail, recommendation, evidence) {
  findings.push({ id, severity, title, detail, recommendation, evidence: String(evidence || "").trim().slice(0, 240) });
}

export function analyzeRlsPolicies({ sql = "" } = {}) {
  const source = String(sql);
  if (!source.trim()) throw new Error("Paste a schema or migration SQL script before running the review.");
  if (source.length > MAX_SQL_LENGTH) throw new Error("SQL input must be 250,000 characters or fewer.");

  const statements = splitStatements(source, maskSql(source));
  const tables = new Map();
  const policies = [];
  const grants = [];
  const findings = [];

  for (const statement of statements) {
    const text = statement.masked.replace(/\\s+/g, " ").trim();
    const evidence = "Line " + statement.line + ": " + statement.original.replace(/\\s+/g, " ").slice(0, 180);
    const createTable = text.match(/^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?((?:"?[\\w$]+"?\\.)?"?[\\w$]+"?)/i);
    if (createTable) {
      const name = cleanIdentifier(createTable[1]);
      if (name) tables.set(name, { name, createdAt: statement.line, enabled: false, disabled: false, policies: [] });
    }

    const alterTable = text.match(/^ALTER\\s+TABLE\\s+(?:ONLY\\s+)?((?:"?[\\w$]+"?\\.)?"?[\\w$]+"?)\\s+([\\s\\S]+)$/i);
    if (alterTable) {
      const name = cleanIdentifier(alterTable[1]);
      const action = alterTable[2];
      if (!tables.has(name)) tables.set(name, { name, createdAt: null, enabled: false, disabled: false, policies: [] });
      if (/\\bENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\b/i.test(action)) tables.get(name).enabled = true;
      if (/\\bDISABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\b/i.test(action)) tables.get(name).disabled = true;
    }

    const policyMatch = text.match(/^CREATE\\s+POLICY\\s+(?:"[^"]+"|[\\w$]+)\\s+ON\\s+((?:"?[\\w$]+"?\\.)?"?[\\w$]+"?)([\\s\\S]*)$/i);
    if (policyMatch) {
      const table = cleanIdentifier(policyMatch[1]);
      const rest = policyMatch[2] || "";
      const roleMatch = rest.match(/\\bTO\\s+([\\s\\S]*?)(?=\\bUSING\\s*\\(|\\bWITH\\s+CHECK\\s*\\(|$)/i);
      const roles = roleMatch ? roleMatch[1].trim() : "PUBLIC";
      const command = (rest.match(/\\bFOR\\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\\b/i) || [,"ALL"])[1].toUpperCase();
      const usingMatch = rest.match(/\\bUSING\\s*\\(([\\s\\S]*?)\\)(?=\\s+WITH\\s+CHECK\\b|$)/i);
      const checkMatch = rest.match(/\\bWITH\\s+CHECK\\s*\\(([\\s\\S]*?)\\)\\s*$/i);
      const policy = {
        table, line: statement.line, roles: roles || "PUBLIC", command,
        using: usingMatch ? usingMatch[1].trim() : null,
        check: checkMatch ? checkMatch[1].trim() : null,
        evidence
      };
      policies.push(policy);
      if (!tables.has(table)) tables.set(table, { name: table, createdAt: null, enabled: false, disabled: false, policies: [] });
      tables.get(table).policies.push(policy);
    }

    const grantMatch = text.match(/^GRANT\\s+([\\s\\S]+?)\\s+ON\\s+([\\s\\S]+?)\\s+TO\\s+([\\s\\S]+?)(?:\\s+WITH\\s+GRANT\\s+OPTION)?$/i);
    if (grantMatch) grants.push({ privileges: grantMatch[1].trim().toUpperCase(), target: grantMatch[2].trim(), roles: grantMatch[3].trim(), line: statement.line, evidence });
  }

  for (const table of tables.values()) {
    const isPublicSchema = table.name.startsWith("public.") || !table.name.includes(".");
    if (table.disabled) add(findings, "RLS_DISABLED", "high", "RLS is explicitly disabled", "The supplied script contains a DISABLE ROW LEVEL SECURITY statement for " + table.name + ".", "If this table contains user or application data, enable RLS and validate grants and policies before deployment.", "Table " + table.name);
    else if (table.createdAt && isPublicSchema && !table.enabled)
      add(findings, "RLS_NOT_ENABLED_IN_SCRIPT", "medium", "No RLS enablement found for a public table", "The supplied script creates " + table.name + " but contains no visible ENABLE ROW LEVEL SECURITY statement for it. Existing database state or another migration may differ.", "Confirm whether the table is exposed through an API or contains user data. Enable RLS where appropriate and verify effective grants and policies.", "Line " + table.createdAt + ": CREATE TABLE " + table.name);
    if (table.enabled && table.policies.length === 0)
      add(findings, "RLS_ENABLED_NO_POLICY", "low", "RLS enabled with no policy in this script", "RLS normally denies access to rows when no applicable policy exists. This may be intentional, but can also cause unexpected application access failures.", "Confirm the intended deny-by-default behavior and add narrowly scoped policies only when access is required.", "Table " + table.name);
    if (table.policies.length && !table.enabled)
      add(findings, "POLICY_WITHOUT_RLS_ENABLE", "high", "Policy exists but RLS is not enabled in this script", "A CREATE POLICY statement is present for " + table.name + ", but no visible ENABLE ROW LEVEL SECURITY statement was found. Policies do not protect rows until RLS is enabled.", "Enable RLS on the table and test access as each application role. Check whether another migration enables it.", "Table " + table.name);
  }

  for (const policy of policies) {
    const roleText = policy.roles.toLowerCase();
    const publicRole = /(^|[,\\s])public($|[,\\s])/.test(roleText) || !roleText || roleText === "public";
    const anonRole = /(^|[,\\s])anon($|[,\\s])/.test(roleText);
    const broadUsing = policy.using !== null && /^true$/i.test(policy.using);
    const broadCheck = policy.check !== null && /^true$/i.test(policy.check);
    if (publicRole || anonRole)
      add(findings, "POLICY_BROAD_ROLE", "high", "Policy applies to PUBLIC or anon", "The policy for " + policy.table + " targets " + policy.roles + ". Anonymous or PUBLIC access may be intentional, but it must be explicitly justified and tightly constrained.", "Restrict the policy to the minimum required roles and validate row ownership or tenant boundaries with realistic role-based tests.", policy.evidence);
    if (broadUsing || broadCheck)
      add(findings, "POLICY_UNCONDITIONAL_PREDICATE", "high", "Policy contains an unconditional TRUE predicate", "A USING (true) or WITH CHECK (true) expression does not restrict rows for that part of the policy.", "Replace unconditional predicates with an explicit ownership, tenant, or business rule unless unrestricted access is deliberately intended.", policy.evidence);
    if (policy.command === "ALL")
      add(findings, "POLICY_FOR_ALL_COMMANDS", "medium", "Policy covers ALL commands", "A single policy covers every command type for its target roles, which can grant a broader capability than intended.", "Consider separate SELECT, INSERT, UPDATE, and DELETE policies with independently reviewed predicates.", policy.evidence);
    if (["SELECT", "UPDATE", "DELETE", "ALL"].includes(policy.command) && !policy.using)
      add(findings, "POLICY_MISSING_USING", "medium", "Policy has no visible USING expression", "No USING predicate is visible for a policy that governs row visibility or existing-row modification.", "Add and test a row-level predicate where access must be restricted. Confirm PostgreSQL command-specific defaults before relying on this policy.", policy.evidence);
  }

  for (const grant of grants) {
    const roles = grant.roles.toLowerCase();
    const publicRole = /(^|[,\\s])public($|[,\\s])/.test(roles);
    const anonRole = /(^|[,\\s])anon($|[,\\s])/.test(roles);
    const writes = /\\b(INSERT|UPDATE|DELETE|TRUNCATE|ALL)\\b/.test(grant.privileges);
    if ((publicRole || anonRole) && writes)
      add(findings, "BROAD_ANONYMOUS_GRANT", "critical", "Write privileges granted to PUBLIC or anon", "The supplied script grants " + grant.privileges + " on " + grant.target + " to " + grant.roles + ".", "Revoke unnecessary anonymous write privileges, grant only required operations to intended roles, and test with an unauthenticated session.", grant.evidence);
    else if (publicRole || anonRole)
      add(findings, "BROAD_ANONYMOUS_READ_GRANT", "high", "Privileges granted to PUBLIC or anon", "The supplied script grants " + grant.privileges + " on " + grant.target + " to " + grant.roles + ". Even read access may expose sensitive data.", "Confirm the data classification and remove public or anonymous access unless it is an intentional, reviewed requirement.", grant.evidence);
    else if (/\\bauthenticated\\b/.test(roles) && writes && /\\bALL\\b/.test(grant.privileges))
      add(findings, "AUTHENTICATED_GRANT_ALL", "medium", "ALL privileges granted to authenticated", "The authenticated role receives broad privileges on " + grant.target + ".", "Prefer explicit table and operation grants; use RLS for row-level boundaries and test each operation.", grant.evidence);
  }

  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.title.localeCompare(b.title));
  const summary = Object.fromEntries(["critical", "high", "medium", "low"].map(level => [level, findings.filter(item => item.severity === level).length]));
  return { tableCount: tables.size, rlsEnabledCount: [...tables.values()].filter(table => table.enabled && !table.disabled).length, policyCount: policies.length, grantCount: grants.length, findings, summary };
}

export function buildRlsSecurityReport(result) {
  if (!result || !Array.isArray(result.findings) || !result.summary) throw new Error("Run an RLS review before building the report.");
  const lines = [
    "# ETERNYX Supabase & PostgreSQL RLS Security Review", "",
    "- Tables identified: " + result.tableCount,
    "- Tables with visible RLS enablement: " + result.rlsEnabledCount,
    "- Policies inspected: " + result.policyCount,
    "- Grants inspected: " + result.grantCount,
    "- Findings: " + result.findings.length,
    "- Critical: " + result.summary.critical + " | High: " + result.summary.high + " | Medium: " + result.summary.medium + " | Low: " + result.summary.low,
    "", "## Findings"
  ];
  if (!result.findings.length) lines.push("No configured heuristic checks were triggered. This is not proof that access controls are correct or secure.");
  for (const item of result.findings) lines.push("### [" + item.severity.toUpperCase() + "] " + item.title, "", item.detail, "Recommendation: " + item.recommendation, "Evidence: " + item.evidence, "");
  lines.push("## Review boundary", "", "This is static, pattern-based analysis of the supplied SQL only. It does not connect to Supabase or PostgreSQL, inspect live grants or effective privileges, evaluate JWT claims, resolve inherited roles, parse the complete SQL grammar, prove tenant isolation, or execute role-based tests. Review findings manually and validate policies in a non-production project before deployment.", "");
  return lines.join("\n");
}
