import test from "node:test";
import assert from "node:assert/strict";
import { analyzePrometheusConfig, analyzePrometheusAlerts, analyzeGrafanaDashboard } from "../src/lib/observabilityUtils.mjs";

test("Prometheus config identifies missing scrape jobs and HTTP transport", () => {
  const result = analyzePrometheusConfig('global:\n  scrape_interval: 15s\nscrape_configs:\n  - job_name: app\n    scheme: http\n    static_configs:\n      - targets: ["localhost:9090"]');
  assert.equal(result.jobCount, 1);
  assert.ok(result.findings.some(x => x.title === "HTTP scrape transport configured"));
});
test("Prometheus config warns when scrape section is absent", () => {
  const result = analyzePrometheusConfig("global:\n  scrape_interval: 15s");
  assert.ok(result.findings.some(x => x.title === "No scrape_configs section"));
});
test("Prometheus alerts check duration, severity and runbook", () => {
  const result = analyzePrometheusAlerts('groups:\n  - name: service\n    rules:\n      - alert: ServiceDown\n        expr: up == 0');
  assert.equal(result.alertCount, 1);
  assert.ok(result.findings.some(x => x.title === "No alert hold duration detected"));
  assert.ok(result.findings.some(x => x.title === "Severity labels not detected"));
  assert.ok(result.findings.some(x => x.title === "No runbook or documentation annotation"));
});
test("Grafana dashboard validates JSON and panel quality", () => {
  const result = analyzeGrafanaDashboard(JSON.stringify({ title: "API", panels: [{ id: 1 }, { id: 1, title: "Latency", targets: [] }] }));
  assert.equal(result.panelCount, 2);
  assert.ok(result.findings.some(x => x.title === "Duplicate panel IDs"));
  assert.ok(result.findings.some(x => x.title === "Untitled panels detected"));
});
test("Grafana rejects malformed JSON", () => {
  assert.throws(() => analyzeGrafanaDashboard("{bad"), /Invalid Grafana dashboard JSON/);
});
test("Analyzers reject empty and oversized input", () => {
  for (const fn of [analyzePrometheusConfig, analyzePrometheusAlerts, analyzeGrafanaDashboard]) {
    assert.throws(() => fn(" "), /required/);
    assert.throws(() => fn("x".repeat(200001)), /200 KB/);
  }
});
