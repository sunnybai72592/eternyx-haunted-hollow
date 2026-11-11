const VERSION_PATTERN = /^\d+(?:\.\d+)*$/;

function splitCpe(value) {
  const parts = [];
  let current = "";
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === ":") {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[-_\s]+/g, "");
}

function compareNumericVersions(left, right) {
  if (!VERSION_PATTERN.test(left) || !VERSION_PATTERN.test(right)) return null;
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

function evaluateVersion(version, criterion) {
  const cpeVersion = criterion.parts[5];
  if (!version) return { result: "unknown", reason: "A software version was not supplied." };
  if (cpeVersion === "-") return { result: "unknown", reason: "The CPE version is not applicable or is unspecified." };

  if (cpeVersion !== "*") {
    if (normalize(cpeVersion) === normalize(version)) {
      return { result: "match", reason: `Exact CPE version ${cpeVersion} matches the supplied version.` };
    }
    return { result: "no_match", reason: `CPE specifies version ${cpeVersion}, not ${version}.` };
  }

  const { version_start_including: startIncluding, version_start_excluding: startExcluding,
    version_end_including: endIncluding, version_end_excluding: endExcluding } = criterion;
  const bounds = [
    [startIncluding, "start-inclusive"],
    [startExcluding, "start-exclusive"],
    [endIncluding, "end-inclusive"],
    [endExcluding, "end-exclusive"],
  ].filter(([bound]) => Boolean(bound));

  if (!bounds.length) return { result: "match", reason: "The matching CPE uses a wildcard version with no narrower version bounds." };

  for (const [bound] of bounds) {
    if (!VERSION_PATTERN.test(version) || !VERSION_PATTERN.test(bound)) {
      return { result: "unknown", reason: "The version or NVD boundary uses a format this conservative comparator cannot safely order." };
    }
  }

  if (startIncluding && compareNumericVersions(version, startIncluding) < 0) {
    return { result: "no_match", reason: `Version is earlier than the inclusive lower bound ${startIncluding}.` };
  }
  if (startExcluding && compareNumericVersions(version, startExcluding) <= 0) {
    return { result: "no_match", reason: `Version is not later than the exclusive lower bound ${startExcluding}.` };
  }
  if (endIncluding && compareNumericVersions(version, endIncluding) > 0) {
    return { result: "no_match", reason: `Version is later than the inclusive upper bound ${endIncluding}.` };
  }
  if (endExcluding && compareNumericVersions(version, endExcluding) >= 0) {
    return { result: "no_match", reason: `Version is not earlier than the exclusive upper bound ${endExcluding}.` };
  }

  return { result: "match", reason: "The supplied numeric version falls within the NVD version boundaries." };
}

function inspectCriterion(configuration, vendor, product, version) {
  if (!configuration || typeof configuration.cpe !== "string") return null;
  const parts = splitCpe(configuration.cpe);
  if (parts.length < 6 || parts[0] !== "cpe" || parts[1] !== "2.3") return null;

  const cpeVendor = parts[3];
  const cpeProduct = parts[4];
  if (cpeVendor === "*" || cpeProduct === "*" || cpeVendor === "-" || cpeProduct === "-") {
    return { identity: "unknown", version: "unknown", reason: "The CPE uses a wildcard or unspecified vendor/product identity.", cpe: configuration.cpe };
  }
  if (normalize(cpeProduct) !== normalize(product)) return null;
  if (vendor && normalize(cpeVendor) !== normalize(vendor)) return null;

  if (configuration.vulnerable !== true) {
    return { identity: "match", version: "not_vulnerable", reason: "NVD marks this related CPE as non-vulnerable.", cpe: configuration.cpe };
  }
  const result = evaluateVersion(version, { ...configuration, parts });
  return { identity: "match", ...result, cpe: configuration.cpe };
}

/**
 * Conservatively compares a supplied software identity/version with NVD CPE
 * criteria. This is evidence triage, not a complete NVD Boolean-configuration
 * evaluator or proof of exploitability.
 */
export function assessCveApplicability({ vendor = "", product = "", version = "", configurations = [] } = {}) {
  if (!String(product).trim()) {
    return { status: "needs_review", label: "Needs manual review", detail: "Enter a product name before assessing applicability.", matchedCriteria: [], reviewCriteria: [] };
  }
  const inspected = (Array.isArray(configurations) ? configurations : [])
    .map((configuration) => inspectCriterion(configuration, vendor, product, version))
    .filter(Boolean);
  const vulnerable = inspected.filter((item) => item.version === "match");
  const uncertain = inspected.filter((item) => item.version === "unknown");
  const identityMatches = inspected.filter((item) => item.identity === "match" && item.version !== "not_vulnerable");

  if (vulnerable.length) {
    return {
      status: "potential_match",
      label: "Potential version match",
      detail: `${vulnerable.length} vulnerable NVD CPE criterion/criteria match the supplied product and version. Review platform and configuration conditions before confirming impact.`,
      matchedCriteria: vulnerable.map((item) => ({ cpe: item.cpe, reason: item.reason })),
      reviewCriteria: uncertain.map((item) => ({ cpe: item.cpe, reason: item.reason })),
    };
  }
  if (uncertain.length || !identityMatches.length) {
    return {
      status: "needs_review",
      label: "Needs manual review",
      detail: uncertain.length
        ? "NVD includes matching product criteria that cannot be safely evaluated with the supplied version."
        : "No directly comparable vendor/product CPE criterion was found. The keyword result may refer to an alias, platform, or related product.",
      matchedCriteria: [],
      reviewCriteria: inspected.map((item) => ({ cpe: item.cpe, reason: item.reason })),
    };
  }
  return {
    status: "no_matching_version",
    label: "No matching version range",
    detail: "The supplied version did not match the vulnerable CPE version criteria found for this product. This does not prove the software is free of vulnerabilities.",
    matchedCriteria: [],
    reviewCriteria: identityMatches.map((item) => ({ cpe: item.cpe, reason: item.reason })),
  };
}
