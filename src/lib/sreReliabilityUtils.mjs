const MAX_TEXT = 20000;

function requiredText(value, label, max = MAX_TEXT) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return text;
}

function finiteNumber(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be a number from ${min} to ${max}.`);
  }
  return number;
}

export function calculateSlo({ objective, totalEvents, goodEvents }) {
  const target = finiteNumber(objective, "SLO objective", 0.01, 100);
  const total = finiteNumber(totalEvents, "Total events", 1, 1e15);
  const good = finiteNumber(goodEvents, "Good events", 0, total);
  if (!Number.isInteger(total) || !Number.isInteger(good)) throw new Error("Event counts must be whole numbers.");
  const bad = total - good;
  const targetRatio = target / 100;
  const actualRatio = good / total;
  const allowedBad = total * (1 - targetRatio);
  const remaining = allowedBad - bad;
  const allowedErrorRate = 1 - targetRatio;
  const actualErrorRate = bad / total;
  const burnRate = allowedErrorRate === 0 ? 0 : actualErrorRate / allowedErrorRate;
  return {
    objective: target,
    actualSli: actualRatio * 100,
    totalEvents: total,
    goodEvents: good,
    badEvents: bad,
    allowedBadEvents: allowedBad,
    remainingBudget: remaining,
    budgetRemainingPercent: allowedBad > 0 ? (remaining / allowedBad) * 100 : 0,
    burnRate,
    withinObjective: actualRatio >= targetRatio,
  };
}

export function buildPostmortem({ title, severity, start, end, impact, detection, rootCause, resolution, followUps }) {
  const incidentTitle = requiredText(title, "Incident title", 200);
  const sev = requiredText(severity, "Severity", 40);
  const sections = {
    "Incident window": [start, end].filter(Boolean).join(" — ") || "Not recorded",
    "Customer and business impact": String(impact ?? "").trim() || "Not documented",
    "Detection": String(detection ?? "").trim() || "Not documented",
    "Root cause": String(rootCause ?? "").trim() || "Under investigation",
    "Resolution and recovery": String(resolution ?? "").trim() || "Not documented",
    "Follow-up actions": String(followUps ?? "").trim() || "- [ ] Assign an owner and due date for each action",
  };
  return `# Incident postmortem: ${incidentTitle}\n\n**Severity:** ${sev}\n\n${Object.entries(sections).map(([heading, value]) => `## ${heading}\n\n${value}`).join("\n\n")}\n\n## Review notes\n\n- What went well?\n- What made response harder?\n- Which alert, test, or safeguard would reduce recurrence?\n`;
}

export function buildRunbook({ service, symptom, checks, mitigation, escalation, rollback }) {
  const name = requiredText(service, "Service name", 120);
  const symptomText = requiredText(symptom, "Alert or symptom", 500);
  return `# Runbook: ${name}\n\n## Trigger\n\n${symptomText}\n\n## Initial checks\n\n${String(checks ?? "").trim() || "1. Confirm the alert and affected environment.\n2. Check service health, recent deployments, and dependency status.\n3. Review logs and key service-level indicators."}\n\n## Mitigation\n\n${String(mitigation ?? "").trim() || "Document the approved mitigation steps before execution."}\n\n## Escalation\n\n${String(escalation ?? "").trim() || "Contact the on-call service owner and incident commander according to the escalation policy."}\n\n## Rollback / recovery\n\n${String(rollback ?? "").trim() || "Use the approved rollback procedure; verify recovery against service-level indicators."}\n\n## Safety notes\n\n- Follow change-management and production-access policies.\n- Record commands, timestamps, decisions, and outcomes.\n- Do not expose credentials or customer data in incident notes.\n`;
}
