import { normalizeDeveloperProject } from "./developerProjectLab.mjs";

/**
 * Project Lab's flat-file, browser-local dependency check.
 * This is deliberately a bounded source heuristic, not a module resolver,
 * HTML/CSS parser, package installer or proof that preview loads imports.
 */
export const DEVELOPER_INTEGRATION_KINDS = Object.freeze([
  "html-local-files-resolve",
  "css-local-files-resolve",
  "js-local-imports-resolve",
]);

const KIND_FOR_EXTENSION = Object.freeze({ css: DEVELOPER_INTEGRATION_KINDS[1], js: DEVELOPER_INTEGRATION_KINDS[2] });
const FILE_EXTENSION = /\.(?:html|css|js|json|md|txt)$/i;
const SCHEMES = /^[a-z][a-z0-9+.-]*:/i;
// Each source file is capped at 20,000 characters; 2,048 exceeds the maximum
// number of non-overlapping supported literal references that can fit.
const MAX_REFERENCES = 2048;

function lineAt(source, index) {
  return source.slice(0, Math.max(index, 0)).split("\n").length;
}

function quotedAttribute(tag, name) {
  const match = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*([\\\"'])(.*?)\\1", "i").exec(tag);
  return match ? match[2] : null;
}

function isExternal(value) {
  return !value || value.startsWith("#") || value.startsWith("//") || SCHEMES.test(value);
}

function candidate(value, kind) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (isExternal(trimmed)) return null;
  // Bare module names belong to a bundler, which Project Lab does not provide.
  if (kind === "js-local-imports-resolve" && !trimmed.startsWith(".") && !trimmed.startsWith("/")) return null;
  return trimmed;
}

