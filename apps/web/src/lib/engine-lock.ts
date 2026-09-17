const LOCK_KEY_PREFIX = "meditaur:engineOwner";
const HEARTBEAT_MS = 2000;
const STALE_MS = 5000;

type Owner = { id: string; at: number };

/**
 * The lock key is scoped to the signed-in user, not to the browser profile.
 * Two people can be signed in on one device — Dexie holds one database, so the
 * app hands both of them the same local workspace today — and a profile-wide key
 * would let the first one's session block the second one's. Before accounts the
 * scope is `LOCAL_USER`, which is the same single-user behaviour as before.
 */
export function runnerLockKey(userId: string): string {
  return `${LOCK_KEY_PREFIX}:${userId}`;
}

function readOwner(userId: string): Owner | null {
  try {
    const raw = localStorage.getItem(runnerLockKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Owner;
    if (typeof parsed.id !== "string" || typeof parsed.at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeOwner(userId: string, id: string): void {
  localStorage.setItem(runnerLockKey(userId), JSON.stringify({ id, at: Date.now() }));
}

export function claimRunnerLock(userId: string, tabId: string): boolean {
  if (!userId) return false;
  const owner = readOwner(userId);
  const now = Date.now();
  if (owner && owner.id !== tabId && now - owner.at < STALE_MS) {
    return false;
  }
  writeOwner(userId, tabId);
  return true;
}

export function heartbeatRunnerLock(userId: string, tabId: string): void {
  if (!userId) return;
  const owner = readOwner(userId);
  if (owner && owner.id !== tabId) return;
  writeOwner(userId, tabId);
}

export function releaseRunnerLock(userId: string, tabId: string): void {
  if (!userId) return;
  const owner = readOwner(userId);
  if (owner && owner.id !== tabId) return;
  localStorage.removeItem(runnerLockKey(userId));
}

export function runnerLockHeartbeatMs(): number {
  return HEARTBEAT_MS;
}
