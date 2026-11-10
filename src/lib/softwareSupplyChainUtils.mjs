const MAX_INPUT_LENGTH = 500000;
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepare"];

function parseJson(text, label) {
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : "parse error"}`); }
}
function packageRef(name, version) {
  const normalized = String(name).startsWith("@")
    ? `%40${String(name).slice(1)}`
    : encodeURIComponent(String(name));
  return `pkg:npm/${normalized}@${encodeURIComponent(String(version))}`;
}
function collectV1Dependencies(tree, result = [], parentRef = "root") {
  for (const [name, item] of Object.entries(tree || {})) {
    if (!item || typeof item !== "object" || !item.version) continue;
    const ref = packageRef(name, item.version);
    result.push({ name, version: String(item.version), ref, item, parentRef });
    collectV1Dependencies(item.dependencies, result, ref);
  }
  return result;
}
function lockInventory(lock) {
  if (lock.packages && typeof lock.packages === "object") {
    return Object.entries(lock.packages)
      .filter(([path, item]) => path && item && typeof item === "object" && item.version)
      .map(([path, item]) => {
        const match = path.match(/(?:^|node_modules\/)(@[^/]+\/[^/]+|[^/]+)$/);
        const name = item.name || (match ? match[1] : path.split("node_modules/").pop());
        return { name, version: String(item.version), ref: packageRef(name, item.version), item, path };
      });
  }
  return collectV1Dependencies(lock.dependencies).map(entry => ({ ...entry, path: entry.name }));
}
function dependencyNames(manifest) {
  const names = new Set();
  for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const name of Object.keys(manifest[group] || {})) names.add(name);
  }
  return names;
}
function addFinding(findings, id, severity, title, detail, recommendation, evidence = "") {
  findings.push({ id, severity, title, detail, recommendation, evidence: String(evidence).slice(0, 240) });
}
function normalizeIntegrity(integrity) {
  if (typeof integrity !== "string") return [];
  return integrity.split(/\s+/).map(token => {
    const match = token.match(/^(sha(?:256|384|512))-(.+)$/);
    return match ? { alg: match[1].toUpperCase(), content: match[2] } : null;
  }).filter(Boolean);
}

export function analyzeNpmSupplyChain({ manifestText, lockfileText = "" } = {}) {
  const manifestSource = String(manifestText ?? "");
  const lockSource = String(lockfileText ?? "");
  if (!manifestSource.trim()) throw new Error("Paste a package.json manifest to begin.");
  if (manifestSource.length > MAX_INPUT_LENGTH || lockSource.length > MAX_INPUT_LENGTH) throw new Error("Each input must be 500,000 characters or fewer.");
  const manifest = parseJson(manifestSource, "package.json");
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("package.json must contain a JSON object.");
  if (!manifest.name || !manifest.version) throw new Error("package.json must include a project name and version.");
  const findings = [];
  const directNames = dependencyNames(manifest);
  let lock = null;
  let inventory = [];
  if (!lockSource.trim()) {
    addFinding(findings, "LOCKFILE_MISSING", "high", "Dependency lockfile was not supplied", "Without a lockfile, exact resolved dependency versions and integrity metadata cannot be inventoried.", "Commit and provide package-lock.json generated with npm install.");
  } else {
    lock = parseJson(lockSource, "package-lock.json");
    if (!lock || typeof lock !== "object" || Array.isArray(lock)) throw new Error("package-lock.json must contain a JSON object.");
    if (![1, 2, 3].includes(Number(lock.lockfileVersion))) addFinding(findings, "LOCKFILE_VERSION_UNSUPPORTED", "medium", "Unrecognized npm lockfile version", "The lockfile version is not one of the commonly supported npm formats (1, 2, or 3).", "Regenerate the lockfile using a supported npm version.", lock.lockfileVersion);
    inventory = lockInventory(lock);
    if (inventory.length === 0) addFinding(findings, "LOCKFILE_EMPTY", "high", "No locked package inventory found", "The supplied lockfile contains no recognized package entries.", "Check that the complete npm package-lock.json was supplied.");
    const root = lock.packages?.[""];
    if (root) {
      for (const [group, values] of Object.entries({ dependencies: manifest.dependencies || {}, devDependencies: manifest.devDependencies || {}, optionalDependencies: manifest.optionalDependencies || {}, peerDependencies: manifest.peerDependencies || {} })) {
        for (const [name, spec] of Object.entries(values)) {
          const lockedSpec = root[group]?.[name];
          if (lockedSpec && lockedSpec !== spec) addFinding(findings, "MANIFEST_LOCK_MISMATCH", "medium", "Manifest and lockfile specifications differ", `The ${group} specification for ${name} differs between package.json and the lockfile root.`, "Run npm install and review the resulting package.json and package-lock.json changes.", `${name}: manifest=${spec}; lock=${lockedSpec}`);
          if (!lockedSpec && !inventory.some(item => item.name === name)) addFinding(findings, "DEPENDENCY_NOT_LOCKED", "high", "Manifest dependency is absent from lockfile", `${name} is declared in package.json but was not found in the supplied lockfile inventory.`, "Regenerate and commit package-lock.json.", name);
        }
      }
    }
  }

  for (const script of LIFECYCLE_SCRIPTS) {
    if (typeof manifest.scripts?.[script] === "string") addFinding(findings, "ROOT_LIFECYCLE_SCRIPT", "medium", `Project defines a ${script} lifecycle script`, "npm can execute this script automatically during dependency installation or package preparation.", "Review every command and every dependency it invokes; avoid downloading or executing untrusted remote content.", manifest.scripts[script]);
  }
  for (const [group, values] of Object.entries({ dependencies: manifest.dependencies || {}, devDependencies: manifest.devDependencies || {}, optionalDependencies: manifest.optionalDependencies || {}, peerDependencies: manifest.peerDependencies || {} })) {
    for (const [name, specValue] of Object.entries(values)) {
      const spec = String(specValue);
      if (/^(?:git\+|git:|github:|https?:|ssh:|file:|\.\.?\/)/i.test(spec)) addFinding(findings, "NON_REGISTRY_DEPENDENCY", "high", "Dependency uses a non-registry source", `${name} is declared using a Git, URL, local path, or other nonstandard source.`, "Prefer a reviewed registry release or pin the source to an immutable commit and verify its provenance.", `${name}@${spec}`);
      else if (/^(?:\*|latest|x)$/i.test(spec.trim()) || /(?:^|[\s,])(?:\*|x)(?:$|[\s,])/i.test(spec)) addFinding(findings, "FLOATING_VERSION_RANGE", "medium", "Dependency uses a floating version range", `${name} uses a wildcard or floating version selector.`, "Use a deliberate version range and rely on a reviewed lockfile for reproducible installs.", `${name}@${spec}`);
    }
  }
  for (const item of inventory) {
    const pkg = item.item || {};
    if (pkg.hasInstallScript === true) addFinding(findings, "DEPENDENCY_INSTALL_SCRIPT", "medium", "Dependency declares an install script", `${item.name}@${item.version} is marked as having an install script in the lockfile.`, "Review the package source and install behavior; use allow-scripts controls where practical.", `${item.name}@${item.version}`);
    if (pkg.resolved && /^(?:git\+|git:|http:)/i.test(String(pkg.resolved))) addFinding(findings, "NON_HTTPS_PACKAGE_SOURCE", "high", "Package resolves from a Git or non-HTTPS source", `${item.name}@${item.version} resolves from a source that is not a standard HTTPS registry URL.`, "Verify the source owner and immutable revision; prefer HTTPS registry artifacts with integrity metadata.", pkg.resolved);
    if (pkg.resolved && /^https:\/\//i.test(String(pkg.resolved)) && !pkg.integrity) addFinding(findings, "INTEGRITY_MISSING", "medium", "Package integrity hash is missing", `${item.name}@${item.version} has a resolved HTTPS URL but no integrity field in the lockfile.`, "Regenerate the lockfile and investigate why the package integrity hash is absent.", `${item.name}@${item.version}`);
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title));
  const components = inventory.map(item => {
    const component = { type: "library", name: item.name, version: item.version, "bom-ref": item.ref, purl: item.ref };
    const hashes = normalizeIntegrity(item.item?.integrity);
    if (hashes.length) component.hashes = hashes;
    if (item.item?.license) component.licenses = [{ license: { id: String(item.item.license) } }];
    if (item.item?.dev) component.scope = "optional";
    return component;
  });
  const rootRef = packageRef(manifest.name, manifest.version);
  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: { component: { type: "application", name: String(manifest.name), version: String(manifest.version), "bom-ref": rootRef, purl: rootRef } },
    components,
    dependencies: [{ ref: rootRef, dependsOn: inventory.filter(item => directNames.has(item.name)).map(item => item.ref) }]
  };
  for (const item of inventory) {
    const deps = item.item?.dependencies && typeof item.item.dependencies === "object" ? Object.keys(item.item.dependencies) : [];
    const refs = deps.map(name => inventory.find(candidate => candidate.name === name)?.ref).filter(Boolean);
    if (refs.length) bom.dependencies.push({ ref: item.ref, dependsOn: [...new Set(refs)] });
  }
  return {
    findings,
    summary: {
      total: findings.length,
      critical: findings.filter(item => item.severity === "critical").length,
      high: findings.filter(item => item.severity === "high").length,
      medium: findings.filter(item => item.severity === "medium").length,
      low: findings.filter(item => item.severity === "low").length
    },
    inventory,
    directDependencyCount: directNames.size,
    transitiveDependencyCount: inventory.filter(item => !directNames.has(item.name)).length,
    bom
  };
}

export function buildSupplyChainReport(result) {
  if (!result || !Array.isArray(result.findings)) throw new Error("Analyze a project before building the report.");
  const lines = [
    "# Software Supply Chain Review",
    "",
    `- Components inventoried: ${result.inventory.length}`,
    `- Direct dependency declarations: ${result.directDependencyCount}`,
    `- Findings: ${result.summary.total} (${result.summary.critical} critical, ${result.summary.high} high, ${result.summary.medium} medium, ${result.summary.low} low)`,
    "",
    "## Findings"
  ];
  if (!result.findings.length) lines.push("No heuristic findings were detected. This is not proof that dependencies are vulnerability-free.");
  for (const finding of result.findings) lines.push(`### [${finding.severity.toUpperCase()}] ${finding.title}`, "", finding.detail, `Recommendation: ${finding.recommendation}`, finding.evidence ? `Evidence: \`${finding.evidence.replace(/\`/g, "'")}\`` : "", "");
  lines.push("## Scope", "", "Static analysis of the supplied package.json and optional package-lock.json only. No package installation, network requests, vulnerability database lookups, malware analysis, or provenance verification was performed.", "");
  return lines.filter(Boolean).join("\n");
}
