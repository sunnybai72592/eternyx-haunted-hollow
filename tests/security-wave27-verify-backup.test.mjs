import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyBackup} from '../scripts/security-wave27-verify-backup.mjs';
const entry={name:'fixture.txt',bytes:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'};
const manifest=files=>({schema:'eternyx-synthetic-evidence-backup-v1',files});
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'wave27-'));try{writeFileSync(join(dir,'fixture.txt'),'abc');fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
test('verified bytes never imply manifest authenticity or production approval',()=>fixture(dir=>{
 assert.deepEqual(verifyBackup(dir,manifest([entry])),{schema:'eternyx-backup-verification-v1',filesVerified:1,bytesVerified:3,manifestAuthenticityVerified:false,productionAuthorized:false});
}));
test('same-size corruption and truncated files denied',()=>fixture(dir=>{
 writeFileSync(join(dir,'fixture.txt'),'abd');assert.throws(()=>verifyBackup(dir,manifest([entry])),/digest-mismatch/);
 writeFileSync(join(dir,'fixture.txt'),'ab');assert.throws(()=>verifyBackup(dir,manifest([entry])),/size-mismatch/);
}));
test('missing, extra, duplicate and traversal entries rejected',()=>fixture(dir=>{
 assert.throws(()=>verifyBackup(dir,manifest([entry,{...entry,name:'missing.txt'}])),/inventory-mismatch/);
 assert.throws(()=>verifyBackup(dir,manifest([entry,entry])),/invalid-entry/);
 assert.throws(()=>verifyBackup(dir,manifest([{...entry,name:'../fixture.txt'}])),/invalid-entry/);
 writeFileSync(join(dir,'extra.txt'),'abc');assert.throws(()=>verifyBackup(dir,manifest([entry])),/inventory-mismatch/);
}));
test('symlink and oversized or invalid manifest claims denied',()=>fixture(dir=>{
 rmSync(join(dir,'fixture.txt'));symlinkSync('/dev/null',join(dir,'fixture.txt'));
 assert.throws(()=>verifyBackup(dir,manifest([entry])),/invalid-file/);
 assert.throws(()=>verifyBackup(dir,manifest([{...entry,bytes:20971521}])),/invalid-entry/);
 assert.throws(()=>verifyBackup(dir,manifest([{...entry,sha256:'invalid'}])),/invalid-entry/);
}));
