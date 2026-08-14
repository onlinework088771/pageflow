/**
 * YouTube Channels routes (protected).
 *
 * All operations are scoped to the authenticated user via account → channel FK chain.
 *
 * GET    /youtube-channels                      — list all managed channels
 * POST   /youtube-channels                      — add a channel to management
 * GET    /youtube-channels/:id                  — get channel details
 * PUT    /youtube-channels/:id                  — update channel settings
 * DELETE /youtube-channels/:id                  — remove channel from management
 * PATCH  /youtube-channels/:id/automation       — update automation settings
 * PATCH  /youtube-channels/:id/source           — update content source
 */

import { Router, type IRouter } from "express";
import {
  db,
  youtubeAccountsTable,
  youtubeChannelsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helper — get all account IDs that belong to the current user
// ---------------------------------------------------------------------------

async function getUserAccountIds(userId: number): Promise<number[]> {
  const accounts = await db
    .select({ id: youtubeAccountsTable.id })
    .from(youtubeAccountsTable)
    .where(eq(youtubeAccountsTable.userId, userId));
  return accounts.map((a) => a.id);
}

// Helper — verify a channel belongs to the authenticated user
async function getUserChannel(
  channelDbId: number,
  userId: number,
): Promise<typeof youtubeChannelsTable.$inferSelect | null> {
  const accountIds = await getUserAccountIds(userId);
  if (!accountIds.length) return null;

  const [channel] = await db
    .select()
    .from(youtubeChannelsTable)
    .where(
      and(
        eq(youtubeChannelsTable.id, channelDbId),
        inArray(youtubeChannelsTable.accountId, accountIds),
      ),
    );
  return channel ?? null;
}

// Serialize channel row to API shape
function serializeChannel(ch: typeof youtubeChannelsTable.$inferSelect) {
  return {
    id: String(ch.id),
    accountId: String(ch.accountId),
    channelId: ch.channelId,
    name: ch.name,
    description: ch.description,
    thumbnailUrl: ch.thumbnailUrl,
    subscriberCount: ch.subscriberCount,
    automationEnabled: ch.automationEnabled,
    sourceType: ch.sourceType,
    sourceIdentity: ch.sourceIdentity,
    postsPerDay: ch.postsPerDay,
    scheduleLogic: ch.scheduleLogic,
    timezone: ch.timezone,
    timeSlots: Array.isArray(ch.timeSlots) ? ch.timeSlots : [],
    status: ch.status,
    lastPostedAt: ch.lastPostedAt?.toISOString() ?? null,
    lastPostedVideoId: ch.lastPostedVideoId,
    totalPosted: ch.totalPosted,
    totalFailed: ch.totalFailed,
    createdAt: ch.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// List channels
// ---------------------------------------------------------------------------

router.get("/youtube-channels", async (req, res): Promise<void> => {
  const userId = (req as any).user.id as number;
  const accountIds = await getUserAccountIds(userId);

  if (!accountIds.length) {
    res.json([]);
    return;
  }

  const channels = await db
    .select()
    .from(youtubeChannelsTable)
    .where(inArray(youtubeChannelsTable.accountId, accountIds));

  res.json(channels.map(serializeChannel));
});

// ---------------------------------------------------------------------------
// Create / add channel
// ---------------------------------------------------------------------------

router.post("/youtube-channels", async (req, res): Promise<void> => {
  const userId = (req as any).user.id as number;
  const {
    accountId,
    channelId,
    name,
    description,
    thumbnailUrl,
    subscriberCount,
  } = req.body as Record<string, any>;

  if (!accountId || !channelId || !name) {
    res.status(400).json({ error: "accountId, channelId and name are required" });
    return;
  }

  // Verify account belongs to user
  const [account] = await db
    .select()
    .from(youtubeAccountsTable)
    .where(
      and(
        eq(youtubeAccountsTable.id, parseInt(accountId, 10)),
        eq(youtubeAccountsTable.userId, userId),
      ),
    );

  if (!account) {
    res.status(403).json({ error: "Account not found or not authorized" });
    return;
  }

  const [channel] = await db
    .insert(youtubeChannelsTable)
    .values({
      accountId: parseInt(accountId, 10),
      channelId,
      name,
      description: description ?? null,
      thumbnailUrl: thumbnailUrl ?? null,
      subscriberCount: subscriberCount ?? 0,
      status: "paused",
    })
    .onConflictDoUpdate({
      target: youtubeChannelsTable.channelId,
      set: { name, description: description ?? null, thumbnailUrl: thumbnailUrl ?? null, subscriberCount: subscriberCount ?? 0 },
    })
    .returning();

  res.status(201).json(serializeChannel(channel));
});

// ---------------------------------------------------------------------------
// Get single channel
// ---------------------------------------------------------------------------

router.get("/youtube-channels/:id", async (req, res): Promise<void> => {
  const userId = (req as any).user.id as number;
  const id = parseInt(req.params["id"], 10);

  const channel = await getUserChannel(id, userId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  res.json(serializeChannel(channel));
});

// ---------------------------------------------------------------------------
// Update channel (general settings)
// ---------------------------------------------------------------------------

router.put("/youtube-channels/:id", async (req, res): Promise<void> => {
  const userId = (req as any).user.id as number;
  const id = parseInt(req.params["id"], 10);

  const channel = await getUserChannel(id, userId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const { automationEnabled, status } = req.body as Record<string, any>;

  const updates: Partial<typeof youtubeChannelsTable.$inferInsert> = {};
  if (typeof automationEnabled === "boolean") updates.automationEnabled = automationEnabled;
  if (status === "active" || status === "paused") updates.status = status;

  const [updated] = await db
    .update(youtubeChannelsTable)
    .set(updates)
    .where(eq(youtubeChannelsTable.id, id))
    .returning();

  res.json(serializeChannel(updated));
});

// ---------------------------------------------------------------------------
// Delete channel
// ---------------------------------------------------------------------------

router.delete("/youtube-channels/:id", async (req, res): Promise<void> => {
  const userId = (req as any).user.id as number;
  const id = parseInt(req.params["id"], 10);

  const channel = await getUserChannel(id, userId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  await db.delete(youtubeChannelsTable).where(eq(youtubeChannelsTable.id, id));
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Update automation settings
// ---------------------------------------------------------------------------

router.patch(
  "/youtube-channels/:id/automation",
  async (req, res): Promise<void> => {
    const userId = (req as any).user.id as number;
    const id = parseInt(req.params["id"], 10);

    const channel = await getUserChannel(id, userId);
    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const { postsPerDay, scheduleLogic, timezone, timeSlots, automationEnabled } =
      req.body as Record<string, any>;

    const updates: Partial<typeof youtubeChannelsTable.$inferInsert> = {};
    if (typeof postsPerDay === "number") updates.postsPerDay = postsPerDay;
    if (scheduleLogic === "fixed" || scheduleLogic === "random")
      updates.scheduleLogic = scheduleLogic;
    if (typeof timezone === "string") updates.timezone = timezone;
    if (Array.isArray(timeSlots)) updates.timeSlots = timeSlots;
    if (typeof automationEnabled === "boolean")
      updates.automationEnabled = automationEnabled;

    const [updated] = await db
      .update(youtubeChannelsTable)
      .set(updates)
      .where(eq(youtubeChannelsTable.id, id))
      .returning();

    res.json(serializeChannel(updated));
  },
);

// ---------------------------------------------------------------------------
// Update source
// ---------------------------------------------------------------------------

router.patch(
  "/youtube-channels/:id/source",
  async (req, res): Promise<void> => {
    const userId = (req as any).user.id as number;
    const id = parseInt(req.params["id"], 10);

    const channel = await getUserChannel(id, userId);
    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const { sourceType, sourceIdentity } = req.body as Record<string, any>;

    if (!sourceType || !sourceIdentity) {
      res.status(400).json({ error: "sourceType and sourceIdentity are required" });
      return;
    }

    if (!["instagram", "tiktok", "youtube", "facebook"].includes(sourceType)) {
      res.status(400).json({ error: "Invalid sourceType. Must be instagram, tiktok, youtube, or facebook" });
      return;
    }

    const [updated] = await db
      .update(youtubeChannelsTable)
      .set({ sourceType, sourceIdentity })
      .where(eq(youtubeChannelsTable.id, id))
      .returning();

    res.json(serializeChannel(updated));
  },
);

export default router;
