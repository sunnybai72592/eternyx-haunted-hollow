#!/usr/bin/env node
/**
 * Local developer-only launcher for an intentionally vulnerable HTTP training
 * target. No cloud API, arbitrary shell commands, paid service, or production
 * Supabase dependency. Refuse a remote Docker daemon.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compose = resolve(root, "infrastructure/cyber-range/compose.yaml");
const project = "eternyx-local-range";
const commands = new Set(["start", "stop", "reset", "status", "logs"]);
const cmd = process.argv[2] || "help";

function docker(args, capture = false) {
  const result = spawnSync("docker", args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
    timeout: 120000,
  });
  if (result.error) throw new Error("Docker command failed: " + result.error.message);
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || "");
    throw new Error("Docker command returned exit status " + result.status);
  }
  return result.stdout || "";
}

function ensureLocalDaemon() {
  const override = process.env.DOCKER_HOST || "";
  if (override && !/^(unix:\/\/|npipe:\/\/)/.test(override)) {
    throw new Error("Remote Docker daemon is forbidden for vulnerable training targets");
  }
  const endpoint = docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], true).trim();
  if (!/^(unix:\/\/|npipe:\/\/)/.test(endpoint)) {
    throw new Error("Docker context is not a local Unix socket or Windows named pipe");
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const result = await fetch("http://127.0.0.1:8765/healthz", {
        signal: AbortSignal.timeout(1200),
        headers: { "Cache-Control": "no-store" },
      });
      if (result.ok) {
        console.log("Local ETERNYX range is ready: http://127.0.0.1:8765");
        return;
      }
    } catch {
      // Docker may still be starting. Never claim success until health responds.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("Container launched but local health check did not succeed. Run: npm run range -- logs");
}

async function main() {
  if (!commands.has(cmd)) {
    console.log("ETERNYX local cyber range (Docker Desktop / Linux Docker required)");
    console.log("npm run range -- start   Start the isolated 30-minute HTTP practice target");
    console.log("npm run range -- reset   Recreate container, rotate flags and clear practice state");
    console.log("npm run range -- stop    Remove only the ETERNYX local range project");
    console.log("npm run range -- status  Show range container status");
    console.log("npm run range -- logs    Show latest container logs");
    return;
  }

  ensureLocalDaemon();
  const args = (parts) => ["compose", "--project-name", project, "--file", compose, ...parts];

  if (cmd === "start") {
    docker(args(["up", "--detach", "--build", "--force-recreate"]));
    await waitForHealth();
  } else if (cmd === "reset") {
    docker(args(["down", "--volumes", "--remove-orphans"]));
    docker(args(["up", "--detach", "--build", "--force-recreate"]));
    await waitForHealth();
  } else if (cmd === "stop") {
    docker(args(["down", "--volumes", "--remove-orphans"]));
    console.log("Local ETERNYX range removed.");
  } else if (cmd === "status") {
    docker(args(["ps"]));
  } else {
    docker(args(["logs", "--tail", "60"]));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unable to run local cyber range");
  process.exitCode = 1;
});
