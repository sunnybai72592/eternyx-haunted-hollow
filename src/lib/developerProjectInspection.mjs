import { checkDeveloperProject, normalizeDeveloperProject, editDeveloperFile } from "./developerProjectLab.mjs";
import { summarizeDeveloperProjectIntegration, developerIntegrationAdvice } from "./developerProjectIntegration.mjs";

export const PROJECT_INSPECTION_REPORT_SCHEMA = "eternyx-developer-inspection-v1";
export const MAX_PROJECT_SEARCH_RESULTS = 120;
const MAX_DIAGNOSTICS = 80;

function lineNumber(text, offset) {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
}

export function searchDeveloperFiles(project, needle, { caseSensitive = false } = {}) {
  const files = normalizeDeveloperProject(project).files;
  if (typeof needle !== "string" || !needle.length || needle.length > 80) return [];
  const results = [];
  for (const file of files) {
    const source = caseSensitive ? file.content : file.content.toLowerCase();
    const phrase = caseSensitive ? needle : needle.toLowerCase();
    let start = 0;
    while (start < source.length) {
      const index = source.indexOf(phrase, start);
      if (index < 0) break;
      const previousNewline = file.content.lastIndexOf("\n", index - 1);
      results.push({ file: file.name, index, length: needle.length,
        line: lineNumber(file.content, index), column: index - previousNewline });
      if (results.length >= MAX_PROJECT_SEARCH_RESULTS) return results;
      start = index + Math.max(phrase.length, 1);
    }
  }
  return results;
}

export function replaceDeveloperFileText(project, filename, search, replacement, all = false) {
  const valid = normalizeDeveloperProject(project);
  if (!valid.files.some((f) => f.name === filename)) throw new Error("File not found.");
  if (typeof search !== "string" || search.length === 0 || search.length > 80) throw new Error("Enter 1–80 literal characters to find.");
  if (typeof replacement !== "string" || replacement.length > 2000) throw new Error("Replacement is limited to 2,000 characters.");
  const source = valid.files.find((f) => f.name === filename).content;
  const occurrences = source.split(search).length - 1;
  if (!occurrences) return { project: valid, count: 0 };
  if (all && occurrences > 200) throw new Error("Replace all is limited to 200 matches per operation.");
  const result = all ? source.replaceAll(search, replacement) : source.replace(search, replacement);
  return { project: editDeveloperFile(valid, filename, result), count: all ? occurrences : 1 };
}

export function compareDeveloperProjectFiles(project, savedProject = null) {
  const current = normalizeDeveloperProject(project);
  if (!savedProject) return { added: current.files.map(f => f.name), modified: [], deleted: [], unchanged: [] };
  const before = normalizeDeveloperProject(savedProject);
  const old = new Map(before.files.map(f => [f.name.toLowerCase(), f]));
  const now = new Map(current.files.map(f => [f.name.toLowerCase(), f]));
  const summary = { added: [], modified: [], deleted: [], unchanged: [] };
  for (const f of current.files) {
    const previous = old.get(f.name.toLowerCase());
    if (!previous) summary.added.push(f.name);
    else if (previous.name !== f.name || previous.content !== f.content) summary.modified.push(f.name);
    else summary.unchanged.push(f.name);
  }
  for (const f of before.files) if (!now.has(f.name.toLowerCase())) summary.deleted.push(f.name);
  return summary;
}

