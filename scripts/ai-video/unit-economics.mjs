/**
 * Offline ETERNYX AI Video unit-economics guard (planning only).
 * Money inputs are integer USD cents; no user-controlled pricing.
 * This module NEVER grants credits, charges customers or starts GPU workers.
 * Do not activate a feature until trusted server-side metering is deployed.
 */
const integer = (n, min, max, name) => {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new RangeError("Invalid " + name);
  return n;
};
const ceilDiv = (a, b) => Math.ceil(a / b);

export function quoteVideoUnitEconomics(config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new TypeError("Trusted pricing configuration required");
  const { planPriceCents, planCredits, paymentFeeCents,
    gpuCentsPerHour, gpuProcessingSeconds, gpuStartupSeconds,
    gpuIdleSeconds, maxBillableAttempts, storageTransferCents,
    otherVariableCents, creditsPerVideo, targetMarginPercent } = config;
  integer(planPriceCents, 1, 100000000, "plan price");
  integer(planCredits, 1, 100000000, "plan credit allowance");
  integer(paymentFeeCents, 0, planPriceCents - 1, "payment fee");
  integer(gpuCentsPerHour, 1, 100000000, "hourly GPU price");
  integer(gpuProcessingSeconds, 1, 86400, "processing seconds");
  integer(gpuStartupSeconds, 0, 86400, "startup seconds");
  integer(gpuIdleSeconds, 0, 86400, "idle seconds");
  integer(maxBillableAttempts, 1, 10, "maximum billable attempts");
  integer(storageTransferCents, 0, 10000000, "storage and transfer");
  integer(otherVariableCents, 0, 10000000, "other variable costs");
  integer(creditsPerVideo, 1, planCredits, "video credit charge");
  integer(targetMarginPercent, 0, 99, "target gross margin");
  // Conservative assumption: each attempt may consume full processing time;
  // startup/idle are counted per attempt as well. Quotes are upper-bound
  // planning assumptions, NOT provider-guaranteed performance.
  const billableSecondsPerAttempt =
    gpuProcessingSeconds + gpuStartupSeconds + gpuIdleSeconds;
  const gpuCentsPerAttempt = ceilDiv(
    gpuCentsPerHour * billableSecondsPerAttempt, 3600);
  const estimatedWorstCaseCostCents =
    gpuCentsPerAttempt * maxBillableAttempts +
    storageTransferCents + otherVariableCents;
  const netPlanRevenueCents = planPriceCents - paymentFeeCents;
  // Allocate the plan's net revenue proportionally to consumed credits.
  // floor => never overstate revenue available for one video.
  const allocatedRevenueCents = Math.floor(
    netPlanRevenueCents * creditsPerVideo / planCredits);
  const budgetAtTargetMarginCents = Math.floor(
    allocatedRevenueCents * (100 - targetMarginPercent) / 100);
  const passesMargin = estimatedWorstCaseCostCents <= budgetAtTargetMarginCents;
  const maxVideosPerPlan = Math.floor(planCredits / creditsPerVideo);
  const worstCasePlanComputeCents = maxVideosPerPlan * estimatedWorstCaseCostCents;
  return Object.freeze({
    gpuCentsPerAttempt,
    estimatedWorstCaseCostCents, allocatedRevenueCents,
    budgetAtTargetMarginCents, passesMargin,
    maxVideosPerPlan, worstCasePlanComputeCents,
    // Plan leftovers, fixed overhead, taxes, returns and conversion of credits
    // across different features are not included: no net-profit claims.
    estimatedPlanContributionCents: netPlanRevenueCents - worstCasePlanComputeCents,
    launchApproved: false,
  });
}

export function requireVideoEconomicsApproval(quote) {
  if (!quote || quote.passesMargin !== true || quote.launchApproved !== false)
    throw new Error("AI video economics verification unavailable");
  // Deliberately NEVER returns an authorization to activate billing.
  return Object.freeze({ status: "planning_pass_only", paidExecutionEnabled: false });
}
