export const INCIDENT_PLAYBOOKS = {
  ransomware: {
    label: "Ransomware / destructive malware",
    actions: [
      "Activate the incident response lead and establish an incident channel",
      "Isolate confirmed affected endpoints using approved procedures",
      "Preserve relevant endpoint, identity, network, and backup evidence",
      "Assess backup integrity and recovery options before restoration",
      "Review privileged access and suspicious authentication activity",
      "Coordinate legal, privacy, communications, and business stakeholders",
      "Validate containment and monitor for recurrence before closure",
    ],
  },
  account_compromise: {
    label: "Account or credential compromise",
    actions: [
      "Confirm the affected identity and scope of suspected access",
      "Revoke active sessions and tokens using approved identity controls",
      "Reset credentials and verify multi-factor authentication status",
      "Review sign-in history, privilege changes, and mailbox or data access",
      "Check for persistence such as forwarding rules or new credentials",
      "Preserve identity-provider and application audit evidence",
      "Confirm recovery with the account owner and monitor for recurrence",
    ],
  },
  data_exposure: {
    label: "Suspected data exposure",
    actions: [
      "Identify the data types, systems, and time window potentially involved",
      "Restrict the exposed access path using approved change procedures",
      "Preserve access logs, configuration evidence, and relevant snapshots",
      "Engage privacy, legal, security, and data-owner stakeholders",
      "Assess notification obligations with the responsible legal/privacy team",
      "Validate that the exposure path is closed without destroying evidence",
      "Document impact assessment, decisions, and follow-up controls",
    ],
  },
  service_disruption: {
    label: "Service disruption / availability incident",
    actions: [
      "Declare incident severity and assign an incident commander",
      "Confirm affected services, users, dependencies, and business impact",
      "Review recent deployments, infrastructure changes, and monitoring signals",
      "Apply the approved rollback, failover, or mitigation procedure",
      "Communicate service status through the designated channel",
      "Verify recovery using service-level indicators and user-facing checks",
      "Schedule a blameless post-incident review and corrective actions",
    ],
  },
  phishing: {
    label: "Phishing / social engineering",
    actions: [
      "Preserve the original message and relevant mail security evidence",
      "Identify recipients, clicks, submitted credentials, and affected devices",
      "Remove or quarantine matching messages using approved controls",
      "Revoke exposed sessions and reset credentials where compromise is suspected",
      "Review identity, endpoint, and email telemetry for follow-on activity",
      "Notify affected users through approved security communications",
      "Record lessons learned and tune defensive controls",
    ],
  },
};

const TYPES = Object.keys(INCIDENT_PLAYBOOKS);
const SEVERITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["declared", "investigating", "contained", "recovering", "resolved"];

export function validateIncident(input = {}) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const type = String(input.type || "");
  const severity = String(input.severity || "").toLowerCase();
  const status = String(input.status || "declared").toLowerCase();
  const commander = typeof input.commander === "string" ? input.commander.trim() : "";
  const affectedServices = typeof input.affectedServices === "string" ? input.affectedServices.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (!title || title.length > 180) throw new Error("Incident title is required and must be 180 characters or fewer.");
  if (!TYPES.includes(type)) throw new Error("Choose a supported incident playbook.");
  if (!SEVERITIES.includes(severity)) throw new Error("Choose a valid incident severity.");
  if (!STATUSES.includes(status)) throw new Error("Choose a valid incident status.");
  if (commander.length > 120 || affectedServices.length > 500 || summary.length > 4000) throw new Error("One or more incident fields exceed their length limits.");
  return { title, type, severity, status, commander, affectedServices, summary };
}

export function validateTimelineEntry(input = {}) {
  const action = typeof input.action === "string" ? input.action.trim() : "";
  const owner = typeof input.owner === "string" ? input.owner.trim() : "";
  const timestamp = typeof input.timestamp === "string" ? input.timestamp.trim() : "";
  if (!action || action.length > 1000) throw new Error("Timeline action is required and must be 1,000 characters or fewer.");
  if (owner.length > 120) throw new Error("Timeline owner must be 120 characters or fewer.");
  if (!timestamp || timestamp.length > 40 || Number.isNaN(Date.parse(timestamp))) throw new Error("Enter a valid timeline date and time.");
  return { action, owner, timestamp };
}

export function summarizeIncident({ incident, timeline = [], completedActions = [] } = {}) {
  const normalized = validateIncident(incident);
  if (!Array.isArray(timeline) || timeline.length > 200) throw new Error("Timeline supports up to 200 entries.");
  timeline.forEach(validateTimelineEntry);
  const playbook = INCIDENT_PLAYBOOKS[normalized.type];
  const completed = completedActions.filter((index) => Number.isInteger(index) && index >= 0 && index < playbook.actions.length);
  return {
    severity: normalized.severity,
    status: normalized.status,
    timelineEntries: timeline.length,
    playbookActions: playbook.actions.length,
    completedActions: new Set(completed).size,
    remainingActions: playbook.actions.length - new Set(completed).size,
  };
}

export function buildIncidentReport({ incident, timeline = [], completedActions = [] } = {}) {
  const item = validateIncident(incident);
  const summary = summarizeIncident({ incident: item, timeline, completedActions });
  const playbook = INCIDENT_PLAYBOOKS[item.type];
  const completed = new Set(completedActions);
  const lines = [
    "# ETERNYX Incident Response Record",
    "",
    "**Incident:** " + item.title,
    "**Type:** " + playbook.label,
    "**Severity:** " + item.severity.toUpperCase(),
    "**Status:** " + item.status,
    "**Incident commander:** " + (item.commander || "Not assigned"),
    "**Affected services / scope:** " + (item.affectedServices || "Not recorded"),
    "",
    "## Situation summary",
    item.summary || "Not recorded",
    "",
    "## Response playbook",
    ...playbook.actions.map((action, index) => (completed.has(index) ? "- [x] " : "- [ ] ") + action),
    "",
    "## Timeline",
    ...(timeline.length ? timeline.map((entry) => {
      const row = validateTimelineEntry(entry);
      return "- " + row.timestamp + " — " + row.action + (row.owner ? " (Owner: " + row.owner + ")" : "");
    }) : ["No timeline entries recorded."]),
    "",
    "## Current status",
    "- Timeline entries: " + summary.timelineEntries,
    "- Playbook actions completed: " + summary.completedActions + " / " + summary.playbookActions,
    "",
    "This is an analyst-maintained response record. It does not connect to monitoring systems, execute containment actions, or independently verify incident resolution.",
  ];
  return lines.join("\n");
}
