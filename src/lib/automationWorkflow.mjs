/**
 * ETERNYX Automation local data workflow engine.
 * Synchronous, deterministic line transformations only. No eval, scripts, network,
 * databases, auth permissions, scheduled tasks, cloud jobs, or external side effects.
 */
export const MAX_WORKFLOW_STEPS = 12;
export const MAX_WORKFLOW_INPUT = 50000;
export const MAX_WORKFLOW_LINES = 2500;
export const MAX_WORKFLOW_OUTPUT = 60000;
export const MAX_WORKFLOW_CONFIG = 16000;
export const WORKFLOW_OPERATIONS = Object.freeze([
  { kind: "trim", label: "Trim surrounding spaces", help: "Remove outer spaces on each line." },
  { kind: "remove_blanks", label: "Remove blank lines", help: "Discard empty or whitespace-only lines." },
  { kind: "unique", label: "Keep unique lines", help: "Keep the first occurrence of each line." },
  { kind: "sort_asc", label: "Sort A to Z", help: "Order lines ascending." },
  { kind: "sort_desc", label: "Sort Z to A", help: "Order lines descending." },
  { kind: "keep_contains", label: "Keep matching lines", help: "Keep lines containing a literal phrase." },
  { kind: "drop_contains", label: "Remove matching lines", help: "Discard lines containing a literal phrase." },
  { kind: "replace", label: "Find and replace", help: "Replace a literal phrase; no regex or code execution." },
  { kind: "prefix", label: "Add prefix", help: "Prepend text to each line." },
  { kind: "suffix", label: "Add suffix", help: "Append text to each line." },
]);

export const WORKFLOW_PRESETS = Object.freeze([
  {
    id: "clean",
    label: "Clean and deduplicate",
    steps: [
      { id: "p1", kind: "trim" }, { id: "p2", kind: "remove_blanks" },
      { id: "p3", kind: "unique", caseSensitive: false },
    ],
  },
  {
    id: "sort",
    label: "Sorted unique inventory",
    steps: [
      { id: "p1", kind: "trim" }, { id: "p2", kind: "remove_blanks" },
      { id: "p3", kind: "unique", caseSensitive: false }, { id: "p4", kind: "sort_asc" },
    ],
  },
  {
    id: "review",
    label: "Review flagged items",
    steps: [
      { id: "p1", kind: "trim" }, { id: "p2", kind: "keep_contains", value: "review", caseSensitive: false },
      { id: "p3", kind: "unique", caseSensitive: false },
    ],
  },
]);

export class LocalWorkflowError extends Error {
  constructor(code) {
    super(code);
    this.name = "LocalWorkflowError";
    this.code = code;
  }
}

const VALID_ID = /^[A-Za-z0-9_-]{1,80}$/;
const VALUE_KINDS = new Set(["keep_contains", "drop_contains", "replace", "prefix", "suffix"]);
const CASE_KINDS = new Set(["unique", "keep_contains", "drop_contains", "replace"]);

export function normalizeWorkflowSteps(steps) {
  if (!Array.isArray(steps) || steps.length > MAX_WORKFLOW_STEPS) throw new LocalWorkflowError("invalid_steps");
  const ids = new Set();
  return steps.map((step) => {
    if (!step || typeof step !== "object" || Array.isArray(step) ||
        (typeof step.id !== "string" || !VALID_ID.test(step.id)) || ids.has(step.id) ||
        !WORKFLOW_OPERATIONS.some((op) => op.kind === step.kind)) {
      throw new LocalWorkflowError("invalid_step");
    }
    ids.add(step.id);
    const normalized = { id: step.id, kind: step.kind };
    if (VALUE_KINDS.has(step.kind)) {
      if (typeof step.value !== "string" || step.value.length === 0 || step.value.length > 120 ||
          step.value.includes("\u0000")) throw new LocalWorkflowError("invalid_value");
      normalized.value = step.value;
    }
    if (step.kind === "replace") {
      if (typeof step.replacement !== "string" || step.replacement.length > 120 ||
          step.replacement.includes("\u0000")) throw new LocalWorkflowError("invalid_value");
      normalized.replacement = step.replacement;
    }
    if (CASE_KINDS.has(step.kind)) {
      if (step.caseSensitive !== undefined && typeof step.caseSensitive !== "boolean") {
        throw new LocalWorkflowError("invalid_value");
      }
      normalized.caseSensitive = step.caseSensitive === true;
    }
    return normalized;
  });
}

