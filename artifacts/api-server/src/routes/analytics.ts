import { Router, type IRouter } from "express";
import axios from "axios";
import { eq, and, inArray } from "drizzle-orm";
import { db, facebookAccountsTable, facebookPagesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const FB_API = "https://graph.facebook.com/v19.0";

// ---------------------------------------------------------------------------
// 60-second in-memory cache
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUserAccountIds(userId: number): Promise<number[]> {
  const accounts = await db
    .select({ id: facebookAccountsTable.id })
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.userId, userId));
  return accounts.map((a) => a.id);
}

async function getPageToken(fbPageId: string, userToken: string): Promise<string> {
  try {
    const res = await axios.get(`${FB_API}/${fbPageId}`, {
      params: { fields: "access_token", access_token: userToken },
      timeout: 15_000,
    });
    return res.data?.access_token ?? userToken;
  } catch {
    return userToken;
  }
}

function sumValues(values: { value: number | Record<string, number> }[]): number {
  return values.reduce((acc, v) => {
    const val = typeof v.value === "number" ? v.value : 0;
    return acc + (Number(val) || 0);
  }, 0);
}

function latestValue(values: { value: number }[]): number {
  if (!values.length) return 0;
  return Number(values[values.length - 1]?.value) || 0;
}

function buildTimeSeries(
  values: { value: number | Record<string, number>; end_time: string }[],
): { date: string; value: number }[] {
  return values.map((v) => ({
    date: v.end_time.split("T")[0],
    value: typeof v.value === "number" ? (Number(v.value) || 0) : 0,
  }));
}

// ---------------------------------------------------------------------------
// GET /analytics/accounts — list FB accounts with page counts
// ---------------------------------------------------------------------------

router.get("/analytics/accounts", async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const accounts = await db
    .select()
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.userId, userId));

  res.json(accounts.map((a) => ({
    id: String(a.id),
    fbUserId: a.fbUserId,
    name: a.name,
    email: a.email ?? null,
    profilePicture: a.profilePicture ?? null,
    status: a.status,
    pagesCount: a.pagesCount ?? 0,
    connectedAt: a.connectedAt instanceof Date ? a.connectedAt.toISOString() : a.connectedAt,
  })));
});

// ---------------------------------------------------------------------------
// GET /analytics/accounts/:accountId/pages — pages for a specific account
// ---------------------------------------------------------------------------

router.get("/analytics/accounts/:accountId/pages", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const accountId = parseInt(req.params.accountId, 10);

  const [account] = await db
    .select()
    .from(facebookAccountsTable)
    .where(and(eq(facebookAccountsTable.id, accountId), eq(facebookAccountsTable.userId, userId)));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const pages = await db
    .select()
    .from(facebookPagesTable)
    .where(eq(facebookPagesTable.accountId, accountId));

  res.json(pages.map((p) => ({
    id: String(p.id),
    fbPageId: p.fbPageId,
    name: p.name,
    category: p.category ?? null,
    profilePicture: p.profilePicture ?? null,
    followersCount: p.followersCount ?? 0,
    likesCount: 0,
    accountId: String(p.accountId),
    accountName: account.name,
  })));
});

// ---------------------------------------------------------------------------
// GET /analytics/pages/:pageId — full analytics dashboard data
// ---------------------------------------------------------------------------

