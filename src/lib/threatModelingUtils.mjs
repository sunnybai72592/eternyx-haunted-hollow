const STRIDE = [
  { id: "spoofing", name: "Spoofing", description: "An actor may impersonate a user, service, or trusted system component.", mitigation: "Use phishing-resistant MFA where practical, strong service identity, short-lived credentials, and mutual authentication between services.", likelihood: 3, impact: 4 },
  { id: "tampering", name: "Tampering", description: "An attacker may alter data, requests, configurations, or software while stored or in transit.", mitigation: "Enforce authorization at every trust boundary, validate inputs, use integrity checks, sign release artifacts, and protect configuration changes.", likelihood: 3, impact: 4 },
  { id: "repudiation", name: "Repudiation", description: "A user or service may deny performing an action if evidence is missing or unreliable.", mitigation: "Create centralized, time-synchronized, tamper-resistant audit logs with actor, action, target, outcome, and correlation identifiers.", likelihood: 2, impact: 3 },
  { id: "information-disclosure", name: "Information Disclosure", description: "Sensitive information may be exposed to an unauthorized person or system.", mitigation: "Classify data, minimize collection, encrypt sensitive data in transit and at rest, restrict access, and prevent secrets or personal data entering logs.", likelihood: 3, impact: 5 },
  { id: "denial-of-service", name: "Denial of Service", description: "An attacker or failure may exhaust resources or make an important function unavailable.", mitigation: "Apply rate limits, quotas, request-size limits, timeouts, back-pressure, resilient dependencies, and tested recovery procedures.", likelihood: 3, impact: 4 },
  { id: "elevation-of-privilege", name: "Elevation of Privilege", description: "A user or compromised component may gain permissions beyond those intended.", mitigation: "Apply least privilege, deny-by-default authorization, server-side permission checks, separation of duties, and periodic access reviews.", likelihood: 3, impact: 5 },
];
const clean = (value, label) => {
  if (typeof value !== "string") throw new Error(label + " must be text.");
  if (value.length > 12000) throw new Error(label + " must be 12,000 characters or fewer.");
  return value.trim();
};
const lines = (value) => value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
export function analyzeThreatModel(input = {}) {
  const systemName = clean(input.systemName ?? "", "System name");
  const scope = clean(input.scope ?? "", "Scope");
  const assetsText = clean(input.assets ?? "", "Assets");
  const entryPointsText = clean(input.entryPoints ?? "", "Entry points");
  const dataFlowsText = clean(input.dataFlows ?? "", "Data flows");
  const boundariesText = clean(input.trustBoundaries ?? "", "Trust boundaries");
  const controlsText = clean(input.existingControls ?? "", "Existing controls");
  if (!systemName) throw new Error("Add a system or application name.");
  if (!scope) throw new Error("Describe the system scope before generating a threat model.");
  const assets = lines(assetsText);
  const entryPoints = lines(entryPointsText);
  const dataFlows = lines(dataFlowsText);
  const trustBoundaries = lines(boundariesText);
  if (!assets.length) throw new Error("Add at least one asset or important component (one per line).");
  if (!entryPoints.length) throw new Error("Add at least one entry point (one per line).");
  const context = [systemName, scope, ...assets, ...entryPoints, ...dataFlows, ...trustBoundaries, controlsText].join(" ");
  const has = (pattern) => pattern.test(context);
  const hasControls = controlsText.length > 0;
  const threats = STRIDE.map((item) => {
    let likelihood = item.likelihood;
    let impact = item.impact;
    if (item.id === "spoofing" && !has(/mfa|multi.factor|oauth|oidc|sso|certificate|mutual tls/i)) likelihood += 1;
    if (item.id === "tampering" && !has(/signature|integrity|immutable|validation|checksum/i)) likelihood += 1;
    if (item.id === "repudiation" && !has(/audit|logging|immutable log|monitoring/i)) likelihood += 1;
    if (item.id === "information-disclosure" && !has(/encrypt|classification|masking|redact/i)) likelihood += 1;
    if (item.id === "denial-of-service" && !has(/rate limit|quota|autoscal|back.pressure|dos protection/i)) likelihood += 1;
    if (item.id === "elevation-of-privilege" && !has(/least privilege|rbac|abac|authorization|separation of duties/i)) likelihood += 1;
    if (item.id === "information-disclosure" && /payment|health|personal|customer|credential|secret|financial/i.test(context)) impact = 5;
    if (item.id === "denial-of-service" && /payment|critical|production|availability|transaction/i.test(context)) impact = 5;
    likelihood = Math.min(5, likelihood);
    const score = likelihood * impact;
    const severity = score >= 20 ? "Critical" : score >= 12 ? "High" : score >= 6 ? "Medium" : "Low";
    return { ...item, likelihood, impact, score, severity, context: "Review against assets: " + assets.join(", ") + ". Entry points: " + entryPoints.join(", ") + (dataFlows.length ? ". Data flows: " + dataFlows.join(", ") : "") + (trustBoundaries.length ? ". Trust boundaries: " + trustBoundaries.join(", ") : ""), controlSignal: hasControls ? "Existing controls were supplied; validate that they are implemented and effective." : "No existing controls were documented; treat this as an assessment gap, not proof that controls are absent." };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const summary = { critical: threats.filter(x => x.severity === "Critical").length, high: threats.filter(x => x.severity === "High").length, medium: threats.filter(x => x.severity === "Medium").length, low: threats.filter(x => x.severity === "Low").length };
  return { systemName, scope, assets, entryPoints, dataFlows, trustBoundaries, existingControls: controlsText, threats, summary, methodology: "STRIDE categories with transparent, rule-based baseline likelihood and impact estimates. Scores are prompts for analyst review, not measured probabilities." };
}
export function buildThreatModelReport(model) {
  const out = ["# ETERNYX Threat Model", "", "**System:** " + model.systemName, "", "**Scope:** " + model.scope, "", "## Summary", ...Object.entries(model.summary).map(([key, value]) => "- " + key.toUpperCase() + ": " + value), "", "## System context", "### Assets / components", ...model.assets.map(x => "- " + x), "", "### Entry points", ...model.entryPoints.map(x => "- " + x), "", "### Data flows", ...(model.dataFlows.length ? model.dataFlows.map(x => "- " + x) : ["- Not supplied"]), "", "### Trust boundaries", ...(model.trustBoundaries.length ? model.trustBoundaries.map(x => "- " + x) : ["- Not supplied"]), "", "### Existing controls", model.existingControls || "Not supplied", "", "## STRIDE threat register"];
  for (const threat of model.threats) out.push("### [" + threat.severity.toUpperCase() + "] " + threat.name, "", threat.description, "", "- Likelihood: " + threat.likelihood + "/5", "- Impact: " + threat.impact + "/5", "- Risk score: " + threat.score + "/25", "- Context: " + threat.context, "- Control review: " + threat.controlSignal, "- Suggested mitigations: " + threat.mitigation, "");
  out.push("## Method and limitations", model.methodology, "This is a planning aid, not an automated security test, proof of exploitability, compliance certification, or substitute for architecture review, abuse-case workshops, testing, and validation by system owners.");
  return out.join("\n");
}
