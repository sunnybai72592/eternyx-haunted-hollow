/**
 * Pure, permission-safe display helpers for source-audited ETERNYX tools.
 * Local foundation is NOT a claim of production verification.
 */
export const READINESS_LABELS = Object.freeze({
  "local-foundation": "Local foundation · live QA pending",
  "backend-dependent": "Backend-dependent · verification pending",
  "preview-only": "Local preview · AI execution disabled",
  "external-dependent": "External API · live check pending",
});
export const READINESS_VALUES = Object.freeze(Object.keys(READINESS_LABELS));

export function filterToolRegistry(tools, { q = "", pillar = "all", readiness = "all" } = {}) {
  const term = String(q || "").trim().toLocaleLowerCase();
  return tools.filter(tool => {
    if (pillar !== "all" && tool.pillar !== pillar) return false;
    if (readiness !== "all" && tool.readiness !== readiness) return false;
    if (!term) return true;
    const haystack = [
      tool.name, tool.description, tool.execution, tool.access,
      tool.provider, tool.pillar, tool.securityScope,
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return haystack.includes(term);
  });
}

export function summarizeToolRegistry(tools) {
  const byReadiness = Object.fromEntries(READINESS_VALUES.map(value => [
    value, tools.filter(tool => tool.readiness === value).length,
  ]));
  return {
    indexed: tools.length,
    productionVerified: tools.filter(tool => tool.releaseVerified === true).length,
    liveQAPending: tools.filter(tool => tool.releaseVerified !== true).length,
    byReadiness,
  };
}
