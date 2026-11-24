import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEVELOPER_DEEP_LINK_PATH, DEVELOPER_DEEP_LINK_PHASES,
  DEVELOPER_DEEP_LINK_VIEWPORTS, verifyHostedDeveloperDeepLinkObservations,
} from "../scripts/developer-staging-deeplink.mjs";

const observations = () => DEVELOPER_DEEP_LINK_VIEWPORTS.flatMap(viewport =>
  DEVELOPER_DEEP_LINK_PHASES.map(phase => ({
    viewport, phase, http_status: 200, route_exact: true,
    https_origin: true, redirect_free: true, content_type_html: true,
    heading_visible: true, html_matches: true, client_matches: true,
    controller_absent: true,
  })));

test("four actual public route observations establish deterministic direct-entry acceptance", () => {
  const result = verifyHostedDeveloperDeepLinkObservations(observations());
  assert.equal(result.route, DEVELOPER_DEEP_LINK_PATH);
  assert.equal(result.route, "/developer-studio/project-lab");
  assert.equal(result.observations, 4);
  assert.equal(result.direct_entry, true);
  assert.equal(result.no_redirects, true);
  assert.equal(result.html_and_client_match_root_release, true);
  assert.match(result.scope, /no authenticated backend or production proof/);
});

test("incomplete, duplicate, wrong viewport and fabricated extra properties fail closed", () => {
  const base = observations();
  const invalid = [
    null, [], base.slice(0, 3),
    [base[0], base[0], base[2], base[3]],
    base.map((x, i) => i === 1 ? { ...x, viewport: "375x812" } : x),
    base.map((x, i) => i === 1 ? { ...x, phase: "during" } : x),
    base.map((x, i) => i === 1 ? { ...x, leak: "PRIVATE_TOKEN_445" } : x),
    base.map((x, i) => i === 1 ? { ...x, html_matches: "true" } : x),
  ];
  for (const v of invalid) {
    assert.throws(() => verifyHostedDeveloperDeepLinkObservations(v), /Developer deep-link:/);
  }
});

test("wrong HTML status, hydration and root-build parity are each blocking staging failures", () => {
  for (const field of ["route_exact", "https_origin", "redirect_free", "content_type_html",
    "heading_visible", "html_matches", "client_matches", "controller_absent"]) {
    const wrong = observations();
    wrong[2] = { ...wrong[2], [field]: false };
    assert.throws(() => verifyHostedDeveloperDeepLinkObservations(wrong),
      /public route response, hydration, revision markers, or isolation failed/);
  }
  for (const status of [0, 204, 302, 404, 500, "200"]) {
    const wrong = observations();
    wrong[0] = { ...wrong[0], http_status: status };
    assert.throws(() => verifyHostedDeveloperDeepLinkObservations(wrong), /Developer deep-link:/);
  }
});

test("actual Chrome runner navigates directly, sees real public page, and records no raw source/headers", () => {
  const runner = readFileSync(new URL("../tests/browser/developer_project_lab_smoke.py", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../scripts/developer-staging-gate.mjs", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../.github/workflows/developer-staging-browser-acceptance.yml", import.meta.url), "utf8");
  assert.match(runner, /def observe_project_lab_direct_route\(/);
  assert.match(runner, /page\.goto\(ORIGIN \+ route, wait_until="domcontentloaded"\)/);
  assert.match(runner, /get_by_role\("heading", name="Local Project Lab"\)/);
  assert.match(runner, /response\.request\.redirected_from is None/);
  assert.match(runner, /navigator\.serviceWorker\?\.controller/);
  assert.match(runner, /observe_project_lab_direct_route\(page, viewport, phase, build_id, require_current\)/);
  assert.match(runner, /"deep_link_observations":DEEP_LINK_OBSERVATIONS/);
  assert.match(gate, /verifyHostedDeveloperDeepLinkObservations\(value\.deep_link_observations\)/);
  assert.match(gate, /"Direct Project Lab route: "/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /RUN_DEVELOPER_STAGING_READ_ONLY/);
  assert.doesNotMatch(workflow, /secrets\.|supabase db push|npm run deploy/);
  assert.doesNotMatch(runner, /page\.screenshot|record_video_dir|trace\.start/);
});
