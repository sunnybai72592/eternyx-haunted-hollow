const MAX_INPUT = 500000;
const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function parseInput(source, label) {
  if (!String(source ?? "").trim()) return null;
  if (String(source).length > MAX_INPUT) throw new Error(`${label} must be 500,000 characters or fewer.`);
  let value;
  try { value = JSON.parse(source); } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : "parse error"}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}
function finding(items, id, severity, title, detail, recommendation, evidence = "") {
  items.push({ id, severity, title, detail, recommendation, evidence: String(evidence).slice(0, 300) });
}
function sha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.replace(/^sha256:/i, ""));
}

export function analyzeArtifactProvenance({ releaseText = "", attestationText = "", sbomText = "" } = {}) {
  const release = parseInput(releaseText, "GitHub release JSON");
  const attestation = parseInput(attestationText, "Provenance attestation JSON");
  const sbom = parseInput(sbomText, "SBOM JSON");
  if (!release && !attestation && !sbom) throw new Error("Provide at least one release, attestation, or SBOM JSON document.");
  const findings = [];
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  if (release) {
    if (!release.tag_name) finding(findings, "RELEASE_TAG_MISSING", "high", "Release tag is missing", "The release metadata does not identify a version tag.", "Publish from an immutable, reviewed version tag.");
    if (release.draft === true) finding(findings, "RELEASE_DRAFT", "low", "Release is still a draft", "Draft releases are not final distribution artifacts.", "Complete review and publish only when release contents are approved.");
    if (release.prerelease === true) finding(findings, "RELEASE_PRERELEASE", "low", "Release is marked as a prerelease", "Consumers may treat prerelease artifacts differently from stable releases.", "Confirm prerelease status is intentional and clearly communicated.");
    if (!assets.length) finding(findings, "RELEASE_ASSETS_MISSING", "medium", "No release assets were supplied", "The release metadata contains no downloadable assets to inspect.", "Attach the intended build artifacts and publish their checksums.");
    for (const asset of assets) {
      if (!asset?.name) finding(findings, "ASSET_NAME_MISSING", "medium", "Release asset has no name", "An asset entry is missing a recognizable filename.", "Use a stable, descriptive artifact filename.", JSON.stringify(asset));
      if (!asset?.digest || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest)) finding(findings, "ASSET_DIGEST_MISSING", "high", "Release asset SHA-256 digest is missing", "The release asset does not expose a recognized SHA-256 digest.", "Publish a SHA-256 checksum and verify it independently after download.", asset?.name || "unnamed asset");
    }
    if (!release.target_commitish) finding(findings, "RELEASE_TARGET_MISSING", "low", "Release target commit is unspecified", "The release metadata does not expose a target commit or branch.", "Record the exact source commit used to build the release.");
  }
  const statement = attestation?.statement || attestation;
  const subjects = Array.isArray(statement?.subject) ? statement.subject : [];
  if (attestation) {
    if (!Array.isArray(statement?.subject) || subjects.length === 0) finding(findings, "ATTESTATION_SUBJECT_MISSING", "high", "Attestation subject is missing", "The supplied statement has no subject identifying the artifact it describes.", "Generate an in-toto statement with explicit artifact subjects and SHA-256 digests.");
    if (!statement?._type || !String(statement._type).includes("in-toto")) finding(findings, "ATTESTATION_TYPE_UNRECOGNIZED", "medium", "Attestation statement type is unrecognized", "The document does not identify a recognized in-toto statement type.", "Use a documented in-toto Statement schema and validate it with an appropriate verifier.");
    if (!statement?.predicateType) finding(findings, "PREDICATE_TYPE_MISSING", "medium", "Attestation predicate type is missing", "The statement does not declare what provenance predicate it contains.", "Use a documented predicate type such as SLSA provenance.");
    for (const subject of subjects) {
      const digest = subject?.digest?.sha256;
      if (!sha256(digest)) finding(findings, "SUBJECT_DIGEST_INVALID", "high", "Attestation subject lacks a valid SHA-256 digest", "A subject is missing a 64-character hexadecimal SHA-256 digest.", "Regenerate provenance with the exact artifact digest.", subject?.name || "unnamed subject");
    }
    const predicate = statement?.predicate || {};
    if (!predicate?.buildDefinition && !predicate?.builder && !predicate?.runDetails) finding(findings, "PROVENANCE_BUILD_DETAILS_MISSING", "medium", "Build provenance details are incomplete", "No recognizable builder or build-definition metadata was found.", "Include builder identity, build definition, and invocation details in provenance.");
    if (!attestation?.signature && !attestation?.verificationMaterial) finding(findings, "ATTESTATION_SIGNATURE_NOT_INCLUDED", "high", "No signature or verification material supplied", "The input does not include signature or verification material for independent verification.", "Verify the signed attestation with the issuer's trusted identity and certificate policy.");
  }
  if (release && attestation && subjects.length) {
    const assetDigests = new Set(assets.map(asset => String(asset?.digest || "").replace(/^sha256:/i, "").toLowerCase()).filter(Boolean));
    for (const subject of subjects) {
      const digest = String(subject?.digest?.sha256 || "").toLowerCase();
      if (assetDigests.size && digest && !assetDigests.has(digest)) finding(findings, "ATTESTATION_ASSET_DIGEST_MISMATCH", "critical", "Attestation subject does not match release asset digest", "The attested subject digest does not match any supplied release asset digest.", "Stop distribution until the artifact and provenance are reconciled; rebuild or regenerate the attestation.", subject?.name || digest);
    }
  }
  if (sbom) {
    const format = String(sbom.bomFormat || "").toLowerCase();
    const isCyclone = format === "cyclonedx" && Array.isArray(sbom.components);
    const isSpdx = Boolean(sbom.spdxVersion && Array.isArray(sbom.packages));
    if (!isCyclone && !isSpdx) finding(findings, "SBOM_FORMAT_UNRECOGNIZED", "high", "SBOM format or component inventory is unrecognized", "The document does not resemble a CycloneDX components document or SPDX packages document.", "Provide a valid CycloneDX or SPDX SBOM and validate it against its published schema.");
    if (isCyclone && !sbom.specVersion) finding(findings, "SBOM_SPEC_VERSION_MISSING", "medium", "CycloneDX specification version is missing", "The CycloneDX document does not declare specVersion.", "Generate the SBOM using a supported CycloneDX specification version.");
    const count = isCyclone ? sbom.components.length : isSpdx ? sbom.packages.length : 0;
    if (count === 0) finding(findings, "SBOM_EMPTY", "medium", "SBOM contains no components", "No component or package records were found.", "Regenerate the SBOM from the actual build inputs and dependency graph.");
    if (isCyclone && !sbom.metadata?.component) finding(findings, "SBOM_ROOT_COMPONENT_MISSING", "low", "SBOM root component is missing", "The CycloneDX metadata does not identify the primary application component.", "Include the root application component in the SBOM metadata.");
  }
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.title.localeCompare(b.title));
  return {
    findings,
    summary: Object.fromEntries(["critical", "high", "medium", "low"].map(level => [level, findings.filter(item => item.severity === level).length])),
    release: release ? { tag: release.tag_name || null, assetCount: assets.length } : null,
    attestation: attestation ? { subjectCount: subjects.length, predicateType: statement?.predicateType || null } : null,
    sbom: sbom ? { format: sbom.bomFormat || (sbom.spdxVersion ? "SPDX" : "Unknown"), componentCount: Array.isArray(sbom.components) ? sbom.components.length : Array.isArray(sbom.packages) ? sbom.packages.length : 0 } : null
  };
}

