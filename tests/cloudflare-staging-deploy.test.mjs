import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {STAGING_REF,STAGING_URL,PRODUCTION_REF,stagingBuildEnv,verifyStagingAssets} from "../scripts/build-cloudflare-staging.mjs";
const valid={VITE_SUPABASE_PROJECT_ID:STAGING_REF,VITE_SUPABASE_URL:STAGING_URL,VITE_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_TEST_ONLY"};
test("staging variables must be explicit and cannot target production",()=>{
  assert.throws(()=>stagingBuildEnv({}),/isolated staging/);
  assert.throws(()=>stagingBuildEnv({...valid,VITE_SUPABASE_URL:"https://"+PRODUCTION_REF+".supabase.co"}),/isolated staging/);
  assert.throws(()=>stagingBuildEnv({...valid,VITE_SUPABASE_PUBLISHABLE_KEY:"sb_secret_TEST"}),/publishable/);
  const env=stagingBuildEnv({...valid,VITE_OPENAI_API_KEY:"private",VITE_ENABLE_STRIPE_TEST_CHECKOUT:"true",VITE_ENABLE_POLAR_SANDBOX_CHECKOUT:"true"});
  assert.equal(env.VITE_DISABLE_VISITOR_PRESENCE,"true");
  assert.equal(env.VITE_OPENAI_API_KEY,"");assert.equal(env.VITE_ENABLE_STRIPE_TEST_CHECKOUT,"false");assert.equal(env.VITE_ENABLE_POLAR_SANDBOX_CHECKOUT,"false");
});
test("static artifact guard detects production endpoint anywhere in nested JS",()=>{
  const dir=mkdtempSync(join(tmpdir(),"eternyx-stage-"));
  try{
    mkdirSync(join(dir,"assets"));writeFileSync(join(dir,"index.html"),"<html></html>");writeFileSync(join(dir,"release-info.json"),"{}");writeFileSync(join(dir,"assets/app.js"),STAGING_URL);
    assert.equal(verifyStagingAssets(dir).stagingBackendReference,true);
    writeFileSync(join(dir,"assets/extra.js"),PRODUCTION_REF);
    assert.throws(()=>verifyStagingAssets(dir),/Production project reference/);
    writeFileSync(join(dir,"assets/extra.js"),"sb_secret_"+"x".repeat(20));
    assert.throws(()=>verifyStagingAssets(dir),/private API key/);
  }finally{rmSync(dir,{recursive:true,force:true})}
});
test("explicit static Worker has no runtime code and guards deployment",()=>{
  const config=JSON.parse(readFileSync(new URL("../wrangler.staging.jsonc",import.meta.url),"utf8"));
  assert.equal(config.name,"eternyx-staging");assert.equal(config.assets.directory,"./dist");assert.equal(config.assets.not_found_handling,"single-page-application");
  assert.equal(config.main,undefined);assert.equal(config.build.command,"npm run build:staging");
  const service=readFileSync(new URL("../src/services/toolExecutionService.ts",import.meta.url),"utf8");
  assert.ok(!service.includes(PRODUCTION_REF));assert.match(service,/import\.meta\.env\.VITE_SUPABASE_URL/);
});

test("staging header policy and telemetry fence are source-defined without changing normal Vite build",()=>{
  const h=readFileSync(new URL("../infrastructure/cloudflare/staging-headers.txt",import.meta.url),"utf8");
  for(const line of ["Strict-Transport-Security: max-age=31536000","X-Content-Type-Options: nosniff","Referrer-Policy: no-referrer","X-Frame-Options: SAMEORIGIN","X-Robots-Tag: noindex, nofollow","frame-ancestors 'self'","object-src 'none'","/release-info.json\n  Cache-Control: no-store"])assert.ok(h.includes(line),line);
  assert.ok(!h.includes("'unsafe-eval'"));assert.ok(!h.includes(PRODUCTION_REF));assert.ok(h.includes(STAGING_URL));
  const presence=readFileSync(new URL("../src/components/home/VisitorPresence.tsx",import.meta.url),"utf8");
  assert.match(presence,/VITE_DISABLE_VISITOR_PRESENCE === "true"/);
  assert.match(presence,/enabled: !presenceDisabled && !privateEducation/);
  assert.match(presence,/if \(presenceDisabled\) return;/);
  assert.match(presence,/Live visitor telemetry is disabled in this staging environment/);
  const build=readFileSync(new URL("../scripts/build-cloudflare-staging.mjs",import.meta.url),"utf8");
  assert.match(build,/writeFileSync\("dist\/_headers"/);
});
