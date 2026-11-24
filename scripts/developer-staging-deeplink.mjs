/**
 * Developer Studio 4.0: verify true public deep-link browser observations,
 * independent from a passing root-page manifest. This validates only observed
 * unsigned public browser metadata, never remote accounts or backend access.
 */
export const DEVELOPER_DEEP_LINK_PATH = "/developer-studio/project-lab";
export const DEVELOPER_DEEP_LINK_PHASES = Object.freeze(["before", "after"]);
export const DEVELOPER_DEEP_LINK_VIEWPORTS = Object.freeze(["390x844", "1440x900"]);

const KEYS = [
  "client_matches", "content_type_html", "controller_absent",
  "heading_visible", "html_matches", "http_status", "https_origin",
  "phase", "redirect_free", "route_exact", "viewport",
].sort().join(",");

export function verifyHostedDeveloperDeepLinkObservations(observations) {
  if (!Array.isArray(observations) || observations.length !== 4) {
    throw new Error("Developer deep-link: four real direct-route browser observations are mandatory.");
  }
  const expected = new Set(DEVELOPER_DEEP_LINK_VIEWPORTS.flatMap(
    viewport => DEVELOPER_DEEP_LINK_PHASES.map(phase => viewport + "/" + phase)));
  const seen = new Set();
  for (const entry of observations) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        Object.keys(entry).sort().join(",") !== KEYS ||
        entry.http_status !== 200 ||
        entry.route_exact !== true ||
        entry.https_origin !== true ||
        entry.redirect_free !== true ||
        entry.content_type_html !== true ||
        entry.heading_visible !== true ||
        entry.html_matches !== true ||
        entry.client_matches !== true ||
        entry.controller_absent !== true) {
      throw new Error("Developer deep-link: public route response, hydration, revision markers, or isolation failed.");
    }
    const key = entry.viewport + "/" + entry.phase;
    if (!expected.has(key) || seen.has(key)) {
      throw new Error("Developer deep-link: duplicate, missing, or unexpected viewport/phase.");
    }
    seen.add(key);
  }
  if (seen.size !== expected.size) throw new Error("Developer deep-link: incomplete observations.");
  return {
    route: DEVELOPER_DEEP_LINK_PATH,
    observations: seen.size,
    direct_entry: true,
    no_redirects: true,
    html_and_client_match_root_release: true,
    browser_isolation: "no controlling service worker",
    scope: "Observed direct public route response and client heading; no authenticated backend or production proof.",
  };
}
