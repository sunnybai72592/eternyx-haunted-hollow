const GIT_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;

function shellQuote(value) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function buildGitWorkflow({ branch = "feature/my-change", commitMessage = "Describe the change", remoteUrl = "" } = {}) {
  const cleanBranch = branch.trim();
  const cleanMessage = commitMessage.trim();
  if (!GIT_BRANCH_PATTERN.test(cleanBranch) || cleanBranch.endsWith("/") || cleanBranch.endsWith(".") || cleanBranch.includes("..") || cleanBranch.includes("@{") || cleanBranch.includes("//")) {
    throw new Error("Enter a valid Git branch name (letters, numbers, dots, underscores, slashes, and hyphens).");
  }
  if (!cleanMessage || cleanMessage.length > 200) {
    throw new Error("Commit message must contain 1–200 characters.");
  }
  let clone = "";
  if (remoteUrl.trim()) {
    let parsed;
    try { parsed = new URL(remoteUrl.trim()); } catch { throw new Error("Enter a valid HTTPS or SSH Git remote URL."); }
    const isHttps = parsed.protocol === "https:" && parsed.hostname.length > 0 && !parsed.username && !parsed.password;
    const isSsh = parsed.protocol === "ssh:" && parsed.hostname.length > 0 && parsed.username === "git";
    if (!isHttps && !isSsh) throw new Error("Remote must be an HTTPS URL or an ssh://git@host URL. Embedded credentials are not allowed.");
    clone = "git clone " + shellQuote(remoteUrl.trim()) + "\ncd " + shellQuote(remoteUrl.trim().split("/").pop().replace(/\.git$/, ""));
  }
  const commands = [
    "git status --short --branch",
    "git switch -c " + shellQuote(cleanBranch),
    "git add --all",
    "git diff --cached",
    "git commit -m " + shellQuote(cleanMessage),
    "git push --set-upstream origin " + shellQuote(cleanBranch),
  ];
  return [clone, ...commands].filter(Boolean).join("\n");
}

const IGNORE_RULES = {
  common: ["# OS files", ".DS_Store", "Thumbs.db", "Desktop.ini", "", "# Logs", "*.log", "logs/", "npm-debug.log*", "", "# Local environment and secrets", ".env", ".env.*", "!.env.example", "", "# Editor swap and temporary files", "*.swp", "*.swo", "*.tmp"],
  react: ["", "# React / Vite", "dist/", "coverage/", ".vite/"],
  node: ["", "# Node.js", "node_modules/", "npm-debug.log*", "yarn-debug.log*", "pnpm-debug.log*"],
  next: ["", "# Next.js", ".next/", "out/", "next-env.d.ts"],
  python: ["", "# Python", "__pycache__/", "*.py[cod]", ".venv/", "venv/", ".pytest_cache/", ".mypy_cache/", "*.egg-info/"],
  docker: ["", "# Docker local overrides", "docker-compose.override.yml", ".docker/"],
  vscode: ["", "# VS Code", ".vscode/*", "!.vscode/extensions.json", "!.vscode/settings.json"],
};

export function generateGitignore(stacks = []) {
  const selected = [...new Set(stacks)];
  const unknown = selected.filter((stack) => !Object.hasOwn(IGNORE_RULES, stack) || stack === "common");
  if (unknown.length) throw new Error("Unsupported .gitignore template selection.");
  return [...IGNORE_RULES.common, ...selected.flatMap((stack) => IGNORE_RULES[stack])].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function validateVercelConfig(source) {
  let config;
  try { config = JSON.parse(source); } catch (error) {
    throw new Error("Invalid JSON: " + (error instanceof Error ? error.message : "unable to parse input."));
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("vercel.json must contain a JSON object at the root.");
  const errors = [];
  for (const key of ["rewrites", "redirects", "headers", "cleanUrls", "trailingSlash", "routes", "crons"]) {
    if (key in config && !Array.isArray(config[key]) && !["cleanUrls", "trailingSlash"].includes(key)) errors.push(key + " must be an array.");
    if (key in config && ["cleanUrls", "trailingSlash"].includes(key) && typeof config[key] !== "boolean") errors.push(key + " must be a boolean.");
  }
  if ("rewrites" in config && Array.isArray(config.rewrites)) config.rewrites.forEach((item, i) => {
    if (!item || typeof item !== "object" || typeof item.source !== "string" || typeof item.destination !== "string") errors.push("rewrites[" + i + "] requires string source and destination fields.");
  });
  if ("redirects" in config && Array.isArray(config.redirects)) config.redirects.forEach((item, i) => {
    if (!item || typeof item !== "object" || typeof item.source !== "string" || typeof item.destination !== "string") errors.push("redirects[" + i + "] requires string source and destination fields.");
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return { provider: "Vercel", valid: true, summary: "Valid JSON with basic vercel.json structure checks passed.", note: "This local preflight is not a complete Vercel schema or deployment validation." };
}

function validateNetlifyToml(source) {
  const errors = [];
  let section = "";
  const seen = new Set();
  const lines = source.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sectionMatch) { section = sectionMatch[1]; return; }
    if (/^\[\[([A-Za-z0-9_.-]+)\]\]$/.test(line)) { section = line.slice(2, -2); return; }
    const assignment = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.+)$/);
    if (!assignment) { errors.push("Line " + (index + 1) + ": expected a TOML key/value assignment or section header."); return; }
    const key = section + "." + assignment[1];
    if (seen.has(key)) errors.push("Line " + (index + 1) + ": duplicate key " + key + ".");
    seen.add(key);
    const value = assignment[2].trim();
    if ((value.startsWith('"') && !value.endsWith('"')) || (value.startsWith("'") && !value.endsWith("'")) || (value.startsWith("[") && !value.endsWith("]"))) {
      errors.push("Line " + (index + 1) + ": value appears to have an unclosed quote or array.");
    }
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return { provider: "Netlify", valid: true, summary: "Basic TOML structure checks passed.", note: "This lightweight preflight is not a complete TOML parser or Netlify build validation. Review complex multiline values and plugin settings with Netlify CLI." };
}

export function validateDeploymentConfig(provider, source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("Paste a configuration file to validate.");
  if (source.length > 200_000) throw new Error("Configuration file exceeds the 200 KB local validation limit.");
  if (provider === "vercel") return validateVercelConfig(source);
  if (provider === "netlify") return validateNetlifyToml(source);
  throw new Error("Choose Vercel or Netlify.");
}
