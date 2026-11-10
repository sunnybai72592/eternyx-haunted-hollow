import test from "node:test";
import assert from "node:assert/strict";
import { buildIncidentReport, INCIDENT_PLAYBOOKS, summarizeIncident, validateIncident, validateTimelineEntry } from "../src/lib/incidentResponseUtils.mjs";

const incident = { title: "API outage", type: "service_disruption", severity: "high", status: "investigating", commander: "On-call lead", affectedServices: "Public API", summary: "Elevated 5xx responses after a deployment." };
const event = { timestamp: "2026-11-10T10:30", action: "Declared incident and began impact assessment.", owner: "SRE" };

test("validates supported incident details", () => {
  assert.deepEqual(validateIncident(incident), incident);
  assert.throws(() => validateIncident({ ...incident, type: "unknown" }), /playbook/i);
  assert.throws(() => validateIncident({ ...incident, severity: "urgent" }), /severity/i);
  assert.throws(() => validateIncident({ ...incident, title: "" }), /title/i);
});
test("validates timeline entries and rejects invalid timestamps", () => {
  assert.deepEqual(validateTimelineEntry(event), event);
  assert.throws(() => validateTimelineEntry({ ...event, timestamp: "not-a-date" }), /date and time/i);
  assert.throws(() => validateTimelineEntry({ ...event, action: "" }), /action/i);
});
test("provides scenario playbooks with defensive response actions", () => {
  assert.equal(Object.keys(INCIDENT_PLAYBOOKS).length, 5);
  for (const playbook of Object.values(INCIDENT_PLAYBOOKS)) assert.ok(playbook.actions.length >= 5);
});
test("summarizes playbook completion and timeline", () => {
  const result = summarizeIncident({ incident, timeline: [event], completedActions: [0, 1, 1] });
  assert.equal(result.timelineEntries, 1);
  assert.equal(result.completedActions, 2);
  assert.equal(result.remainingActions, result.playbookActions - 2);
});
test("limits timeline size", () => {
  assert.throws(() => summarizeIncident({ incident, timeline: Array.from({ length: 201 }, () => event) }), /200/);
});
test("exports a report with incident facts, checklist, and timeline", () => {
  const report = buildIncidentReport({ incident, timeline: [event], completedActions: [0] });
  assert.match(report, /API outage/);
  assert.match(report, /SRE/);
  assert.match(report, /Response playbook/);
  assert.match(report, /Event chronology|Declared incident/);
  assert.match(report, /does not connect to monitoring systems/);
});
