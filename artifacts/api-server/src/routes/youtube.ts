import { Router, type IRouter } from "express";
import { parseStringPromise } from "xml2js";
import { db, facebookPagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function fetchYouTubeChannelId(handle: string): Promise<string | null> {
  const cleanHandle = handle.replace(/^@/, "").replace(/\/$/, "");
  const url = `https://www.youtube.com/@${cleanHandle}`;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PageFlow/1.0)" },
    });
    const html = await resp.text();
    const match = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/);
    if (match) return match[1];
    const match2 = html.match(/channel\/([^"&?\/\s]{24})/);
    if (match2) return match2[1];
  } catch {
  }
  return null;
}

async function fetchChannelVideosByChannelId(channelId: string) {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const resp = await fetch(rssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PageFlow/1.0)" },
  });
  if (!resp.ok) {
    throw new Error(`YouTube RSS returned ${resp.status}`);
  }
  const xml = await resp.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const entries = parsed?.feed?.entry;
  if (!entries) return [];

  const arr = Array.isArray(entries) ? entries : [entries];
  return arr.slice(0, 20).map((e: any) => ({
    videoId: e["yt:videoId"] ?? "",
    title: e.title ?? "",
    url: `https://www.youtube.com/watch?v=${e["yt:videoId"] ?? ""}`,
    thumbnail: `https://i.ytimg.com/vi/${e["yt:videoId"] ?? ""}/hqdefault.jpg`,
    publishedAt: e.published ?? "",
    description: (e["media:group"]?.["media:description"] ?? "").slice(0, 300),
    viewCount: parseInt(e["media:group"]?.["media:community"]?.["media:statistics"]?.["$"]?.views ?? "0", 10),
  }));
}

router.get("/youtube/scrape", async (req, res): Promise<void> => {
  const { handle, channelId, pageId } = req.query as Record<string, string>;

  let resolvedChannelId = channelId;

  if (!resolvedChannelId && handle) {
    if (handle.startsWith("UC") && handle.length === 24) {
      resolvedChannelId = handle;
    } else {
      resolvedChannelId = (await fetchYouTubeChannelId(handle)) ?? undefined;
    }
  }

  if (pageId && !resolvedChannelId) {
    const [page] = await db.select().from(facebookPagesTable).where(eq(facebookPagesTable.id, parseInt(pageId, 10)));
    if (page?.sourceIdentity) {
      const identity = page.sourceIdentity;
      if (identity.startsWith("UC") && identity.length === 24) {
        resolvedChannelId = identity;
      } else {
        resolvedChannelId = (await fetchYouTubeChannelId(identity)) ?? undefined;
      }
    }
  }

  if (!resolvedChannelId) {
    res.status(400).json({ error: "Could not resolve YouTube channel. Provide ?handle=@channelname or ?channelId=UC..." });
    return;
  }

  try {
    const videos = await fetchChannelVideosByChannelId(resolvedChannelId);

    if (pageId) {
      await db
        .update(facebookPagesTable)
        .set({ scrapingStatus: "active" })
        .where(eq(facebookPagesTable.id, parseInt(pageId, 10)));
    }

    res.json({ channelId: resolvedChannelId, videos, count: videos.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to scrape YouTube" });
  }
});

export default router;
