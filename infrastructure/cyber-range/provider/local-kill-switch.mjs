/**
 * Local-only launch halt switch, independent of Supabase connectivity.
 * A host administrator engages it before emergency cleanup. Subsequent
 * Docker starts fail closed until the operator manually reviews the incident
 * and removes the marker file.
 */
import { lstat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_HOST_HALT_FILE = join(homedir(), ".eternyx-range-launches-halted");

export async function assertLocalLaunchAllowed(path = DEFAULT_HOST_HALT_FILE) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw new Error("Local kill-switch state cannot be checked; launches denied");
  }
  throw new Error("Local emergency stop active; new labs cannot be launched");
}

export async function engageLocalHostHalt(path = DEFAULT_HOST_HALT_FILE) {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile("ETERNYX managed range launch halt. Operator review required before removal.\n");
    await handle.sync();
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false; // already halted
    throw new Error("Unable to engage local range kill switch; operator must intervene");
  } finally {
    if (handle) await handle.close();
  }
}
