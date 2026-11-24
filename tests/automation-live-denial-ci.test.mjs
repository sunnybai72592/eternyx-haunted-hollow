import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {NEGATIVE_CASES} from "../scripts/automation-staging-negative-http.mjs";
test("credentialless CI targets exact live staging and mirrors five reviewed denial cases",async()=>{
 const w=await readFile(new URL("../.github/workflows/automation-live-denial-ci.yml",import.meta.url),"utf8");
 assert.ok(w.includes("https://mhodwvypfbxafamkrgsk.supabase.co/functions/v1/"));
 assert.ok(!w.includes("wcncuarekaofmfurbtbh"));
 for(const c of NEGATIVE_CASES){
   assert.ok(w.includes(JSON.stringify(c.id)));
   assert.ok(w.includes(JSON.stringify(c.slug)));
 }
 assert.match(w,/head.repo.full_name == github.repository/);
 assert.match(w,/head.ref == 'feat\/automation-phase3z-live-denial-ci-20261124'/);
 assert.match(w,/github.ref == 'refs\/heads\/main'/);
 assert.match(w,/ProxyHandler\(\{\}\)/);
 assert.match(w,/ssl.create_default_context\(\)/);
 assert.match(w,/response.read\(2049\)/);
 assert.match(w,/timeout=8/);
 assert.match(w,/authenticatedRuntimeVerified":False/);
 assert.doesNotMatch(w,/actions\/checkout|secrets\.|pull_request_target|continue-on-error|supabase functions deploy|supabase db push/);
});
