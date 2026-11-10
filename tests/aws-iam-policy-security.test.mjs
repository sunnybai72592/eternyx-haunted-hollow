import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAwsIamPolicy, buildAwsIamPolicyReport } from "../src/lib/awsIamPolicySecurityUtils.mjs";
const analyze = Statement => analyzeAwsIamPolicy({ policyText: JSON.stringify({ Version: "2012-10-17", Statement }) });
test("detects full administrator wildcard grants", () => {
 const result = analyze([{ Effect: "Allow", Action: "*", Resource: "*" }]);
 assert.ok(result.findings.some(item => item.id === "IAM_ACTION_WILDCARD" && item.severity === "critical"));
 assert.ok(result.findings.some(item => item.id === "IAM_RESOURCE_WILDCARD"));
});
test("detects broad action and resource patterns", () => {
 const result = analyze([{ Effect: "Allow", Action: "s3:*", Resource: "arn:aws:s3:::company-*" }]);
 assert.ok(result.findings.some(item => item.id === "IAM_ACTION_PATTERN_WILDCARD"));
 assert.ok(result.findings.some(item => item.id === "IAM_RESOURCE_PATTERN_WILDCARD"));
});
test("detects privilege-sensitive actions and NotAction", () => {
 const result = analyze([{ Effect: "Allow", NotAction: ["iam:DeleteUser"], Resource: "*" }, { Effect: "Allow", Action: "iam:PassRole", Resource: "*" }]);
 assert.ok(result.findings.some(item => item.id === "IAM_NOTACTION_ALLOW"));
 assert.ok(result.findings.some(item => item.id === "IAM_PRIVILEGE_SENSITIVE_ACTION"));
});
test("detects wildcard trust principal without conditions", () => {
 const result = analyze([{ Effect: "Allow", Principal: "*", Action: "sts:AssumeRole", Resource: "*" }]);
 assert.ok(result.findings.some(item => item.id === "IAM_TRUST_WILDCARD_PRINCIPAL" && item.severity === "critical"));
 assert.ok(result.findings.some(item => item.id === "IAM_TRUST_NO_CONDITION"));
});
test("recognizes account-root trust and constrained policy", () => {
 const result = analyze([{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::123456789012:root" }, Action: "sts:AssumeRole", Resource: "*", Condition: { StringEquals: { "sts:ExternalId": "example" } } }]);
 assert.ok(result.findings.some(item => item.id === "IAM_TRUST_ACCOUNT_ROOT"));
 assert.equal(result.findings.some(item => item.id === "IAM_TRUST_WILDCARD_PRINCIPAL"), false);
});
test("does not flag explicit least-privilege action and resource", () => {
 const result = analyze([{ Effect: "Allow", Action: ["s3:GetObject"], Resource: ["arn:aws:s3:::company-data/reports/*"], Condition: { StringEquals: { "aws:PrincipalOrgID": "o-example" } } }]);
 assert.equal(result.findings.some(item => item.severity === "critical"), false);
 assert.equal(result.findings.some(item => item.id === "IAM_ACTION_WILDCARD"), false);
});
test("rejects empty, malformed, invalid-shape, and oversized policies", () => {
 assert.throws(() => analyzeAwsIamPolicy({}), /Paste an AWS IAM policy/);
 assert.throws(() => analyzeAwsIamPolicy({ policyText: "{" }), /valid JSON/);
 assert.throws(() => analyzeAwsIamPolicy({ policyText: "[]" }), /JSON object/);
 assert.throws(() => analyzeAwsIamPolicy({ policyText: JSON.stringify({ Statement: [] }) }), /non-empty Statement/);
 assert.throws(() => analyzeAwsIamPolicy({ policyText: "x".repeat(300001) }), /300,000/);
});
test("exports findings and clear static-analysis limitations", () => {
 const report = buildAwsIamPolicyReport(analyze([{ Effect: "Allow", Action: "*", Resource: "*" }]));
 assert.match(report, /AWS IAM Policy Security Review/);
 assert.match(report, /does not contact AWS/);
});
