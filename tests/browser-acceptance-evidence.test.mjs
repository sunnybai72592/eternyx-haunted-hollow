import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");
const manifest=JSON.parse(read("tests/browser/acceptance_manifest.json"));
const registry=JSON.parse(read("src/data/toolRegistry.json"));
const python=read("tests/browser/preview_smoke.py");
const workflow=read(".github/workflows/ci.yml");
const studio=read("src/pages/DeveloperStudio.tsx");

test("browser evidence manifest uses two concrete Chrome viewports and never claims production certification",()=>{
  assert.deepEqual(manifest.viewports,["390x844","1440x900"]);
  assert.equal(manifest.productionVerified,false);
  assert.match(manifest.environment,/local Vite preview/);
  assert.ok(manifest.cases.length>=12);
  assert.equal(new Set(manifest.cases.map(c=>c.id)).size,manifest.cases.length);
});

test("every browser acceptance case maps to a registered capability or purposeful Explore UI",()=>{
  for (const item of manifest.cases){
    assert.match(item.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(["local-preview","auth-fixture","mocked-external","mocked-backend"].includes(item.kind));
    assert.ok(item.assertions.length>20);
    if(item.tool){
      const tool=registry.find(r=>r.id===item.tool);
      assert.ok(tool,"Unregistered test capability "+item.tool);
      assert.equal(tool.route,item.route,"Manifest route diverged from registry for "+item.tool);
      assert.equal(tool.releaseVerified,false,"Preview test must not silently mark production release");
    } else assert.equal(item.route,"/explore");
  }
});

test("five local Developer Studio capabilities each have a uniquely named browser journey",()=>{
  for (const name of ["json-format","utf8-base64","uri-encoding","uuid-generation","jwt-inspection"]){
    const entry=manifest.cases.find(c=>c.id===name);
    assert.ok(entry,"Missing real browser case "+name);
    assert.equal(entry.kind,"local-preview");
    assert.equal(entry.route,"/developer-studio");
    assert.match(python,new RegExp('exercise\\("'+name+'"'));
  }
});

test("browser script validates success and error handling, Unicode and security notices",()=>{
  for(const name of ["developer_json","developer_base64","developer_url","developer_uuid","developer_jwt","explore_filters"]){
    assert.match(python,new RegExp("def "+name+"\\(page\\):"));
  }
  assert.match(python,/raw = "ETERNYX سلام 🌙"/);
  assert.match(python,/assert len\(ids\) == len\(set\(ids\)\) == 3/);
  assert.match(python,/Decoding is not verification/);
  assert.match(python,/No indexed capabilities match these filters/);
  assert.match(python,/Invalid percent-encoded input/);
  assert.match(python,/Unable to decode this value/);
});

test("report records each actual browser action result and avoids user data",()=>{
  assert.match(python,/results\.append\(\{"case": case_id, "viewport": f"\{width\}x\{height\}", "result": "passed"\}\)/);
  assert.match(python,/results\.append\(\{"case": case_id, "viewport": f"\{width\}x\{height\}", "result": "failed"\}\)/);
  assert.match(python,/report_path\.write_text\(json\.dumps\(/);
  assert.match(python,/"production_verified": False/);
  assert.match(python,/external_api_note/);
  assert.doesNotMatch(python,/page\.screenshot\(/);
  assert.doesNotMatch(python,/page\.video/);
});

test("CI uploads local preview evidence after running browser tests, including on failure",()=>{
  const browse=workflow.indexOf("tests/browser/preview_smoke.py");
  const upload=workflow.indexOf("Upload local-preview browser acceptance evidence");
  assert.ok(browse>=0&&upload>browse);
  assert.match(workflow,/if: always\(\)/);
  assert.match(workflow,/uses: actions\/upload-artifact@v4/);
  assert.match(workflow,/path: test-results\/browser-preview-acceptance\.json/);
  assert.match(workflow,/retention-days: 14/);
});

test("all output textarea labels in Developer Studio are connected to real focus targets",()=>{
  assert.match(studio,/import \{[^}]*\buseId\b[^}]*\} from "react"/);
  assert.match(studio,/const id = useId\(\);/);
  assert.match(studio,/<Label htmlFor=\{id\}>\{label\}<\/Label>/);
  assert.match(studio,/<Textarea id=\{id\} value=\{value\} readOnly/);
});

test("Python browser suite parses before CI actually runs it",()=>{
  const source=new URL("tests/browser/preview_smoke.py",root);
  const run=spawnSync("python3",["-c","import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())",source.pathname],{encoding:"utf8",timeout:10000});
  assert.equal(run.status,0,run.stderr||run.stdout);
});

test("acceptance evidence documentation explicitly disclaims deployed provider verification",()=>{
  const doc=read("docs/LOCAL_PREVIEW_ACCEPTANCE_2026-11.md");
  assert.match(doc,/mocked GitHub/);
  assert.match(doc,/mocked AI/);
  assert.match(doc,/not production/i);
  assert.match(doc,/12 cases/);
  assert.match(doc,/24 viewport-specific journeys/);
});
