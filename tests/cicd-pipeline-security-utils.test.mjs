import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWorkflowSecurity } from "../src/lib/cicdPipelineSecurityUtils.mjs";

test("reports missing least-privilege permissions", () => {
 const result=analyzeWorkflowSecurity("name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n");
 assert.ok(result.findings.some(x=>x.id==="PERMISSIONS_MISSING"));
});
test("accepts full SHA pins and flags mutable action tags", () => {
 const source="permissions: {}\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567\n";
 assert.equal(analyzeWorkflowSecurity(source).findings.filter(x=>x.id==="UNPINNED_ACTION").length,1);
});
test("detects persisted checkout credentials and broad write permissions", () => {
 const source="permissions: write-all\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          persist-credentials: true\n";
 const ids=analyzeWorkflowSecurity(source).findings.map(x=>x.id);
 assert.ok(ids.includes("PERMISSIONS_WRITE_ALL"));assert.ok(ids.includes("CHECKOUT_PERSIST_CREDENTIALS"));
});
test("detects privileged pull request checkout and shell expression injection", () => {
 const source="on:\n  pull_request_target:\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - run: echo ${{ github.event.pull_request.title }}\n";
 const ids=analyzeWorkflowSecurity(source).findings.map(x=>x.id);
 assert.ok(ids.includes("PULL_REQUEST_TARGET_CHECKOUT"));assert.ok(ids.includes("EXPRESSION_INJECTION"));
});
test("detects secret logging and inherited secrets", () => {
 const source="jobs:\n  call:\n    uses: org/repo/.github/workflows/reuse.yml@main\n    secrets: inherit\n  test:\n    steps:\n      - run: echo ${{ secrets.DEPLOY_TOKEN }}\n";
 const ids=analyzeWorkflowSecurity(source).findings.map(x=>x.id);
 assert.ok(ids.includes("SECRET_LOGGING"));assert.ok(ids.includes("SECRETS_INHERIT"));assert.ok(ids.includes("UNPINNED_ACTION"));
});
test("validates empty and oversized inputs", () => {
 assert.throws(()=>analyzeWorkflowSecurity("  "),/Paste a GitHub Actions workflow/);
 assert.throws(()=>analyzeWorkflowSecurity("x".repeat(100001)),/100,000/);
});
test("returns severity totals and line numbers", () => {
 const result=analyzeWorkflowSecurity("name: CI\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
 const finding=result.findings.find(x=>x.id==="UNPINNED_ACTION");
 assert.equal(finding.line,5);assert.equal(result.summary.high,1);assert.equal(result.summary.total,result.findings.length);
});
