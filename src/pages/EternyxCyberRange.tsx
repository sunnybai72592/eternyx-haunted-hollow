import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Container, ExternalLink, FolderLock,
  HardDrive, Network, RotateCcw, ShieldAlert, ShieldCheck, Terminal, Timer,
} from "lucide-react";

const commands = [
  { label: "Start", value: "npm run range -- start", info: "Build and start one local, disposable training container." },
  { label: "Reset", value: "npm run range -- reset", info: "Destroy the existing target and recreate it with new random flags." },
  { label: "Status", value: "npm run range -- status", info: "Inspect the lifecycle of your local range." },
  { label: "Stop", value: "npm run range -- stop", info: "Delete the local training container and its transient state." },
];

const rooms = [
  { name: "Ticket Ownership", difficulty: "Beginner", point: "IDOR", description: "Access another user's support ticket through an unchecked record identifier." },
  { name: "Document Root Escape", difficulty: "Intermediate", point: "Path traversal", description: "Read a private training file by traversing above the public directory." },
  { name: "Operations Role Spoofing", difficulty: "Intermediate", point: "Authorization bypass", description: "Find how the server incorrectly trusts a client-supplied role header." },
];

export default function EternyxCyberRange() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-7 px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <Link to="/labs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> Back to Labs</Link>

        <header className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.13] via-card to-accent/[0.07] p-6 sm:p-9">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary"><Container className="h-4 w-4" /> ETERNYX · Local Cyber Range / 01</p>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Real HTTP targets. Controlled practice.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Run a deliberately vulnerable Node.js application inside a disposable Docker container on your own computer.
            Explore actual HTTP request-handling flaws, discover runtime-generated flags, and reset the entire environment.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {["Three backend challenges", "Local Docker runtime", "30-minute automatic expiry", "No cloud deployment"].map((item) =>
              <span key={item} className="rounded-lg border border-border bg-background/50 px-3 py-1.5">{item}</span>)}
          </div>
        </header>

        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldAlert className="h-5 w-5 text-amber-500" /> Developer preview — not a hosted lab yet</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            This page explains a local runnable container environment. Visiting ETERNYX does not start a virtual machine,
            create a cloud session, or connect to your local Docker daemon. The intentionally vulnerable target must never
            be exposed on a public port, VPN, shared workstation, or production server. Docker isolation is defense in depth,
            not a guarantee against container escape.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Network, title: "Loopback-only exposure", description: "Target is bound to 127.0.0.1:8765 on the Docker host." },
            { icon: FolderLock, title: "Disposable filesystem", description: "Read-only image and transient training data; no host bind mounts or production credentials." },
            { icon: Timer, title: "Automatic expiry", description: "Target server closes after 30 minutes; reset rotates random practice flags." },
          ].map((item) => {
            const Icon = item.icon;
            return <div key={item.title} className="rounded-2xl border border-border/70 bg-card/70 p-5"><Icon className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">{item.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p></div>;
          })}
        </section>

        <section className="rounded-2xl border border-border/70 bg-card/70 p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <Terminal className="mt-1 h-6 w-6 shrink-0 text-primary" />
            <div><h2 className="text-xl font-bold">Run it on your own computer</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Requires Docker Desktop or local Linux Docker with Compose v2, Node.js 22, npm, and a checkout of the ETERNYX GitHub repository.</p></div>
          </div>
          <div className="mt-5 space-y-3">
            {commands.map((command) => (
              <div key={command.label} className="rounded-xl border border-border/70 bg-background/50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-14 text-xs font-bold uppercase tracking-wide text-primary">{command.label}</span>
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs sm:text-sm">{command.value}</code>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{command.info}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm">After the local launcher reports a healthy container, open <strong>http://127.0.0.1:8765</strong> in the same computer's browser.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card/70 p-5 sm:p-7">
          <h2 className="text-xl font-bold">Three network-backed practice rooms</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Unlike browser-only practice, these targets handle real HTTP requests. All records and filesystem contents are synthetic, created just for the local lab.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {rooms.map((room) => <article key={room.name} className="rounded-xl border border-border/70 bg-background/40 p-4">
              <p className="text-xs font-bold text-primary">{room.difficulty} · {room.point}</p><h3 className="mt-2 font-semibold">{room.name}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{room.description}</p>
            </article>)}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <Link to="/labs/ctf" className="rounded-2xl border border-border/70 bg-card/70 p-5 transition hover:border-primary/40">
            <HardDrive className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">Browser CTF rooms</h2><p className="mt-2 text-sm text-muted-foreground">Continue solving the original four browser-only vulnerability demonstrations.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary">Open CTF <ArrowRight className="h-4 w-4" /></span>
          </Link>
          <Link to="/labs/verified" className="rounded-2xl border border-border/70 bg-card/70 p-5 transition hover:border-primary/40">
            <ShieldCheck className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">Verified forensic missions</h2><p className="mt-2 text-sm text-muted-foreground">Account-linked evidence challenges, provided their server backend has been deployed.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary">Open missions <ArrowRight className="h-4 w-4" /></span>
          </Link>
        </section>

        <footer className="rounded-xl border border-border/70 bg-card/70 p-4 text-xs leading-6 text-muted-foreground">
          This is a local proof of concept, not a public multi-tenant cyber range. It does not provision remote sessions,
          authenticate ETERNYX accounts or award official points. Before any hosted release, we must add a separate hardened
          orchestration control plane, per-player tenant isolation, secure ingress, quotas and billing safeguards,
          plus external penetration testing of the infrastructure.
        </footer>
      </div>
    </div>
  );
}
