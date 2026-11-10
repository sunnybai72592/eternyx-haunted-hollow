const MAX_INPUT = 200_000;

function requireSource(source, label) {
  if (typeof source !== "string" || !source.trim()) throw new Error(label + " is required.");
  if (source.length > MAX_INPUT) throw new Error(label + " exceeds the 200 KB local analysis limit.");
  return source;
}
function finding(level, title, detail) { return { level, title, detail }; }
function result(source, findings, metadata = {}) {
  if (!findings.length) findings.push(finding("info", "No common risks detected", "The limited text-based rules found no matching patterns. Validate with the native toolchain and your organization's policies."));
  return { lines: source.split(/\r?\n/).length, findings, ...metadata };
}

export function analyzeTerraform(source) {
  const text = requireSource(source, "Terraform configuration");
  const findings = [];
  if (/\b0\.0\.0\.0\/0\b/.test(text)) findings.push(finding("error", "Public IPv4 ingress or egress range", "A rule references 0.0.0.0/0. Confirm the direction, protocol, port range, and business need; restrict access wherever possible."));
  if (/\b(?:password|secret|token|access_key|secret_key)\s*=\s*["'][^"']+["']/i.test(text)) findings.push(finding("error", "Possible hard-coded credential", "A credential-like attribute has a quoted literal value. Move secrets to a protected secret manager or runtime injection and rotate exposed credentials."));
  if (/\b(?:actions|resources|not_actions)\s*=\s*\[\s*["']\*["']\s*\]/i.test(text) || /\b(?:Action|Resource)\s*[:=]\s*["']\*["']/i.test(text)) findings.push(finding("warning", "Wildcard IAM permission", "Wildcard action or resource permissions can grant broad access. Apply least privilege and scope permissions to required resources."));
  if (/\bacl\s*=\s*["']public-read(?:-write)?["']/i.test(text) || /\bpublicly_accessible\s*=\s*true\b/i.test(text)) findings.push(finding("error", "Public resource exposure setting", "A public access setting was detected. Verify that exposure is intentional and protected."));
  if (/\b(?:encrypted|encryption)\s*=\s*false\b/i.test(text) || /\bserver_side_encryption_configuration\s*=\s*null\b/i.test(text)) findings.push(finding("warning", "Encryption may be disabled", "A resource appears to disable encryption. Enable encryption at rest where supported and define key-management requirements."));
  if (/\bversion\s*=\s*["'](?:latest|\*)["']/i.test(text)) findings.push(finding("warning", "Unpinned provider or module version", "A mutable version selector reduces reproducibility. Pin compatible provider/module versions and commit the dependency lock file."));
  if (/\b(?:http|ftp):\/\//i.test(text)) findings.push(finding("warning", "Insecure URL scheme", "An HTTP or FTP URL appears in the configuration. Prefer HTTPS and validate remote source integrity."));
  if (/\bdeletion_protection\s*=\s*false\b/i.test(text)) findings.push(finding("warning", "Deletion protection disabled", "Confirm that critical data resources have appropriate deletion safeguards, backups, and recovery procedures."));
  if (!/required_providers\s*\{|terraform\s*\{/i.test(text)) findings.push(finding("info", "Provider constraints not obvious", "Declare required providers and compatible version constraints to make initialization more predictable."));
  const resources = [...text.matchAll(/^\s*resource\s+"([^"]+)"\s+"([^"]+)"/gm)].map((m) => ({ type: m[1], name: m[2] }));
  return result(text, findings, { resources, resourceCount: resources.length });
}

export function analyzeAnsible(source) {
  const text = requireSource(source, "Ansible playbook");
  const findings = [];
  if (/\bbecome\s*:\s*true\b/i.test(text)) findings.push(finding("info", "Privilege escalation enabled", "Ansible become is enabled. Limit escalation to tasks and hosts that require it, and use controlled privilege policies."));
  if (/\b(?:shell|command)\s*:/i.test(text)) findings.push(finding("warning", "Shell or command task detected", "Prefer idempotent Ansible modules when available. Review quoting, input validation, and changed-state behavior."));
  if (/\b(?:password|token|secret|api_key)\s*:\s*["'][^"']+["']/i.test(text)) findings.push(finding("error", "Possible plaintext credential", "A credential-like YAML value appears quoted. Use Ansible Vault or an approved secret manager; rotate exposed credentials."));
  if (/\bvalidate_certs\s*:\s*false\b/i.test(text) || /\bvalidate_certs\s*=\s*false\b/i.test(text)) findings.push(finding("error", "TLS certificate validation disabled", "Certificate validation appears disabled. Restore verification and investigate any certificate trust issue."));
  if (/\binesecure\s*:\s*true\b/i.test(text)) findings.push(finding("warning", "Insecure transport option enabled", "An insecure transport option was detected. Confirm its scope and replace it with authenticated, verified transport."));
  if (/\bignore_errors\s*:\s*true\b/i.test(text)) findings.push(finding("warning", "Task errors are ignored", "Ignoring failures can hide partial configuration drift. Handle expected failures explicitly and report meaningful status."));
  if (/\bno_log\s*:\s*false\b/i.test(text) && /\b(?:password|token|secret)\b/i.test(text)) findings.push(finding("warning", "Sensitive task output may be logged", "Sensitive values may be exposed in task output. Apply no_log: true to tasks that handle secrets."));
  if (!/\bhosts\s*:/i.test(text)) findings.push(finding("error", "No play target detected", "A playbook should declare its target hosts or groups."));
  const taskCount = (text.match(/^\s*-\s+name\s*:/gm) || []).length;
  return result(text, findings, { taskCount });
}

export function analyzeHelmValues(source) {
  const text = requireSource(source, "Helm values");
  const findings = [];
  if (/\bprivileged\s*:\s*true\b/i.test(text)) findings.push(finding("error", "Privileged container configured", "Avoid privileged workloads unless explicitly justified and approved."));
  if (/\brunAsNonRoot\s*:\s*false\b/i.test(text)) findings.push(finding("warning", "Non-root execution disabled", "Set runAsNonRoot: true where compatible and configure an appropriate runAsUser."));
  if (/\bimage\s*:[\s\S]{0,120}?\btag\s*:\s*["']?latest["']?/i.test(text)) findings.push(finding("warning", "Mutable image tag", "Pin a release tag or immutable digest for predictable deployments."));
  if (/\btype\s*:\s*LoadBalancer\b/i.test(text)) findings.push(finding("warning", "LoadBalancer service exposure", "A cloud load balancer may create a public endpoint. Confirm access controls, firewall rules, and intended exposure."));
  if (/\btype\s*:\s*NodePort\b/i.test(text)) findings.push(finding("warning", "NodePort service exposure", "NodePort exposes a port on cluster nodes. Restrict network access and confirm it is required."));
  if (/\bhostNetwork\s*:\s*true\b/i.test(text)) findings.push(finding("warning", "Host networking enabled", "Host networking reduces workload network isolation. Avoid it unless required."));
  if (/\b(?:password|token|secret|apiKey)\s*:\s*["'][^"']+["']/i.test(text)) findings.push(finding("error", "Possible plaintext secret in values", "Do not commit credentials in Helm values. Use external secret management or protected deployment-time injection."));
  if (!/\bresources\s*:/i.test(text)) findings.push(finding("warning", "Resource requests and limits not found", "Define appropriate CPU and memory requests/limits to improve scheduling and reduce noisy-neighbor risks."));
  if (!/\b(?:readinessProbe|livenessProbe|startupProbe)\s*:/i.test(text)) findings.push(finding("info", "No application probe detected", "Configure suitable readiness/liveness probes in the chart's workload templates where supported."));
  if (/\b(?:ingress|gateway)\s*:/i.test(text) && !/\btls\s*:/i.test(text)) findings.push(finding("warning", "Ingress TLS configuration not obvious", "If this chart terminates TLS at ingress, configure certificates and enforce HTTPS."));
  return result(text, findings);
}
