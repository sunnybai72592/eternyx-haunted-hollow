import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const config=JSON.parse(readFileSync(new URL("../wrangler.preview.jsonc",import.meta.url),"utf8"));
test("explicit preview config targets the existing Worker and opts into Wrangler previews",()=>{
  assert.deepEqual(Object.keys(config).sort(),["assets","build","compatibility_date","name","previews"].sort());
  assert.equal(config.name,"eternyx-haunted-hollow");
  assert.deepEqual(config.previews,{});
  assert.deepEqual(config.assets,{directory:"./dist",not_found_handling:"single-page-application"});
});
test("preview builds use existing staging guard and leave separate staging Worker unchanged",()=>{
  assert.deepEqual(config.build,{command:"npm run build:staging"});
  const staging=JSON.parse(readFileSync(new URL("../wrangler.staging.jsonc",import.meta.url),"utf8"));
  assert.equal(staging.name,"eternyx-staging");
  assert.equal(staging.build.command,"npm run build:staging");
  assert.notEqual(config.name,staging.name);
});
