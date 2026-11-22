// Secure operator-managed token file. Never embed agent credentials in web bundles.
import { lstatSync, readFileSync } from "node:fs";
import { getuid } from "node:process";
export function readAgentToken(path) {
  if (typeof path !== "string" || !path || path.includes("\0")) throw new Error("Set ETERNYX_DOCKER_AGENT_TOKEN_FILE to an existing private token file.");
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 256) throw new Error("Agent credential must be a small regular file, not a symlink.");
  if (process.platform !== "win32") {
    if ((info.mode & 0o077) !== 0) throw new Error("Agent token file permissions must be 0600 or stricter.");
    if (typeof getuid === "function" && info.uid !== getuid()) throw new Error("Agent token file must be owned by the current user.");
  }
  const token = readFileSync(path, "utf8").trim();
  if (!/^[a-f0-9]{64,128}$/.test(token)) throw new Error("Agent token must be a random hex string of 64-128 characters.");
  return token;
}
export function readAgentPort(value) {
  if (value === undefined || value === "") return 43871;
  if (!/^\d{4,5}$/.test(value)) throw new Error("Invalid agent port.");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error("Agent port must be between 1024 and 65535.");
  return n;
}
