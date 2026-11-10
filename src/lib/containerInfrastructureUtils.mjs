const MAX_INPUT = 200_000;

function requireSource(source, label) {
  if (typeof source !== "string" || !source.trim()) throw new Error(label + " is required.");
  if (source.length > MAX_INPUT) throw new Error(label + " exceeds the 200 KB local analysis limit.");
  return source;
}

function finding(level, title, detail) { return { level, title, detail }; }

export function analyzeDockerfile(source) {
  const text = requireSource(source, "Dockerfile");
  const lines = text.split(/\r?\n/);
  const instructions = lines.map((line, index) => ({ line: line.trim(), number: index + 1 })).filter(({ line }) => line && !line.startsWith("#"));
  const directive = (name) => instructions.filter(({ line }) => new RegExp("^" + name + "\\s+", "i").test(line));
  const findings = [];
  const from = directive("FROM");
  const user = directive("USER");
  const workdir = directive("WORKDIR");
  const copy = directive("COPY");
  const add = directive("ADD");
  if (!from.length) findings.push(finding("error", "Missing FROM instruction", "A Dockerfile needs a base image or a valid scratch stage."));
  if (!user.length) findings.push(finding("warning", "No USER instruction", "The container may run as root. Create/use a dedicated non-root user where the application permits it."));
  if (!workdir.length) findings.push(finding("info", "No WORKDIR instruction", "Set an explicit working directory to make subsequent relative paths predictable."));
  if (add.length) findings.push(finding("warning", "Review ADD usage", "Prefer COPY for ordinary local files. Keep ADD only when its archive or remote-URL behavior is intentionally required."));
  if (instructions.some(({ line }) => /^FROM\s+[^\s]+:(latest|\*)\b/i.test(line))) findings.push(finding("warning", "Mutable base image tag", "Pin a supported image version or digest to improve reproducibility."));
  if (instructions.some(({ line }) => /^RUN\s+.*(curl|wget).*(\|\s*(sh|bash)|bash\s+-c)/i.test(line))) findings.push(finding("warning", "Remote script execution pattern", "Review downloaded scripts, pin their integrity, and avoid piping unverified remote content directly into a shell."));
  if (instructions.some(({ line }) => /^EXPOSE\s+.*(22|2375|2376)(\/|\s|$)/i.test(line))) findings.push(finding("warning", "Sensitive service port exposed", "Confirm SSH or Docker daemon ports are intentionally exposed and protected by network policy."));
  const copyAll = copy.filter(({ line }) => /^(COPY|ADD)\s+\.\s+\./i.test(line));
  if (copyAll.length) findings.push(finding("info", "Broad build-context copy", "Use a .dockerignore file to keep secrets, dependencies, build output, and local files out of the build context."));
  if (!findings.length) findings.push(finding("info", "No common Dockerfile risks detected", "Static checks found no patterns in this limited rule set. This is not a complete Dockerfile or image security audit."));
  return { instructions: instructions.length, baseImages: from.map(({ line }) => line.replace(/^FROM\s+/i, "")), findings };
}

