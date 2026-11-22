#!/usr/bin/env node
// Operator-controlled loopback-only API for SSH port forwarding; no hosted endpoints.
import { spawnSync } from "node:child_process";
import { createDockerAgentServer } from "../src/lib/dockerAgentService.mjs";
import { readAgentToken, readAgentPort } from "../src/lib/dockerAgentConfig.mjs";
import { isLocalEndpoint } from "../src/lib/dockerOperatorUtils.mjs";
const run = (args) => {
  const result = spawnSync("docker", args, { shell: false, encoding: "utf8", timeout: 8000, maxBuffer: 524288, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("Docker CLI unavailable.");
  return result.stdout.trim();
};
function verifyContext() {
  if (process.env.DOCKER_HOST && !isLocalEndpoint(process.env.DOCKER_HOST)) throw new Error("Remote DOCKER_HOST is forbidden.");
  const context = run(["context", "show"]);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(context)) throw new Error("Invalid Docker context.");
  let endpoint;
  try { endpoint = JSON.parse(run(["context", "inspect", context, "--format", "{{json .Endpoints.docker.Host}}"])); }
  catch { throw new Error("Cannot verify Docker context."); }
  if (!isLocalEndpoint(endpoint)) throw new Error("Docker context must refer to a local socket or named pipe.");
  return context;
}
if (process.argv.length !== 2) {
  process.stderr.write("Run without arguments; see docs/DOCKER_AGENT_TUNNEL.md\n");
  process.exit(2);
}
try {
  const token = readAgentToken(process.env.ETERNYX_DOCKER_AGENT_TOKEN_FILE);
  const port = readAgentPort(process.env.ETERNYX_DOCKER_AGENT_PORT);
  // Validate before accepting any client. Re-validate context every request.
  verifyContext();
  const server = createDockerAgentServer({
    token,
    runDocker: (args) => {
      const context = verifyContext();
      return run(["--context", context, ...args]);
    },
  });
  server.on("error", () => { process.stderr.write("Docker agent failed to bind its loopback port.\n"); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => {
    process.stderr.write("ETERNYX Docker read-only agent listening on 127.0.0.1:" + port + ". SSH tunneling only.\n");
  });
  process.on("SIGINT", () => server.close());
  process.on("SIGTERM", () => server.close());
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : "Docker agent failed.") + "\n");
  process.exitCode = 1;
}