router.get("/analytics/pages/:pageId", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const pageId = parseInt(req.params.pageId, 10);
  const range = (req.query.range as string) || "7";
  const sinceParam = req.query.since as string | undefined;
  const untilParam = req.query.until as string | undefined;

  const cacheKey = `analytics:${pageId}:${range}:${sinceParam ?? ""}:${untilParam ?? ""}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json({ ...cached, fromCache: true });
    return;
  }

  const accountIds = await getUserAccountIds(userId);
  if (!accountIds.length) {
    res.status(403).json({ error: "No accounts found" });
    return;
  }

  const [page] = await db
    .select()
    .from(facebookPagesTable)
    .where(and(eq(facebookPagesTable.id, pageId), inArray(facebookPagesTable.accountId, accountIds)));

  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  const [account] = await db
    .select()
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.id, page.accountId));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  try {
    const pageToken = await getPageToken(page.fbPageId, account.accessToken);

    // Compute time window
    const nowSec = Math.floor(Date.now() / 1000);
    let since: number;
    let until: number;

    if (sinceParam && untilParam) {
      since = parseInt(sinceParam, 10);
      until = parseInt(untilParam, 10);
    } else if (range === "today") {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      since = Math.floor(d.getTime() / 1000);
      until = nowSec;
    } else if (range === "yesterday") {
      const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0);
      since = Math.floor(d.getTime() / 1000);
      const e = new Date(d); e.setHours(23, 59, 59, 999);
      until = Math.floor(e.getTime() / 1000);
    } else {
      const days = parseInt(range, 10) || 7;
      since = nowSec - days * 86400;
      until = nowSec;
    }

    // Run all Facebook API calls in parallel
    const [pageInfoRes, insightsRes, postsRes, videosRes, reelsRes] = await Promise.allSettled([
      // Page basic info (fans, followers counts from API)
      axios.get(`${FB_API}/${page.fbPageId}`, {
        params: {
          fields: "fan_count,followers_count,name,category",
          access_token: pageToken,
        },
        timeout: 10_000,
      }),

      // Page insights — daily period metrics
      axios.get(`${FB_API}/${page.fbPageId}/insights`, {
        params: {
          metric: [
            "page_fans",
            "page_fan_adds",
            "page_fan_removes",
            "page_impressions",
            "page_impressions_unique",
            "page_impressions_organic",
            "page_impressions_paid",
            "page_engaged_users",
            "page_post_engagements",
            "page_views_total",
            "page_video_views",
            "page_video_view_time",
          ].join(","),
          period: "day",
          since,
          until,
          access_token: pageToken,
        },
        timeout: 20_000,
      }),

      // Posts with full engagement metrics
      axios.get(`${FB_API}/${page.fbPageId}/posts`, {
        params: {
          fields: "id,message,created_time,attachments,likes.summary(true),comments.summary(true),shares,reactions.summary(true)",
          limit: 100,
          access_token: pageToken,
        },
        timeout: 15_000,
      }),

      // Videos
      axios.get(`${FB_API}/${page.fbPageId}/videos`, {
        params: {
          fields: "id,title,created_time,likes.summary(true),comments.summary(true),views",
          limit: 50,
          access_token: pageToken,
        },
        timeout: 15_000,
      }),

      // Reels
      axios.get(`${FB_API}/${page.fbPageId}/video_reels`, {
        params: {
          fields: "id,title,created_time,views",
          limit: 50,
          access_token: pageToken,
        },
        timeout: 15_000,
      }),
    ]);

    // Parse page info
    const pageInfo = pageInfoRes.status === "fulfilled" ? pageInfoRes.value.data : null;
    const fans = pageInfo?.fan_count ?? page.followersCount;
    const followers = pageInfo?.followers_count ?? fans;

    // Parse insights into keyed map
    const insights: Record<string, { value: number; end_time: string }[]> = {};
    if (insightsRes.status === "fulfilled") {
      for (const metric of (insightsRes.value.data?.data ?? [])) {
        insights[metric.name] = metric.values ?? [];
      }
    } else {
      logger.warn({ err: (insightsRes as any).reason?.message }, "Insights fetch failed");
    }

    const fansValues        = insights["page_fans"] ?? [];
    const fanAddsValues     = insights["page_fan_adds"] ?? [];
    const fanRemovesValues  = insights["page_fan_removes"] ?? [];
    const impressionsValues = insights["page_impressions"] ?? [];
    const reachValues       = insights["page_impressions_unique"] ?? [];
    const organicValues     = insights["page_impressions_organic"] ?? [];
    const paidValues        = insights["page_impressions_paid"] ?? [];
    const engagedValues     = insights["page_engaged_users"] ?? [];
    const engagementValues  = insights["page_post_engagements"] ?? [];
    const viewsValues       = insights["page_views_total"] ?? [];
    const videoViewsValues  = insights["page_video_views"] ?? [];
    const watchTimeValues   = insights["page_video_view_time"] ?? [];

    // Parse posts
    const rawPosts = postsRes.status === "fulfilled" ? (postsRes.value.data?.data ?? []) : [];
    const videosData = videosRes.status === "fulfilled" ? (videosRes.value.data?.data ?? []) : [];
    const reelsData  = reelsRes.status === "fulfilled"  ? (reelsRes.value.data?.data ?? []) : [];

    // Post time counts
    const todayStart  = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekStart   = new Date(Date.now() - 7 * 86_400_000);
    const monthStart  = new Date(Date.now() - 30 * 86_400_000);

    const publishedToday     = rawPosts.filter((p: any) => new Date(p.created_time) >= todayStart).length;
    const publishedThisWeek  = rawPosts.filter((p: any) => new Date(p.created_time) >= weekStart).length;
    const publishedThisMonth = rawPosts.filter((p: any) => new Date(p.created_time) >= monthStart).length;

    // Format posts
    const formattedPosts = rawPosts.map((p: any) => {
      const likes     = p.likes?.summary?.total_count ?? 0;
      const comments  = p.comments?.summary?.total_count ?? 0;
      const shares    = p.shares?.count ?? 0;
      const reactions = p.reactions?.summary?.total_count ?? likes;
      const hasVideo  = !!p.attachments?.data?.find((a: any) =>
        a.type === "video_autoplay" || a.type === "video_inline" || a.type?.includes("video"));
      const hasImage  = !!p.attachments?.data?.find((a: any) =>
        a.type === "photo" || a.type === "album" || a.type === "sticker");
      const thumbnail = p.attachments?.data?.[0]?.media?.image?.src ?? null;
      const engagement = reactions + comments + shares;
      return { id: p.id, message: p.message ?? "", createdTime: p.created_time, likes, comments, shares, reactions, engagement, hasVideo, hasImage, thumbnail };
    });

    // Best / worst performing (by total engagement)
    const sortedByEngagement = [...formattedPosts].sort((a, b) => b.engagement - a.engagement);
    const bestPost  = sortedByEngagement[0] ?? null;
    const worstPost = sortedByEngagement.length > 1 ? sortedByEngagement[sortedByEngagement.length - 1] : null;

    // Reel views (some APIs return "views" directly on the reel)
    const reelViews = reelsData.reduce((s: number, r: any) => s + (Number(r.views) || 0), 0);

    // Watch time ms → minutes
    const watchTimeMs  = sumValues(watchTimeValues);
    const watchTimeMin = Math.round(watchTimeMs / 60_000);

    const result = {
      page: {
        id: String(page.id),
        fbPageId: page.fbPageId,
        name: page.name,
        category: page.category,
        profilePicture: page.profilePicture,
        fans,
        followers,
      },
      summary: {
        followers,
        fans,
        newFans:            sumValues(fanAddsValues),
        lostFans:           sumValues(fanRemovesValues),
        impressions:        sumValues(impressionsValues),
        organicImpressions: sumValues(organicValues),
        paidImpressions:    sumValues(paidValues),
        reach:              sumValues(reachValues),
        engagedUsers:       sumValues(engagedValues),
        engagement:         sumValues(engagementValues),
        pageViews:          sumValues(viewsValues),
        videoViews:         sumValues(videoViewsValues),
        watchTimeMinutes:   watchTimeMin,
        reelViews,
        totalPosts:         rawPosts.length,
        totalVideos:        videosData.length,
        totalReels:         reelsData.length,
        publishedToday,
        publishedThisWeek,
        publishedThisMonth,
        totalReactions:     formattedPosts.reduce((s: number, p: any) => s + p.reactions, 0),
        totalComments:      formattedPosts.reduce((s: number, p: any) => s + p.comments, 0),
        totalShares:        formattedPosts.reduce((s: number, p: any) => s + p.shares, 0),
        totalLikes:         formattedPosts.reduce((s: number, p: any) => s + p.likes, 0),
      },
      charts: {
        impressions: buildTimeSeries(impressionsValues),
        reach:       buildTimeSeries(reachValues),
        engagement:  buildTimeSeries(engagementValues),
        followers:   buildTimeSeries(fansValues),
        videoViews:  buildTimeSeries(videoViewsValues),
        fanAdds:     buildTimeSeries(fanAddsValues),
      },
      recentPosts: formattedPosts.slice(0, 20),
      bestPost,
      worstPost,
      fetchedAt: new Date().toISOString(),
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    logger.error({ pageId, err: err?.response?.data ?? err.message }, "Analytics fetch error");
    const fbError = err?.response?.data?.error;
    const msg = fbError?.message ?? err.message ?? "Failed to fetch analytics";
    const code = fbError?.code;
    const isPermError = code === 10 || msg.includes("permission") || msg.includes("(#10)");
    res.status(502).json({ error: msg, permissionError: isPermError, errorCode: code });
  }
});

// ---------------------------------------------------------------------------
// Backward-compat: GET /analytics/pages — all pages flat list
// ---------------------------------------------------------------------------

router.get("/analytics/pages", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const accountIds = await getUserAccountIds(userId);

  if (!accountIds.length) {
    res.json([]);
    return;
  }

  const accounts = await db.select().from(facebookAccountsTable).where(eq(facebookAccountsTable.userId, userId));
  const pages = await db.select().from(facebookPagesTable).where(inArray(facebookPagesTable.accountId, accountIds));

  res.json(pages.map((p) => {
    const account = accounts.find((a) => a.id === p.accountId);
    return {
      id: String(p.id),
      fbPageId: p.fbPageId,
      name: p.name,
      category: p.category ?? undefined,
      profilePicture: p.profilePicture ?? undefined,
      followersCount: p.followersCount,
      accountId: String(p.accountId),
      accountName: account?.name ?? "Unknown",
      accountPicture: account?.profilePicture ?? undefined,
    };
  }));
});

export default router;
