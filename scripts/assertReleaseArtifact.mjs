import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { readCheckedOutSha } from "./releaseProvenance.mjs";

/**
 * CI checks the exact Vite output, not a hand-authored source constant.
 * This proves generated HTML/manifest and bundled JS share one build ID.
 * It does NOT establish which artifact Lovable has deployed publicly.
 */
const dist = resolve("dist");
const metadata = JSON.parse(readFileSync(resolve(dist, "release-info.json"), "utf8"));
const html = readFileSync(resolve(dist, "index.html"), "utf8");
assert.equal(metadata.schema, 1);
assert.equal(metadata.project, "eternyx");
assert.match(metadata.build_id, /^[a-f0-9]{32}$/);
assert.match(metadata.built_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
assert.equal(metadata.production_verified, false);
assert.ok(["git-checkout", "unavailable"].includes(metadata.source_sha_origin));
assert.ok(html.includes('name="eternyx-build-id"'));
assert.ok(html.includes('content="' + metadata.build_id + '"'));
const assetsDir = resolve(dist, "assets");
const jsFiles = readdirSync(assetsDir).filter(name => name.endsWith(".js"));
assert.ok(jsFiles.length > 0, "Missing client JavaScript bundles");
assert.ok(jsFiles.some(name => readFileSync(resolve(assetsDir, name), "utf8")
  .includes(metadata.build_id)), "Browser JS must contain the matching build identifier");

const localSha = readCheckedOutSha();
if (localSha) {
  assert.equal(metadata.source_sha, localSha, "Built revision must equal checked-out Git SHA");
  assert.equal(metadata.source_sha_origin, "git-checkout");
} else {
  assert.equal(metadata.source_sha, null, "Do not invent a Git revision");
  assert.equal(metadata.source_sha_origin, "unavailable");
}
console.log("Release artifact validated: build ID " + metadata.build_id + ", source " + (metadata.source_sha ?? "unavailable"));
