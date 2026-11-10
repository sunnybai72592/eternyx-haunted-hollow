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
    } else if (input[i] === "'" || input[i] === '"') {
      const quote = input[i];
      blank(i++);
      while (i < input.length) {
        if (input[i] === quote && input[i + 1] === quote) { blank(i++); blank(i++); continue; }
        if (input[i] === quote) { blank(i++); break; }
        if (input[i] === "\\" && i + 1 < input.length) { blank(i++); blank(i++); continue; }
        blank(i++);
      }
    } else if (input[i] === "$") {
      const match = /^\$[a-zA-Z_][\w]*\$|^\$\$/.exec(input.slice(i));
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

function add(findings, id, severity, title, detail, recommendation, evidence) {
  findings.push({ id, severity, title, detail, recommendation, evidence: String(evidence || "").trim().slice(0, 240) });
}

export function analyzeSqlScript({ sql = "", dialect = "postgresql" } = {}) {
  const source = String(sql);
  if (!source.trim()) throw new Error("Paste a SQL script before running the review.");
  if (source.length > MAX_SQL_LENGTH) throw new Error("SQL input must be 250,000 characters or fewer.");
  const masked = maskSql(source);
  const statements = [];
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === ";") {
      const text = masked.slice(start, i).trim();
      if (text) statements.push({ masked: text, original: source.slice(start, i).trim(), line: source.slice(0, start).split("\n").length });
      start = i + 1;
    }
  }
  const tail = masked.slice(start).trim();
  if (tail) statements.push({ masked: tail, original: source.slice(start).trim(), line: source.slice(0, start).split("\n").length });
  const findings = [];
  const dialectName = String(dialect).toLowerCase();
  for (const statement of statements) {
    const sqlText = statement.masked.replace(/\s+/g, " ").trim();
    const original = statement.original.replace(/\s+/g, " ").trim();
    const evidence = "Line " + statement.line + ": " + original.slice(0, 180);
    const emit = (id, severity, title, detail, recommendation) => add(findings, id, severity, title, detail, recommendation, evidence);
    if (/^DROP\s+(?:TABLE|SCHEMA|DATABASE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|TYPE|SEQUENCE)\b/i.test(sqlText))
      emit("DESTRUCTIVE_DROP", "high", "DROP operation detected", "This statement removes a database object and may cause data loss or application downtime.", "Confirm dependencies, backups, rollback strategy, and the exact target before execution.");
    if (/^TRUNCATE\b/i.test(sqlText))
      emit("TABLE_TRUNCATION", "high", "TRUNCATE operation detected", "TRUNCATE removes all rows from the targeted table(s).", "Verify the target, retention requirements, backup, and approval before execution.");
    if (/^DELETE\s+FROM\b/i.test(sqlText) && !/\bWHERE\b/i.test(sqlText))
      emit("DELETE_WITHOUT_WHERE", "critical", "DELETE has no WHERE clause", "The statement appears to delete every row from its target table.", "Add a reviewed predicate, preview affected rows in a safe environment, and use a controlled transaction.");
    if (/^UPDATE\b/i.test(sqlText) && !/\bWHERE\b/i.test(sqlText))
      emit("UPDATE_WITHOUT_WHERE", "critical", "UPDATE has no WHERE clause", "The statement appears to modify every row in its target table.", "Add a reviewed predicate and verify the affected-row count before committing.");
    if (/^ALTER\s+TABLE\b/i.test(sqlText) && /\bDROP\s+COLUMN\b/i.test(sqlText))
      emit("DROP_COLUMN", "high", "Column removal detected", "Dropping a column can permanently remove data and break dependent queries or application versions.", "Use a staged expand-and-contract migration, verify consumers, and retain a tested backup/rollback plan.");
    if (/\bGRANT\s+ALL(?:\s+PRIVILEGES)?\b/i.test(sqlText))
      emit("GRANT_ALL_PRIVILEGES", "high", "Broad database privileges granted", "GRANT ALL may give a role more authority than it needs.", "Apply least privilege with explicit permissions, scoped objects, and reviewed role membership.");
    if (/\bSECURITY\s+DEFINER\b/i.test(sqlText))
      emit("SECURITY_DEFINER", "high", "SECURITY DEFINER routine detected", "A definer-rights routine executes with its owner's privileges and can become a privilege-escalation path if unsafe.", "Set a safe search_path, schema-qualify objects, restrict EXECUTE grants, and review ownership and input handling.");
    if (/^CREATE\s+TABLE\b/i.test(sqlText) && !/\bPRIMARY\s+KEY\b/i.test(sqlText))
      emit("TABLE_WITHOUT_PRIMARY_KEY", "medium", "New table has no visible primary key", "The CREATE TABLE statement does not declare a primary key.", "Confirm the data model and add a stable primary key where appropriate.");
    if (/^INSERT\s+INTO\b/i.test(sqlText) && !/^INSERT\s+INTO\s+[\w".]+\s*\(/i.test(sqlText))
      emit("INSERT_WITHOUT_COLUMN_LIST", "medium", "INSERT omits an explicit column list", "The statement relies on table column order, making migrations and schema changes more fragile.", "Name target columns explicitly in INSERT statements.");
    if (/^SELECT\s+\*/i.test(sqlText))
      emit("SELECT_STAR", "low", "SELECT * detected", "Selecting every column can transfer unnecessary data and make consumers sensitive to schema changes.", "Select only the columns required by the application or report.");
    if (/^SELECT\b/i.test(sqlText) && !/\bLIMIT\b/i.test(sqlText) && !/\bFETCH\s+(?:FIRST|NEXT)\b/i.test(sqlText))
      emit("SELECT_WITHOUT_LIMIT", "low", "SELECT has no visible row limit", "The query does not contain a LIMIT or FETCH clause; large tables may return more rows than expected.", "Consider pagination or a deliberate row limit for interactive and exploratory queries.");
    if (/\bEXECUTE\s+(?:IMMEDIATE|FORMAT)\b/i.test(sqlText))
      emit("DYNAMIC_SQL", "medium", "Dynamic SQL execution detected", "Dynamically assembled SQL can introduce injection risk when identifiers or values are not safely handled.", "Use parameterized values, safe identifier quoting, and strict allow-lists for dynamic object names.");
    if (dialectName === "postgresql" && /\bCREATE\s+POLICY\b/i.test(sqlText) && !/\bTO\s+(?:authenticated|anon|public|[\w"]+)\b/i.test(sqlText))
      emit("POLICY_ROLE_SCOPE", "medium", "Policy role scope is not obvious", "The policy statement does not contain a recognizable TO role clause.", "Specify the intended database roles explicitly and test access as each role.");
  }
  if (statements.length > 1 && !/\bBEGIN\b/i.test(masked) && !/\bSTART\s+TRANSACTION\b/i.test(masked))
    add(findings, "NO_EXPLICIT_TRANSACTION", "low", "No explicit transaction boundary found", "The multi-statement script does not visibly begin a transaction. Some DDL operations and database-specific commands have transaction restrictions.", "Choose transaction boundaries deliberately; verify dialect behavior and avoid wrapping commands that cannot run transactionally.", "Whole script");
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.title.localeCompare(b.title));
  return {
    dialect: dialectName,
    statementCount: statements.length,
    findings,
    summary: Object.fromEntries(["critical", "high", "medium", "low"].map(level => [level, findings.filter(item => item.severity === level).length]))
  };
}

export function buildSqlReviewReport(result) {
  if (!result || !Array.isArray(result.findings)) throw new Error("Run a SQL review before building the report.");
  const lines = [
    "# ETERNYX Database & SQL Review", "",
    "- Dialect profile: " + result.dialect,
    "- Statements inspected: " + result.statementCount,
    "- Findings: " + result.findings.length,
    "- Critical: " + result.summary.critical + " | High: " + result.summary.high + " | Medium: " + result.summary.medium + " | Low: " + result.summary.low,
    "", "## Findings"
  ];
  if (!result.findings.length) lines.push("No configured heuristic checks were triggered. This is not proof that the SQL is correct or safe.");
  for (const item of result.findings) lines.push("### [" + item.severity.toUpperCase() + "] " + item.title, "", item.detail, "Recommendation: " + item.recommendation, "Evidence: " + item.evidence, "");
  lines.push("## Review boundary", "", "This is static, pattern-based review. It does not parse or execute SQL, connect to a database, validate permissions or schema state, estimate locks or query plans, guarantee dialect compatibility, or prove migration safety. Review every finding and test changes against a non-production database before deployment.", "");
  return lines.join("\n");
}
