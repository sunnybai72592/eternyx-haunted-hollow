/**
 * Local-only deterministic Docker driver for the ETERNYX range provider.
 * A trusted operator runs this ON THE HOST. Never mount the Docker socket
 * into any vulnerable container, gateway or production Edge Function.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectForSession, validSessionId } from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import { sessionFromProject, verifyManagedContainer } from "./orphan-watchdog.mjs";
import { assertLocalLaunchAllowed } from "./local-kill-switch.mjs";
import { admitHostLab, verifyRuntimeIsolation } from "./isolation-policy.mjs";

const composeFile = resolve(dirname(fileURLToPath(import.meta.url)), "../compose.managed.yaml");
const managedPlaceholder = "0".repeat(64);

export function assertLocalDockerHost(env = process.env, contextHost = "") {
  if (env.DOCKER_HOST && !/^(unix:\/\/|npipe:\/\/)/.test(env.DOCKER_HOST)) {
    throw new Error("Remote Docker daemons are prohibited for vulnerable range targets");
  }
  if (env.DOCKER_CONTEXT && env.DOCKER_CONTEXT !== "default" && env.DOCKER_CONTEXT !== "desktop-linux") {
    throw new Error("Explicit nonstandard Docker contexts require a separate operator review");
  }
  if (contextHost && !/^(unix:\/\/|npipe:\/\/)/.test(contextHost)) {
    throw new Error("Docker context does not resolve to a local socket");
  }
}

export function dockerProcessEnv(env = process.env, token = managedPlaceholder) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("Invalid managed gateway token");
  // Never inherit CTF_RANGE_WORKER_TOKEN or any Supabase service credentials.
  return {
    PATH: env.PATH || "/usr/local/bin:/usr/bin:/bin",
    ...(env.HOME ? { HOME: env.HOME } : {}),
    ...(env.DOCKER_HOST && /^(unix:\/\/|npipe:\/\/)/.test(env.DOCKER_HOST)
      ? { DOCKER_HOST: env.DOCKER_HOST } : {}),
    ETERNYX_GATEWAY_TOKEN: token,
  };
}

function executeDocker(args, token = managedPlaceholder) {
  const outcome = spawnSync("docker", args, {
    env: dockerProcessEnv(process.env, token),
    cwd: dirname(composeFile),
    encoding: "utf8",
    shell: false,
    timeout: 90_000,
    maxBuffer: 256 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (outcome.error || outcome.status !== 0) {
    // Avoid including Docker output: image/env diagnostics might contain a secret.
    throw new Error("Docker command failed; inspect local runtime status securely");
  }
  return (outcome.stdout || "").trim();
}

const composeArgs = (id, extra) => [
  "compose", "-p", projectForSession(id), "-f", composeFile, ...extra,
];

export class LocalDockerRangeRuntime {
  #validated = false;

  validateHost() {
    assertLocalDockerHost(process.env);
    const host = executeDocker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
    assertLocalDockerHost(process.env, host.trim());
    this.#validated = true;
  }

  #requireHost() {
    if (!this.#validated) this.validateHost();
  }

  async start(sessionId) {
    if (!validSessionId(sessionId)) throw new Error("Invalid session identifier");
    if (process.env.ETERNYX_PROVIDER_EXECUTION !== "enabled" ||
        process.env.ETERNYX_RANGE_OPERATOR_ACK !== "LOCAL_ONLY_NO_PUBLIC_INGRESS") {
      throw new Error("Local provider execution requires explicit operator opt-in");
    }
    this.#requireHost();
    await assertLocalLaunchAllowed();
    // The host also enforces a local 3-lab resource envelope independently
    // of the Supabase rolling daily budget and maximum active sessions.
    const previous = await this.listVerifiedManagedProjects();
    const projects = [...new Set(previous.map(item=>
      verifyManagedContainer(item).project))];
    admitHostLab({ existingProjects: projects, sessionId });
    for (const project of projects) {
      const record = previous.find(item=>
        item.Config.Labels["com.docker.compose.project"] === project);
      await this.attest(verifyManagedContainer(record).sessionId);
    }

    const token = randomBytes(32).toString("hex");
    let launched = false;
    try {
      await assertLocalLaunchAllowed();
      executeDocker(composeArgs(sessionId, ["up", "--detach", "--build", "--force-recreate"]), token);
      launched = true;
      const portLine = executeDocker(composeArgs(sessionId, ["port", "gateway", "8081"]), token);
      const match = /^127\.0\.0\.1:(\d{1,5})$/.exec(portLine);
      const port = match ? Number(match[1]) : NaN;
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error("Gateway was not published only to loopback");
      }

      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const response = await fetch("http://127.0.0.1:" + port + "/healthz", {
            headers: { authorization: "Bearer " + token },
            signal: AbortSignal.timeout(1300),
          });
          if (response.ok) {
            await this.attest(sessionId);
            // Caller MUST NOT log token or put it in DB/HTTP responses. An
            // authenticated browser ingress proxy is a separate milestone.
            return { instanceRef: projectForSession(sessionId), localPort: port, token };
          }
        } catch {
          // The local container gateway may still be booting.
        }
        await new Promise((done) => setTimeout(done, 400));
      }
      throw new Error("Managed gateway did not become healthy");
    } catch (error) {
      if (launched) {
        try { await this.stop(sessionId); } catch { /* Retain error; operator reconciliation needed. */ }
      }
      throw error;
    }
  }

  /**
   * Discover all ETERNYX-labelled projects and verify EVERY member of each
   * Docker Compose project, including members missing our managed labels.
   * A project with any unexpected service/label is unsafe to mutate.
   */
  async listVerifiedManagedProjects() {
    this.#requireHost();
    const listIds = (args) => {
      const out = executeDocker(["ps", "--all", "--no-trunc", "--quiet", ...args]);
      const ids = out ? out.split(/\r?\n/).filter(Boolean) : [];
      if (ids.length > 100 || ids.some(x=>!/^[0-9a-f]{64}$/.test(x))) {
        throw new Error("Untrusted Docker ID inventory; cleanup refused");
      }
      return ids;
    };
    const inspect = (id) => {
      const raw = executeDocker(["inspect", "--format", "{{json .}}", id]);
      try {
        const data = JSON.parse(raw);
        if (data?.Id !== id) throw new Error("Container ID changed");
        return data;
      } catch {
        throw new Error("Malformed Docker inspection; cleanup refused");
      }
    };

    const managedIds = listIds(["--filter","label=org.eternyx.range.managed=v1"]);
    if (!managedIds.length) return [];
    const managed = managedIds.map(inspect);
    const projects = new Set();
    for (const item of managed) {
      const verified = verifyManagedContainer(item);
      projects.add(verified.project);
    }

    const all = [];
    const seen = new Set();
    for (const project of projects) {
      if (!sessionFromProject(project)) {
        throw new Error("Unexpected managed project identifier; cleanup refused");
      }
      const projectIds = listIds(["--filter","label=com.docker.compose.project=" + project]);
      if (!projectIds.length) throw new Error("Managed project disappeared during inspection");
      for (const id of projectIds) {
        if (seen.has(id)) throw new Error("Container duplicated across projects");
        seen.add(id);
        const inspected = inspect(id);
        if (verifyManagedContainer(inspected).project !== project) {
          throw new Error("Docker project membership changed during inspection");
        }
        all.push(inspected);
      }
    }
    if (all.length !== managedIds.length ||
        managedIds.some(id=>!seen.has(id))) {
      throw new Error("Docker project contains an unexpected container; cleanup refused");
    }
    return all;
  }

  /**
   * Independently inspect actual Docker state, not just Compose YAML.
   * Never return raw host/docker inspect output or gateway credentials.
   */
  async attest(sessionId) {
    if (!validSessionId(sessionId)) throw new Error("Invalid range session for isolation audit");
    this.#requireHost();
    const project = projectForSession(sessionId);
    const all = await this.listVerifiedManagedProjects();
    const containers = all.filter(item=>
      item.Config.Labels["com.docker.compose.project"] === project);
    const networks = [];
    for (const name of [project + "_local_target_only",project + "_localhost_ingress"]) {
      const raw = executeDocker(["network","inspect","--format","{{json .}}",name]);
      let data;
      try { data = JSON.parse(raw); }
      catch { throw new Error("Managed Docker network attestation failed"); }
      if (data?.Name !== name) throw new Error("Managed Docker network attestation failed");
      networks.push(data);
    }
    return verifyRuntimeIsolation(sessionId, containers, networks);
  }

  async exists(sessionId) {
    if (!validSessionId(sessionId)) throw new Error("Invalid session identifier");
    this.#requireHost();
    const listed = executeDocker(composeArgs(sessionId, ["ps", "--status", "running", "-q", "gateway"]));
    return listed.length > 0;
  }

  async stop(sessionId) {
    if (!validSessionId(sessionId)) throw new Error("Invalid session identifier");
    this.#requireHost();
    executeDocker(composeArgs(sessionId, ["down", "--volumes", "--remove-orphans"]));
    return true;
  }
}
