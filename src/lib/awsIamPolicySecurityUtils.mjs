const MAX_INPUT = 300000;
const add = (findings, id, severity, title, detail, recommendation, evidence = "") => {
  if (!findings.some(item => item.id === id && item.evidence === evidence)) findings.push({ id, severity, title, detail, recommendation, evidence });
};
const asArray = value => Array.isArray(value) ? value : value == null ? [] : [value];
const strings = value => asArray(value).filter(item => typeof item === "string");
const hasWildcard = value => typeof value === "string" && (value === "*" || value.includes("*"));
const validObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " must be a JSON object.");
  return value;
};
export function analyzeAwsIamPolicy({ policyText = "" } = {}) {
  if (typeof policyText !== "string" || !policyText.trim()) throw new Error("Paste an AWS IAM policy JSON document to begin.");
  if (policyText.length > MAX_INPUT) throw new Error("Policy exceeds the 300,000 character limit.");
  let policy;
  try { policy = JSON.parse(policyText); } catch { throw new Error("Policy must be valid JSON."); }
  validObject(policy, "Policy");
  const findings = [];
  if (!Array.isArray(policy.Statement) || policy.Statement.length === 0) throw new Error("Policy must contain a non-empty Statement array.");
  if (policy.Version && policy.Version !== "2012-10-17") add(findings, "IAM_POLICY_VERSION", "low", "Unexpected policy language version", "The policy version is not the current AWS IAM policy language version.", "Use Version 2012-10-17 unless a documented compatibility requirement applies.", String(policy.Version));
  let allowCount = 0;
  policy.Statement.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      add(findings, "IAM_STATEMENT_INVALID", "high", "Statement is not an object", "Statement " + (index + 1) + " is not a JSON object.", "Correct the statement structure and validate it with AWS IAM Access Analyzer.", String(index + 1));
      return;
    }
    const statement = raw;
    const effect = statement.Effect;
    const actions = strings(statement.Action);
    const notActions = strings(statement.NotAction);
    const resources = strings(statement.Resource);
    const notResources = strings(statement.NotResource);
    const principal = statement.Principal;
    const label = typeof statement.Sid === "string" ? statement.Sid : "Statement " + (index + 1);
    if (effect !== "Allow" && effect !== "Deny") add(findings, "IAM_EFFECT_INVALID", "high", "Statement effect is missing or invalid", label + " does not declare Effect as Allow or Deny.", "Set an explicit Effect and validate the complete policy.");
    if (effect !== "Allow") return;
    allowCount++;
    if (!actions.length && !notActions.length) add(findings, "IAM_ACTION_MISSING", "high", "Allowed statement has no Action", label + " does not contain Action or NotAction.", "Define the minimum required actions.");
    if (actions.some(action => action === "*")) add(findings, "IAM_ACTION_WILDCARD", "critical", "Wildcard action grants every action", label + " allows Action '*'.", "Replace '*' with the smallest explicit action list required by the workload.", label);
    else if (actions.some(hasWildcard)) add(findings, "IAM_ACTION_PATTERN_WILDCARD", "high", "Wildcard action pattern is present", label + " includes a wildcard action pattern.", "Replace broad service/action patterns with explicit API actions.", actions.join(", "));
    if (resources.some(resource => resource === "*")) add(findings, "IAM_RESOURCE_WILDCARD", "high", "Allow statement applies to every resource", label + " includes Resource '*'.", "Scope each action to the specific resource ARNs it needs.", label);
    else if (resources.some(hasWildcard)) add(findings, "IAM_RESOURCE_PATTERN_WILDCARD", "medium", "Resource ARN contains a wildcard", label + " uses a wildcard in one or more resource ARNs.", "Narrow wildcard ARN segments where the service supports resource-level permissions.", resources.join(", "));
    if (notActions.length) add(findings, "IAM_NOTACTION_ALLOW", "high", "Allow statement uses NotAction", label + " grants every action except the listed exclusions; this can become overly broad as AWS adds actions.", "Prefer explicit Action allowlists and review the policy's effective permissions.", notActions.join(", "));
    if (notResources.length) add(findings, "IAM_NOTRESOURCE_ALLOW", "high", "Allow statement uses NotResource", label + " grants access to resources other than the exclusions.", "Prefer explicit Resource ARNs and assess the effective scope.", notResources.join(", "));
    const risky = actions.filter(action => /^(iam:PassRole|iam:CreatePolicyVersion|iam:SetDefaultPolicyVersion|iam:AttachUserPolicy|iam:AttachRolePolicy|iam:PutRolePolicy|iam:PutUserPolicy|iam:CreateAccessKey|iam:UpdateAssumeRolePolicy|sts:AssumeRole)$/i.test(action));
    if (risky.length) add(findings, "IAM_PRIVILEGE_SENSITIVE_ACTION", "high", "Privilege-sensitive IAM or STS action allowed", label + " includes actions that can enable privilege changes, credential creation, or role assumption.", "Constrain these actions by resource ARN and conditions; review escalation paths and who can pass or assume each role.", risky.join(", "));
    if (principal !== undefined) {
      const principalValues = typeof principal === "string" ? [principal] : principal && typeof principal === "object" ? Object.values(principal).flatMap(asArray) : [];
      if (principalValues.includes("*")) {
        add(findings, "IAM_TRUST_WILDCARD_PRINCIPAL", "critical", "Trust policy accepts any principal", label + " contains Principal '*'.", "Restrict trusted principals to specific AWS account, role, or service identities and add appropriate conditions.", label);
        if (!statement.Condition || Object.keys(statement.Condition).length === 0) add(findings, "IAM_TRUST_NO_CONDITION", "high", "Wildcard trust has no condition", label + " has a wildcard principal and no Condition block.", "Use a specific principal and narrowly scoped conditions such as external ID or organization constraints where appropriate.", label);
      }
      const accountPrincipals = principalValues.filter(value => typeof value === "string" && /^arn:aws:iam::\d{12}:root$/.test(value));
      if (accountPrincipals.length) add(findings, "IAM_TRUST_ACCOUNT_ROOT", "medium", "Trust policy trusts an entire AWS account", label + " trusts an account root principal, which can delegate access to identities in that account.", "Confirm the account is trusted and constrain role assumption with conditions and tightly controlled caller permissions.", accountPrincipals.join(", "));
    }
    if (!statement.Condition && (actions.some(hasWildcard) || resources.some(hasWildcard))) add(findings, "IAM_BROAD_GRANT_NO_CONDITION", "medium", "Broad grant has no condition", label + " contains wildcard action or resource scope without a Condition block.", "Where supported, add conditions that constrain network, organization, principal, source account, or requested context.");
  });
  if (!allowCount) add(findings, "IAM_NO_ALLOW_STATEMENTS", "low", "No Allow statements found", "The supplied policy contains no Allow statements.", "Confirm that this is intentional for the policy's purpose.");
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a,b) => order[a.severity] - order[b.severity] || a.title.localeCompare(b.title));
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  findings.forEach(item => counts[item.severity]++);
  return { statementCount: policy.Statement.length, allowCount, findings, counts, inputCharacters: policyText.length };
}
export function buildAwsIamPolicyReport(result) {
  const lines = ["# AWS IAM Policy Security Review", "", "## Summary", "", "- Statements: " + result.statementCount, "- Allow statements: " + result.allowCount, "- Findings: " + result.findings.length, ...Object.entries(result.counts).map(([key,value]) => "- " + key + ": " + value), "", "## Findings", ""];
  if (!result.findings.length) lines.push("No configured heuristic checks were triggered.");
  for (const item of result.findings) lines.push("### [" + item.severity.toUpperCase() + "] " + item.title, "", item.detail, "", "Recommendation: " + item.recommendation, item.evidence ? "Evidence: " + item.evidence : "", "");
  lines.push("## Scope and limitations", "", "This is local, rule-based static analysis of the pasted JSON. It does not contact AWS, resolve effective permissions, evaluate SCPs, permission boundaries, session policies, resource policies, identity federation, or runtime context. It is not an AWS IAM Access Analyzer replacement or a compliance certification. Validate with AWS IAM Access Analyzer and your organization's approved review process. Do not paste secrets or sensitive account data.");
  return lines.join("\n");
}
