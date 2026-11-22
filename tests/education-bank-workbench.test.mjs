import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  createBankUndoHistory, duplicateBankQuestion, moveBankQuestion,
  searchBankQuestions, duplicatePromptWarnings, questionIssueTargets,
} from "../src/lib/educationBankWorkbench.mjs";
import {
  emptyQuestionBank,newQuestion,validateQuestionBank,
  validateQuestionBankDraft,QUESTION_BANK_LIMITS,
} from "../src/lib/educationQuestionBank.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const page=read("src/pages/EducationInstructorStudio.tsx");
const guide=read("docs/EDUCATION_QUESTION_BANK_AUTHORING_QUALITY.md");
const mk=()=>{
  const a=newQuestion("multiple_choice","mcq-1");
  a.text="What protects a pipeline?";
  a.points=5;
  a.options[0].text="Cathodic protection";
  a.options[1].text="Sunshine";
  a.options[0].correct=true;
  const b=newQuestion("true_false","tf-2");
  b.text="Corrosion is an electrochemical process.";
  b.options[0].correct=true;
  const c=newQuestion("short_answer","essay-3");
  c.text="Explain polarization in steel.";
  return {version:1,title:"Corrosion Basics",description:"",
    duration_minutes:30,questions:[a,b,c]};
};
const idSequence=(...names)=>{
  let i=0;return ()=>names[i++];
};
test("01 full sample bank is a genuinely valid local assessment",()=>{
  assert.equal(validateQuestionBank(mk()).valid,true);
});
test("02 duplicate MCQ inserts immediately after selected question",()=>{
  const bank=mk(),copy=duplicateBankQuestion(bank,"mcq-1",
    idSequence("mcq-copy","copy-a","copy-b"));
  assert.equal(copy.bank.questions.length,4);
  assert.equal(copy.bank.questions[1].id,"mcq-copy");
  assert.equal(copy.questionId,"mcq-copy");
  assert.equal(copy.bank.questions[2].id,"tf-2");
});
test("03 copied answer choices retain text and correct flags but get new IDs",()=>{
  const bank=mk(),copy=duplicateBankQuestion(bank,"mcq-1",
    idSequence("mcq-copy","copy-a","copy-b"));
  assert.deepEqual(copy.bank.questions[1].options.map(x=>x.id),["copy-a","copy-b"]);
  assert.deepEqual(copy.bank.questions[1].options.map(x=>x.correct),[true,false]);
  assert.deepEqual(copy.bank.questions[1].options.map(x=>x.text),[
    "Cathodic protection","Sunshine",
  ]);
  assert.equal(validateQuestionBank(copy.bank).valid,true);
});
test("04 duplication preserves original bank immutably",()=>{
  const bank=mk(),before=JSON.stringify(bank);
  duplicateBankQuestion(bank,"mcq-1",idSequence("dup","dup1","dup2"));
  assert.equal(JSON.stringify(bank),before);
});
test("05 short-answer copies have no hidden answer choices",()=>{
  const copy=duplicateBankQuestion(mk(),"essay-3",idSequence("essay-copy"));
  assert.deepEqual(copy.bank.questions[3].options,[]);
  assert.equal(copy.bank.questions[3].text,"Explain polarization in steel.");
});
test("06 true/false copies receive new choice IDs, retaining one correct key",()=>{
  const copy=duplicateBankQuestion(mk(),"tf-2",
    idSequence("tf-copy","tf-copy-t","tf-copy-f"));
  assert.equal(copy.bank.questions[2].type,"true_false");
  assert.deepEqual(copy.bank.questions[2].options.map(x=>x.correct),[true,false]);
});
test("07 duplicate refuses a nonexistent question",()=>{
  assert.throws(()=>duplicateBankQuestion(mk(),"missing",()=> "copy"),/not found/);
});
test("08 duplicate rejects a reused question ID",()=>{
  assert.throws(()=>duplicateBankQuestion(mk(),"mcq-1",()=> "tf-2"),/Duplicate/);
});
test("09 duplicate rejects an existing option ID even on another question",()=>{
  assert.throws(()=>duplicateBankQuestion(mk(),"mcq-1",
    idSequence("copy","mcq-1-a")) ,/Duplicate/);
});
test("10 duplicate rejects invalid generated IDs",()=>{
  assert.throws(()=>duplicateBankQuestion(mk(),"mcq-1",()=> "not valid!"),/invalid/);
});
test("11 no duplication can exceed the 100-question bank limit",()=>{
  const bank=mk();bank.questions=Array.from({length:QUESTION_BANK_LIMITS.questions},
    (_,i)=>({...newQuestion("short_answer","essay-"+i),text:"Question "+i}));
  assert.equal(validateQuestionBankDraft(bank).valid,true);
  assert.throws(()=>duplicateBankQuestion(bank,"essay-1",()=> "copy"),/100-question/);
});
test("12 malformed bank and invalid factory do not mutate content",()=>{
  const bank=mk();bank.questions[0].points=-1;
  assert.throws(()=>duplicateBankQuestion(bank,"mcq-1",()=> "copy"),/valid local/);
  assert.throws(()=>duplicateBankQuestion(mk(),"mcq-1",null),/valid local/);
});
test("13 moving a question maintains exact ordering and ownership",()=>{
  const bank=mk(),moved=moveBankQuestion(bank,"tf-2",-1);
  assert.deepEqual(moved.questions.map(q=>q.id),["tf-2","mcq-1","essay-3"]);
  assert.deepEqual(bank.questions.map(q=>q.id),["mcq-1","tf-2","essay-3"]);
  assert.equal(validateQuestionBank(moved).valid,true);
});
test("14 out-of-range move returns the same immutable bank",()=>{
  const bank=mk();
  assert.equal(moveBankQuestion(bank,"mcq-1",-1),bank);
  assert.equal(moveBankQuestion(bank,"essay-3",1),bank);
  assert.equal(moveBankQuestion(bank,"missing",1),bank);
});
test("15 text search is case-insensitive and preserves original ordinal",()=>{
  const result=searchBankQuestions(mk()," PROTECTs ");
  assert.deepEqual(result.map(x=>[x.id,x.index]),[["mcq-1",0]]);
});
test("16 type filter operates on actual question types",()=>{
  const bank=mk();
  assert.deepEqual(searchBankQuestions(bank,"","short_answer").map(x=>x.id),["essay-3"]);
  assert.deepEqual(searchBankQuestions(bank,"","true_false").map(x=>x.index),[1]);
  assert.equal(searchBankQuestions(bank,"","all").length,3);
});
test("17 invalid filters cannot masquerade as a valid query",()=>{
  assert.throws(()=>searchBankQuestions(mk(),"","graded"),/filter/);
  assert.throws(()=>searchBankQuestions(mk(),null),/filter/);
  assert.throws(()=>searchBankQuestions(null),/filter/);
});
test("18 empty question search does not invent results",()=>{
  assert.deepEqual(searchBankQuestions(mk(),"unmatched phrase"),[]);
});
test("19 repeated prompts are flagged without changing grading",()=>{
  const bank=mk();
  bank.questions[2].text="  WHAT   protects A pipeline?  ";
  assert.deepEqual(duplicatePromptWarnings(bank),[
    {questionId:"essay-3",questionNumber:3,firstNumber:1},
  ]);
  assert.equal(validateQuestionBank(bank).valid,true);
});
test("20 empty placeholder text does not cause duplicate warnings",()=>{
  const bank=mk();bank.questions[0].text=" ";bank.questions[1].text=" ";
  assert.deepEqual(duplicatePromptWarnings(bank),[]);
});
test("21 readiness issue labels link to the actual question",()=>{
  const bank=mk();bank.questions[1].options[0].correct=false;
  const issues=validateQuestionBank(bank).issues;
  assert.deepEqual(questionIssueTargets(bank,issues).map(x=>x.id),["tf-2"]);
});
test("22 global bank issues cannot be misidentified as question failures",()=>{
  const bank=mk();
  assert.deepEqual(questionIssueTargets(bank,[
    "Bank title, description or duration is invalid.","Question 999: unknown",
  ]),[]);
});
test("23 history edit pushes snapshots and undo restores previous content",()=>{
  const history=createBankUndoHistory(mk());
  history.edit(bank=>({...bank,title:"Edited"}));
  assert.equal(history.status().undoCount,1);
  assert.equal(history.undo().bank.title,"Corrosion Basics");
});
test("24 redo restores state without rewriting original snapshots",()=>{
  const history=createBankUndoHistory(mk());
  history.edit(bank=>({...bank,title:"New Title"}));
  history.undo();
  assert.equal(history.redo().bank.title,"New Title");
});
test("25 editing after undo drops outdated redo branch",()=>{
  const history=createBankUndoHistory(mk());
  history.edit(bank=>({...bank,title:"One"}));
  history.undo();
  history.edit(bank=>({...bank,title:"Two"}));
  assert.equal(history.status().redoCount,0);
  assert.equal(history.redo().bank.title,"Two");
});
test("26 unchanged edits do not pollute history",()=>{
  const history=createBankUndoHistory(mk());
  history.edit(bank=>bank);
  assert.equal(history.status().undoCount,0);
});
test("27 history bounded to 30 steps, preventing unbounded answer-key snapshots",()=>{
  const history=createBankUndoHistory(mk(),30);
  for(let i=0;i<90;i++)history.edit(bank=>({...bank,title:"Revision"+i}));
  assert.equal(history.status().undoCount,30);
  for(let i=0;i<40;i++)history.undo();
  assert.equal(history.status().undoCount,0);
});
test("28 incomplete editor keystrokes remain undoable",()=>{
  const history=createBankUndoHistory(mk());
  history.edit(bank=>({...bank,duration_minutes:0}));
  assert.equal(history.status().bank.duration_minutes,0);
  assert.equal(validateQuestionBankDraft(history.status().bank).valid,false);
  assert.equal(history.undo().bank.duration_minutes,30);
});
test("29 imported draft reset erases all previous undo and redo snapshots",()=>{
  const history=createBankUndoHistory(mk());
  history.edit(bank=>({...bank,title:"Sensitive old answer bank"}));
  history.undo();
  const fresh=emptyQuestionBank();
  history.reset(fresh);
  assert.equal(history.status().bank,fresh);
  assert.equal(history.status().undoCount,0);
  assert.equal(history.status().redoCount,0);
  assert.equal(history.redo().bank,fresh);
});
test("30 invalid history configuration and bad reset reject unsafe changes",()=>{
  assert.throws(()=>createBankUndoHistory(null),/Invalid/);
  assert.throws(()=>createBankUndoHistory(mk(),0),/Invalid/);
  assert.throws(()=>createBankUndoHistory(mk(),101),/Invalid/);
  const history=createBankUndoHistory(mk());
  assert.throws(()=>history.reset(null),/Invalid/);
  assert.throws(()=>history.edit(()=>null),/Invalid/);
});
test("31 instructor editor clears every local answer key on account switch",()=>{
  assert.match(page,/useLayoutEffect\(\(\) => \{/);
  assert.match(page,/if \(currentUserRef\.current === user\?\.id\) return/);
  assert.match(page,/resetEditor\(emptyQuestionBank\(\) as Bank\)/);
  assert.match(page,/setSourceDraftId\(null\)/);
  assert.match(page,/historyController\.reset\(next\)/);
});
test("32 server draft load and JSON import reset old undo snapshots",()=>{
  assert.match(page,/resetEditor\(draft\.bank as Bank\)/);
  assert.match(page,/resetEditor\(parsed\)/);
  assert.match(page,/setSourceDraftId\(null\)/);
});
test("33 original instructor authorization and private server save are preserved",()=>{
  assert.match(page,/readInstructorAccess/);
  assert.match(page,/readInstructorDrafts/);
  assert.match(page,/createInstructorDraft\(bank\)/);
  assert.match(page,/requestEducationPublication\(draftId\)/);
});
test("34 visible editor undo and redo use bounded pure-history controller",()=>{
  assert.match(page,/createBankUndoHistory/);
  assert.match(page,/travelHistory\("undo"\)/);
  assert.match(page,/travelHistory\("redo"\)/);
  assert.match(page,/historyCounts\.undo === 0/);
  assert.match(page,/historyCounts\.redo === 0/);
});
test("35 duplicate action uses fresh UUIDs for question and options",()=>{
  assert.match(page,/duplicateBankQuestion\(bank, active\.id, \(\) => crypto\.randomUUID\(\)\)/);
  assert.match(page,/setActiveId\(duplicate\.questionId\)/);
  assert.match(page,/100-question limit/);
});
test("36 question search and type filters are visible and resettable",()=>{
  assert.match(page,/searchBankQuestions\(bank, questionSearch, questionTypeFilter\)/);
  assert.match(page,/id="authoring-question-search"/);
  assert.match(page,/id="authoring-question-type"/);
  assert.match(page,/Clear question filters/);
});
test("37 first genuine validation issue can be opened directly",()=>{
  assert.match(page,/questionIssueTargets\(bank, readiness\.issues\)/);
  assert.match(page,/Jump to first question issue/);
  assert.match(page,/setActiveId\(issueTargets\[0\]\.id\)/);
});
test("38 repeated prompt warning is editorial, not a scoring rule",()=>{
  assert.match(page,/duplicatePromptWarnings\(bank\)/);
  assert.match(page,/Repeated question wording/);
  assert.match(page,/not automatic grading decisions/);
});
test("39 no automatic upload, local persistent answer-key storage or new feature flag",()=>{
  assert.doesNotMatch(page,/localStorage\.|sessionStorage\.|indexedDB\./);
  assert.doesNotMatch(page,/service_role|SUPABASE_SERVICE_ROLE/);
  assert.match(guide,/NOT DEPLOYED/);
  assert.match(guide,/production/i);
});

test("40 stale account draft fetch never restores an earlier user's answer key",()=>{
 assert.match(page,/const generation = accountGenerationRef\.current;[\s\S]*const draft = await loadInstructorDraft\(draftId\);[\s\S]*if \(generation !== accountGenerationRef\.current\) return;[\s\S]*resetEditor\(draft\.bank as Bank\)/);
});
test("41 stale account JSON import never restores earlier answer keys",()=>{
 assert.match(page,/const parsed = parseQuestionBankJson\(await file\.text\(\)\) as Bank;\s+if \(generation !== accountGenerationRef\.current\) return;\s+resetEditor\(parsed\)/);
});
test("42 account changes increment generation and clear all undo snapshots before paint",()=>{
 assert.match(page,/accountGenerationRef\.current \+= 1;\s+resetEditor\(emptyQuestionBank\(\) as Bank\)/);
 assert.match(page,/useLayoutEffect/);
});
test("43 stale remote draft save cannot attach an old account's draft ID",()=>{
 assert.match(page,/const created = await createInstructorDraft\(bank\);\s+if \(generation !== accountGenerationRef\.current\) return;/);
});
test("44 stale publication confirmation cannot surface in a newly signed-in account",()=>{
 assert.match(page,/await requestEducationPublication\(draftId\);\s+if \(generation !== accountGenerationRef\.current\) return;/);
});
