import type { SessionContext, WorkspaceRepository } from "@meditaur/domain";
import { db } from "./schema.ts";
import { LOCAL_USER, LOCAL_WS } from "./seed.ts";

/**
 * Claim the local seed workspace for the first user who signs in.
 *
 * The rows that carry identity are the `members` membership and the
 * `preferences` key — both keyed by user id — because the workspace row itself
 * has no owner column. One transaction, and a no-op unless the workspace is
 * still unclaimed: a workspace another user already claimed is left inert rather
 * than re-pointed at whoever signed in next.
 *
 * Known limitation, until cloud workspaces exist (sync): a second user signing in
 * on the same device is also handed the local workspace, because Dexie holds one
 * database. Per-user workspaces belong to the sync step.
 */
export const dexieWorkspaces: WorkspaceRepository = {
  async adopt(userId: string): Promise<SessionContext> {
    return db.transaction("rw", [db.workspaces, db.members, db.preferences], async () => {
      const workspace = await db.workspaces.get(LOCAL_WS);
      if (!workspace) return { userId, workspaceId: LOCAL_WS };

      const alreadyTheirs = Boolean(await db.members.get([LOCAL_WS, userId]));
      const stillUnclaimed = Boolean(await db.members.get([LOCAL_WS, LOCAL_USER]));
      if (alreadyTheirs || !stillUnclaimed || userId === LOCAL_USER) {
        return { userId, workspaceId: LOCAL_WS };
      }

      await db.members.put({ workspaceId: LOCAL_WS, userId, role: "owner" });
      await db.members.delete([LOCAL_WS, LOCAL_USER]);

      const preferences = await db.preferences.get(LOCAL_USER);
      if (preferences) {
        await db.preferences.put({ ...preferences, userId });
        await db.preferences.delete(LOCAL_USER);
      }

      return { userId, workspaceId: LOCAL_WS };
    });
  },
};
