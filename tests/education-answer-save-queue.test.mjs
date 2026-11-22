import test from "node:test";
import assert from "node:assert/strict";
import { createEducationAnswerSaveQueue } from "../src/lib/educationAnswerSaveQueue.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}
const answer=(questionId,text)=>({questionId,shortAnswer:text});

test("1. Empty queue flush is harmless and does not create a server write",async()=>{
  let calls=0;
  const q=createEducationAnswerSaveQueue(async()=>{calls++;});
  assert.equal(q.hasUnsaved(),false);
  await q.flush();
  assert.equal(calls,0);
});
test("2. The newest queued answer wins before the first request",async()=>{
  const writes=[];
  const q=createEducationAnswerSaveQueue(async item=>writes.push(item));
  q.enqueue(answer("essay","first"));
  q.enqueue(answer("essay","second"));
  q.enqueue(answer("essay","latest"));
  assert.equal(q.pendingCount(),1);
  await q.flush();
  assert.deepEqual(writes,[answer("essay","latest")]);
  assert.equal(q.hasUnsaved(),false);
});
test("3. Two distinct questions flush without erasing each other",async()=>{
  const writes=[];
  const q=createEducationAnswerSaveQueue(async item=>writes.push(item));
  q.enqueue(answer("first","one"));
  q.enqueue(answer("second","two"));
  await q.flush();
  assert.deepEqual(writes,[answer("first","one"),answer("second","two")]);
});
test("4. An edit arriving in-flight is saved AFTER older request confirms",async()=>{
  const first=deferred(),writes=[];
  const q=createEducationAnswerSaveQueue(async item=>{
    writes.push(item);
    if(writes.length===1)await first.promise;
  });
  q.enqueue(answer("essay","old"));
  const busy=q.flush();
  q.enqueue(answer("essay","new"));
  assert.equal(q.hasUnsaved(),true);
  first.resolve();
  await busy;
  assert.deepEqual(writes,[answer("essay","old"),answer("essay","new")]);
  assert.equal(q.hasUnsaved(),false);
});
test("5. Concurrent flush callers share the same serialized operation",async()=>{
  const pending=deferred(),writes=[];
  const q=createEducationAnswerSaveQueue(async item=>{writes.push(item);await pending.promise;});
  q.enqueue(answer("one","A"));
  const a=q.flush(),b=q.flush(),c=q.flush();
  assert.equal(a,b);
  assert.equal(b,c);
  pending.resolve();
  await Promise.all([a,b,c]);
  assert.equal(writes.length,1);
});
test("6. A failed request requeues the unsaved answer for retry",async()=>{
  const writes=[];let fail=true;
  const q=createEducationAnswerSaveQueue(async item=>{
    writes.push(item);
    if(fail){fail=false;throw new Error("offline");}
  });
  q.enqueue(answer("essay","draft"));
  await assert.rejects(q.flush(),/offline/);
  assert.equal(q.hasUnsaved(),true);
  assert.equal(q.pendingCount(),1);
  await q.flush();
  assert.deepEqual(writes,[answer("essay","draft"),answer("essay","draft")]);
  assert.equal(q.hasUnsaved(),false);
});
test("7. A failed older in-flight answer never replaces newer text",async()=>{
  const first=deferred(),writes=[];
  const q=createEducationAnswerSaveQueue(async item=>{
    writes.push(item);
    if(writes.length===1)await first.promise;
  });
  q.enqueue(answer("essay","old"));
  const flush=q.flush();
  q.enqueue(answer("essay","newer"));
  first.reject(new Error("offline"));
  await assert.rejects(flush,/offline/);
  assert.equal(q.pendingCount(),1);
  await q.flush();
  assert.deepEqual(writes,[answer("essay","old"),answer("essay","newer")]);
});
test("8. Failure on later question keeps all remaining responses",async()=>{
  const writes=[];let shouldFail=true;
  const q=createEducationAnswerSaveQueue(async item=>{
    writes.push(item.questionId);
    if(item.questionId==="two"&&shouldFail){shouldFail=false;throw new Error("unstable");}
  });
  q.enqueue(answer("one","A"));
  q.enqueue(answer("two","B"));
  q.enqueue(answer("three","C"));
  await assert.rejects(q.flush(),/unstable/);
  assert.equal(q.pendingCount(),2);
  await q.flush();
  assert.deepEqual(writes,["one","two","two","three"]);
});
test("9. Clearing a response is persisted as the latest empty answer",async()=>{
  const writes=[];
  const q=createEducationAnswerSaveQueue(async item=>writes.push(item));
  q.enqueue({questionId:"essay",shortAnswer:"before"});
  q.enqueue({questionId:"essay",shortAnswer:""});
  await q.flush();
  assert.equal(writes.length,1);
  assert.equal(writes[0].shortAnswer,"");
});
test("10. Queued payloads are copies and cannot be changed by external mutation",async()=>{
  const item=answer("essay","first"),writes=[];
  const q=createEducationAnswerSaveQueue(async x=>writes.push(x));
  q.enqueue(item);
  item.shortAnswer="corrupted";
  await q.flush();
  assert.equal(writes[0].shortAnswer,"first");
});
test("11. A disposed queue refuses future edits or flushes",async()=>{
  const q=createEducationAnswerSaveQueue(async()=>{throw Error("should not write");});
  q.enqueue(answer("one","A"));
  q.dispose();
  assert.equal(q.pendingCount(),0);
  assert.throws(()=>q.enqueue(answer("two","B")),/closed/);
  await assert.rejects(q.flush(),/closed/);
});
test("12. Disposed pending queue does not process remaining queued items",async()=>{
  const first=deferred(),writes=[];
  const q=createEducationAnswerSaveQueue(async x=>{
    writes.push(x.questionId);
    if(x.questionId==="one")await first.promise;
  });
  q.enqueue(answer("one","A"));
  q.enqueue(answer("two","B"));
  const running=q.flush();
  q.dispose();
  first.resolve();
  await assert.rejects(running,/closed/);
  assert.deepEqual(writes,["one"]);
});
test("13. A failed disposed in-flight request is never requeued",async()=>{
  const pending=deferred();
  const q=createEducationAnswerSaveQueue(async()=>pending.promise);
  q.enqueue(answer("essay","A"));
  const flush=q.flush();
  q.dispose();
  pending.reject(new Error("offline"));
  await assert.rejects(flush,/offline/);
  assert.equal(q.pendingCount(),0);
});
test("14. Invalid save adapter and missing question identity are rejected",()=>{
  assert.throws(()=>createEducationAnswerSaveQueue(null),/save function/);
  const q=createEducationAnswerSaveQueue(async()=>{});
  assert.throws(()=>q.enqueue({}),/question identifier/);
  assert.throws(()=>q.enqueue({questionId:""}),/question identifier/);
});
