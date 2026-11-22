import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  emptyQuestionBank, newQuestion, validateQuestionBankDraft, validateQuestionBank,
  parseQuestionBankJson, exportQuestionBankJson, learnerQuestionPreview,
  questionBankSummary, QUESTION_BANK_LIMITS,
} from "../src/lib/educationQuestionBank.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const component = read("src/pages/EducationInstructorStudio.tsx");
const education = read("src/pages/Education.tsx");
const routes = read("src/App.tsx");
const qid = "question-123";

function readyBank() {
  const q = newQuestion("multiple_choice", qid);
  q.text = "What is cathodic protection?";
  q.options[0].text = "Corrosion control";
  q.options[0].correct = true;
  q.options[1].text = "Surface painting only";
  const tf = newQuestion("true_false", "question-456");
  tf.text = "Does coating reduce current demand?";
  tf.options[0].correct = true;
  const essay = newQuestion("short_answer", "question-789");
  essay.text = "Explain polarization in your own words.";
  return {
    version: 1,
    title: "CP fundamentals",
    description: "Corrosion prevention and field practice.",
    duration_minutes: 40,
    questions: [q, tf, essay],
  };
}

test("1: new local banks start empty and are not falsely marked export-ready", () => {
  const bank = emptyQuestionBank();
  assert.equal(bank.version, 1);
  assert.equal(bank.questions.length, 0);
  assert.equal(validateQuestionBankDraft(bank).valid, true);
  const r = validateQuestionBank(bank);
  assert.equal(r.valid, false);
  assert.ok(r.issues.some(x => /Add at least one question/.test(x)));
});

test("2: MCQ, true/false and written editor inputs create truthful draft structures", () => {
  const mcq = newQuestion("multiple_choice", "mcq-1");
  const tf = newQuestion("true_false", "tf-1");
  const written = newQuestion("short_answer", "essay-1");
  assert.equal(mcq.options.length, 2);
  assert.deepEqual(tf.options.map(o => o.text), ["True", "False"]);
  assert.equal(written.options.length, 0);
  assert.equal(tf.options.filter(o => o.correct).length, 0);
  assert.throws(() => newQuestion("unsafe", "test"));
});

test("3: a complete mixed-type bank validates without fabricated scores", () => {
  const bank = readyBank();
  assert.deepEqual(validateQuestionBank(bank), { valid: true, issues: [] });
  const summary = questionBankSummary(bank);
  assert.equal(summary.count, 3);
  assert.equal(summary.maxPoints, 3);
  assert.deepEqual(summary.types, {multiple_choice:1, true_false:1, short_answer:1});
});

test("4: MCQs must have exactly one correct choice", () => {
  const bank = readyBank();
  bank.questions[0].options[0].correct = false;
  assert.ok(validateQuestionBank(bank).issues.some(x => /exactly one correct/.test(x)));
  bank.questions[0].options[0].correct = true;
  bank.questions[0].options[1].correct = true;
  assert.equal(validateQuestionBank(bank).valid, false);
});

test("5: missing, mismatched or blank true/false choices cannot pass review", () => {
  const bank = readyBank();
  bank.questions[1].options[0].text = "Yes";
  assert.match(validateQuestionBank(bank).issues.join(" "), /True and False/);
  bank.questions[1].options[0].text = "True";
  bank.questions[1].options.pop();
  assert.equal(validateQuestionBankDraft(bank).valid, false);
});

test("6: shape validation rejects duplicate IDs, unsupported types and malformed choices", () => {
  const bank = readyBank();
  bank.questions[1].id = bank.questions[0].id;
  assert.equal(validateQuestionBankDraft(bank).valid, false);
  bank.questions[1].id = "different";
  bank.questions[2].type = "hacked";
  assert.equal(validateQuestionBankDraft(bank).valid, false);
  bank.questions[2].type = "short_answer";
  bank.questions[2].options.push({id:"bad",text:"illegal",correct:false});
  assert.equal(validateQuestionBankDraft(bank).valid, false);
});

test("7: limit and malformed numeric fields are checked before accepting drafts", () => {
  const bank = readyBank();
  bank.duration_minutes = 0;
  assert.equal(validateQuestionBankDraft(bank).valid, false);
  bank.duration_minutes = 30;
  bank.questions[0].points = Number.NaN;
  assert.equal(validateQuestionBankDraft(bank).valid, false);
  bank.questions[0].points = 1;
  bank.questions[0].options[0].text = "x".repeat(QUESTION_BANK_LIMITS.option + 1);
  assert.equal(validateQuestionBankDraft(bank).valid, false);
  bank.questions[0].options[0].text = "ok";
  bank.questions = Array.from({length:101}, (_,i) => ({
    ...newQuestion("short_answer", "question-" + i), text:"Long explanation",
  }));
  assert.equal(validateQuestionBankDraft(bank).valid, false);
});

