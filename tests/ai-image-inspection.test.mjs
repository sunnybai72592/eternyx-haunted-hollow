import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const src = await readFile(new URL("../supabase/functions/_shared/ai-image-inspection.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
function png(w,h) {
  const b=new Uint8Array(24); b.set([137,80,78,71,13,10,26,10]); b.set([0,0,0,13],8); b.set([73,72,68,82],12);
  b.set([(w>>>24)&255,(w>>>16)&255,(w>>>8)&255,w&255],16); b.set([(h>>>24)&255,(h>>>16)&255,(h>>>8)&255,h&255],20); return b;
}
function webpX(w,h) {
  const b=new Uint8Array(30); b.set([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88,10,0,0,0],0);
  const put=(o,n)=>b.set([n&255,(n>>>8)&255,(n>>>16)&255],o); put(24,w-1); put(27,h-1); return b;
}
function jpeg(w,h) {
  // SOF segment length includes its two length bytes and one component record.
  return new Uint8Array([0xff,0xd8,0xff,0xc0,0,11,8,(h>>8)&255,h&255,(w>>8)&255,w&255,1,1,0x11,0,0xff,0xd9]);
}
test("reads PNG, JPEG and WebP dimensions", () => {
  assert.deepEqual(mod.inspectImageDimensions(png(1920,1080),"image/png"),{width:1920,height:1080,format:"png"});
  assert.deepEqual(mod.inspectImageDimensions(jpeg(1280,720),"image/jpeg"),{width:1280,height:720,format:"jpeg"});
  assert.deepEqual(mod.inspectImageDimensions(webpX(640,480),"image/webp"),{width:640,height:480,format:"webp"});
});
test("rejects truncated, malformed and unsupported image headers", () => {
  for (const [bytes,type] of [[new Uint8Array(30),"image/png"],[png(1,1).slice(0,20),"image/png"],[png(10,10),"image/gif"],[jpeg(0,2),"image/jpeg"]]) {
    assert.throws(()=>mod.inspectImageDimensions(bytes,type));
  }
});
test("rejects dimensions exceeding axis or total pixel limits", () => {
  assert.throws(()=>mod.inspectImageDimensions(png(8193,1),"image/png"));
  assert.throws(()=>mod.inspectImageDimensions(png(5000,5000),"image/png"));
});
test("input verification inspects dimensions before marking the asset ready", async () => {
  const endpoint=await readFile(new URL("../supabase/functions/ai-generation-input-verify/index.ts",import.meta.url),"utf8");
  assert.match(endpoint,/inspectImageDimensions\(bytes, asset\.declared_content_type\)/);
  assert.ok(endpoint.indexOf("inspectImageDimensions(bytes, asset.declared_content_type)") < endpoint.indexOf('status: "ready"'));
  assert.match(endpoint,/status: "rejected"/);
});