export function inspectDeveloperProject(project) {
  const valid = normalizeDeveloperProject(project);
  const findings = [];
  const push = (level, rule, file, line, message) => {
    if (findings.length < MAX_DIAGNOSTICS) findings.push({ level, rule, file, line, message });
  };
  const entry = valid.files.find(f => f.name.toLowerCase() === "index.html");
  if (!entry) push("error", "missing-entry", "", 0, "Create index.html before running the preview.");
  else if (!entry.content.trim()) push("warning", "empty-entry", entry.name, 1, "The HTML entry file is empty.");

  for (const file of valid.files) {
    const content = file.content;
    const extension = file.name.split(".").at(-1).toLowerCase();
    if (extension === "json") {
      try { JSON.parse(content); }
      catch { push("error", "json-syntax", file.name, 1, "Invalid JSON. The parser rejected this file; no code content is included in reports."); }
    }
    if (extension === "css") {
      const imports = /@import\s+(?:url\s*\(|["'])/gi;
      const match = imports.exec(content);
      if (match) push("warning", "blocked-css-import", file.name, lineNumber(content, match.index),
        "CSS @import is not supported by the isolated preview's network policy.");
      const externalUrl = /url\s*\(\s*["']?https?:\/\//gi.exec(content);
      if (externalUrl) push("warning", "blocked-css-url", file.name, lineNumber(content, externalUrl.index),
        "External CSS resources are blocked by the isolated preview.");
    }
    if (extension === "js") {
      const network = /\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\s*\()/g.exec(content);
      if (network) push("warning", "blocked-network", file.name, lineNumber(content, network.index),
        "Network APIs are blocked by preview CSP; this is a static advisory, not JavaScript execution analysis.");
    }
  }

  if (entry) {
    const html = entry.content;
    const ids = new Set();
    const idPattern = /\bid\s*=\s*(["'])([^"']+)\1/gi;
    for (const match of html.matchAll(idPattern)) {
      const id = match[2];
      if (ids.has(id)) push("warning", "duplicate-id", entry.name, lineNumber(html, match.index),
        "Duplicate HTML id values may break same-page navigation.");
      ids.add(id);
    }
    const anchor = /\bhref\s*=\s*(["'])#([^"']+)\1/gi;
    for (const match of html.matchAll(anchor)) {
      if (!ids.has(match[2])) push("warning", "missing-anchor", entry.name, lineNumber(html, match.index),
        "A same-page link targets an id that is not present in index.html.");
    }
    const image = /<img\b[^>]*>/gi;
    for (const match of html.matchAll(image)) {
      if (!/\balt\s*=/i.test(match[0])) push("warning", "image-alt", entry.name, lineNumber(html, match.index),
        "An image element is missing an alt attribute.");
    }
    const src = /<script\b[^>]*\bsrc\s*=/gi.exec(html);
    if (src) push("warning", "blocked-script-src", entry.name, lineNumber(html, src.index),
      "Script src references are not bundled or loaded by this isolated preview. Use a project .js file instead.");
    const link = /<link\b(?=[^>]*\brel\s*=\s*(["'])stylesheet\1)[^>]*>/gi.exec(html);
    if (link) push("warning", "blocked-stylesheet-link", entry.name, lineNumber(html, link.index),
      "Linked stylesheets are not loaded by this preview. Use a project .css file instead.");
  }
  const integration = summarizeDeveloperProjectIntegration(valid);
  for (const issue of integration.findings) {
    push("warning", issue.rule, issue.file, issue.line, developerIntegrationAdvice(issue.rule));
  }
  if (findings.length >= MAX_DIAGNOSTICS || integration.truncated) {
    findings.push({ level: "info", rule: "limit", file: "", line: 0, message: "Only the first 80 advisory findings are shown." });
  }
  return findings;
}

export function exportDeveloperInspectionReport(project, findings = inspectDeveloperProject(project)) {
  const valid = normalizeDeveloperProject(project);
  // Recalculate rather than trusting caller-supplied messages that might contain user source.
  const sanitized = inspectDeveloperProject(valid);
  const counts = { errors: sanitized.filter(f => f.level === "error").length,
    warnings: sanitized.filter(f => f.level === "warning").length,
    info: sanitized.filter(f => f.level === "info").length };
  return JSON.stringify({ schema: PROJECT_INSPECTION_REPORT_SCHEMA, createdAt: new Date().toISOString(),
    scope: "Local heuristic/static review; not an executable compiler, audit, or security certification.",
    fileCount: valid.files.length,
    files: valid.files.map(f => ({ name: f.name, characters: f.content.length })),
    counts, findings: sanitized }, null, 2);
}
