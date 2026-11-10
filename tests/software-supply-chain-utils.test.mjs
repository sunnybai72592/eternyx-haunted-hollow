import test from "node:test";
import assert from "node:assert/strict";
import { analyzeNpmSupplyChain, buildSupplyChainReport } from "../src/lib/softwareSupplyChainUtils.mjs";

const manifest = JSON.stringify({
  name: "sample-app", version: "1.0.0",
  dependencies: { "safe-lib": "^1.2.0", "git-lib": "github:attacker/project", "float-lib": "*" },
  scripts: { postinstall: "node setup.js" }
});
const lock = JSON.stringify({
  name: "sample-app", version: "1.0.0", lockfileVersion: 3,
  packages: {
    "": { name: "sample-app", version: "1.0.0", dependencies: { "safe-lib": "^1.2.0", "git-lib": "github:attacker/project", "float-lib": "*" } },
    "node_modules/safe-lib": { version: "1.2.3", resolved: "https://registry.npmjs.org/safe-lib/-/safe-lib-1.2.3.tgz", integrity: "sha512-YWJjZA==", license: "MIT" },
    "node_modules/float-lib": { version: "2.0.0", resolved: "https://registry.npmjs.org/float-lib/-/float-lib-2.0.0.tgz", integrity: "sha512-YWJjZA==" },
    "node_modules/git-lib": { version: "1.0.0", resolved: "git+https://github.com/attacker/project.git", hasInstallScript: true }
  }
});

test("creates a CycloneDX 1.5 inventory from npm lockfile v3", () => {
  const result = analyzeNpmSupplyChain({ manifestText: manifest, lockfileText: lock });
  assert.equal(result.bom.bomFormat, "CycloneDX");
  assert.equal(result.bom.specVersion, "1.5");
  assert.equal(result.inventory.length, 3);
  assert.equal(result.bom.components.length, 3);
  assert.ok(result.bom.components.some(item => item.purl === "pkg:npm/safe-lib@1.2.3"));
  assert.ok(result.bom.components.find(item => item.name === "safe-lib").hashes.length === 1);
});

test("detects floating specs, non-registry dependencies and lifecycle scripts", () => {
  const ids = analyzeNpmSupplyChain({ manifestText: manifest, lockfileText: lock }).findings.map(item => item.id);
  assert.ok(ids.includes("FLOATING_VERSION_RANGE"));
  assert.ok(ids.includes("NON_REGISTRY_DEPENDENCY"));
  assert.ok(ids.includes("ROOT_LIFECYCLE_SCRIPT"));
  assert.ok(ids.includes("DEPENDENCY_INSTALL_SCRIPT"));
  assert.ok(ids.includes("NON_HTTPS_PACKAGE_SOURCE"));
});

test("reports missing lockfile and produces a Markdown report", () => {
  const result = analyzeNpmSupplyChain({ manifestText: manifest });
  assert.ok(result.findings.some(item => item.id === "LOCKFILE_MISSING"));
  assert.match(buildSupplyChainReport(result), /Software Supply Chain Review/);
  assert.match(buildSupplyChainReport(result), /not vulnerability-free/);
});

test("detects manifest and lockfile drift and absent locked packages", () => {
  const changed = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { "safe-lib": "^2.0.0", "missing-lib": "^1.0.0" } },
      "node_modules/safe-lib": { version: "1.2.3" }
    }
  });
  const result = analyzeNpmSupplyChain({ manifestText: manifest, lockfileText: changed });
  const ids = result.findings.map(item => item.id);
  assert.ok(ids.includes("MANIFEST_LOCK_MISMATCH"));
  assert.ok(ids.includes("DEPENDENCY_NOT_LOCKED"));
});

test("validates malformed, incomplete and oversized inputs", () => {
  assert.throws(() => analyzeNpmSupplyChain({ manifestText: "{" }), /valid JSON/);
  assert.throws(() => analyzeNpmSupplyChain({ manifestText: '{"name":"x"}' }), /name and version/);
  assert.throws(() => analyzeNpmSupplyChain({ manifestText: "x".repeat(500001) }), /500,000/);
});

test("supports npm v1 nested dependency trees", () => {
  const oldLock = JSON.stringify({ lockfileVersion: 1, dependencies: { "old-lib": { version: "1.0.0", integrity: "sha512-YWJjZA==" } } });
  const result = analyzeNpmSupplyChain({ manifestText: JSON.stringify({ name: "old-app", version: "1.0.0" }), lockfileText: oldLock });
  assert.equal(result.inventory.length, 1);
  assert.equal(result.bom.components[0].name, "old-lib");
});
