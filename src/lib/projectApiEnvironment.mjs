import { normalizeProjectApiScenario, MAX_PROJECT_SCENARIOS } from "./projectApiSuite.mjs";

export const API_ENVIRONMENTS = Object.freeze(["saved","development","staging","preview"]);
export function normalizeApiEnvironment(value = "saved") {
  if (!API_ENVIRONMENTS.includes(value)) throw new Error("Unknown API environment.");
  return value;
}
export function validateApiTargetOrigin(value) {
  if (typeof value !== "string" || !value || value.length > 512 || /[\s\\]/.test(value)) throw new Error("Enter an exact HTTP(S) origin.");
  let url;
  try { url = new URL(value); } catch { throw new Error("Enter an exact HTTP(S) origin."); }
  if (url.username || url.password || (value !== url.origin && value !== url.origin + "/") ||
      !["http:","https:"].includes(url.protocol)) throw new Error("Use an origin only: no credentials, path, query or fragment.");
  if (url.protocol !== "https:" && !["localhost","127.0.0.1","[::1]"].includes(url.hostname)) {
    throw new Error("HTTPS is required except for loopback development targets.");
  }
  return url.origin;
}
export function resolveApiEnvironmentSuite(scenarios, environment = "saved", targetOrigin = "") {
  const mode = normalizeApiEnvironment(environment);
  if (!Array.isArray(scenarios) || scenarios.length > MAX_PROJECT_SCENARIOS) throw new Error("Invalid saved suite.");
  const normalized = scenarios.map(normalizeProjectApiScenario);
  if (mode === "saved" || !normalized.length) return normalized;
  const target = validateApiTargetOrigin(targetOrigin);
  const originals = normalized.map(item => new URL(item.url));
  if (new Set(originals.map(url => url.origin)).size !== 1) throw new Error("Environment overrides require a single-origin saved suite.");
  return normalized.map((item,i) => {
    // Concatenate the canonical origin, never resolve a potentially //-prefixed path as a URL.
    const destination = new URL(target + originals[i].pathname);
    if (destination.origin !== target || destination.pathname !== originals[i].pathname || destination.search || destination.hash) {
      throw new Error("Cannot preserve the saved request path safely.");
    }
    return normalizeProjectApiScenario({...item,url:destination.href});
  });
}
