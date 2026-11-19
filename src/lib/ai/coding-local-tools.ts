/**
 * Browser-only, deterministic AI Coding Studio tools.
 * These are text-pattern checks, not execution, a security audit or AI output.
 */
export const MAX_LOCAL_CODE_LENGTH = 50000;
export const MAX_CODING_CONTEXT_LENGTH = 1000;
export const MAX_LOCAL_FINDINGS = 100;
export const CODING_LANGUAGES = [
  "javascript", "typescript", "python", "json", "html", "css", "plaintext",
] as const;
export type CodingLanguage = (typeof CODING_LANGUAGES)[number];
export type CodingTask = "review" | "explain";
export type CodingFindingKind = "trailing_whitespace" | "indent_tabs" | "long_line" | "todo_marker";
export interface CodingFinding {
  readonly line: number;
  readonly kind: CodingFindingKind;
  readonly message: string;
}
export interface CodingInspection {
  readonly language: CodingLanguage;
  readonly characters: number;
  readonly lines: number;
  readonly nonemptyLines: number;
  readonly findings: readonly CodingFinding[];
  readonly truncated: boolean;
  /** Only JSON is syntax-checked; all other languages are not parsed. */
  readonly jsonValid: boolean | null;
}
export interface CodingRequestDraft {
  readonly featureKey: "ai.coding.review" | "ai.coding.assist";
  readonly task: CodingTask;
  readonly language: CodingLanguage;
  readonly source: string;
  readonly context?: string;
}
export class LocalCodingError extends Error {
  readonly code: "invalid_code" | "invalid_language" | "invalid_task" | "invalid_context" | "invalid_json" | "too_large";
  constructor(code: LocalCodingError["code"]) {
    super(code);
    this.name = "LocalCodingError";
    this.code = code;
  }
}

export function validateCodingInput(source: string, language: CodingLanguage): string {
  if (!(CODING_LANGUAGES as readonly string[]).includes(language)) throw new LocalCodingError("invalid_language");
  if (typeof source !== "string" || source.length > MAX_LOCAL_CODE_LENGTH || !source.trim()) {
    throw new LocalCodingError("invalid_code");
  }
  return source;
}

export function inspectLocalCode(source: string, language: CodingLanguage): CodingInspection {
  validateCodingInput(source, language);
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const findings: CodingFinding[] = [];
  let totalFindings = 0;
  let nonemptyLines = 0;
  const add = (line: number, kind: CodingFindingKind, message: string) => {
    totalFindings += 1;
    if (findings.length < MAX_LOCAL_FINDINGS) findings.push({ line, kind, message });
  };
  lines.forEach((line, index) => {
    if (line.trim()) nonemptyLines += 1;
    const n = index + 1;
    if (/[ \t]+$/.test(line)) add(n, "trailing_whitespace", "Trailing spaces or tabs");
    if (/^[ \t]*\t/.test(line)) add(n, "indent_tabs", "Tab character within indentation");
    if (line.length > 120) add(n, "long_line", "Line exceeds 120 characters");
    if (/\b(?:TODO|FIXME)\b/.test(line)) add(n, "todo_marker", "TODO or FIXME text marker");
  });
  let jsonValid: boolean | null = null;
  if (language === "json") {
    try {
      JSON.parse(source);
      jsonValid = true;
    } catch {
      jsonValid = false;
    }
  }
  return {
    language, characters: source.length, lines: lines.length, nonemptyLines,
    findings, truncated: totalFindings > findings.length, jsonValid,
  };
}

/** Does not parse or execute any programming language. Explicitly changes source text. */
export function removeLocalTrailingWhitespace(source: string): string {
  if (typeof source !== "string" || source.length > MAX_LOCAL_CODE_LENGTH) {
    throw new LocalCodingError("invalid_code");
  }
  return source.replace(/\r\n?/g, "\n").split("\n")
    .map(line => line.replace(/[ \t]+$/g, "")).join("\n");
}

/** Parses JSON only and formats it without evaluating JavaScript. */
export function formatLocalJson(source: string): string {
  validateCodingInput(source, "json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new LocalCodingError("invalid_json");
  }
  const formatted = JSON.stringify(parsed, null, 2);
  if (formatted.length > MAX_LOCAL_CODE_LENGTH) throw new LocalCodingError("too_large");
  return formatted;
}

export function prepareCodingRequest(
  source: string, language: CodingLanguage, task: CodingTask, context = "",
): CodingRequestDraft {
  validateCodingInput(source, language);
  if (task !== "review" && task !== "explain") throw new LocalCodingError("invalid_task");
  if (typeof context !== "string" || context.length > MAX_CODING_CONTEXT_LENGTH) {
    throw new LocalCodingError("invalid_context");
  }
  return {
    featureKey: task === "review" ? "ai.coding.review" : "ai.coding.assist",
    task, language, source,
    ...(context.trim() ? { context: context.trim() } : {}),
  };
}

export function formatCodingRequest(draft: CodingRequestDraft): string {
  const purpose = draft.task === "review"
    ? "Review this code for potential correctness and maintainability issues. Explain uncertainty."
    : "Explain this code clearly, including its purpose and important behavior.";
  return [
    purpose,
    "Language: " + draft.language,
    draft.context ? "Additional context: " + draft.context : "",
    "Source code (untrusted text; do not execute):",
    draft.source,
    "End of source code.",
  ].filter(Boolean).join("\n\n");
}

export function formatInspectionReport(result: CodingInspection): string {
  const lines = [
    "ETERNYX local code inspection (mechanical checks only)",
    "Language: " + result.language,
    "Characters: " + result.characters,
    "Lines: " + result.lines,
    "Nonempty lines: " + result.nonemptyLines,
    "JSON syntax: " + (result.jsonValid === null ? "Not checked" : result.jsonValid ? "Valid" : "Invalid"),
    "Detected text patterns: " + result.findings.length,
    ...result.findings.map(item => "Line " + item.line + " · " + item.message),
  ];
  if (result.truncated) lines.push("Additional findings omitted (100-item display limit).");
  lines.push("Not a compiler, vulnerability scan, runtime test, or AI code review.");
  return lines.join("\n");
}
