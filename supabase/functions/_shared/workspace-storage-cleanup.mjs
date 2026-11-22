// Privileged deletion helper. Only invoke AFTER authenticating the owner.
// Delete via Storage API (not storage.objects SQL) to remove real object bytes.
const MAX_FILE_OBJECTS = 10000;
const PER_PAGE = 100;
const OWNER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function safeSegment(segment) {
  return typeof segment === "string" && segment.length >= 1 &&
    segment.length <= 255 && segment !== "." && segment !== ".." &&
    !segment.includes("/") && !segment.includes("\\") && !/[\u0000-\u001F]/.test(segment);
}

function isBucketMissing(error) {
  const code = String(error?.statusCode ?? error?.status ?? "");
  return (code === "404" || code === "NoSuchBucket") &&
    /bucket|not found|does not exist/i.test(String(error?.message ?? ""));
}

export async function collectOwnedStorageKeys(bucket, ownerId) {
  if (!OWNER_ID.test(ownerId)) throw new Error("Invalid account identity");
  const pending = [{ prefix: ownerId, depth: 0 }];
  const keys = [];
  const foldersSeen = new Set();
  while (pending.length) {
    const { prefix, depth } = pending.shift();
    if (foldersSeen.has(prefix)) continue;
    foldersSeen.add(prefix);
    if (foldersSeen.size > MAX_FILE_OBJECTS) throw new Error("Too many Storage folders to safely clean up");
    for (let offset = 0;; offset += PER_PAGE) {
      const { data, error } = await bucket.list(prefix, { limit: PER_PAGE, offset });
      if (error) {
        if (prefix === ownerId && isBucketMissing(error)) return null;
        throw new Error("Could not inspect private account files: " + error.message);
      }
      const batch = data ?? [];
      for (const object of batch) {
        if (!safeSegment(object.name)) throw new Error("Unsafe Storage object path encountered");
        const path = prefix + "/" + object.name;
        if (object.id === null || object.id === undefined) {
          if (depth >= 5) throw new Error("Unexpectedly nested Storage directory");
          pending.push({ prefix: path, depth: depth + 1 });
        } else {
          keys.push(path);
          if (keys.length > MAX_FILE_OBJECTS) throw new Error("Too many Storage files to safely clean up");
        }
      }
      if (batch.length < PER_PAGE) break;
    }
  }
  return keys;
}

export async function removeOwnedStorage(bucket, ownerId) {
  const keys = await collectOwnedStorageKeys(bucket, ownerId);
  if (keys === null) return { removed: 0, available: false };
  for (let i = 0; i < keys.length; i += PER_PAGE) {
    const chunk = keys.slice(i, i + PER_PAGE);
    const { error } = await bucket.remove(chunk);
    if (error) throw new Error("Failed to delete private account files: " + error.message);
  }
  // If an upload raced with deletion or Storage returned a partial response,
  // never claim the account was fully erased.
  const remaining = await collectOwnedStorageKeys(bucket, ownerId);
  if (remaining !== null && remaining.length) {
    throw new Error("Private account files remain after cleanup; retry account deletion");
  }
  return { removed: keys.length, available: true };
}
