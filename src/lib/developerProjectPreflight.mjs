import { normalizeDeveloperProject } from "./developerProjectLab.mjs";
import { inspectDeveloperProject } from "./developerProjectInspection.mjs";
import { validateProjectJavascript } from "./developerEditorUtils.mjs";

export const DEVELOPER_PREFLIGHT_SCHEMA = "eternyx-developer-preflight-v1";

export async function runDeveloperPreflight(project) {
  const valid = normalizeDeveloperProject(project);
  const staticFindings = inspectDeveloperProject(valid);
  const js = await validateProjectJavascript(valid);
  const errors = staticFindings.filter(item => item.level === "error").length + js.issues.length;
  const warnings = staticFindings.filter(item => item.level === "warning").length;
  const report = {
    schema: DEVELOPER_PREFLIGHT_SCHEMA, createdAt: new Date().toISOString(),
    scope: "Local static rules plus TypeScript JS parsing. Not execution, deployment, authentication, or security certification.",
    filesChecked: valid.files.length, jsFilesChecked: js.filesChecked,
    errors, warnings, truncated: js.truncated,
    previewReadiness: errors === 0 && !js.truncated ? "no-blocking-issues-found" : "review-required",
    staticFindings: staticFindings.map(({ level, rule, file, line }) => ({ level, rule, file, line })),
    syntaxFindings: js.issues.map(({ file, line, column, code }) => ({ file, line, column, code })),
  };
  return report;
}

export function exportDeveloperPreflight(report) {
  if (!report || report.schema !== DEVELOPER_PREFLIGHT_SCHEMA) throw new Error("Run current project preflight before export.");
  // Only map known fields; never serialize untrusted source or messages.
  const safeFinding = item => ({ level: item.level, rule: item.rule, file: item.file, line: item.line });
  const safeIssue = item => ({ file: item.file, line: item.line, column: item.column, code: item.code });
  return JSON.stringify({
    schema: DEVELOPER_PREFLIGHT_SCHEMA, createdAt: report.createdAt, scope: report.scope,
    filesChecked: report.filesChecked, jsFilesChecked: report.jsFilesChecked,
    errors: report.errors, warnings: report.warnings, truncated: report.truncated,
    previewReadiness: report.previewReadiness,
    staticFindings: report.staticFindings.map(safeFinding),
    syntaxFindings: report.syntaxFindings.map(safeIssue),
  }, null, 2);
}
