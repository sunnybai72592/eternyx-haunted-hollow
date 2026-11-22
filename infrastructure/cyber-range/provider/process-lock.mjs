/**
 * Fail-closed singleton process lock for the local operator Docker host.
 * Prevents two cooperative instances on the same host from racing Docker
 * operations, on top of the database worker lease. Never blindly remove
 * a stale lock: inspect the host and old process before manual recovery.
 */
import { open, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_PATH = join(tmpdir(), "eternyx-range-provider-host.lock");

export async function acquireLocalOperatorLock(path = DEFAULT_PATH) {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile("ETERNYX range provider operator lock\n");
  } catch (error) {
    try { if (handle) await handle.close(); } catch { /* best effort */ }
    // Deliberately do not delete an unknown/stale lock automatically.
    throw new Error("Another operator process or stale local lock exists; Docker access refused");
  }

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      try { await handle.close(); } finally { await unlink(path); }
    },
  };
}
