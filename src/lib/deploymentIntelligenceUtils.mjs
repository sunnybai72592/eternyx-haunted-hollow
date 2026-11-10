const MAX_INPUT = 200_000;

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " is required.");
  if (value.length > MAX_INPUT) throw new Error(label + " exceeds the 200 KB analysis limit.");
  return value;
}

export function parseProjectPackageJson(source) {
  requireText(source, "package.json");
  let pkg;
  try { pkg = JSON.parse(source); } catch (error) {
    throw new Error("Invalid package.json: " + (error instanceof Error ? error.message : "unable to parse JSON."));
  }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) throw new Error("package.json must contain a JSON object.");
  const scripts = pkg.scripts && typeof pkg.scripts === "object" && !Array.isArray(pkg.scripts) ? pkg.scripts : {};
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const packageManager = typeof pkg.packageManager === "string" ? pkg.packageManager : "Not declared";
  const framework = dependencies.next ? "Next.js" : dependencies.vite ? "Vite" : dependencies["react-scripts"] ? "Create React App" : dependencies["@angular/cli"] ? "Angular" : dependencies.nuxt ? "Nuxt" : dependencies.astro ? "Astro" : dependencies.vue ? "Vue" : dependencies.svelte ? "Svelte" : "Node.js / custom";
  const findings = [];
  if (!scripts.build) findings.push({ level: "warning", title: "No build script", detail: "Add a build script so hosting providers know how to create production assets." });
  if (!scripts.start && !scripts.preview && !scripts.serve) findings.push({ level: "info", title: "No runtime/preview script", detail: "Static sites may not need one. Server-rendered apps should define the appropriate start command." });
  if (!pkg.engines?.node) findings.push({ level: "info", title: "Node version not pinned", detail: "Consider declaring engines.node or a provider-specific Node version to reduce build drift." });
  if (!pkg.packageManager) findings.push({ level: "info", title: "Package manager not declared", detail: "Declare packageManager to make the expected package manager explicit." });
  return { name: typeof pkg.name === "string" ? pkg.name : "Unnamed project", version: typeof pkg.version === "string" ? pkg.version : "Not declared", framework, packageManager, scripts: Object.keys(scripts), dependencies: Object.keys(dependencies).length, hasBuild: typeof scripts.build === "string", hasTest: typeof scripts.test === "string", hasLint: typeof scripts.lint === "string", nodeEngine: typeof pkg.engines?.node === "string" ? pkg.engines.node : "Not declared", findings };
}

export function auditDeploymentReadiness({ packageJson, provider = "vercel", config = "", envExample = "" } = {}) {
  const project = parseProjectPackageJson(packageJson);
  if (!["vercel", "netlify"].includes(provider)) throw new Error("Choose Vercel or Netlify.");
  const findings = [...project.findings];
  const configText = typeof config === "string" ? config : "";
  if (configText.length > MAX_INPUT) throw new Error("Deployment config exceeds the 200 KB analysis limit.");
  if (!configText.trim()) findings.push({ level: "info", title: "No provider config supplied", detail: "No " + (provider === "vercel" ? "vercel.json" : "netlify.toml") + " was provided. Provider defaults may still be sufficient." });
  else if (provider === "vercel") {
    let parsed;
    try { parsed = JSON.parse(configText); } catch { findings.push({ level: "error", title: "Invalid vercel.json", detail: "The supplied configuration is not valid JSON." }); }
    if (parsed !== undefined && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) findings.push({ level: "error", title: "Invalid Vercel root", detail: "vercel.json must be a JSON object." });
  } else {
    const malformed = configText.split(/\r?\n/).some((line) => line.trim() && !line.trim().startsWith("#") && !/^\[[A-Za-z0-9_.-]+\]$/.test(line.trim()) && !/^\[\[[A-Za-z0-9_.-]+\]\]$/.test(line.trim()) && !/^[A-Za-z_][A-Za-z0-9_-]*\s*=\s*.+$/.test(line.trim()));
    if (malformed) findings.push({ level: "warning", title: "Review Netlify TOML syntax", detail: "At least one non-comment line is not a simple section header or key/value assignment. Validate the complete file with Netlify CLI." });
  }
  const envNames = typeof envExample === "string" ? envExample.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)).map((line) => line.split("=")[0].trim()) : [];
  if (envExample.length > MAX_INPUT) throw new Error("Environment example exceeds the 200 KB analysis limit.");
  const uniqueEnv = [...new Set(envNames)];
  if (uniqueEnv.length) findings.push({ level: "info", title: "Environment variables documented", detail: uniqueEnv.length + " variable names found. Confirm required values are configured in the provider dashboard; never commit real secrets." });
  const score = Math.max(0, Math.min(100, 100 - findings.reduce((total, item) => total + (item.level === "error" ? 30 : item.level === "warning" ? 12 : 4), 0)));
  return { provider: provider === "vercel" ? "Vercel" : "Netlify", project, score, findings, environmentVariableNames: uniqueEnv };
}

export function compareEnvironmentKeys(exampleSource, configuredNames) {
  const source = typeof exampleSource === "string" ? exampleSource : "";
  if (source.length > MAX_INPUT) throw new Error("Environment example exceeds the 200 KB analysis limit.");
  const expected = [...new Set(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)).map((line) => line.split("=")[0].trim()))];
  const configured = new Set((Array.isArray(configuredNames) ? configuredNames : []).filter((name) => typeof name === "string"));
  return { expected, missing: expected.filter((name) => !configured.has(name)), extra: [...configured].filter((name) => !expected.includes(name)) };
}

export function analyzeBuildLog(source) {
  requireText(source, "Build log");
  const rules = [
    { pattern: /module not found|cannot find module|failed to resolve import/i, title: "Missing dependency or import", advice: "Check the package is installed, the import path casing is correct, and the dependency is declared." },
    { pattern: /out of memory|heap out of memory|javascript heap/i, title: "Build memory exhaustion", advice: "Review large bundles and build concurrency; increase Node memory only after checking for avoidable memory growth." },
    { pattern: /permission denied|eacces|eperm/i, title: "File permission issue", advice: "Check build user permissions and avoid relying on files outside the project workspace." },
    { pattern: /command not found|not recognized as an internal or external command/i, title: "Missing build command", advice: "Confirm the package manager, install step, and build command configured in the provider." },
    { pattern: /typescript error|ts\(\d+\)|type error/i, title: "TypeScript error", advice: "Fix the first reported type error, then rerun the build to reveal any subsequent issues." },
    { pattern: /eslint|lint error/i, title: "Lint failure", advice: "Run the project's lint script locally and fix the reported rule violations." },
    { pattern: /failed to fetch|network error|etimedout|econnreset/i, title: "Network or registry failure", advice: "Check registry availability, DNS, proxy settings, and dependency lockfile consistency." },
    { pattern: /lockfile.*(out of date|not up to date)|npm ci.*package-lock/i, title: "Lockfile mismatch", advice: "Regenerate and commit the lockfile using the project's intended package manager." },
    { pattern: /404.*not found|page not found/i, title: "Possible routing or publish directory issue", advice: "Check the publish/output directory and configure SPA fallback rewrites where appropriate." },
  ];
  const matches = rules.filter((rule) => rule.pattern.test(source)).map(({ title, advice }) => ({ title, advice }));
  return { matches, matched: matches.length, summary: matches.length ? "Found " + matches.length + " likely build issue pattern(s). Treat these as investigation hints, not definitive diagnoses." : "No known failure pattern matched. Inspect the first error and surrounding build context manually." };
}
