import { useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import WorkspaceCaptureLink from "@/components/workspace/WorkspaceCaptureLink";
import { Cloud, Container, Network, ShieldCheck, Upload, Database, Workflow, GitBranch, Server, AlertTriangle, ArrowUpRight } from "lucide-react";
import { parseCloudSnapshot, MAX_SNAPSHOT_BYTES } from "@/lib/cloudInventoryUtils.mjs";

type Snapshot = ReturnType<typeof parseCloudSnapshot>;
const statusText = (ok: boolean) => ok ? "Collected on operator host" : "Unavailable at collection";
const tools = [
  { title: "Container configuration review", detail: "Local Dockerfile, Compose and Kubernetes manifest checks", to: "/developer-studio/container-infrastructure", icon: Container },
  { title: "Deployment intelligence", detail: "Review deployment configuration before release", to: "/developer-studio/deployment-intelligence", icon: GitBranch },
  { title: "GitHub integrations", detail: "Repository and development integration tools", to: "/developer-studio/github-hub", icon: Workflow },
  { title: "API engineering", detail: "Build, test and debug requests", to: "/developer-studio/api-workbench", icon: Server },
];

export default function CloudIntegrations() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Re-selecting the same file should work.
    event.target.value = "";
    setError("");
    setSnapshot(null);
    if (!file) return;
    if (file.size > MAX_SNAPSHOT_BYTES) { setError("Snapshot exceeds the 512 KB limit."); return; }
    setLoading(true);
    try { setSnapshot(parseCloudSnapshot(await file.text())); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to read this snapshot."); }
    finally { setLoading(false); }
  };
  return <div className="mx-auto max-w-7xl space-y-8 px-4 pb-20 pt-4 text-foreground sm:px-6">
    <Link className="text-sm text-cyan-300 hover:underline" to="/explore">All ETERNYX pillars</Link>
    <WorkspaceCaptureLink title="Cloud & Integrations" />
    <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-slate-950 to-cyan-950/60 p-7 text-white sm:p-10">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300"><Cloud className="h-5 w-5" /> ETERNYX infrastructure</div>
      <h1 className="mt-4 text-3xl font-bold sm:text-5xl">Cloud &amp; <span className="text-cyan-300">Integrations</span></h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-300">A unified home for cloud resources, infrastructure operations and connected services. Begin with real read-only inventory from an operator-controlled Docker host or Kubernetes namespace.</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300">
        <span className="rounded-full border border-slate-700 px-3 py-1">Local operator inventory available</span>
        <span className="rounded-full border border-slate-700 px-3 py-1">Remote live control not connected</span>
        <span className="rounded-full border border-slate-700 px-3 py-1">No credentials uploaded</span>
      </div>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-labelledby="inventory-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="inventory-title" className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="h-6 w-6 text-cyan-500" /> Infrastructure inventory</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Run the read-only collector on a trusted computer with Docker CLI and/or kubectl access, then import its JSON output here. The snapshot stays in this browser tab; it is not a live connection and is not uploaded or saved.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-foreground hover:bg-cyan-500/20 focus-within:ring-2 focus-within:ring-cyan-400">
          <Upload className="h-4 w-4" /> {loading ? "Reading…" : "Import snapshot"}
          <input type="file" accept=".json,application/json" className="sr-only" onChange={onFile} aria-label="Import ETERNYX infrastructure snapshot JSON" />
        </label>
      </div>
      <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Operator command · repository checkout</p>
        <code className="block break-all font-mono text-xs sm:text-sm">node scripts/cloud-inventory.mjs &gt; cloud-snapshot.json</code>
        <p className="mt-2 text-xs text-muted-foreground">Optional: set ETERNYX_KUBE_NAMESPACE to inspect a permitted namespace. Requires local Docker / Kubernetes CLI access. No execution happens in the browser.</p>
      </div>
      {error && <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-red-500"><AlertTriangle className="h-4 w-4" />{error}</p>}
      {snapshot ? <>
        <p className="mt-5 text-sm text-muted-foreground">Snapshot captured <time dateTime={snapshot.collectedAt}>{new Date(snapshot.collectedAt).toLocaleString()}</time>. Results may now be stale.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-border p-5">
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Container className="h-5 w-5" /> Docker</h3>
            <p className="mt-2 text-xs text-muted-foreground">{statusText(snapshot.docker.status === "available")} {snapshot.docker.version && "· Engine " + snapshot.docker.version}</p>
            <p className="mt-3 text-2xl font-bold">{snapshot.docker.status === "available" ? snapshot.docker.containers.length : "—"} <span className="text-sm font-normal text-muted-foreground">containers in snapshot</span></p>
            <div className="mt-4 space-y-2">{snapshot.docker.containers.map((item, index) => <div key={item.id + index} className="rounded-lg bg-muted/30 p-3 text-sm"><p className="break-words font-medium">{item.name || item.id}</p><p className="mt-1 break-all text-xs text-muted-foreground">{item.image} · {item.state || item.status}</p></div>)}</div>
            {snapshot.docker.status === "available" && snapshot.docker.containers.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No containers were returned by Docker.</p>}
          </article>
          <article className="rounded-xl border border-border p-5">
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Network className="h-5 w-5" /> Kubernetes</h3>
            <p className="mt-2 break-all text-xs text-muted-foreground">{statusText(snapshot.kubernetes.status === "available")} {snapshot.kubernetes.namespace && "· Namespace: " + snapshot.kubernetes.namespace}</p>
            <p className="mt-3 text-2xl font-bold">{snapshot.kubernetes.status === "available" ? snapshot.kubernetes.pods.length : "—"} <span className="text-sm font-normal text-muted-foreground">pods in snapshot</span></p>
            <div className="mt-4 space-y-2">{snapshot.kubernetes.pods.map((item, index) => <div key={item.namespace + item.name + index} className="rounded-lg bg-muted/30 p-3 text-sm"><p className="break-all font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.phase} · Ready {item.ready}</p></div>)}</div>
            {snapshot.kubernetes.status === "available" && <p className="mt-4 text-sm text-muted-foreground">{snapshot.kubernetes.deployments.length} deployments returned; {snapshot.kubernetes.deployments.map((item) => item.name + " (" + item.ready + "/" + item.replicas + ")").join(", ") || "none found"}.</p>}
          </article>
        </div>
      </> : <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-8 text-center"><Database className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No inventory loaded</p><p className="mt-1 text-sm text-muted-foreground">Import an actual operator-generated snapshot to see Docker and Kubernetes state.</p></div>}
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-labelledby="docker-local-title">
      <h2 id="docker-local-title" className="flex items-center gap-2 text-2xl font-semibold"><Container className="h-6 w-6 text-cyan-500" /> Docker operator workbench</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Run real Docker operations on a trusted workstation from the ETERNYX repository. This is an operator CLI, not live remote browser control.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {[
          ["Container inventory", "node scripts/docker-operator.mjs list"],
          ["Local image inventory", "node scripts/docker-operator.mjs images"],
          ["Container details", "node scripts/docker-operator.mjs inspect FULL_CONTAINER_ID"],
          ["Resource usage", "node scripts/docker-operator.mjs stats FULL_CONTAINER_ID"],
          ["Bounded logs", "node scripts/docker-operator.mjs logs FULL_CONTAINER_ID"],
          ["Guarded lifecycle preview", "node scripts/docker-operator.mjs stop FULL_CONTAINER_ID"],
        ].map(([label, command]) => <div key={label} className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">{label}</p>
          <code className="mt-2 block break-all text-xs text-muted-foreground">{command}</code>
        </div>)}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Start, stop and restart require an exact full ID, hardened local-workbench labels, explicit confirmation, and a recorded local audit entry. See <code>docs/DOCKER_OPERATOR_RUNBOOK.md</code>. This does not operate on production or remote customer infrastructure.</p>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-labelledby="remote-docker-title">
      <div className="flex items-center gap-3"><Server className="h-6 w-6 text-cyan-500" /><h2 id="remote-docker-title" className="text-2xl font-semibold">Remote Docker inventory via SSH tunnel</h2></div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Connect to a trusted server using a loopback-only Docker read-only agent and an authenticated SSH tunnel. No Docker socket is made public, no application logs are exposed, and the website never receives connection credentials.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold">Trusted server · agent</p>
          <code className="mt-2 block break-all text-xs text-muted-foreground">node scripts/docker-readonly-agent.mjs</code>
          <p className="mt-2 text-xs text-muted-foreground">A private 0600 token file is required. Local 127.0.0.1 binding only.</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold">Trusted workstation · snapshot</p>
          <code className="mt-2 block break-all text-xs text-muted-foreground">node scripts/docker-agent-client.mjs snapshot &gt; cloud-snapshot.json</code>
          <p className="mt-2 text-xs text-muted-foreground">Uses your authenticated SSH tunnel; import the JSON above. No live browser session.</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">See <code>docs/DOCKER_AGENT_TUNNEL.md</code> for SSH, token setup, read-only endpoints, and security restrictions. This is an operator-only bridge, not yet a multi-tenant ETERNYX service.</p>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-labelledby="docker-connections-title">
      <div className="flex items-center gap-3">
        <Network className="h-6 w-6 text-cyan-500" />
        <h2 id="docker-connections-title" className="text-2xl font-semibold">Docker agent connection manager</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Register multiple trusted Docker servers through separate SSH tunnels, check actual agent reachability, and export one server's real inventory to this page. Configured connections are not automatically considered online.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ["Register a verified agent", "node scripts/docker-connections.mjs add lab-east 43872 /ABSOLUTE/TOKEN-FILE"],
          ["Check live agent health", "node scripts/docker-connections.mjs check-all"],
          ["List configured hosts", "node scripts/docker-connections.mjs list"],
          ["Export a server snapshot", "node scripts/docker-connections.mjs snapshot lab-east > cloud-snapshot.json"],
        ].map(([label, command]) => <div key={label} className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">{label}</p>
          <code className="mt-2 block break-all text-xs text-muted-foreground">{command}</code>
        </div>)}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Credentials remain in private workstation files, not in ETERNYX or its browser. Connection registration, rotation, and removal are local operator actions. See <code>docs/DOCKER_CONNECTION_REGISTRY.md</code> for setup, security, and limitations.</p>
    </section>
    <section className="rounded-2xl border border-cyan-400/20 bg-card p-5 sm:p-7"><h2 className="text-xl font-semibold">Account-bound Docker agent enrollment</h2><p className="mt-2 text-sm text-muted-foreground">Register Docker workspaces and verify Ed25519 key possession without sharing private keys, Docker credentials or live server access.</p><Link to="/integrations/docker-enrollment" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-cyan-500 px-4 font-semibold text-slate-950">Open Docker enrollment</Link><p className="mt-3 text-xs text-muted-foreground">Requires sign-in and deployment of the authenticated enrollment backend. A verified identity is not a live Docker connection.</p></section>
    <section className="rounded-2xl border border-cyan-400/20 bg-card p-5 sm:p-7"><h2 className="text-xl font-semibold">Docker Operation Review</h2><p className="mt-2 text-sm text-muted-foreground">Account-owned start, stop and restart plans with explicit approval, short expiry, and audit events. Hosted execution is disabled until agent command delivery is independently secured.</p><Link to="/integrations/docker-control" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-cyan-500 px-4 font-semibold text-slate-950">Open operation review</Link></section>
    <section aria-labelledby="connections-title" className="space-y-4">
      <h2 id="connections-title" className="text-2xl font-semibold">Infrastructure workspaces</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map(({ title, detail, to, icon: Icon }) => <Link key={to} to={to} className="group rounded-xl border border-border bg-card p-5 hover:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"><div className="flex items-center gap-3"><Icon className="h-5 w-5 text-cyan-500" /><h3 className="font-semibold">{title}</h3><ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-cyan-500" /></div><p className="mt-2 text-sm text-muted-foreground">{detail}</p></Link>)}
      </div>
    </section>
    <section className="rounded-xl border border-border p-5">
      <h2 className="text-lg font-semibold">Next infrastructure milestone</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Remote Docker and Kubernetes connectivity requires a separate authenticated server-side service with least-privilege credentials, tenant isolation, allowlisted operations, rate limits and audit logs. No live servers, paid hosting or cluster privileges are provisioned by this page.</p>
    </section>
  </div>;
}
