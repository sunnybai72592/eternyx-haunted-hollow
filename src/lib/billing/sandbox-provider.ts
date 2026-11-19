/**
 * Browser UX selection ONLY. Backend checkout and webhook endpoints independently
 * enforce their own sandbox gates, provider identity and signed events.
 */
export type SandboxBillingProvider = "stripe" | "polar";
export function selectSandboxBillingProvider(
  stripeEnabled: boolean,
  polarEnabled: boolean,
): SandboxBillingProvider | null {
  // Misconfigured simultaneous providers fail closed instead of silently
  // choosing which processor could have charged a customer.
  if (stripeEnabled === polarEnabled) return null;
  return polarEnabled ? "polar" : "stripe";
}
export function sandboxCheckoutEndpoint(provider: SandboxBillingProvider): string {
  return provider === "polar" ? "polar-checkout" : "create-checkout";
}
export function sandboxPortalEndpoint(provider: SandboxBillingProvider): string {
  return provider === "polar" ? "polar-customer-portal" : "customer-portal";
}
