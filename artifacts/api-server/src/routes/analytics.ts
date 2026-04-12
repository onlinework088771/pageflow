import { Router, type IRouter } from "express";
import axios from "axios";
import { eq, and, inArray } from "drizzle-orm";
import { db, facebookAccountsTable, facebookPagesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const FB_API = "https://graph.facebook.com/v19.0";

async function getUserAccountIds(userId: number): Promise<number[]> {
  const accounts = await db
    .select({ id: facebookAccountsTable.id })
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.userId, userId));
  return accounts.map((a) => a.id);
}

router.get("/analytics/pages", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const accountIds = await getUserAccountIds(userId);

  if (!accountIds.length) {
    res.json([]);
    return;
  }

  const accounts = await db
    .select()
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.userId, userId));

  const pages = await db
    .select()
    .from(facebookPagesTable)
    .where(inArray(facebookPagesTable.accountId, accountIds));

  const result = pages.map((p) => {
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
  });

  res.json(result);
});

router.get("/analytics/pages/:pageId", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const pageId = parseInt(req.params.pageId, 10);
  const range = (req.query.range as string) || "7";

  const accountIds = await getUserAccountIds(userId);
  if (!accountIds.length) {
    res.status(403).json({ error: "No accounts found" });
    return;
  }

  const [page] = await db
    .select()
    .from(facebookPagesTable)
    .where(
      and(
        eq(facebookPagesTable.id, pageId),
        inArray(facebookPagesTable.accountId, accountIds),
      ),
    );

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
    const days = parseInt(range, 10) || 7;
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const until = Math.floor(Date.now() / 1000);

    const pageToken = await getPageToken(page.fbPageId, account.accessToken);

    const [insightsRes, postsRes, videosRes] = await Promise.allSettled([
      axios.get(`${FB_API}/${page.fbPageId}/insights`, {
        params: {
          metric: [
            "page_fans",
            "page_impressions",
            "page_impressions_unique",
            "page_engaged_users",
            "page_post_engagements",
            "page_views_total",
          ].join(","),
          period: "day",
          since,
          until,
          access_token: pageToken,
        },
        timeout: 20_000,
      }),
      axios.get(`${FB_API}/${page.fbPageId}/posts`, {
        params: {
          fields: "id,message,created_time,attachments,likes.summary(true),comments.summary(true),shares",
          limit: 100,
          access_token: pageToken,
        },
        timeout: 15_000,
      }),
      axios.get(`${FB_API}/${page.fbPageId}/videos`, {
        params: {
          fields: "id,title,created_time,likes.summary(true),comments.summary(true)",
          limit: 100,
          access_token: pageToken,
        },
        timeout: 15_000,
      }),
    ]);

    const insights: Record<string, { name: string; values: { value: number; end_time: string }[] }[]> = {};
    if (insightsRes.status === "fulfilled") {
      const data = insightsRes.value.data?.data ?? [];
      for (const metric of data) {
        insights[metric.name] = metric.values ?? [];
      }
    } else {
      logger.warn({ err: insightsRes.reason?.message }, "Failed to fetch page insights");
    }

    const posts = postsRes.status === "fulfilled"
      ? (postsRes.value.data?.data ?? []).map((p: any) => ({
          id: p.id,
          message: p.message ?? "",
          createdTime: p.created_time,
          likes: p.likes?.summary?.total_count ?? 0,
          comments: p.comments?.summary?.total_count ?? 0,
          shares: p.shares?.count ?? 0,
          hasVideo: !!p.attachments?.data?.find((a: any) => a.type === "video_autoplay" || a.type === "video_inline"),
        }))
      : [];

    const videosData = videosRes.status === "fulfilled"
      ? (videosRes.value.data?.data ?? [])
      : [];
    const videosCount = videosData.length;

    function sumLatest(values: { value: number; end_time: string }[]): number {
      return values.reduce((acc, v) => acc + (v.value || 0), 0);
    }

    function buildTimeSeries(values: { value: number; end_time: string }[]): { date: string; value: number }[] {
      return values.map((v) => ({
        date: v.end_time.split("T")[0],
        value: v.value ?? 0,
      }));
    }

    const fanValues = (insights["page_fans"] ?? []);
    const impressionValues = (insights["page_impressions"] ?? []);
    const uniqueReachValues = (insights["page_impressions_unique"] ?? []);
    const engagedValues = (insights["page_engaged_users"] ?? []);
    const engagementValues = (insights["page_post_engagements"] ?? []);
    const viewValues = (insights["page_views_total"] ?? []);

    const followersCount = fanValues.length
      ? (fanValues[fanValues.length - 1].value ?? page.followersCount)
      : page.followersCount;

    res.json({
      page: {
        id: String(page.id),
        fbPageId: page.fbPageId,
        name: page.name,
        category: page.category,
        profilePicture: page.profilePicture,
        followersCount,
      },
      summary: {
        followers: followersCount,
        totalImpressions: sumLatest(impressionValues),
        uniqueReach: sumLatest(uniqueReachValues),
        engagedUsers: sumLatest(engagedValues),
        totalEngagement: sumLatest(engagementValues),
        pageViews: sumLatest(viewValues),
        postsCount: posts.length,
        videosCount,
      },
      charts: {
        impressions: buildTimeSeries(impressionValues),
        uniqueReach: buildTimeSeries(uniqueReachValues),
        engagement: buildTimeSeries(engagementValues),
        followers: buildTimeSeries(fanValues),
      },
      recentPosts: posts.slice(0, 10),
    });
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err.message;
    logger.error({ pageId, err: msg }, "Analytics fetch error");
    res.status(502).json({ error: msg ?? "Failed to fetch analytics" });
  }
});

async function getPageToken(fbPageId: string, userToken: string): Promise<string> {
  const res = await axios.get(`${FB_API}/${fbPageId}`, {
    params: { fields: "access_token", access_token: userToken },
    timeout: 15_000,
  });
  return res.data?.access_token ?? userToken;
}

export default router;