function assertBudget(lines) {
  if (lines.length > MAX_WORKFLOW_LINES) throw new LocalWorkflowError("too_many_lines");
  if (lines.join("\n").length > MAX_WORKFLOW_OUTPUT) throw new LocalWorkflowError("output_too_large");
}
function includesLiteral(line, term, caseSensitive) {
  return caseSensitive ? line.includes(term) : line.toLowerCase().includes(term.toLowerCase());
}
function applyStep(lines, step) {
  switch (step.kind) {
    case "trim": return lines.map((line) => line.trim());
    case "remove_blanks": return lines.filter((line) => line.trim().length > 0);
    case "unique": {
      const seen = new Set();
      return lines.filter((line) => {
        const key = step.caseSensitive ? line : line.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    case "sort_asc": return [...lines].sort((a, b) => a.localeCompare(b));
    case "sort_desc": return [...lines].sort((a, b) => b.localeCompare(a));
    case "keep_contains": return lines.filter((line) => includesLiteral(line, step.value, step.caseSensitive));
    case "drop_contains": return lines.filter((line) => !includesLiteral(line, step.value, step.caseSensitive));
    case "replace":
      if (step.caseSensitive) return lines.map((line) => line.split(step.value).join(step.replacement));
      // Literal case-insensitive replacement with no regex injection from user input.
      return lines.map((line) => {
        const needle = step.value.toLowerCase();
        const lower = line.toLowerCase();
        let cursor = 0;
        let result = "";
        while (cursor < line.length) {
          const found = lower.indexOf(needle, cursor);
          if (found === -1) break;
          result += line.slice(cursor, found) + step.replacement;
          cursor = found + step.value.length;
        }
        return result + line.slice(cursor);
      });
    case "prefix": return lines.map((line) => step.value + line);
    case "suffix": return lines.map((line) => line + step.value);
    default: throw new LocalWorkflowError("invalid_step");
  }
}

export function runLocalWorkflow(input, steps) {
  if (typeof input !== "string" || input.length > MAX_WORKFLOW_INPUT) throw new LocalWorkflowError("input_too_large");
  const checked = normalizeWorkflowSteps(steps);
  if (checked.length === 0) throw new LocalWorkflowError("empty_workflow");
  let lines = input.length === 0 ? [] : input.split(/\r\n|\n|\r/);
  assertBudget(lines);
  const trace = [];
  for (const step of checked) {
    const beforeLines = lines.length;
    const beforeChars = lines.join("\n").length;
    const next = applyStep(lines, step);
    assertBudget(next);
    trace.push({
      id: step.id, kind: step.kind,
      label: WORKFLOW_OPERATIONS.find((item) => item.kind === step.kind).label,
      beforeLines, afterLines: next.length,
      beforeChars, afterChars: next.join("\n").length,
      changed: next.length !== lines.length || next.some((line, index) => line !== lines[index]),
    });
    lines = next;
  }
  return { output: lines.join("\n"), outputLines: lines.length, trace };
}

export function exportWorkflowConfiguration(steps) {
  return JSON.stringify({ version: 1, steps: normalizeWorkflowSteps(steps) }, null, 2);
}
export function parseWorkflowConfiguration(json) {
  if (typeof json !== "string" || json.length > MAX_WORKFLOW_CONFIG) throw new LocalWorkflowError("invalid_config");
  let parsed;
  try { parsed = JSON.parse(json); }
  catch { throw new LocalWorkflowError("invalid_config"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== 1) {
    throw new LocalWorkflowError("invalid_config");
  }
  return normalizeWorkflowSteps(parsed.steps);
}
export function getWorkflowPreset(presetId) {
  const preset = WORKFLOW_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new LocalWorkflowError("invalid_config");
  return normalizeWorkflowSteps(preset.steps);
}
