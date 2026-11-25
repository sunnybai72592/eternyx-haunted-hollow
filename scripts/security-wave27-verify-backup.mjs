import {openSync,closeSync,fstatSync,readSync,readdirSync,lstatSync,readFileSync,constants} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const MAX_FILE=20*1024*1024,MAX_TOTAL=1024*1024*1024;
export function verifyBackup(directory,manifest){
 if(!manifest||manifest.schema!=='eternyx-synthetic-evidence-backup-v1'||!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>1024)throw Error('invalid-manifest');
 if(!lstatSync(directory).isDirectory())throw Error('invalid-directory');
 const names=new Set();let total=0;
 for(const entry of manifest.files){
  if(!entry||typeof entry.name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$/.test(entry.name)||names.has(entry.name)||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>MAX_FILE||!/^[0-9a-f]{64}$/.test(entry.sha256??''))throw Error('invalid-entry');
  names.add(entry.name);total+=entry.bytes;if(total>MAX_TOTAL)throw Error('backup-too-large');
 }
 const actual=readdirSync(directory);
 if(actual.length!==names.size||actual.some(name=>!names.has(name)))throw Error('inventory-mismatch');
 for(const entry of manifest.files){
  const path=join(directory,entry.name);
  if(!lstatSync(path).isFile())throw Error('invalid-file');
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const stat=fstatSync(fd);
   if(!stat.isFile()||stat.size!==entry.bytes)throw Error('size-mismatch');
   const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let count=0;
   while(true){const n=readSync(fd,buffer,0,buffer.length,null);if(!n)break;count+=n;if(count>entry.bytes)throw Error('size-mismatch');hash.update(buffer.subarray(0,n));}
   if(count!==entry.bytes||hash.digest('hex')!==entry.sha256)throw Error('digest-mismatch');
  }finally{closeSync(fd);}
 }
 return {schema:'eternyx-backup-verification-v1',filesVerified:names.size,bytesVerified:total,manifestAuthenticityVerified:false,productionAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==4)throw Error('usage');
  const m=process.argv[3];if(!lstatSync(m).isFile()||lstatSync(m).size>262144)throw Error('invalid-manifest');
  console.log(JSON.stringify(verifyBackup(process.argv[2],JSON.parse(readFileSync(m,'utf8'))),null,2));
 }catch{console.error('Backup verification blocked; review inventory, size and digest.');process.exitCode=1;}
}
