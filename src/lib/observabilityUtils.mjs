const MAX_INPUT = 200_000;
function sourceText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " is required.");
  if (value.length > MAX_INPUT) throw new Error(label + " exceeds the 200 KB analysis limit.");
  return value;
}
const item = (level, title, detail) => ({ level, title, detail });
function finish(source, findings, metadata = {}) {
  if (!findings.length) findings.push(item("info", "No common issues detected", "The available text-based checks found no matching patterns. Validate with the official tools and production telemetry."));
  return { lines: source.split(/\r?\n/).length, findings, ...metadata };
}
export function analyzePrometheusConfig(input) {
  const source = sourceText(input, "Prometheus configuration");
  const findings = [];
  const jobs = [...source.matchAll(/^\s*-\s*job_name\s*:\s*["']?([^"'\s#]+)["']?/gm)].map(match => match[1]);
  if (!/\bscrape_configs\s*:/m.test(source)) findings.push(item("error", "No scrape_configs section", "Prometheus needs scrape job definitions to collect target metrics."));
  if (!jobs.length) findings.push(item("warning", "No job_name entries detected", "Define clearly named scrape jobs so target coverage and troubleshooting are manageable."));
  if (/\bstatic_configs\s*:\s*\n(?:\s*#.*\n)*\s*-\s*targets\s*:\s*\[\s*\]/m.test(source)) findings.push(item("warning", "Empty static target list", "A scrape job appears to contain no targets. Confirm service discovery or target configuration."));
  if (/\bscheme\s*:\s*http\b/i.test(source)) findings.push(item("warning", "HTTP scrape transport configured", "Metrics may be transmitted without transport encryption. Use HTTPS or a protected network where appropriate."));
  if (/\bevaluation_interval\s*:\s*["']?0s\b/i.test(source)) findings.push(item("error", "Invalid zero evaluation interval", "A zero evaluation interval is not a useful operational setting. Configure a valid interval."));
  if (!/\b(?:external_labels|external_url)\s*:/m.test(source)) findings.push(item("info", "External metadata not obvious", "Consider external labels or an external URL when operating multiple Prometheus servers or remote integrations."));
  return finish(source, findings, { jobs, jobCount: jobs.length });
}
export function analyzePrometheusAlerts(input) {
  const source = sourceText(input, "Prometheus alert rules");
  const findings = [];
  const alerts = [...source.matchAll(/^\s*-\s*alert\s*:\s*["']?([^"'\s#]+)["']?/gm)].map(match => match[1]);
  if (!/\bgroups\s*:/m.test(source)) findings.push(item("error", "No alert rule groups", "Prometheus rule files should define groups containing alerting or recording rules."));
  if (!alerts.length) findings.push(item("warning", "No alert rules detected", "Add actionable alerts for service availability, latency, errors, and capacity."));
  if (alerts.length && !/^\s*for\s*:/m.test(source)) findings.push(item("warning", "No alert hold duration detected", "Consider a for duration to reduce noisy alerts caused by brief transient conditions."));
  if (alerts.length && !/^\s*severity\s*:/m.test(source)) findings.push(item("warning", "Severity labels not detected", "Use consistent severity labels to support routing, prioritization, and escalation."));
  if (alerts.length && !/^\s*(?:runbook_url|documentation)\s*:/m.test(source)) findings.push(item("info", "No runbook or documentation annotation", "Link alerts to response steps so on-call engineers know how to investigate."));
  if (/\bexpr\s*:\s*["']?vector\s*\(\s*1\s*\)/i.test(source)) findings.push(item("warning", "Constant alert expression", "A constant expression may remain firing continuously. Verify the expression is intentional."));
  return finish(source, findings, { alerts, alertCount: alerts.length });
}
export function analyzeGrafanaDashboard(input) {
  const source = sourceText(input, "Grafana dashboard JSON");
  let dashboard;
  try { dashboard = JSON.parse(source); } catch (error) { throw new Error("Invalid Grafana dashboard JSON: " + (error instanceof Error ? error.message : "parse error")); }
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) throw new Error("Grafana dashboard JSON must be an object.");
  const findings = [];
  const panels = Array.isArray(dashboard.panels) ? dashboard.panels : [];
  if (!Array.isArray(dashboard.panels)) findings.push(item("warning", "Dashboard panels array missing", "A dashboard normally contains a panels array. Confirm this is a complete dashboard export."));
  if (panels.length === 0) findings.push(item("warning", "Dashboard has no panels", "Add panels for service health, traffic, errors, latency, and resource saturation."));
  const ids = panels.map(panel => panel?.id).filter(id => id !== undefined && id !== null);
  if (new Set(ids).size !== ids.length) findings.push(item("error", "Duplicate panel IDs", "Panel IDs should be unique within the dashboard."));
  const missingTitles = panels.filter(panel => !String(panel?.title || "").trim()).length;
  if (missingTitles) findings.push(item("warning", "Untitled panels detected", missingTitles + " panel(s) have no title. Use clear names that communicate the metric and scope."));
  const missingTargets = panels.filter(panel => !Array.isArray(panel?.targets) || panel.targets.length === 0).length;
  if (missingTargets) findings.push(item("warning", "Panels without query targets", missingTargets + " panel(s) have no targets. Confirm each visualization is intentionally static or has a data query."));
  if (!dashboard.title) findings.push(item("warning", "Dashboard title missing", "Give the dashboard a clear service or system name."));
  if (dashboard.editable === true) findings.push(item("info", "Dashboard is editable", "Review who can edit dashboards in the deployed Grafana organization and folder permissions."));
  return finish(source, findings, { title: typeof dashboard.title === "string" ? dashboard.title : "", panelCount: panels.length });
}
