import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [gateway, premium, team, catalog, detail, oldServices, hub, contact, app] = await Promise.all([
  "src/pages/Hacked.tsx", "src/pages/Premium.tsx", "src/pages/EliteDevelopmentTeam.tsx",
  "src/pages/ServicesPage.tsx", "src/pages/ServiceDetailPage.tsx",
  "src/pages/Services.tsx", "src/pages/ServicesHub.tsx", "src/pages/Contact.tsx", "src/App.tsx",
].map(read));

test("legacy hacked route retains cyberpunk style but cannot claim an actual intrusion", () => {
  assert.match(gateway, /CYBERPUNK EXPERIENCE/);
  assert.match(gateway, /Thematic experience · no security action performed/);
  assert.match(gateway, /No network was scanned, no privileges were granted/);
  assert.doesNotMatch(gateway, /ROOT ACCESS GRANTED|UNAUTHORIZED ACCESS DETECTED|SYSTEM COMPROMISED|BYPASSING FIREWALL|PREMIUM ACCESS GRANTED|50% OFF/);
  assert.doesNotMatch(gateway, /setTimeout\(|setInterval\(|Math\.random\(|supabase\.|fetch\(/);
});

test("the legacy gateway offers functional internal navigation instead of fake premium grants", () => {
  for (const href of ["/cybersecurity", "/developer-studio", "/ai-arsenal"]) {
    assert.ok(gateway.includes('href: "' + href + '"'));
    assert.ok(app.includes('path="' + href + '"'));
  }
  assert.match(gateway, /<Link to=\{destination\.href\}>/);
  assert.doesNotMatch(gateway, /Claim Premium Access|Secure Exit/);
});

test("premium legacy route advertises no unapproved prices, available paid plans, or inert purchase buttons", () => {
  assert.match(premium, /Premium features roadmap/);
  assert.match(premium, /Pricing not published · purchases not available here/);
  assert.match(premium, /This page cannot create a checkout, charge a card/);
  assert.doesNotMatch(premium, /\$29|\$79|\$199|Choose Basic|Choose Pro|Choose Elite|24\/7 dedicated support/);
  assert.doesNotMatch(premium, /create-checkout|supabase\.|stripe\.|window\.open\(/);
});

test("premium route points to the existing Explore destination, not a checkout", () => {
  assert.ok(premium.includes('<Link to="/explore">'));
  assert.ok(app.includes('path="/premium"'));
  assert.ok(app.includes('path="/explore"'));
});

test("fictional development team members, avatars and social profiles are not displayed", () => {
  assert.match(team, /Staff and service availability not verified/);
  assert.match(team, /fictional employee identities and a form that only displayed a success alert/);
  assert.doesNotMatch(team, /Anya|Cipher.*Kaito|Spectre.*Khan|DataStream|pravatar|linkedin\.com\/in|teamMembers\s*=/);
  assert.doesNotMatch(team, /alert\("Message sent|console\.log\("Contact Form Submitted/);
});

test("development inquiry uses existing server-confirmed contact path rather than a fabricated success alert", () => {
  assert.ok(team.includes('<Link to="/contact">'));
  assert.ok(team.includes('<Link to="/developer-studio">'));
  assert.match(contact, /await supabaseAPI\.submitContactForm\(/);
  assert.match(contact, /if \(error\) throw error/);
  assert.match(contact, /toast\.error\(/);
  assert.ok(app.includes('path="/contact"'));
});

test("public service listing and detail legacy routes redirect to the real capability directory", () => {
  for (const source of [catalog, detail, oldServices]) {
    assert.ok(source.includes('<Navigate to="/services-hub" replace />'));
    assert.doesNotMatch(source, /Starting at \$/);
  }
  assert.ok(app.includes('path="/services"'));
  assert.ok(app.includes('path="/services/:serviceId"'));
  assert.ok(app.includes('path="/services-hub"'));
  assert.match(hub, /ETERNYX capability directory/);
});

test("old service marketing cannot surface speculative AI models, teams, or cybersecurity protection through active routes", () => {
  assert.doesNotMatch(catalog + detail, /certified ethical hackers|custom operational deployments|GOD_MODE|Request a Consultation/);
  assert.match(hub, /Preview · status varies by tool/);
  assert.match(hub, /Backend-dependent/);
});

test("legacy public routes remain registered without silently activating entitlements", () => {
  for (const href of ["/hacked", "/premium", "/elite-development-team"]) {
    assert.ok(app.includes('path="' + href + '"'));
  }
  assert.doesNotMatch(gateway + premium + team + catalog + detail, /supabase\.functions\.invoke|localStorage\.|create-checkout/);
});

test("launch audit documents public trust corrections and remaining server/payment launch gates", async () => {
  const report = await read("RELEASE_AUDIT_2026-11-19.md");
  assert.match(report, /Additional public trust findings/);
  assert.match(report, /November 23/);
  assert.match(report, /November 25/);
  assert.match(report, /No checkout was enabled by this patch/);
});
