#!/usr/bin/env node
// Operator-only signing key generator. Private key stays outside Git/browser.
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
if(process.argv.length!==3 || !isAbsolute(process.argv[2])){
  process.stderr.write("Usage: node scripts/docker-lab-keygen.mjs /ABSOLUTE/PRIVATE/server-signing-key.pk8\n");
  process.exit(2);
}
try {
  const pair=generateKeyPairSync("ed25519");
  const der=pair.privateKey.export({type:"pkcs8",format:"der"});
  const pub=pair.publicKey.export({type:"spki",format:"der"});
  writeFileSync(process.argv[2],der,{flag:"wx",mode:0o600});
  process.stdout.write(JSON.stringify({
    publicKey:pub.subarray(12).toString("base64url"),
    privateKeyPath:process.argv[2],
    nextStep:"Configure the DER file as private secret DOCKER_LAB_SERVER_PRIVATE_KEY_PKCS8_B64 (base64), pin the PUBLIC key on agents.",
  },null,2)+"\n");
}catch{
  process.stderr.write("Unable to create private signing key file; check directory permissions and file existence.\n");
  process.exitCode=1;
}
