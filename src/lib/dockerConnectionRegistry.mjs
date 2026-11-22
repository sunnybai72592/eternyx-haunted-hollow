// Trusted workstation registry for read-only ETERNYX Docker agents.
// Contains only metadata and private token FILE PATHS, never token values.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, constants, fsyncSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { readAgentPort, readAgentToken } from "./dockerAgentConfig.mjs";
import { parseCloudSnapshot } from "./cloudInventoryUtils.mjs";

export const DOCKER_REGISTRY_VERSION = 1;
export const MAX_DOCKER_CONNECTIONS = 20;
export const DEFAULT_DOCKER_REGISTRY = join(homedir(), ".eternyx", "docker-connections.json");
const ID = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_RESPONSE = 512 * 1024;
const endpoints = { health: "/v1/health", list: "/v1/containers", images: "/v1/images" };
const validId = (id) => typeof id === "string" && ID.test(id);
const validateRecord = (record) => {
  if (!record || typeof record !== "object" || Array.isArray(record) ||
    !validId(record.id) || !Number.isInteger(record.port) ||
    record.port < 1024 || record.port > 65535 ||
    typeof record.tokenFile !== "string" || !isAbsolute(record.tokenFile) ||
    typeof record.registeredAt !== "string" || !Number.isFinite(Date.parse(record.registeredAt))) {
    throw new Error("Invalid local Docker connection registry entry.");
  }
  return { id: record.id, port: record.port, tokenFile: record.tokenFile, registeredAt: record.registeredAt };
};
function ensurePrivateDirectory(path) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Docker connection directory must be a real directory.");
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) throw new Error("Docker connection directory must have private 0700 permissions.");
}
function checkPrivateFile(path) {
  const file = lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink() || file.size > 32768) throw new Error("Invalid Docker connection registry file.");
  if (process.platform !== "win32") {
    if ((file.mode & 0o077) !== 0) throw new Error("Registry file permissions must be 0600.");
    if (typeof process.getuid === "function" && file.uid !== process.getuid()) throw new Error("Registry owner mismatch.");
  }
}
export function validateRegistry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    value.schemaVersion !== DOCKER_REGISTRY_VERSION ||
    !Array.isArray(value.connections) || value.connections.length > MAX_DOCKER_CONNECTIONS) {
    throw new Error("Unsupported or oversized Docker connection registry.");
  }
  const connections = value.connections.map(validateRecord);
  if (new Set(connections.map(x => x.id)).size !== connections.length ||
    new Set(connections.map(x => x.port)).size !== connections.length) {
    throw new Error("Duplicate connection IDs or tunnel ports.");
  }
  return connections;
}
export function readRegistry(path = DEFAULT_DOCKER_REGISTRY) {
  ensurePrivateDirectory(path);
  if (!existsSync(path)) return [];
  checkPrivateFile(path);
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("Docker connection registry is invalid JSON."); }
  return validateRegistry(parsed);
}
export function writeRegistry(connections, path = DEFAULT_DOCKER_REGISTRY) {
  // Fail closed on concurrent registry edits; atomic rename avoids partial JSON files.
  ensurePrivateDirectory(path);
  const data = JSON.stringify({ schemaVersion: DOCKER_REGISTRY_VERSION, connections: validateRegistry({schemaVersion:1, connections}) }, null, 2) + "\n";
  if (Buffer.byteLength(data) > 32768) throw new Error("Registry exceeds size limit.");
  const lockPath = path + ".lock";
  const lock = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  let temp = "";
  try {
    if (existsSync(path)) checkPrivateFile(path);
    temp = path + "." + randomUUID() + ".tmp";
    const fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, path);
  } finally {
    if (temp && existsSync(temp)) unlinkSync(temp);
    closeSync(lock);
    unlinkSync(lockPath);
  }
}
export function parseConnectionArgs(id, portValue, tokenFile) {
  if (!validId(id)) throw new Error("Connection ID must be a lowercase slug (1-40 characters, starting with a letter).");
  const port = readAgentPort(portValue);
  if (typeof tokenFile !== "string" || !isAbsolute(tokenFile)) throw new Error("Token file path must be absolute.");
  // Read the file to check owner/mode, but never return or store credential contents.
  readAgentToken(tokenFile);
  return { id, port, tokenFile, registeredAt: new Date().toISOString() };
}
export function addConnection(connections, entry) {
  if (connections.some(c=>c.id===entry.id)) throw new Error("Connection ID already registered.");
  if (connections.some(c=>c.port===entry.port)) throw new Error("Tunnel port already registered.");
  return validateRegistry({schemaVersion:1,connections:[...connections,entry]});
}
export function replaceConnection(connections, entry) {
  if (!connections.some(c=>c.id===entry.id)) throw new Error("Connection not found.");
  if (connections.some(c=>c.id!==entry.id && c.port===entry.port)) throw new Error("Tunnel port already registered.");
  return validateRegistry({schemaVersion:1,connections:connections.map(c=>c.id===entry.id?entry:c)});
}
export function removeConnection(connections, id) {
  if (!connections.some(c=>c.id===id)) throw new Error("Connection not found.");
  return connections.filter(c=>c.id!==id);
}
export function findConnection(connections, id) {
  const connection = connections.find(c=>c.id===id);
  if (!connection) throw new Error("Connection not found.");
  return connection;
}
export async function queryConnection(entry, operation = "health", fetcher = fetch) {
  const c = validateRecord(entry);
  const path = endpoints[operation];
  if (!path) throw new Error("Unsupported read-only agent operation.");
  const token = readAgentToken(c.tokenFile);
  // Only loopback targets are allowed. SSH tunnels must be configured separately.
  const response = await fetcher("http://127.0.0.1:" + c.port + path, {
    method: "GET",
    redirect: "error",
    cache: "no-store",
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Docker agent unavailable (HTTP " + response.status + ").");
  if (!(response.headers.get("content-type") || "").startsWith("application/json")) throw new Error("Unexpected agent response format.");
  if (Number(response.headers.get("content-length") || "0") > MAX_RESPONSE) throw new Error("Agent response too large.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_RESPONSE) throw new Error("Agent response too large.");
    chunks.push(chunk);
  }
  let result;
  try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("Invalid JSON response from Docker agent."); }
  if (operation === "health") {
    if (result?.status !== "agent-ready" || result?.mode !== "read-only" ||
      typeof result.checkedAt !== "string" || !Number.isFinite(Date.parse(result.checkedAt))) {
      throw new Error("Docker agent identity or health response invalid.");
    }
    return { id: c.id, state: "agent-reachable", checkedAt: result.checkedAt };
  }
  if (result?.source !== "eternyx-docker-readonly-agent" ||
    typeof result.capturedAt !== "string" || !Number.isFinite(Date.parse(result.capturedAt)) ||
    !Array.isArray(operation === "list" ? result.containers : result.images)) {
    throw new Error("Agent inventory response was invalid.");
  }
  return result;
}
export function makeConnectionSnapshot(result) {
  if (result?.source !== "eternyx-docker-readonly-agent" || !Array.isArray(result.containers)) throw new Error("Invalid Docker inventory.");
  return parseCloudSnapshot(JSON.stringify({
    schemaVersion:1, collectedAt:result.capturedAt,
    docker:{status:"available",version:"",containers:result.containers},
    kubernetes:{status:"unavailable",context:"",namespace:"",pods:[],deployments:[]},
  }));
}
