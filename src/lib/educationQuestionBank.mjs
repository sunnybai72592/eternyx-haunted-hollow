/**
 * Local-only ETERNYX question-bank authoring. No database reads or uploads.
 * Educator answer keys must never be placed in student-facing data.
 */
export const QUESTION_BANK_VERSION = 1;
export const QUESTION_BANK_LIMITS = Object.freeze({
  fileBytes: 256_000, questions: 100, choices: 8,
  title: 160, description: 1500, question: 2000,
  option: 500, points: 1000,
});
export const QUESTION_TYPES = Object.freeze(["multiple_choice", "true_false", "short_answer"]);

export function emptyQuestionBank() {
  return { version: QUESTION_BANK_VERSION, title: "", description: "", duration_minutes: 30, questions: [] };
}
export function newQuestion(type, id) {
  if (!QUESTION_TYPES.includes(type) || typeof id !== "string" || !/^[\w-]{1,64}$/.test(id)) {
    throw new Error("Invalid new question type or identifier.");
  }
  const choices = type === "short_answer" ? [] : type === "true_false"
    ? [{ id: id + "-true", text: "True", correct: false }, { id: id + "-false", text: "False", correct: false }]
    : [{ id: id + "-a", text: "", correct: false }, { id: id + "-b", text: "", correct: false }];
  return { id, type, text: "", points: 1, options: choices };
}
const textWithin = (v, max) => typeof v === "string" && v.length <= max;
const safeId = v => typeof v === "string" && /^[a-z0-9_-]{1,64}$/i.test(v);

/** Import validation accepts incomplete drafts but never treats them as privileged content. */
export function validateQuestionBankDraft(bank) {
  const issues = [];
  if (!bank || typeof bank !== "object" || Array.isArray(bank) ||
      bank.version !== QUESTION_BANK_VERSION || !Array.isArray(bank.questions)) {
    return { valid: false, issues: ["Unsupported or malformed question-bank format."] };
  }
  if (!textWithin(bank.title, QUESTION_BANK_LIMITS.title) ||
      !textWithin(bank.description, QUESTION_BANK_LIMITS.description) ||
      !Number.isInteger(bank.duration_minutes) ||
      bank.duration_minutes < 1 || bank.duration_minutes > 1440) {
    issues.push("Bank title, description or duration is invalid.");
  }
  if (bank.questions.length > QUESTION_BANK_LIMITS.questions) {
    issues.push("Question bank exceeds 100 questions.");
  }
  const questionIds = new Set();
  for (const [index, q] of bank.questions.entries()) {
    const at = "Question " + (index + 1);
    if (!q || typeof q !== "object" || Array.isArray(q) ||
        !safeId(q.id) || questionIds.has(q.id) || !QUESTION_TYPES.includes(q.type) ||
        !textWithin(q.text, QUESTION_BANK_LIMITS.question) ||
        !Number.isInteger(q.points) || q.points < 1 || q.points > QUESTION_BANK_LIMITS.points ||
        !Array.isArray(q.options)) {
      issues.push(at + ": malformed question details.");
      continue;
    }
    questionIds.add(q.id);
    if (q.type === "short_answer" && q.options.length) issues.push(at + ": short-answer items cannot have choices.");
    if (q.type === "true_false" && q.options.length !== 2) issues.push(at + ": true/false requires two choices.");
    if (q.type === "multiple_choice" && (q.options.length < 2 || q.options.length > QUESTION_BANK_LIMITS.choices)) {
      issues.push(at + ": multiple choice needs two to eight choices.");
    }
    const choiceIds = new Set();
    for (const choice of q.options) {
      if (!choice || typeof choice !== "object" || Array.isArray(choice) ||
          !safeId(choice.id) || choiceIds.has(choice.id) ||
          !textWithin(choice.text, QUESTION_BANK_LIMITS.option) ||
          typeof choice.correct !== "boolean") {
        issues.push(at + ": invalid or duplicate choice.");
        break;
      }
      choiceIds.add(choice.id);
    }
  }
  return { valid: issues.length === 0, issues };
}

/** Determine whether a draft is ready for instructor export; no fake scores. */
export function validateQuestionBank(bank) {
  const draft = validateQuestionBankDraft(bank);
  if (!draft.valid) return draft;
  const issues = [];
  if (bank.title.trim().length < 3) issues.push("Enter a question-bank title (at least 3 characters).");
  if (bank.questions.length === 0) issues.push("Add at least one question.");
  for (const [index, q] of bank.questions.entries()) {
    const at = "Question " + (index + 1);
    if (q.text.trim().length < 3) issues.push(at + ": enter a question (at least 3 characters).");
    if (q.type === "true_false" && (q.options[0].text.trim().toLowerCase() !== "true" ||
        q.options[1].text.trim().toLowerCase() !== "false")) {
      issues.push(at + ": true/false choices must read True and False.");
    }
    if (q.type !== "short_answer") {
      if (q.options.some(choice => !choice.text.trim())) issues.push(at + ": fill in every option.");
      if (q.options.filter(choice => choice.correct).length !== 1) issues.push(at + ": select exactly one correct answer.");
    }
  }
  return { valid: issues.length === 0, issues };
}

export function parseQuestionBankJson(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > QUESTION_BANK_LIMITS.fileBytes) {
    throw new Error("Question bank must be a JSON file smaller than 256 KB.");
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("The selected file is not valid JSON."); }
  const checked = validateQuestionBankDraft(parsed);
  if (!checked.valid) throw new Error(checked.issues.slice(0, 3).join(" "));
  // Canonicalize: ignore unknown imported properties rather than trusting them.
  return {
    version: QUESTION_BANK_VERSION, title: parsed.title, description: parsed.description,
    duration_minutes: parsed.duration_minutes,
    questions: parsed.questions.map(q => ({
      id: q.id, type: q.type, text: q.text, points: q.points,
      options: q.options.map(o => ({ id: o.id, text: o.text, correct: o.correct })),
    })),
  };
}

export function exportQuestionBankJson(bank, readyOnly = false) {
  const result = readyOnly ? validateQuestionBank(bank) : validateQuestionBankDraft(bank);
  if (!result.valid) throw new Error(result.issues.slice(0, 3).join(" "));
  return JSON.stringify(bank, null, 2) + "\n";
}

/** A student preview that does not include correctness flags or hidden keys. */
export function learnerQuestionPreview(bank) {
  const result = validateQuestionBankDraft(bank);
  if (!result.valid) throw new Error(result.issues[0]);
  return bank.questions.map(q => ({
    id: q.id, type: q.type, text: q.text, points: q.points,
    options: q.options.map(o => ({ id: o.id, text: o.text })),
  }));
}
export function questionBankSummary(bank) {
  const questions = Array.isArray(bank?.questions) ? bank.questions : [];
  return {
    count: questions.length,
    maxPoints: questions.reduce((total, q) => total + (Number.isInteger(q?.points) ? q.points : 0), 0),
    types: {
      multiple_choice: questions.filter(q => q.type === "multiple_choice").length,
      true_false: questions.filter(q => q.type === "true_false").length,
      short_answer: questions.filter(q => q.type === "short_answer").length,
    },
  };
}
