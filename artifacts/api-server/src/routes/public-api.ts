import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
import {
  db, facebookAccountsTable, facebookPagesTable, youtubeAccountsTable,
  youtubeChannelsTable, automationLogsTable, scheduledVideosTable,
} from "@workspace/db";
import { apiKeyAuth } from "../middlewares/api-key-auth";

// Phase 7 — Public API (v1). External tools authenticate with an API key
// (see api-key-auth.ts / routes/api-keys.ts) instead of a JWT. This is a thin,
// read-mostly wrapper around the same tables the main dashboard uses — it does
// not touch facebook-poster.ts, page-automation.ts, or any other Facebook logic.

const router: IRouter = Router();
router.use("/v1", apiKeyAuth);

async function getUserAccountIds(userId: number): Promise<number[]> {
  const accounts = await db.select({ id: facebookAccountsTable.id }).from(facebookAccountsTable).where(eq(facebookAccountsTable.userId, userId));
  return accounts.map((a) => a.id);
}

function serializePage(p: typeof facebookPagesTable.$inferSelect) {
  return {
    id: String(p.id),
    fbPageId: p.fbPageId,
    name: p.name,
    automationEnabled: p.automationEnabled,
    status: p.status,
    followersCount: p.followersCount,
    totalPosted: p.totalPosted,
    totalPending: p.totalPending,
    totalFailed: p.totalFailed,
    lastPostedAt: p.lastPostedAt instanceof Date ? p.lastPostedAt.toISOString() : (p.lastPostedAt ?? undefined),
  };
}

// GET /v1/pages — list Facebook pages
router.get("/v1/pages", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const accountIds = await getUserAccountIds(userId);
  if (!accountIds.length) { res.json([]); return; }
  const pages = await db.select().from(facebookPagesTable).where(inArray(facebookPagesTable.accountId, accountIds)).orderBy(asc(facebookPagesTable.createdAt));
  res.json(pages.map(serializePage));
});

// GET /v1/analytics — lightweight per-platform totals (not the full live dashboard)
router.get("/v1/analytics", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const accountIds = await getUserAccountIds(userId);
  const pages = accountIds.length
    ? await db.select().from(facebookPagesTable).where(inArray(facebookPagesTable.accountId, accountIds))
    : [];
  const ytAccounts = await db.select({ id: youtubeAccountsTable.id }).from(youtubeAccountsTable).where(eq(youtubeAccountsTable.userId, userId));
  const channels = ytAccounts.length
    ? await db.select().from(youtubeChannelsTable).where(inArray(youtubeChannelsTable.accountId, ytAccounts.map((a) => a.id)))
    : [];

  res.json({
    facebook: {
      pages: pages.length,
      totalFollowers: pages.reduce((s, p) => s + (p.followersCount ?? 0), 0),
      totalPosted: pages.reduce((s, p) => s + (p.totalPosted ?? 0), 0),
      totalFailed: pages.reduce((s, p) => s + (p.totalFailed ?? 0), 0),
    },
    youtube: {
      channels: channels.length,
      totalSubscribers: channels.reduce((s, c) => s + (c.subscriberCount ?? 0), 0),
      totalVideos: channels.reduce((s, c) => s + (c.videoCount ?? 0), 0),
    },
  });
});

// GET /v1/automation-logs
router.get("/v1/automation-logs", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const accountIds = await getUserAccountIds(userId);
  if (!accountIds.length) { res.json([]); return; }
  const pageIds = (await db.select({ id: facebookPagesTable.id }).from(facebookPagesTable).where(inArray(facebookPagesTable.accountId, accountIds))).map((p) => p.id);
  if (!pageIds.length) { res.json([]); return; }
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  const logs = await db.select().from(automationLogsTable).where(inArray(automationLogsTable.pageId, pageIds)).orderBy(desc(automationLogsTable.createdAt)).limit(limit);
  res.json(logs.map((l) => ({
    id: String(l.id), type: l.type, message: l.message, pageName: l.pageName ?? undefined,
    status: l.status, createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
  })));
});

// PATCH /v1/pages/:id/automation — turn automation on/off for a page
router.patch("/v1/pages/:id/automation", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "Body must include a boolean 'enabled' field" });
    return;
  }
  const accountIds = await getUserAccountIds(userId);
  if (!accountIds.length) { res.status(404).json({ error: "Page not found" }); return; }
  const [page] = await db.update(facebookPagesTable)
    .set({ automationEnabled: enabled, status: enabled ? "active" : "paused" })
    .where(and(eq(facebookPagesTable.id, id), inArray(facebookPagesTable.accountId, accountIds)))
    .returning();
  if (!page) { res.status(404).json({ error: "Page not found" }); return; }
  res.json(serializePage(page));
});

// POST /v1/scheduled-videos — schedule a video by URL (no file upload over the public API)
router.post("/v1/scheduled-videos", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { title, description, videoUrl, pageIds, scheduledAt, timezone } = req.body ?? {};

  if (!title || typeof title !== "string") { res.status(400).json({ error: "title is required" }); return; }
  if (!videoUrl || typeof videoUrl !== "string") { res.status(400).json({ error: "videoUrl is required (direct video URL)" }); return; }
  if (!Array.isArray(pageIds) || !pageIds.length) { res.status(400).json({ error: "pageIds must be a non-empty array" }); return; }
  if (!scheduledAt) { res.status(400).json({ error: "scheduledAt is required (ISO date string)" }); return; }
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) { res.status(400).json({ error: "Invalid scheduledAt" }); return; }

  // Verify every requested page actually belongs to this API key's owner.
  const accountIds = await getUserAccountIds(userId);
  const ownedPages = accountIds.length
    ? await db.select({ id: facebookPagesTable.id }).from(facebookPagesTable).where(inArray(facebookPagesTable.accountId, accountIds))
    : [];
  const ownedIds = new Set(ownedPages.map((p) => String(p.id)));
  const invalid = pageIds.filter((id: string) => !ownedIds.has(String(id)));
  if (invalid.length) { res.status(403).json({ error: `Pages not found or not owned: ${invalid.join(", ")}` }); return; }

  const [video] = await db.insert(scheduledVideosTable).values({
    userId,
    title,
    description: description ?? null,
    postType: "video",
    videoUrl,
    pageIds: pageIds.map(String),
    scheduledAt: scheduledDate,
    timezone: timezone || "UTC",
    status: "pending",
  }).returning();

  res.status(201).json({
    id: String(video.id), title: video.title, status: video.status,
    scheduledAt: video.scheduledAt instanceof Date ? video.scheduledAt.toISOString() : String(video.scheduledAt),
  });
});

// GET /v1/youtube/channels
router.get("/v1/youtube/channels", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const accounts = await db.select({ id: youtubeAccountsTable.id }).from(youtubeAccountsTable).where(eq(youtubeAccountsTable.userId, userId));
  if (!accounts.length) { res.json([]); return; }
  const channels = await db.select().from(youtubeChannelsTable).where(inArray(youtubeChannelsTable.accountId, accounts.map((a) => a.id)));
  res.json(channels.map((c) => ({
    id: String(c.id), channelId: c.channelId, title: c.title,
    subscriberCount: c.subscriberCount, videoCount: c.videoCount,
  })));
});

export default router;
