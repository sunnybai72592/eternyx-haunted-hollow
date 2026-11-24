# Docker Phase 37 — seal the signed agent's Docker client configuration

**Prerequisite:** PR #699 merged. Phases 35–36 independently pin the actual root-owned Docker CLI ELF and execute that verified inode through Linux fd 3. But Docker still gets the operator's ordinary `HOME` and may read mutable `~/.docker/config.json`, context metadata, credentials, plugins and other client state. A pinned executable and pinned daemon are not a substitute for controlling the executable's **configuration inputs**.

Docker officially supports a global `--config DIR` flag. Phase 37 requires one separately approved, root-owned, two-file Docker CLI configuration directory and forces that flag on **every actual Docker CLI invocation**.

## Seven integrated release improvements

1. **Separate CLI config directory:** `ETERNYX_DOCKER_AGENT_CONFIG_DIR=/etc/eternyx/docker-agent-client` is a mandatory absolute path (example, **not created automatically**). The directory and every parent must be real, non-symlinked, owned by root and non-group/world-writable. The non-root agent may read it, but cannot update it.
2. **Independent full manifest pin:** `ETERNYX_DOCKER_AGENT_CONFIG_SHA256` must be the independently reviewed, lowercase 64-character SHA-256 for the exact canonical two-file manifest. Changed files, context name, endpoint or metadata fail closed before Docker.
3. **Exactly one minimal approved local context:** the config tree may contain only `config.json` and `contexts/meta/<sha256(context-name)>/meta.json` (plus their necessary directories). Both JSON files must be canonical one-line JSON with a single LF. `config.json` contains **only** `{"currentContext":"APPROVED_CONTEXT"}`. On-disk `meta.json` contains only `{"Name":"APPROVED_CONTEXT","Metadata":{},"Endpoints":{"docker":{"Host":"unix:///run/user/UID/docker.sock","SkipTLSVerify":false}}}`. Replace the illustrative context, UID and Unix socket with the **independently reviewed exact values**. No credentials, plugins, authorization helpers, TLS files, additional contexts, hidden files or unknown content.
4. **Double-read private filesystem integrity:** recursively examine *all four known directories* with exact allowed entries; use `lstat`, `O_NOFOLLOW`, `fstat`, bounded file reads and owner/mode/inode/time comparisons; verify two complete consecutive snapshots and independently pinned content hash. Unexpected extra files or changed paths fail closed.
5. **The real agent uses `docker --config <root-owned-dir>`** before every `context show`, `context inspect`, `info`, `container inspect` and `container start/stop/restart`. It never reads a Docker CLI configuration chosen through an inherited `DOCKER_CONFIG` override. The protected executable file descriptor remains inherited as child fd 3. Existing independent rootless daemon/socket and target pins remain mandatory.
6. **Exact command grammar:** refuse arbitrary Docker subcommands and flags. The only permitted operations are the existing two context-read operations, pinned rootless daemon info, full-ID container inspect and start/stop/restart. No pull, build, shell/exec, compose, context creation, plugin installation, remote TCP/SSH host or ad hoc format strings.
7. **Dedicated offline tests and CI fixture:** root-owned synthetic JSON files can be installed *only on the disposable Ubuntu CI runner* to exercise the actual full filesystem verification; no Docker daemon or container is started. The test suite also covers forbidden credentials, alternate endpoints, TLS, path traversal, arbitrary CLI args, changed context manifests, noncanonical duplicate-key JSON and all prior Phase 26–36 Docker safety suites.

## Operator release and reproducible manifest

After independent host approval, **an operator** creates a dedicated root-owned tree. The target context metadata should be generated and inspected according to the pinned Docker CLI version, then canonicalized to the minimal on-disk form above. `sha256(context-name)` here means the lowercase digest of the UTF-8 context name, without newline. Do not simply copy an unreviewed `~/.docker` directory. This configuration deliberately rejects most ordinary Docker environments.

The approval digest is:

```js
import {createHash} from "node:crypto";
const hash = b => createHash("sha256").update(b).digest("hex");
const manifest = [
  {path:"config.json",sha256:hash(configFileRawBytes)},
  {path:"contexts/meta/"+hash(approvedContextName)+"/meta.json",sha256:hash(metaFileRawBytes)}
];
const pinned = hash("ETERNYX_DOCKER_CLI_CONFIG_TREE_V1\n"+JSON.stringify(manifest));
```

The `pinned` value is what the independent approver sets as `ETERNYX_DOCKER_AGENT_CONFIG_SHA256`. Do not let the agent silently create the directory, regenerate a mismatched hash, rewrite files or switch contexts.

## Limitations

This is **not** a production deployment, a rootless Docker staging acceptance or proof of a successful container mutation. A compromised root/kernel, dishonest storage, malicious ELF interpreter/runtime, unexpected Docker implementation behavior, or a second privileged actor replacing root-owned client configuration during its brief verification/use window remain outside this guarantee. All Docker CLI commands and returned daemon/context state remain checked against the independent Engine pins and signed target policy. The earlier no-retry UNKNOWN hold, owner-private fsynced claims, full history scans and receipt safety gates remain untouched.

The `--resend-receipt` path remains **Docker-free** and does not need the sealed CLI config at all. A failure of config approval or an unknown action never permits automatic cleanup, a fabricated receipt or re-execution of Docker.
