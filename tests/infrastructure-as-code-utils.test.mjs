import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTerraform, analyzeAnsible, analyzeHelmValues } from "../src/lib/infrastructureAsCodeUtils.mjs";

test("Terraform detects broad ingress, plaintext secrets and wildcard IAM", () => {
  const r = analyzeTerraform('resource "aws_security_group_rule" "web" { cidr_blocks = ["0.0.0.0/0"] }\npassword = "plain"\nactions = ["*"]');
  assert.ok(r.findings.some(x => x.title === "Public IPv4 ingress or egress range"));
  assert.ok(r.findings.some(x => x.title === "Possible hard-coded credential"));
  assert.ok(r.findings.some(x => x.title === "Wildcard IAM permission"));
});
test("Terraform extracts resource inventory", () => {
  const r = analyzeTerraform('resource "aws_s3_bucket" "data" {}\nresource "aws_kms_key" "key" {}');
  assert.equal(r.resourceCount, 2);
  assert.equal(r.resources[0].type, "aws_s3_bucket");
});
test("Ansible detects unsafe command patterns and plaintext secrets", () => {
  const r = analyzeAnsible('hosts: all\ntasks:\n  - name: run\n    shell: echo hello\n    password: "plaintext"\n    validate_certs: false');
  assert.ok(r.findings.some(x => x.title === "Shell or command task detected"));
  assert.ok(r.findings.some(x => x.title === "Possible plaintext credential"));
  assert.ok(r.findings.some(x => x.title === "TLS certificate validation disabled"));
});
test("Ansible requires a play target", () => {
  const r = analyzeAnsible('tasks:\n  - name: noop\n    debug:');
  assert.ok(r.findings.some(x => x.title === "No play target detected"));
});
test("Helm detects privileged workloads, public services and missing resources", () => {
  const r = analyzeHelmValues('image:\n  tag: latest\nservice:\n  type: LoadBalancer\nsecurityContext:\n  privileged: true');
  assert.ok(r.findings.some(x => x.title === "Privileged container configured"));
  assert.ok(r.findings.some(x => x.title === "LoadBalancer service exposure"));
  assert.ok(r.findings.some(x => x.title === "Resource requests and limits not found"));
});
test("Analyzers reject empty and oversized input", () => {
  for (const fn of [analyzeTerraform, analyzeAnsible, analyzeHelmValues]) {
    assert.throws(() => fn(" "), /required/);
    assert.throws(() => fn("x".repeat(200001)), /200 KB/);
  }
});
