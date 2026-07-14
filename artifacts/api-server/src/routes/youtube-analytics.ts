import { Router, type IRouter } from "express";
import axios from "axios";
import { eq, and } from "drizzle-orm";
import { db, youtubeAccountsTable, youtubeChannelsTable } from "@workspace/db";
import { getValidAccessToken } from "../services/youtube-poster";
import { logger } from "../lib/logger";

// Phase 6 — YouTube Analytics.
// Fully independent of Facebook's routes/analytics.ts: talks only to the YouTube
// Data API v3 (channels.list / playlistItems.list / videos.list) using the
// Phase 4 OAuth helper (getValidAccessToken), no shared code paths or tables
// with any Facebook file. No YouTube Analytics (reporting) scope is requested —
// this reads the same public-ish statistics fields already available on the
// existing youtube.readonly scope.

const router: IRouter = Router();
const YT_API = "https://www.googleapis.com/youtube/v3";

// ---------------------------------------------------------------------------
// 60-second in-memory cache (same pattern as Facebook's analytics route)
// ---------------------------------------------------------------------------
const analyticsCache = new Map<string, { data: any; expires: number }>();

function getCached(key: string): any | null {
  const entry = analyticsCache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data;
  analyticsCache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  analyticsCache.set(key, { data, expires: Date.now() + 60_000 });
}

function n(v: unknown): number {
  return Number(v) || 0;
}

/** Confirm the channel belongs to a YouTube account owned by this user. Returns channel + account if so. */
async function getOwnedChannel(userId: number, channelId: number) {
  const [row] = await db
    .select({ channel: youtubeChannelsTable, account: youtubeAccountsTable })
    .from(youtubeChannelsTable)
    .innerJoin(youtubeAccountsTable, eq(youtubeChannelsTable.accountId, youtubeAccountsTable.id))
    .where(and(eq(youtubeChannelsTable.id, channelId), eq(youtubeAccountsTable.userId, userId)));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// GET /youtube-analytics/channels — list channels available for analytics
// ---------------------------------------------------------------------------

router.get("/youtube-analytics/channels", async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const rows = await db
    .select({ channel: youtubeChannelsTable })
    .from(youtubeChannelsTable)
    .innerJoin(youtubeAccountsTable, eq(youtubeChannelsTable.accountId, youtubeAccountsTable.id))
    .where(eq(youtubeAccountsTable.userId, userId));

  res.json(
    rows.map(({ channel }) => ({
      id: String(channel.id),
      channelId: channel.channelId,
      title: channel.title,
      thumbnail: channel.thumbnail ?? null,
      customUrl: channel.customUrl ?? null,
      subscriberCount: channel.subscriberCount ?? 0,
      videoCount: channel.videoCount ?? 0,
    })),
  );
});

// ---------------------------------------------------------------------------
// GET /youtube-analytics/channels/:channelId — full analytics dashboard data
// ---------------------------------------------------------------------------

