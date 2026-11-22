#!/usr/bin/env node
// Generate/sign a Docker agent enrollment identity on a trusted machine.
// The private key is never transmitted to ETERNYX.
import { generateKeyPairSync, createPrivateKey, sign } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const help="Usage: node scripts/docker-enrollment-key.mjs generate /absolute/private-key.pem OR sign /absolute/private-key.pem /absolute/challenge.txt";
function requirePath(path){if(!path||!resolve(path).startsWith("/") && process.platform!=="win32") throw new Error("Specify an absolute path.");return resolve(path);}
function checkPrivate(path){
  const stat=lstatSync(path);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>8192) throw new Error("Private key must be a small regular file.");
  if(process.platform!=="win32" && ((stat.mode&0o077)!==0 || stat.uid!==process.getuid())) throw new Error("Private key requires owner-only permissions and ownership.");
}
function main(argv){
  if(argv.length===2 && argv[0]==="generate"){
    const keyPath=requirePath(argv[1]);
    const {publicKey,privateKey}=generateKeyPairSync("ed25519");
    const pem=privateKey.export({type:"pkcs8",format:"pem"});
    writeFileSync(keyPath,pem,{flag:"wx",mode:0o600});
    const spki=publicKey.export({type:"spki",format:"der"});
    if(spki.length!==44 || spki.subarray(0,12).toString("hex")!=="302a300506032b6570032100") throw new Error("Unexpected Ed25519 key encoding.");
    process.stdout.write(JSON.stringify({publicKey:spki.subarray(12).toString("base64url"),privateKeySaved:true},null,2)+"\n");
    return;
  }
  if(argv.length===3 && argv[0]==="sign"){
    const keyPath=requirePath(argv[1]), challengePath=requirePath(argv[2]);
    checkPrivate(keyPath);
    const privateKey=createPrivateKey(readFileSync(keyPath,"utf8"));
    if(privateKey.asymmetricKeyType!=="ed25519")throw new Error("Ed25519 key required.");
    const challenge=readFileSync(challengePath,"utf8").replace(/\r?\n$/,"");
    if(Buffer.byteLength(challenge)>512 || !challenge.startsWith("ETERNYX_DOCKER_ENROLLMENT_V1\n") ||
      challenge.split("\n").length!==6)throw new Error("Invalid signed enrollment challenge.");
    process.stdout.write(JSON.stringify({signature:sign(null,Buffer.from(challenge,"utf8"),privateKey).toString("base64url")})+"\n");
    return;
  }
  throw new Error(help);
}
try{main(process.argv.slice(2));}catch(error){process.stderr.write((error instanceof Error?error.message:"Enrollment CLI failed")+"\n");process.exitCode=1;}