export function buildArtifactTrustReport(result) {
  if (!result || !Array.isArray(result.findings)) throw new Error("Run an artifact trust review before building the report.");
  const lines = [
    "# ETERNYX Artifact Provenance & Release Trust Review",
    "",
    `- Findings: ${result.findings.length}`,
    `- Critical: ${result.summary.critical} | High: ${result.summary.high} | Medium: ${result.summary.medium} | Low: ${result.summary.low}`,
    `- Release supplied: ${result.release ? "Yes" : "No"}`,
    `- Attestation supplied: ${result.attestation ? "Yes" : "No"}`,
    `- SBOM supplied: ${result.sbom ? "Yes" : "No"}`,
    "",
    "## Findings"
  ];
  if (!result.findings.length) lines.push("No configured heuristic checks were triggered. This is not proof of artifact authenticity or release security.");
  for (const item of result.findings) lines.push(`### [${item.severity.toUpperCase()}] ${item.title}`, "", item.detail, `Recommendation: ${item.recommendation}`, item.evidence ? `Evidence: ${item.evidence}` : "", "");
  lines.push("## Verification boundary", "", "This is offline structural and consistency analysis only. It does not verify cryptographic signatures, certificate identity, transparency logs, SLSA levels, artifact bytes, GitHub permissions, or SBOM completeness. A clean report is not proof of authenticity, integrity, or safety.", "");
  return lines.filter(Boolean).join("\n");
}
