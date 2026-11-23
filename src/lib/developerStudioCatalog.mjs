// A discovery index for existing, routed workbenches—not a claim of release certification.
// Keep titles/modes consistent with each tool's actual execution boundary.
export const developerCategories = Object.freeze([
  { id: "all", label: "All workbenches" },
  { id: "utilities", label: "Utilities" },
  { id: "api", label: "API engineering" },
  { id: "github", label: "GitHub" },
  { id: "devops", label: "DevOps & cloud" },
  { id: "security", label: "Security reviews" },
  { id: "labs", label: "Learning labs" },
]);

export const developerTools = Object.freeze([
  { id: "json", title: "JSON formatter & validator", category: "utilities", mode: "local", route: "/developer-studio?tool=json#developer-utilities", description: "Validate JSON syntax and format text locally." },
  { id: "base64", title: "UTF-8 Base64 encoder & decoder", category: "utilities", mode: "local", route: "/developer-studio?tool=base64#developer-utilities", description: "Encode or decode UTF-8 text without a server request." },
  { id: "url", title: "URL component encoder & decoder", category: "utilities", mode: "local", route: "/developer-studio?tool=url#developer-utilities", description: "Safely encode and decode URI components." },
  { id: "uuid", title: "UUID v4 generator", category: "utilities", mode: "local", route: "/developer-studio?tool=uuid#developer-utilities", description: "Generate random version 4 identifiers." },
  { id: "jwt", title: "JWT payload inspector", category: "utilities", mode: "local", route: "/developer-studio?tool=jwt#developer-utilities", description: "Decode JWT header and payload; signatures are not verified." },
  { id: "advanced", title: "Advanced developer utilities", category: "utilities", mode: "local", route: "/developer-studio/advanced", description: "Markdown preview, CSV conversion, HTML entities, timestamps and diff." },
  { id: "api-workbench", title: "HTTP API workbench", category: "api", mode: "browser-request", route: "/developer-studio/api-workbench", description: "Send browser HTTP requests, inspect responses, and export cURL." },
  { id: "github-hub", title: "GitHub repository inspector", category: "github", mode: "public-readonly", route: "/developer-studio/github-hub", description: "Inspect public repository metadata, branches and commits." },
  { id: "github-collaboration", title: "GitHub issues & pull requests", category: "github", mode: "public-readonly", route: "/developer-studio/github-collaboration", description: "Explore public issue and PR queues without editing them." },
  { id: "github-changes", title: "GitHub change intelligence", category: "github", mode: "public-readonly", route: "/developer-studio/github-changes", description: "Compare public branches, tags and commits." },
  { id: "github-actions", title: "GitHub Actions intelligence", category: "github", mode: "public-readonly", route: "/developer-studio/github-actions", description: "Inspect public CI runs, jobs and steps." },
  { id: "github-releases", title: "GitHub release intelligence", category: "github", mode: "public-readonly", route: "/developer-studio/github-releases", description: "Explore public releases, assets and version tags." },
  { id: "devops", title: "DevOps Launchpad", category: "devops", mode: "local", route: "/developer-studio/devops", description: "Generate Git commands and .gitignore files; commands are not executed." },
  { id: "deployment", title: "Deployment intelligence", category: "devops", mode: "local", route: "/developer-studio/deployment-intelligence", description: "Review Vercel or Netlify config, environment names and build logs offline." },
  { id: "containers", title: "Container & infrastructure review", category: "devops", mode: "local", route: "/developer-studio/container-infrastructure", description: "Static checks for Dockerfile, Compose and Kubernetes configurations." },
  { id: "iac", title: "Infrastructure as code review", category: "devops", mode: "local", route: "/developer-studio/infrastructure-as-code", description: "Rule-based review of Terraform, Ansible and Helm text." },
  { id: "observability", title: "Observability intelligence", category: "devops", mode: "local", route: "/developer-studio/observability", description: "Review supplied Prometheus and Grafana configurations locally." },
  { id: "sre", title: "SRE reliability workbench", category: "devops", mode: "local", route: "/developer-studio/sre-reliability", description: "Calculate error budgets and prepare postmortems or runbooks." },
  { id: "cicd-security", title: "CI/CD pipeline security", category: "security", mode: "local", route: "/developer-studio/cicd-security", description: "Static GitHub Actions workflow security checks." },
  { id: "supply-chain", title: "Software supply chain review", category: "security", mode: "local", route: "/developer-studio/supply-chain", description: "Inspect npm manifests and lockfiles; generate an SBOM." },
  { id: "provenance", title: "Artifact provenance review", category: "security", mode: "local", route: "/developer-studio/artifact-provenance", description: "Offline structure and digest consistency review; not trust certification." },
  { id: "sql", title: "Database & SQL intelligence", category: "security", mode: "local", route: "/developer-studio/database-sql", description: "Review SQL scripts and migrations for risky patterns." },
  { id: "rls", title: "PostgreSQL RLS intelligence", category: "security", mode: "local", route: "/developer-studio/rls-security", description: "Static RLS policy review; not a live permission audit." },
  { id: "api-security", title: "API security review", category: "security", mode: "local", route: "/developer-studio/api-security", description: "Review supplied API settings and OpenAPI security metadata." },
  { id: "web-security", title: "Web security readiness", category: "security", mode: "local", route: "/cybersecurity/web-security", description: "Review supplied headers, CSP, cookies and CSRF settings." },
  { id: "labs", title: "ETERNYX Labs", category: "labs", mode: "local", route: "/labs", description: "Run local web-development and defensive practice exercises." },
]);

const allowedIds = new Set(developerTools.map((tool) => tool.id));
export const developerUtilityTab = (value) =>
  ["json", "base64", "url", "uuid", "jwt"].includes(value) ? value : "json";

export function normalizeDeveloperSavedIds(value, max = 26) {
  if (!Array.isArray(value)) return [];
  const clean = [];
  for (const id of value) {
    if (typeof id !== "string" || !allowedIds.has(id) || clean.includes(id)) continue;
    clean.push(id);
    if (clean.length >= max) break;
  }
  return clean;
}

export function recordDeveloperRecent(value, id) {
  if (!allowedIds.has(id)) return normalizeDeveloperSavedIds(value, 6);
  return [id, ...normalizeDeveloperSavedIds(value).filter((item) => item !== id)].slice(0, 6);
}

export function toggleDeveloperFavorite(value, id) {
  const current = normalizeDeveloperSavedIds(value);
  if (!allowedIds.has(id)) return current;
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export function filterDeveloperTools({ query = "", category = "all", favoritesOnly = false, favorites = [] } = {}) {
  const needle = String(query).trim().toLocaleLowerCase();
  const favoriteIds = new Set(normalizeDeveloperSavedIds(favorites));
  const validCategory = developerCategories.some((item) => item.id === category) ? category : "all";
  return developerTools.filter((tool) => {
    if (validCategory !== "all" && tool.category !== validCategory) return false;
    if (favoritesOnly && !favoriteIds.has(tool.id)) return false;
    const haystack = [tool.title, tool.description, tool.category, tool.mode].join(" ").toLocaleLowerCase();
    return haystack.includes(needle);
  });
}