test("8: JSON draft export preserves incomplete edits without falsely publishing", () => {
  const bank = emptyQuestionBank();
  const result = exportQuestionBankJson(bank);
  assert.deepEqual(parseQuestionBankJson(result), bank);
  assert.throws(() => exportQuestionBankJson(bank, true), /title|question/i);
});

test("9: valid instructor bank JSON is Unicode-safe and round trips", () => {
  const bank = readyBank();
  bank.title = "حفاظتِ سنکنرن — CP";
  bank.questions[0].text = "ما هو التيار؟";
  const json = exportQuestionBankJson(bank, true);
  assert.deepEqual(parseQuestionBankJson(json), bank);
  assert.match(json, /حفاظتِ/);
});

test("10: imports reject oversize, invalid JSON and unsupported format versions", () => {
  assert.throws(() => parseQuestionBankJson("{"), /valid JSON/);
  assert.throws(() => parseQuestionBankJson("a".repeat(QUESTION_BANK_LIMITS.fileBytes + 1)), /smaller than/);
  assert.throws(() => parseQuestionBankJson(JSON.stringify({...readyBank(),version:99})), /Unsupported/);
  assert.throws(() => parseQuestionBankJson(JSON.stringify({__proto__:null})), /Unsupported/);
});

test("11: imported unknown fields are discarded, not trusted", () => {
  const original = readyBank();
  original.admin = true;
  original.questions[0].is_correct = true;
  original.questions[0].options[0].sql = "ignore this";
  const parsed = parseQuestionBankJson(JSON.stringify(original));
  assert.equal("admin" in parsed, false);
  assert.equal("is_correct" in parsed.questions[0], false);
  assert.equal("sql" in parsed.questions[0].options[0], false);
});

test("12: learner previews omit all correctness flags while retaining question text", () => {
  const bank = readyBank();
  const student = learnerQuestionPreview(bank);
  assert.equal(student.length, 3);
  assert.equal(student[0].text, "What is cathodic protection?");
  assert.equal(student[0].options[0].text, "Corrosion control");
  assert.equal("correct" in student[0].options[0], false);
  assert.equal("is_correct" in student[0], false);
  assert.equal("description" in student[0], false);
});

test("13: student-safe previews reject corrupt drafts instead of rendering misleading content", () => {
  const bank = readyBank();
  bank.questions[0].type = "not-a-type";
  assert.throws(() => learnerQuestionPreview(bank), /malformed|Invalid/);
  assert.match(component, /draftCheck.valid \? learnerQuestionPreview\(bank\) : \[\]/);
});

test("14: local studio includes functional choice editing, reorder and deletion controls", () => {
  for(const token of ["addQuestion", "changeOption", "chooseCorrect", "moveQuestion", "deleteQuestion",
    "addOption", "removeOption", "Import JSON", "Save draft JSON", "Export validated bank",
    "Learner preview", "Download", "Question type", "Mark choice "]) {
    assert.ok(component.includes(token), "Missing local editor behavior: " + token);
  }
  assert.match(component, /crypto\.randomUUID\(\)/);
  assert.match(component, /window\.confirm\(/);
});

test("15: imports and downloads use local files, without API writes or fabricated roles", () => {
  assert.match(component, /await file\.text\(\)/);
  assert.match(component, /file\.size > QUESTION_BANK_LIMITS\.fileBytes/);
  assert.match(component, /new Blob\(\[content\]/);
  assert.match(component, /nothing is automatically saved/);
  assert.match(component, /does not grant an instructor role/);
  assert.doesNotMatch(component, /\.from\(["'](?:options|questions|tests|user_roles)["']\)|supabase\.rpc|fetch\(/);
});

test("16: Education lists local authoring as a separate activity, behind authentication", () => {
  assert.match(education, /isAuthenticated && \(/);
  assert.match(education, /Open Question Bank Studio/);
  assert.match(education, /does not publish assessments or grant an instructor role/);
  assert.match(education, /to="\/education\/question-bank"/);
  assert.match(routes, /<Route path="\/education\/question-bank" element=\{<RequireAuth><EducationInstructorStudio \/><\/RequireAuth>\} \/>/);
});

test("17: preview editor compiles as TSX and follows primary/accent design tokens", () => {
  const ast = ts.createSourceFile("EducationInstructorStudio.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText,"\n")), []);
  assert.match(component, /from-primary\/10 via-card to-accent\/10/);
  assert.match(component, /bg-primary text-primary-foreground/);
});
