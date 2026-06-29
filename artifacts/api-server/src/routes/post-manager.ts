import { Router, type IRouter } from "express";
import axios from "axios";
import { eq, and, inArray, desc } from "drizzle-orm";
import { db, facebookPagesTable, facebookAccountsTable, automationLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const FB_API = "https://graph.facebook.com/v19.0";

// ---------------------------------------------------------------------------
// Shared helpers
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Post type detection from Facebook attachment data
// ---------------------------------------------------------------------------

type PostType = "text" | "image" | "video" | "reel";

function detectPostType(post: any, reelIds: Set<string>): PostType {
  const postId = String(post.id ?? "");
  if (reelIds.has(postId)) return "reel";

  const attachments = post.attachments?.data;
  if (!attachments || attachments.length === 0) return "text";

  const type = (attachments[0]?.type ?? "").toLowerCase();

  if (type.includes("video")) return "video";
  if (type === "photo" || type === "album" || type === "sticker" || type === "profile_media") return "image";
  if (type === "share" || type === "link" || type === "note") return "text";

  return "text";
}

function extractThumbnail(post: any): string | null {
  const attachments = post.attachments?.data;
  if (!attachments || attachments.length === 0) return null;

  const first = attachments[0];
  return (
    first?.media?.image?.src ??
    first?.media?.source ??
    first?.full_picture ??
    null
  );
}

// ---------------------------------------------------------------------------
// Fetch reel IDs for a page (for cross-referencing post types)
// ---------------------------------------------------------------------------

async function fetchReelIds(fbPageId: string, pageToken: string, limit = 50): Promise<Set<string>> {
  try {
    const res = await axios.get(`${FB_API}/${fbPageId}/video_reels`, {
      params: {
        fields: "id",
        limit,
        access_token: pageToken,
      },
      timeout: 15_000,
    });
    const data: any[] = res.data?.data ?? [];
    return new Set(data.map((r) => String(r.id)));
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// GET /post-manager/accounts
// ---------------------------------------------------------------------------

router.get("/post-manager/accounts", async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const accounts = await db
    .select()
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.userId, userId));

  const result = accounts.map((a) => ({
    id: String(a.id),
    fbUserId: a.fbUserId,
    name: a.name,
    email: a.email ?? null,
    profilePicture: a.profilePicture ?? null,
    status: a.status,
    pagesCount: a.pagesCount,
    connectedAt: a.connectedAt instanceof Date ? a.connectedAt.toISOString() : a.connectedAt,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  }));

  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /post-manager/accounts/:accountId/pages
// ---------------------------------------------------------------------------

router.get("/post-manager/accounts/:accountId/pages", async (req, res): Promise<void> => {
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

  // Try to enrich each page with live Facebook data
  const enriched = await Promise.all(
    pages.map(async (p) => {
      let fanCount = p.followersCount;
      let likesCount = p.followersCount;
      let category = p.category ?? null;
      let profilePicture = p.profilePicture ?? null;
      let totalPosts: number | null = null;

      try {
        const pageToken = await getPageToken(p.fbPageId, account.accessToken);
        const fbRes = await axios.get(`${FB_API}/${p.fbPageId}`, {
          params: {
            fields: "fan_count,category,picture.type(large)",
            access_token: pageToken,
          },
          timeout: 10_000,
        });
        fanCount = fbRes.data?.fan_count ?? fanCount;
        likesCount = fbRes.data?.fan_count ?? likesCount;
        category = fbRes.data?.category ?? category;
        profilePicture = fbRes.data?.picture?.data?.url ?? profilePicture;
      } catch {
        // Fallback to DB data
      }

      // Try to get post count (summary endpoint)
      try {
        const pageToken = await getPageToken(p.fbPageId, account.accessToken);
        const postsRes = await axios.get(`${FB_API}/${p.fbPageId}/feed`, {
          params: {
            fields: "id",
            limit: 1,
            summary: true,
            access_token: pageToken,
          },
          timeout: 10_000,
        });
        totalPosts = postsRes.data?.summary?.total_count ?? null;
      } catch {
        totalPosts = null;
      }

      return {
        id: String(p.id),
        fbPageId: p.fbPageId,
        name: p.name,
        category,
        profilePicture,
        followersCount: fanCount,
        likesCount,
        totalPosts,
        automationEnabled: p.automationEnabled,
        status: p.status,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      };
    }),
  );

  res.json(enriched);
});

// ---------------------------------------------------------------------------
// GET /post-manager/pages/:pageId/posts
// ---------------------------------------------------------------------------

router.get("/post-manager/pages/:pageId/posts", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const pageId = parseInt(req.params.pageId, 10);
  const { cursor, limit: limitStr, type, search, sort } = req.query as Record<string, string>;

  const limit = Math.min(parseInt(limitStr ?? "25", 10) || 25, 100);
  const sortOrder = sort === "oldest" ? "ascending" : "descending";

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

  let pageToken: string;
  try {
    pageToken = await getPageToken(page.fbPageId, account.accessToken);
  } catch (err: any) {
    res.status(502).json({ error: "Failed to get page access token: " + (err?.message ?? "Unknown") });
    return;
  }

  try {
    // Fetch reel IDs for type detection (only on first page to avoid extra API calls)
    const reelIds = !cursor ? await fetchReelIds(page.fbPageId, pageToken, 100) : new Set<string>();

    // Fetch posts from Facebook
    const params: Record<string, any> = {
      fields: "id,message,story,created_time,full_picture,attachments{type,media,subattachments,url,title,description},likes.limit(0).summary(true),comments.limit(0).summary(true),shares",
      limit,
      access_token: pageToken,
    };

    if (cursor) params.after = cursor;

    // Facebook doesn't support ascending order on /posts; for oldest sort
    // we reverse the array client-side after fetching descending.
    const fbRes = await axios.get(`${FB_API}/${page.fbPageId}/posts`, {
      params,
      timeout: 20_000,
    });

    let rawPosts: any[] = fbRes.data?.data ?? [];
    const paging = fbRes.data?.paging;
    const nextCursor = paging?.cursors?.after ?? null;
    const hasMore = !!paging?.next;

    if (sortOrder === "ascending") {
      rawPosts = [...rawPosts].reverse();
    }

    let posts = rawPosts.map((post: any) => {
      const postType = detectPostType(post, reelIds);
      const thumbnail = extractThumbnail(post) ?? post.full_picture ?? null;
      return {
        id: String(post.id),
        type: postType,
        message: post.message ?? post.story ?? "",
        createdTime: post.created_time,
        thumbnail,
        likes: post.likes?.summary?.total_count ?? 0,
        comments: post.comments?.summary?.total_count ?? 0,
        shares: post.shares?.count ?? 0,
      };
    });

    // Client-side filter by type
    if (type && type !== "all") {
      posts = posts.filter((p) => p.type === type);
    }

    // Client-side search
    if (search?.trim()) {
      const q = search.toLowerCase();
      posts = posts.filter((p) => p.message.toLowerCase().includes(q));
    }

    res.json({ posts, nextCursor, hasMore });
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
    logger.error({ pageId, err: msg }, "Post Manager: failed to fetch posts");
    res.status(502).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// DELETE /post-manager/posts/:pageId/:postId
// ---------------------------------------------------------------------------

router.delete("/post-manager/posts/:pageId/:postId", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const pageId = parseInt(req.params.pageId, 10);
  const postId = req.params.postId;

  const accountIds = await getUserAccountIds(userId);

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

  const pageToken = await getPageToken(page.fbPageId, account.accessToken);

  try {
    await axios.delete(`${FB_API}/${postId}`, {
      params: { access_token: pageToken },
      timeout: 15_000,
    });

    await db.insert(automationLogsTable).values({
      type: "deletion",
      message: `Deleted post ${postId} from page "${page.name}"`,
      pageId: page.id,
      pageName: page.name,
      accountId: account.id,
      status: "success",
      metadata: JSON.stringify({ postId }),
    });

    res.json({ success: true });
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
    logger.error({ pageId, postId, err: msg }, "Post Manager: delete post failed");

    await db.insert(automationLogsTable).values({
      type: "deletion",
      message: `Failed to delete post ${postId} from page "${page.name}": ${msg}`,
      pageId: page.id,
      pageName: page.name,
      accountId: account.id,
      status: "error",
      metadata: JSON.stringify({ postId, error: msg }),
    }).catch(() => {});

    res.status(502).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// POST /post-manager/pages/:pageId/bulk-delete
// Body: { postIds?: string[], deleteType?: 'all'|'text'|'image'|'video'|'reel' }
// ---------------------------------------------------------------------------

router.post("/post-manager/pages/:pageId/bulk-delete", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const pageId = parseInt(req.params.pageId, 10);
  const { postIds, deleteType } = req.body as { postIds?: string[]; deleteType?: string };

  const accountIds = await getUserAccountIds(userId);

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

  const pageToken = await getPageToken(page.fbPageId, account.accessToken);

  let idsToDelete: string[] = [];

  if (postIds && postIds.length > 0) {
    // Delete specific posts by ID
    idsToDelete = postIds;
  } else if (deleteType) {
    // Collect all post IDs of the given type by paginating
    logger.info({ pageId, deleteType }, "Post Manager: collecting posts for bulk delete");
    const reelIds = deleteType === "reel" ? await fetchReelIds(page.fbPageId, pageToken, 200) : new Set<string>();

    let cursor: string | null = null;
    let collected = 0;
    const MAX_COLLECT = 500;

    while (collected < MAX_COLLECT) {
      const params: Record<string, any> = {
        fields: "id,message,story,attachments{type}",
        limit: 100,
        access_token: pageToken,
      };
      if (cursor) params.after = cursor;

      let fbRes: any;
      try {
        fbRes = await axios.get(`${FB_API}/${page.fbPageId}/posts`, { params, timeout: 20_000 });
      } catch (err: any) {
        logger.warn({ err: err?.message }, "Post Manager: bulk collect page fetch failed");
        break;
      }

      const batch: any[] = fbRes.data?.data ?? [];
      if (!batch.length) break;

      for (const post of batch) {
        if (collected >= MAX_COLLECT) break;
        const ptype = detectPostType(post, reelIds);
        if (deleteType === "all" || ptype === deleteType) {
          idsToDelete.push(String(post.id));
          collected++;
        }
      }

      const nextCursor = fbRes.data?.paging?.cursors?.after;
      const hasMore = !!fbRes.data?.paging?.next;
      if (!hasMore || !nextCursor) break;
      cursor = nextCursor;

      await delay(300); // Rate limit protection between collection pages
    }
  }

  if (!idsToDelete.length) {
    res.json({ success: 0, failed: 0, remaining: 0, errors: [] });
    return;
  }

  logger.info({ pageId, count: idsToDelete.length }, "Post Manager: starting bulk delete");

  let successCount = 0;
  let failedCount = 0;
  const errors: { postId: string; error: string }[] = [];

  for (const postId of idsToDelete) {
    try {
      await axios.delete(`${FB_API}/${postId}`, {
        params: { access_token: pageToken },
        timeout: 15_000,
      });
      successCount++;

      await db.insert(automationLogsTable).values({
        type: "deletion",
        message: `Deleted post ${postId} from "${page.name}"`,
        pageId: page.id,
        pageName: page.name,
        accountId: account.id,
        status: "success",
        metadata: JSON.stringify({ postId, bulk: true, deleteType: deleteType ?? "selected" }),
      }).catch(() => {});
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown";
      failedCount++;
      errors.push({ postId, error: msg });

      await db.insert(automationLogsTable).values({
        type: "deletion",
        message: `Failed to delete post ${postId} from "${page.name}": ${msg}`,
        pageId: page.id,
        pageName: page.name,
        accountId: account.id,
        status: "error",
        metadata: JSON.stringify({ postId, error: msg, bulk: true }),
      }).catch(() => {});
    }

    await delay(150); // 150ms between API calls to respect rate limits
  }

  logger.info({ pageId, successCount, failedCount }, "Post Manager: bulk delete complete");

  res.json({
    success: successCount,
    failed: failedCount,
    remaining: 0,
    errors: errors.slice(0, 20), // Cap error list
  });
});

// ---------------------------------------------------------------------------
// GET /post-manager/pages/:pageId/deletion-logs
// ---------------------------------------------------------------------------

router.get("/post-manager/pages/:pageId/deletion-logs", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const pageId = parseInt(req.params.pageId, 10);

  const accountIds = await getUserAccountIds(userId);

  const [page] = await db
    .select()
    .from(facebookPagesTable)
    .where(and(eq(facebookPagesTable.id, pageId), inArray(facebookPagesTable.accountId, accountIds)));

  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  const logs = await db
    .select()
    .from(automationLogsTable)
    .where(and(eq(automationLogsTable.pageId, pageId), eq(automationLogsTable.type, "deletion")))
    .orderBy(desc(automationLogsTable.createdAt))
    .limit(200);

  const result = logs.map((l) => {
    let meta: any = {};
    try { meta = l.metadata ? JSON.parse(l.metadata) : {}; } catch {}
    return {
      id: l.id,
      status: l.status,
      message: l.message,
      postId: meta?.postId ?? null,
      error: meta?.error ?? null,
      bulk: meta?.bulk ?? false,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    };
  });

  res.json(result);
});

export default router;
