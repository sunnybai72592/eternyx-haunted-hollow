import test from "node:test";
import assert from "node:assert/strict";
import { calculateSlo, buildPostmortem, buildRunbook } from "../src/lib/sreReliabilityUtils.mjs";

test("SLO calculator reports remaining error budget and burn rate", () => {
  const result = calculateSlo({ objective: 99.9, totalEvents: 100000, goodEvents: 99950 });
  assert.equal(result.badEvents, 50);
  assert.ok(Math.abs(result.allowedBadEvents - 100) < 1e-8);
  assert.ok(result.withinObjective);
  assert.ok(result.burnRate > 0);
});

test("SLO calculator rejects invalid event counts", () => {
  assert.throws(() => calculateSlo({ objective: 99.9, totalEvents: 100, goodEvents: 101 }), /Good events/);
  assert.throws(() => calculateSlo({ objective: 99.9, totalEvents: 10.5, goodEvents: 10 }), /whole numbers/);
});

test("Postmortem builder creates structured markdown and safe defaults", () => {
  const result = buildPostmortem({ title: "Checkout outage", severity: "SEV-2", rootCause: "Database saturation" });
  assert.match(result, /# Incident postmortem: Checkout outage/);
  assert.match(result, /## Root cause\n\nDatabase saturation/);
  assert.match(result, /Database saturation/);
});

test("Runbook builder includes trigger, response and safety guidance", () => {
  const result = buildRunbook({ service: "Payments", symptom: "Elevated 5xx rate" });
  assert.match(result, /# Runbook: Payments/);
  assert.match(result, /Elevated 5xx rate/);
  assert.match(result, /change-management/);
});

test("Document builders require core identifiers", () => {
  assert.throws(() => buildPostmortem({ title: " " }), /Incident title is required/);
  assert.throws(() => buildRunbook({ service: "API" }), /Alert or symptom is required/);
});
