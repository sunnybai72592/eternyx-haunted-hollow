import test from "node:test";
import assert from "node:assert/strict";
import {
  assertWorkspaceImportOwner, sha256Hex, storeAndVerifyWorkspaceImportFile,
  verifyCompletedWorkspaceImport,
} from "../src/lib/workspaceImportRecovery.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const session="22222222-2222-4222-8222-222222222222";
const file={title:"proof.txt",mime_type:"text/plain",size_bytes:5,
  bytes:new TextEncoder().encode("hello")};
const path=owner+"/p/import-0-proof.txt";
function storage(body="hello",uploadError=null) {
  const calls={uploads:0,downloads:0};
  return {
    calls,
    async upload(key,bytes,opts) {
      calls.uploads++;
      assert.equal(key,path);
      assert.equal(opts.upsert,false);
      assert.equal(opts.contentType,"text/plain");
      assert.deepEqual(bytes,file.bytes);
      return {data:uploadError?null:{path:key},error:uploadError};
    },
    async download(key) {
      calls.downloads++;
      assert.equal(key,path);
      return {data:new Blob([new TextEncoder().encode(body)]),error:null};
    },
  };
}

test("every new private upload is verified by download even after success",async()=>{
  const holder=storage();
  assert.equal(await storeAndVerifyWorkspaceImportFile(holder,path,file),true);
  assert.equal(holder.calls.uploads,1);
  assert.equal(holder.calls.downloads,1);
});

test("same-key upload errors are safe only if existing bytes match",async()=>{
  const existing=storage("hello",{message:"Object already exists"});
  assert.equal(await storeAndVerifyWorkspaceImportFile(existing,path,file),true);
  assert.equal(existing.calls.uploads,1);
  assert.equal(existing.calls.downloads,1);
  await assert.rejects(storeAndVerifyWorkspaceImportFile(
    storage("world",{message:"Object exists"}),path,file),/checksum mismatch/);
});

test("previously registered private files are rechecked but never overwritten",async()=>{
  const existing=storage("hello");
  await storeAndVerifyWorkspaceImportFile(existing,path,file,true);
  assert.equal(existing.calls.uploads,0);
  assert.equal(existing.calls.downloads,1);
  await assert.rejects(storeAndVerifyWorkspaceImportFile(
    storage("world"),path,file,true),/checksum mismatch/);
});

test("invalid private file bytes or nominal size cannot reach storage",async()=>{
  await assert.rejects(storeAndVerifyWorkspaceImportFile(storage(),path,
    {...file,size_bytes:6}),/Invalid private file/);
  await assert.rejects(storeAndVerifyWorkspaceImportFile(storage(),path,
    {...file,bytes:"hello"}),/Invalid private file/);
});

function client({authOwner=owner,integrity=true,claims=null,stored="hello"}={}) {
  const one=claims??[{file_index:0,storage_path:path,sha256:"",
    title:"proof.txt",size_bytes:5,mime_type:"text/plain",registered:true}];
  const calls={reads:0};
  return {
    calls,
    auth:{getUser:async()=>({data:{user:{id:authOwner}},error:null})},
    rpc:async(fn,args)=>{
      assert.equal(fn,"workspace_import_integrity");
      assert.equal(args.p_session_id,session);
      return {data:{session_id:session,status:"complete",content_matches:integrity},error:null};
    },
    from(table){
      assert.equal(table,"workspace_import_files");
      return {
        select(fields) { assert.match(fields,/file_index/);return this; },
        async eq(column,value) {
          assert.equal(column,"session_id");assert.equal(value,session);
          calls.reads++;
          return {data:one,error:null};
        },
      };
    },
    storage:{from:()=>{
      const bucket=storage(stored);
      return {download:bucket.download};
    }},
  };
}

test("fresh Auth user is required to continue the original owner's restore",async()=>{
  assert.equal(await assertWorkspaceImportOwner(client(),owner),true);
  await assert.rejects(assertWorkspaceImportOwner(client({authOwner:"someone-else"}),owner),
    /account changed/);
  await assert.rejects(assertWorkspaceImportOwner({auth:{
    getUser:async()=>({data:{user:null},error:null}),
  }},owner),/expired/);
});

test("completed imports recheck private byte content and server DB checkpoint",async()=>{
  const good=client();
  const hash=await sha256Hex(file.bytes);
  const claim={file_index:0,storage_path:path,sha256:hash,title:file.title,
    size_bytes:file.size_bytes,mime_type:file.mime_type,registered:true};
  good.from=()=>({select(){return this;},async eq(){
    return {data:[claim],error:null};
  }});
  assert.equal(await verifyCompletedWorkspaceImport(good,owner,session,[file]),true);
  await assert.rejects(verifyCompletedWorkspaceImport(client({integrity:false}),owner,session,[file]),
    /contents differ/);
  const altered=client({stored:"world"});
  altered.from=good.from;
  await assert.rejects(verifyCompletedWorkspaceImport(altered,owner,session,[file]),
    /checksum mismatch/);
  await assert.rejects(verifyCompletedWorkspaceImport(client({authOwner:"other"}),owner,session,[file]),
    /account changed/);
});

test("completed import refuses missing or unexpected registered file claims",async()=>{
  const missing=client({claims:[]});
  await assert.rejects(verifyCompletedWorkspaceImport(missing,owner,session,[file]),
    /claims could not be verified/);
  const bad=client({claims:[{file_index:0,storage_path:path,
    sha256:"0".repeat(64),title:file.title,size_bytes:5,
    mime_type:"text/plain",registered:true}]});
  await assert.rejects(verifyCompletedWorkspaceImport(bad,owner,session,[file]),
    /manifest does not match/);
});