router.get("/youtube-analytics/channels/:channelId", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const channelId = parseInt(req.params.channelId, 10);
  if (isNaN(channelId)) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }

  const cacheKey = `yt-analytics:${channelId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json({ ...cached, fromCache: true });
    return;
  }

  const owned = await getOwnedChannel(userId, channelId);
  if (!owned) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }
  const { channel, account } = owned;

  try {
    const accessToken = await getValidAccessToken(account);
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Channel snippet/statistics/contentDetails (for the uploads playlist ID)
    const channelRes = await axios.get(`${YT_API}/channels`, {
      params: { part: "snippet,statistics,contentDetails", id: channel.channelId },
      headers: authHeader,
      timeout: 15_000,
    });
    const channelData = channelRes.data?.items?.[0];
    if (!channelData) {
      res.status(502).json({ error: "Channel not found on YouTube (it may have been deleted)" });
      return;
    }

    const stats = channelData.statistics ?? {};
    const uploadsPlaylistId = channelData.contentDetails?.relatedPlaylists?.uploads;

    // Recent uploads (up to 50)
    let videoIds: string[] = [];
    if (uploadsPlaylistId) {
      const playlistRes = await axios.get(`${YT_API}/playlistItems`, {
        params: { part: "contentDetails", playlistId: uploadsPlaylistId, maxResults: 50 },
        headers: authHeader,
        timeout: 15_000,
      });
      videoIds = (playlistRes.data?.items ?? [])
        .map((it: any) => it.contentDetails?.videoId)
        .filter(Boolean);
    }

    let videos: any[] = [];
    if (videoIds.length) {
      const videosRes = await axios.get(`${YT_API}/videos`, {
        params: { part: "snippet,statistics,contentDetails", id: videoIds.join(",") },
        headers: authHeader,
        timeout: 15_000,
      });
      videos = videosRes.data?.items ?? [];
    }

    const formattedVideos = videos.map((v: any) => ({
      id: v.id as string,
      title: v.snippet?.title ?? "",
      thumbnail: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? null,
      publishedAt: v.snippet?.publishedAt ?? null,
      views: n(v.statistics?.viewCount),
      likes: n(v.statistics?.likeCount),
      comments: n(v.statistics?.commentCount),
      duration: v.contentDetails?.duration ?? null,
    }));

    // Sort newest-first (playlistItems is already roughly newest-first, but be explicit)
    formattedVideos.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

    const totalViews = formattedVideos.reduce((s, v) => s + v.views, 0);
    const totalLikes = formattedVideos.reduce((s, v) => s + v.likes, 0);
    const totalComments = formattedVideos.reduce((s, v) => s + v.comments, 0);
    const avgViews = formattedVideos.length ? Math.round(totalViews / formattedVideos.length) : 0;

    const sortedByViews = [...formattedVideos].sort((a, b) => b.views - a.views);
    const bestVideo = sortedByViews[0] ?? null;
    const worstVideo = sortedByViews.length > 1 ? sortedByViews[sortedByViews.length - 1] : null;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(Date.now() - 7 * 86_400_000);
    const monthStart = new Date(Date.now() - 30 * 86_400_000);
    const publishedToday = formattedVideos.filter((v) => v.publishedAt && new Date(v.publishedAt) >= todayStart).length;
    const publishedThisWeek = formattedVideos.filter((v) => v.publishedAt && new Date(v.publishedAt) >= weekStart).length;
    const publishedThisMonth = formattedVideos.filter((v) => v.publishedAt && new Date(v.publishedAt) >= monthStart).length;

    // Views-per-video chart, oldest to newest, for the recent uploads window
    const viewsChart = [...formattedVideos]
      .reverse()
      .map((v) => ({ date: v.publishedAt ? v.publishedAt.split("T")[0] : "", value: v.views, title: v.title }));

    const result = {
      channel: {
        id: String(channel.id),
        channelId: channel.channelId,
        title: channelData.snippet?.title ?? channel.title,
        thumbnail: channelData.snippet?.thumbnails?.medium?.url ?? channel.thumbnail,
        customUrl: channelData.snippet?.customUrl ?? channel.customUrl,
      },
      summary: {
        subscriberCount: n(stats.subscriberCount),
        totalChannelViews: n(stats.viewCount),
        totalChannelVideos: n(stats.videoCount),
        recentVideosFetched: formattedVideos.length,
        totalViews,
        totalLikes,
        totalComments,
        avgViews,
        publishedToday,
        publishedThisWeek,
        publishedThisMonth,
      },
      charts: { views: viewsChart },
      recentVideos: formattedVideos.slice(0, 20),
      bestVideo,
      worstVideo,
      fetchedAt: new Date().toISOString(),
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    logger.error({ channelId, err: err?.response?.data ?? err.message }, "YouTube analytics fetch error");
    const ytError = err?.response?.data?.error;
    const msg = ytError?.message ?? err.message ?? "Failed to fetch YouTube analytics";
    const isPermError = /insufficient|permission|quota|forbidden/i.test(msg) || err?.response?.status === 403;
    res.status(502).json({ error: msg, permissionError: isPermError });
  }
});

export default router;
