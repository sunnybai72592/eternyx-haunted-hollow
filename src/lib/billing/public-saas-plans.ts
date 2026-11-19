/**
 * Provider-neutral presentation of ETERNYX subscription tiers.
 *
 * These are NOT purchasable Stripe Products, active merchant accounts,
 * authorized entitlements or guarantees that a tool is available.
 * The server and the verified payment processor remain authoritative.
 */
export type EterNyxPlanId = "free" | "premium" | "elite";

export interface PublicSaasPlan {
  readonly id: EterNyxPlanId;
  readonly name: string;
  readonly description: string;
  readonly priceNote: string;
  readonly publicPrice: null;
  readonly paidCheckoutGenerallyAvailable: false;
}

export const PUBLIC_SAAS_PLANS: Readonly<Record<EterNyxPlanId, PublicSaasPlan>> = Object.freeze({
  free: Object.freeze({
    id: "free",
    name: "Ghost Access",
    description: "Browser-based utilities and available local workspaces; server-backed features vary.",
    priceNote: "No card needed for local free tools",
    publicPrice: null,
    paidCheckoutGenerallyAvailable: false,
  }),
  premium: Object.freeze({
    id: "premium",
    name: "Shadow Operative",
    description: "Planned subscription for expanded web-tool access after merchant verification.",
    priceNote: "Price not published",
    publicPrice: null,
    paidCheckoutGenerallyAvailable: false,
  }),
  elite: Object.freeze({
    id: "elite",
    name: "Cyber Overlord",
    description: "Planned advanced subscription, with limits and entitlements to be confirmed.",
    priceNote: "Price not published",
    publicPrice: null,
    paidCheckoutGenerallyAvailable: false,
  }),
});

/**
 * Never silently map an unknown paid plan to the free tier.
 * A subscription may only be interpreted after server verification.
 */
export function knownSaasPlan(value: unknown): PublicSaasPlan | null {
  return value === "free" || value === "premium" || value === "elite"
    ? PUBLIC_SAAS_PLANS[value]
    : null;
}

/**
 * Merchant jurisdiction must come from actual registration and acquiring
 * eligibility, NOT a founder's nationality or current country of residence.
 * This is copy for preview UIs; do not use it to enforce payment permissions.
 */
export const MERCHANT_ONBOARDING_NOTE =
  "Paid plans are unavailable until a legally eligible merchant, payment provider, pricing, taxes, and subscription lifecycle are verified.";