function scanFile(file, kind) {
  const references = [];
  const source = file.content;
  const collect = (raw, offset) => {
    const value = candidate(raw, kind);
    if (value !== null && references.length < MAX_REFERENCES) {
      references.push({ file: file.name, kind, value, line: lineAt(source, offset) });
    }
  };
  if (kind === "html-local-files-resolve") {
    for (const match of source.matchAll(/<(script|link|a)\b[^>]*>/gi)) {
      const tag = match[1].toLowerCase();
      const attr = tag === "script" ? "src" : "href";
      const value = quotedAttribute(match[0], attr);
      if (tag === "link" && !/\bstylesheet\b/i.test(quotedAttribute(match[0], "rel") || "")) continue;
      if (tag === "a" && !/\.html(?:[?#]|$)/i.test(value || "")) continue;
      collect(value, match.index);
    }
  } else if (kind === "css-local-files-resolve") {
    for (const match of source.matchAll(/@import\s+(?:url\s*\(\s*)?(["'])([^"'\r\n]{1,120})\1/gi)) {
      collect(match[2], match.index);
    }
  } else if (kind === "js-local-imports-resolve") {
    // Literal static imports/re-exports on one line and literal dynamic imports.
    // Arbitrary expressions, comments and template strings are not evaluated.
    for (const match of source.matchAll(/(?:^|[;\n])\s*(?:import|export)\s+(?:[^;\n]{0,150}?\s+from\s*)?(["'])([^"'\r\n]{1,120})\1/gm)) {
      // The static-import pattern can consume the previous newline; report the
      // token position rather than the start of its regex match.
      collect(match[2], match.index + match[0].search(/\b(?:import|export)\b/));
    }
    for (const match of source.matchAll(/\bimport\s*\(\s*(["'])([^"'\r\n]{1,120})\1\s*\)/g)) {
      collect(match[2], match.index);
    }
  }
  return references;
}

function checkReference(reference, lookup) {
  const path = reference.value.split(/[?#]/, 1)[0].replace(/^\.\//, "");
  if (!path || path.startsWith(".") || path.includes("/") || path.includes("\\") ||
      !FILE_EXTENSION.test(path)) return "unsupported-local-path";
  const found = lookup.get(path.toLowerCase());
  if (!found) return "missing-local-reference";
  if (found !== path) return "reference-case-mismatch";
  return null;
}

function applicableFiles(project, kind) {
  if (kind === "html-local-files-resolve") return project.files.filter(file => file.name.toLowerCase() === "index.html");
  const extension = kind === "css-local-files-resolve" ? ".css" : ".js";
  return project.files.filter(file => file.name.toLowerCase().endsWith(extension));
}

export function checkDeveloperProjectIntegration(project, kind, filename) {
  if (!DEVELOPER_INTEGRATION_KINDS.includes(kind)) throw new Error("Unknown project integration check.");
  const valid = normalizeDeveloperProject(project);
  const file = applicableFiles(valid, kind).find(f => f.name.toLowerCase() === filename?.toLowerCase());
  if (!file) throw new Error("Integration checks require an applicable project source file.");
  const lookup = new Map(valid.files.map(item => [item.name.toLowerCase(), item.name]));
  const references = scanFile(file, kind);
  for (const reference of references) {
    const reason = checkReference(reference, lookup);
    if (reason) return { ok: false, reason, line: reference.line };
  }
  return { ok: true, reason: references.length ? "local-references-found" : "no-static-references", line: references.length ? references[0].line : 0 };
}

export function summarizeDeveloperProjectIntegration(project) {
  const valid = normalizeDeveloperProject(project);
  const lookup = new Map(valid.files.map(item => [item.name.toLowerCase(), item.name]));
  const findings = [];
  let checked = 0;
  let resolved = 0;
  for (const kind of DEVELOPER_INTEGRATION_KINDS) {
    for (const file of applicableFiles(valid, kind)) {
      for (const reference of scanFile(file, kind)) {
        checked++;
        const reason = checkReference(reference, lookup);
        if (!reason) { resolved++; continue; }
        if (findings.length < 80) {
          findings.push({ rule: reason, kind, file: reference.file, line: reference.line });
        }
      }
    }
  }
  return { checked, resolved, unresolved: checked - resolved, findings, truncated: findings.length < checked - resolved };
}

/**
 * Return only matched project filenames, rule IDs and line numbers; never
 * expose the original quoted reference value through this shared API.
 * Unmatched and unsupported references keep a null target.
 */
export function listDeveloperProjectReferences(project) {
  const valid = normalizeDeveloperProject(project);
  const lookup = new Map(valid.files.map(file => [file.name.toLowerCase(), file.name]));
  const results = [];
  for (const kind of DEVELOPER_INTEGRATION_KINDS) {
    for (const file of applicableFiles(valid, kind)) {
      for (const reference of scanFile(file, kind)) {
        const reason = checkReference(reference, lookup);
        const target = reason ? null :
          lookup.get(reference.value.split(/[?#]/, 1)[0].replace(/^\.\//, "").toLowerCase()) || null;
        results.push({ from: file.name, to: target, kind, line: reference.line,
          reason: reason || "resolved" });
      }
    }
  }
  return results;
}

export function developerIntegrationAdvice(reason) {
  const advice = {
    "missing-local-reference": "Add the named local file to this project or correct the reference. Project Lab supports only flat filenames.",
    "reference-case-mismatch": "Match the referenced filename's capitalization exactly; the case may differ even when names look similar.",
    "unsupported-local-path": "Use a simple project filename such as ./app.js. Parent folders, absolute paths and unsupported asset types cannot be loaded here.",
    "json-path-missing": "Check the object-key path and ensure every parent key exists in the JSON file.",
    "invalid-json": "Correct JSON syntax before checking nested values.",
    "json-array-length-different": "Review the actual array length or change the expected count in your plan.",
    "json-value-not-array": "The selected JSON key must contain an array, not an object or scalar.",
    "css-selector-not-found": "Check the exact CSS selector spelling and the source file selected by this assertion.",
    "unresolved-local-anchor": "Add the matching HTML id or change the in-page href target.",
    "required-text-missing": "Search the actual file and update the literal expectation or source content.",
    "missing-file": "Create the referenced file or select a filename that exists in this project.",
  };
  return Object.hasOwn(advice, reason) ? advice[reason] : "Open the reported source location and review the assertion. This is a static local check, not runtime evidence.";
}

export function recommendedDeveloperIntegrationTests(project, existing = []) {
  const valid = normalizeDeveloperProject(project);
  const signatures = new Set(existing.map(item => item.kind + "|" + item.file.toLowerCase()));
  const ids = new Set(existing.map(item => item.id));
  const suggestions = [];
  let sequence = 0;
  for (const kind of DEVELOPER_INTEGRATION_KINDS) {
    for (const file of applicableFiles(valid, kind)) {
      const signature = kind + "|" + file.name.toLowerCase();
      if (signatures.has(signature)) continue;
      let id;
      do { id = "integration-" + ++sequence; } while (ids.has(id));
      ids.add(id);
      signatures.add(signature);
      suggestions.push({ id, kind, file: file.name, expected: "", path: "" });
    }
  }
  return suggestions;
}

export function developerIntegrationKindForFile(filename) {
  const ext = typeof filename === "string" ? filename.split(".").at(-1).toLowerCase() : "";
  return filename?.toLowerCase() === "index.html" ? DEVELOPER_INTEGRATION_KINDS[0] : (KIND_FOR_EXTENSION[ext] || null);
}
