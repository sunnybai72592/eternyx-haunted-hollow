import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const requestSource = await read("src/lib/ai/studio-chat-request.ts");
const bridge = await read("src/lib/ai/studio-chat-bridge.ts");
const hook = await read("src/hooks/useAIStudioChat.ts");
const writing = await read("src/pages/AIWritingStudio.tsx");
const coding = await read("src/pages/AICodingStudio.tsx");
const hub = await read("src/pages/AIArsenal.tsx");

const compiled = ts.transpileModule(requestSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const request = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("the studio chat bridge supports exactly the agreed writing and coding feature keys", () => {
  assert.deepEqual([...request.STUDIO_CHAT_FEATURES], [
    "ai.writing.generate", "ai.writing.translate", "ai.coding.assist", "ai.coding.review",
  ]);
  for (const key of request.STUDIO_CHAT_FEATURES) {
    const message = request.prepareStudioChatMessage(key, "  Sample source  ");
    assert.ok(message.includes(key));
    assert.ok(message.includes("Sample source"));
    assert.ok(message.includes("untrusted data"));
  }
});

test("request shaping rejects unknown operations, missing content, and oversized data without truncation", () => {
  assert.throws(() => request.prepareStudioChatMessage("ai.video.text_to_video", "x"), { code: "unsupported_feature" });
  assert.throws(() => request.prepareStudioChatMessage("ai.writing.generate", " "), { code: "invalid_prompt" });
  assert.throws(() => request.prepareStudioChatMessage("ai.writing.generate", "x".repeat(4000)), { code: "too_long" });
  assert.equal(request.STUDIO_CHAT_MAX_MESSAGE_LENGTH, 4000);
  const message = request.prepareStudioChatMessage("ai.coding.review", "hello");
  assert.ok(message.length < 4000);
  assert.ok(!message.includes("undefined"));
});

test("authenticated AI chat invocation is explicit, bounded, and charged through ai.chat only", () => {
  assert.match(bridge, /supabase\.functions\.invoke\("eternyx-ai-chat"/);
  assert.match(bridge, /prepareStudioChatMessage\(featureKey, prompt\)/);
  assert.match(bridge, /requestId: crypto\.randomUUID\(\)/);
  assert.doesNotMatch(bridge, /service_role|SUPABASE_SERVICE_ROLE|GROQ_API_KEY|VITE_OPENAI_API_KEY/);
  assert.doesNotMatch(bridge, /setInterval\(|setTimeout\(|retry\(/);
  assert.match(bridge, /status === 401/);
  assert.match(bridge, /status === 402/);
  assert.match(bridge, /status === 403 \|\| status === 409/);
  assert.match(bridge, /UUID_PATTERN\.test\(data\.sessionId\)/);
});

test("the shared hook blocks concurrent requests and discards stale responses after edits", () => {
  assert.match(hook, /if \(inFlight\.current\) return/);
  assert.match(hook, /requestVersion\.current \+= 1/);
  assert.match(hook, /requestVersion\.current === version/);
  assert.match(hook, /inFlight\.current = false/);
  assert.match(hook, /Shorten the source before sending/);
  assert.match(hook, /in-flight requests cannot be cancelled|In-flight requests cannot be cancelled/);
});

test("both studios keep local utilities and expose user-initiated AI results with a billing warning", () => {
  for (const page of [writing, coding]) {
    assert.match(page, /useAIStudioChat/);
    assert.match(page, /ai\.invalidate\(\)/);
    assert.match(page, /ai\.run\(request\.featureKey/);
    assert.match(page, /ai\.loading/);
    assert.match(page, /ai\.error/);
    assert.match(page, /ai\.result/);
    assert.match(page, /chat credits|AI chat credits/);
    assert.match(page, /role="alert"/);
    assert.match(page, /whitespace-pre-wrap/);
    assert.doesNotMatch(page, /supabase\.functions\.invoke\(/);
  }
  assert.match(writing, /Generate with AI Chat/);
  assert.match(coding, /Review with AI Chat/);
  assert.match(coding, /Explain with AI Chat/);
  assert.match(hub, /Local tools \+ opt-in AI Chat/);
});
