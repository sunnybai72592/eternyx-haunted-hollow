import test from "node:test";
import assert from "node:assert/strict";
import { quoteVideoUnitEconomics, requireVideoEconomicsApproval } from "../scripts/ai-video/unit-economics.mjs";
const sample = () => ({
  planPriceCents: 2000, planCredits: 1000, paymentFeeCents: 100,
  gpuCentsPerHour: 150, gpuProcessingSeconds: 600,
  gpuStartupSeconds: 0, gpuIdleSeconds: 0, maxBillableAttempts: 1,
  storageTransferCents: 0, otherVariableCents: 0,
  creditsPerVideo: 100, targetMarginPercent: 50,
});
test("simple 10-min GPU quote costs 25 cents at $1.50/h", () => {
  const quote = quoteVideoUnitEconomics(sample());
  assert.equal(quote.gpuCentsPerAttempt, 25);
  assert.equal(quote.allocatedRevenueCents, 190);
  assert.equal(quote.budgetAtTargetMarginCents, 95);
  assert.equal(quote.maxVideosPerPlan, 10);
  assert.equal(quote.worstCasePlanComputeCents, 250);
  assert.equal(quote.passesMargin, true);
  assert.equal(quote.launchApproved, false);
});
test("startup, idle and retries are counted in worst case", () => {
  const quote = quoteVideoUnitEconomics({
    ...sample(), gpuStartupSeconds: 30, gpuIdleSeconds: 30,
    maxBillableAttempts: 3, storageTransferCents: 10, otherVariableCents: 5,
  });
  assert.equal(quote.gpuCentsPerAttempt, 28);
  assert.equal(quote.estimatedWorstCaseCostCents, 99);
  assert.equal(quote.passesMargin, false);
});
test("underpriced credits fail the specified margin", () => {
  const quote = quoteVideoUnitEconomics({ ...sample(),
    planPriceCents: 100, paymentFeeCents: 20, targetMarginPercent: 50 });
  assert.equal(quote.allocatedRevenueCents, 8);
  assert.equal(quote.passesMargin, false);
});
test("rejects fractional, negative, missing and inflated assumptions", () => {
  const fields = [
    ["gpuCentsPerHour", 1.5], ["planPriceCents", -1],
    ["maxBillableAttempts", 0], ["creditsPerVideo", 1001],
    ["gpuProcessingSeconds", 0], ["planCredits", undefined],
    ["targetMarginPercent", 100], ["paymentFeeCents", 2000],
  ];
  for (const [key, value] of fields)
    assert.throws(() => quoteVideoUnitEconomics({ ...sample(), [key]: value }));
  assert.throws(() => quoteVideoUnitEconomics(null));
});
test("planning evidence never unlocks paid execution", () => {
  assert.deepEqual(requireVideoEconomicsApproval(quoteVideoUnitEconomics(sample())),
    { status: "planning_pass_only", paidExecutionEnabled: false });
  assert.throws(() => requireVideoEconomicsApproval({ passesMargin: false, launchApproved: false }));
  assert.throws(() => requireVideoEconomicsApproval({ passesMargin: true, launchApproved: true }));
});
