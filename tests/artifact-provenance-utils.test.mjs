import test from "node:test";
import assert from "node:assert/strict";
import { analyzeArtifactProvenance, buildArtifactTrustReport } from "../src/lib/artifactProvenanceUtils.mjs";

const digest = "a".repeat(64);
const release = { tag_name: "v1.0.0", target_commitish: "abc123", assets: [{ name: "app.tgz", digest: "sha256:" + digest }] };
const attestation = { _type: "https://in-toto.io/Statement/v1", subject: [{ name: "app.tgz", digest: { sha256: digest } }], predicateType: "https://slsa.dev/provenance/v1", predicate: { buildDefinition: {} }, verificationMaterial: { certificate: "placeholder" } };
const sbom = { bomFormat: "CycloneDX", specVersion: "1.5", components: [{ name: "lib" }], metadata: { component: { name: "app" } } };
const json = value => JSON.stringify(value);

test("accepts release, attestation and CycloneDX structure without false digest mismatch", () => {
 const result = analyzeArtifactProvenance({ releaseText: json(release), attestationText: json(attestation), sbomText: json(sbom) });
 assert.equal(result.release.assetCount, 1);
 assert.equal(result.attestation.subjectCount, 1);
 assert.equal(result.sbom.componentCount, 1);
 assert.ok(!result.findings.some(item => item.id === "ATTESTATION_ASSET_DIGEST_MISMATCH"));
});

test("flags release assets without SHA-256 digests", () => {
 const result = analyzeArtifactProvenance({ releaseText: json({ tag_name: "v1", assets: [{ name: "app.zip" }] }) });
 assert.ok(result.findings.some(item => item.id === "ASSET_DIGEST_MISSING"));
});

test("flags a provenance subject digest that differs from release assets", () => {
 const changed = { ...attestation, subject: [{ name: "app.tgz", digest: { sha256: "b".repeat(64) } }] };
 const result = analyzeArtifactProvenance({ releaseText: json(release), attestationText: json(changed) });
 assert.ok(result.findings.some(item => item.id === "ATTESTATION_ASSET_DIGEST_MISMATCH" && item.severity === "critical"));
});

test("detects incomplete attestation and unrecognized SBOM", () => {
 const result = analyzeArtifactProvenance({ attestationText: json({ subject: [] }), sbomText: json({ nope: true }) });
 const ids = result.findings.map(item => item.id);
 assert.ok(ids.includes("ATTESTATION_SUBJECT_MISSING"));
 assert.ok(ids.includes("ATTESTATION_SIGNATURE_NOT_INCLUDED"));
 assert.ok(ids.includes("SBOM_FORMAT_UNRECOGNIZED"));
});

test("rejects empty, malformed, non-object and oversized inputs", () => {
 assert.throws(() => analyzeArtifactProvenance({}), /at least one/);
 assert.throws(() => analyzeArtifactProvenance({ releaseText: "{" }), /valid JSON/);
 assert.throws(() => analyzeArtifactProvenance({ sbomText: "[]" }), /JSON object/);
 assert.throws(() => analyzeArtifactProvenance({ releaseText: "x".repeat(500001) }), /500,000/);
});

test("builds a report with explicit verification boundaries", () => {
 const result = analyzeArtifactProvenance({ releaseText: json(release) });
 const report = buildArtifactTrustReport(result);
 assert.match(report, /Artifact Provenance/);
 assert.match(report, /does not verify cryptographic signatures/);
});
