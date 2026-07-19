import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, youtubeAutomationsTable, youtubeChannelsTable, youtubeAccountsTable } from "@workspace/db";
import { runChannelAutomation } from "../services/youtube-automation";

// Phase 5 — YouTube Automation.
// Fully independent of Facebook's `/pages/:pageId/automation` route: separate
// table (youtube_automations), separate service, no shared code paths. This
// route manages per-channel automation config and exposes a manual "run now".

const router: IRouter = Router();

function serialize(a: typeof youtubeAutomationsTable.$inferSelect) {
  return {
    id: String(a.id),
    channelId: String(a.channelId),
    automationEnabled: a.automationEnabled,
    status: a.status,
    sourceType: a.sourceType ?? undefined,
    sourceIdentity: a.sourceIdentity ?? undefined,
    postsPerDay: a.postsPerDay,
    scheduleLogic: a.scheduleLogic,
    timezone: a.timezone,
    timeSlots: Array.isArray(a.timeSlots) ? a.timeSlots : [],
    privacyStatus: a.privacyStatus,
    videoType: a.videoType,
    totalPosted: a.totalPosted,
    totalPending: a.totalPending,
    totalFailed: a.totalFailed,
    lastPostedAt: a.lastPostedAt instanceof Date ? a.lastPostedAt.toISOString() : (a.lastPostedAt ?? undefined),
    lastPostedVideoId: a.lastPostedVideoId ?? undefined,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
  };
}

/** Confirm the channel belongs to a YouTube account owned by this user. Returns the channel row if so. */
async function getOwnedChannel(userId: number, channelId: number) {
  const [row] = await db
    .select({ channel: youtubeChannelsTable })
    .from(youtubeChannelsTable)
    .innerJoin(youtubeAccountsTable, eq(youtubeChannelsTable.accountId, youtubeAccountsTable.id))
    .where(and(eq(youtubeChannelsTable.id, channelId), eq(youtubeAccountsTable.userId, userId)));
  return row?.channel ?? null;
}

// GET /youtube/automations - list automation config for every channel the user owns
// (channels without a config row yet are returned with automationEnabled=false defaults).
router.get("/youtube/automations", async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const channels = await db
    .select({ channel: youtubeChannelsTable })
    .from(youtubeChannelsTable)
    .innerJoin(youtubeAccountsTable, eq(youtubeChannelsTable.accountId, youtubeAccountsTable.id))
    .where(eq(youtubeAccountsTable.userId, userId));

  const results = await Promise.all(
    channels.map(async ({ channel }) => {
      const [automation] = await db
        .select()
        .from(youtubeAutomationsTable)
        .where(eq(youtubeAutomationsTable.channelId, channel.id));

      return {
        channelId: String(channel.id),
        channelTitle: channel.title,
        channelThumbnail: channel.thumbnail ?? undefined,
        automation: automation ? serialize(automation) : null,
      };
    }),
  );

  res.json(results);
});

// PATCH /youtube/automations/:channelId - create or update automation config for a channel.
router.patch("/youtube/automations/:channelId", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const channelId = parseInt(req.params.channelId, 10);
  if (isNaN(channelId)) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }

  const channel = await getOwnedChannel(userId, channelId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const {
    automationEnabled,
    sourceType,
    sourceIdentity,
    postsPerDay,
    scheduleLogic,
    timezone,
    timeSlots,
    privacyStatus,
    videoType,
  } = req.body ?? {};

  if (sourceType !== undefined && sourceType !== null && !["tiktok", "instagram", "facebook"].includes(sourceType)) {
    res.status(400).json({ error: "sourceType must be 'tiktok', 'instagram', or 'facebook'" });
    return;
  }
  if (scheduleLogic !== undefined && !["fixed", "random"].includes(scheduleLogic)) {
    res.status(400).json({ error: "scheduleLogic must be 'fixed' or 'random'" });
    return;
  }
  if (privacyStatus !== undefined && !["public", "unlisted", "private"].includes(privacyStatus)) {
    res.status(400).json({ error: "privacyStatus must be 'public', 'unlisted', or 'private'" });
    return;
  }
  if (videoType !== undefined && !["short", "long"].includes(videoType)) {
    res.status(400).json({ error: "videoType must be 'short' or 'long'" });
    return;
  }
  if (postsPerDay !== undefined && (typeof postsPerDay !== "number" || postsPerDay < 1 || postsPerDay > 24)) {
    res.status(400).json({ error: "postsPerDay must be a number between 1 and 24" });
    return;
  }
  if (timeSlots !== undefined && !Array.isArray(timeSlots)) {
    res.status(400).json({ error: "timeSlots must be an array of HH:MM strings" });
    return;
  }

  const [existing] = await db.select().from(youtubeAutomationsTable).where(eq(youtubeAutomationsTable.channelId, channelId));

  const values: Record<string, unknown> = {};
  if (sourceType !== undefined) values.sourceType = sourceType;
  if (sourceIdentity !== undefined) values.sourceIdentity = sourceIdentity;
  if (postsPerDay !== undefined) values.postsPerDay = postsPerDay;
  if (scheduleLogic !== undefined) values.scheduleLogic = scheduleLogic;
  if (timezone !== undefined) values.timezone = timezone;
  if (timeSlots !== undefined) values.timeSlots = timeSlots;
  if (privacyStatus !== undefined) values.privacyStatus = privacyStatus;
  if (videoType !== undefined) values.videoType = videoType;
  if (automationEnabled !== undefined) {
    values.automationEnabled = automationEnabled;
    values.status = automationEnabled ? "active" : "paused";
  }

  let saved: typeof youtubeAutomationsTable.$inferSelect;
  if (existing) {
    [saved] = await db
      .update(youtubeAutomationsTable)
      .set(values)
      .where(eq(youtubeAutomationsTable.id, existing.id))
      .returning();
  } else {
    if (automationEnabled && (!values.sourceType || !values.sourceIdentity)) {
      res.status(400).json({ error: "sourceType and sourceIdentity are required to enable automation" });
      return;
    }
    [saved] = await db
      .insert(youtubeAutomationsTable)
      .values({ channelId, ...values })
      .returning();
  }

  res.json(serialize(saved));
});

// POST /youtube/automations/:channelId/run-now - trigger one automation cycle immediately (manual/testing).
router.post("/youtube/automations/:channelId/run-now", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const channelId = parseInt(req.params.channelId, 10);
  if (isNaN(channelId)) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }

  const channel = await getOwnedChannel(userId, channelId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const [automation] = await db.select().from(youtubeAutomationsTable).where(eq(youtubeAutomationsTable.channelId, channelId));
  if (!automation || !automation.sourceType || !automation.sourceIdentity) {
    res.status(400).json({ error: "Automation is not configured for this channel yet" });
    return;
  }

  runChannelAutomation(automation).catch(() => {
    /* runChannelAutomation already records failures via automation_logs and the row itself */
  });

  res.json({ status: "running" });
});

export default router;