export function analyzeCompose(source) {
  const text = requireSource(source, "Compose file");
  const lines = text.split(/\r?\n/);
  const findings = [];
  if (!/^\s*services\s*:/m.test(text)) findings.push(finding("error", "Missing services section", "A Compose application normally defines at least one service under the top-level services key."));
  if (/\bprivileged\s*:\s*true\b/i.test(text)) findings.push(finding("error", "Privileged container enabled", "Privileged mode grants extensive host capabilities. Remove it unless a documented requirement and compensating controls exist."));
  if (/\bnetwork_mode\s*:\s*host\b/i.test(text)) findings.push(finding("warning", "Host networking enabled", "Host networking reduces network isolation. Confirm it is required and understood."));
  if (/\bpid:\s*host\b/i.test(text)) findings.push(finding("warning", "Host PID namespace enabled", "Sharing the host PID namespace can expose host process information."));
  if (/^[ \t]*(?:[A-Za-z0-9_-]*[_-])?(?:password|secret|token|api[_-]?key)[ \t]*:[ \t]*(?![${])[\x21-\x7E][^\n]*$/im.test(text)) findings.push(finding("error", "Possible hard-coded secret", "A credential-like value appears directly in the Compose file. Use a secret manager or protected runtime injection; rotate exposed credentials."));
  if (/\bports\s*:\s*[\s\S]{0,250}?-\s*["']?\d+:\d+/i.test(text) && !/127\.0\.0\.1:/i.test(text)) findings.push(finding("info", "Review published port bindings", "Published ports may bind on all host interfaces. Bind to loopback when external access is not required."));
  if (/\bimage\s*:\s*[^\n]*:latest\s*(?:#.*)?$/im.test(text)) findings.push(finding("warning", "Mutable image tag", "Avoid latest for controlled releases; pin an explicit version or digest."));
  if (!/\bhealthcheck\s*:/i.test(text)) findings.push(finding("info", "No healthcheck detected", "Consider a healthcheck so orchestration can detect an unhealthy application process."));
  if (!findings.length) findings.push(finding("info", "No common Compose risks detected", "Static checks found no patterns in this limited rule set. Validate with Docker Compose before use."));
  const serviceMatches = [...text.matchAll(/^\s{0,2}([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]).filter((name) => name !== "services" && name !== "volumes" && name !== "networks" && name !== "secrets" && name !== "configs");
  return { lines: lines.length, serviceNames: [...new Set(serviceMatches)], findings };
}

export function analyzeKubernetesManifest(source) {
  const text = requireSource(source, "Kubernetes manifest");
  const docs = text.split(/^---\s*$/m).map((doc) => doc.trim()).filter(Boolean);
  const findings = [];
  if (!/^\s*apiVersion\s*:/m.test(text)) findings.push(finding("error", "Missing apiVersion", "Each Kubernetes resource needs an apiVersion."));
  if (!/^\s*kind\s*:/m.test(text)) findings.push(finding("error", "Missing kind", "Each Kubernetes resource needs a kind."));
  if (/\bprivileged\s*:\s*true\b/i.test(text)) findings.push(finding("error", "Privileged workload", "A privileged container weakens isolation. Avoid it unless explicitly justified."));
  if (/\ballowPrivilegeEscalation\s*:\s*true\b/i.test(text)) findings.push(finding("warning", "Privilege escalation allowed", "Set allowPrivilegeEscalation to false where compatible."));
  if (/\bhostNetwork\s*:\s*true\b/i.test(text)) findings.push(finding("warning", "Host network enabled", "Host networking shares the node network namespace and should be exceptional."));
  if (/\bhostPath\s*:/i.test(text)) findings.push(finding("warning", "hostPath volume detected", "HostPath can expose node files. Restrict paths and permissions or use an appropriate volume type."));
  if (/\bimage\s*:\s*[^\n]*:latest\s*(?:#.*)?$/im.test(text)) findings.push(finding("warning", "Mutable image tag", "Pin a version or immutable digest for reproducible rollouts."));
  if (!/\breadinessProbe\s*:/i.test(text)) findings.push(finding("info", "No readiness probe detected", "Add a readiness probe so traffic is sent only when the application is ready."));
  if (!/\blivenessProbe\s*:/i.test(text)) findings.push(finding("info", "No liveness probe detected", "Consider a liveness probe for automatic recovery from an unhealthy process."));
  if (!/\bresources\s*:/i.test(text)) findings.push(finding("warning", "No resource requests/limits detected", "Define appropriate CPU and memory requests/limits to support scheduling and resource governance."));
  if (!findings.length) findings.push(finding("info", "No common manifest risks detected", "Static checks found no patterns in this limited rule set. Validate against the target cluster and policy set."));
  const kinds = [...text.matchAll(/^\s*kind\s*:\s*([A-Za-z]+)/gm)].map((match) => match[1]);
  return { documents: docs.length, kinds, findings };
}
