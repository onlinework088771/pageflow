import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import FormData from "form-data";
import { db, facebookPagesTable, facebookAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { parseStringPromise } from "xml2js";

const execFileAsync = promisify(execFile);
const FB_API = "https://graph.facebook.com/v19.0";
const YT_DLP_PATH = process.env["YT_DLP_PATH"] ?? "yt-dlp";

// --- Timezone-aware time matching ---

function getCurrentHHMM(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const h = parts.find((p) => p.type === "hour")?.value?.padStart(2, "0") ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value?.padStart(2, "0") ?? "00";
    return `${h}:${m}`;
  } catch {
    return new Date().toISOString().slice(11, 16);
  }
}

function timeSlotDue(slot: string, timezone: string): boolean {
  const current = getCurrentHHMM(timezone);
  return current === slot;
}

// --- YouTube RSS scraper ---

async function fetchChannelIdFromHandle(handle: string): Promise<string | null> {
  const cleanHandle = handle.replace(/^@/, "").replace(/\/$/, "");
  if (cleanHandle.startsWith("UC") && cleanHandle.length === 24) return cleanHandle;
  try {
    const resp = await fetch(`https://www.youtube.com/@${cleanHandle}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PageFlow/1.0)" },
    });
    const html = await resp.text();
    const match = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/);
    if (match) return match[1];
    const match2 = html.match(/channel\/([^"&?\/\s]{24})/);
    if (match2) return match2[1];
  } catch {}
  return null;
}

async function fetchChannelVideos(channelId: string): Promise<{ videoId: string; title: string; description: string }[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PageFlow/1.0)" } });
  if (!resp.ok) throw new Error(`YouTube RSS ${resp.status}`);
  const xml = await resp.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const entries = parsed?.feed?.entry;
  if (!entries) return [];
  const arr = Array.isArray(entries) ? entries : [entries];
  return arr.slice(0, 20).map((e: any) => ({
    videoId: e["yt:videoId"] ?? "",
    title: e.title ?? "",
    description: (e["media:group"]?.["media:description"] ?? "").slice(0, 2000),
  }));
}

// --- Caption / hashtag generation ---

export function generateCaption(title: string, description: string, tags?: string[]): string {
  const hashtagsFromDesc = (description.match(/#[\w\u00C0-\u024F]+/g) ?? []).slice(0, 12);
  let hashtags: string[];

  if (hashtagsFromDesc.length >= 3) {
    hashtags = hashtagsFromDesc;
  } else if (tags && tags.length > 0) {
    hashtags = tags
      .slice(0, 10)
      .map((t) => `#${t.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "").toLowerCase()}`)
      .filter((h) => h.length > 2);
  } else {
    const words = title
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, ""))
      .filter((w) => w.length >= 4);
    hashtags = [...new Set(words)]
      .slice(0, 6)
      .map((w) => `#${w.toLowerCase()}`);
  }

  const hashStr = hashtags.filter((h) => h.length > 2).join(" ");
  return hashStr ? `${title}\n\n${hashStr}` : title;
}

// --- YouTube metadata via yt-dlp ---

async function getYouTubeMetadata(url: string): Promise<{ title: string; description: string; tags: string[] }> {
  try {
    const { stdout } = await execFileAsync(
      YT_DLP_PATH,
      ["--dump-json", "--no-playlist", "--no-warnings", url],
      { timeout: 30_000 },
    );
    const data = JSON.parse(stdout.trim());
    return {
      title: data.title ?? "",
      description: data.description ?? "",
      tags: Array.isArray(data.tags) ? data.tags : [],
    };
  } catch (err: any) {
    logger.warn({ url, err: err.message }, "yt-dlp --dump-json failed");
    return { title: "", description: "", tags: [] };
  }
}

// --- Facebook token ---

async function getPageAccessToken(fbPageId: string, userToken: string): Promise<string> {
  const res = await axios.get(`${FB_API}/${fbPageId}`, {
    params: { fields: "access_token", access_token: userToken },
    timeout: 15_000,
  });
  return res.data?.access_token ?? userToken;
}

// --- YouTube direct URL extraction ---

async function getYouTubeDirectUrl(url: string): Promise<string> {
  const { stdout } = await execFileAsync(
    YT_DLP_PATH,
    ["--get-url", "--format", "best[ext=mp4][height<=720]/mp4/best[height<=720]/best", "--no-playlist", url],
    { timeout: 30_000 },
  );
  const directUrl = stdout.trim().split("\n")[0];
  if (!directUrl) throw new Error("yt-dlp returned no direct URL");
  return directUrl;
}

// --- Post one YouTube video to a Facebook page ---

async function postYouTubeVideoToPage(
  fbPageId: string,
  userAccessToken: string,
  ytUrl: string,
  caption: string,
): Promise<string> {
  const pageToken = await getPageAccessToken(fbPageId, userAccessToken);
  const directUrl = await getYouTubeDirectUrl(ytUrl);

  const res = await axios.post(
    `${FB_API}/${fbPageId}/videos`,
    null,
    {
      params: {
        file_url: directUrl,
        title: caption.split("\n")[0],
        description: caption,
        access_token: pageToken,
      },
      timeout: 120_000,
    },
  );
  return res.data?.id ?? "unknown";
}

// --- Page automation scheduler ---

// Track in-memory which slots we already triggered this minute to avoid duplicates
const triggeredSlots = new Map<string, string>(); // pageId:slot -> HH:MM when last triggered

export async function runPageAutomation(): Promise<void> {
  try {
    const activePages = await db
      .select()
      .from(facebookPagesTable)
      .where(
        and(
          eq(facebookPagesTable.automationEnabled, true),
          eq(facebookPagesTable.scheduleLogic, "fixed"),
          eq(facebookPagesTable.sourceType, "youtube"),
          eq(facebookPagesTable.status, "active"),
        ),
      );

    if (!activePages.length) return;

    for (const page of activePages) {
      const slots: string[] = Array.isArray(page.timeSlots) ? page.timeSlots : [];
      if (!slots.length || !page.sourceIdentity) continue;

      const timezone = page.timezone || "UTC";
      const dueSlot = slots.find((slot) => timeSlotDue(slot, timezone));
      if (!dueSlot) continue;

      const dedupeKey = `${page.id}:${dueSlot}`;
      const currentHHMM = getCurrentHHMM(timezone);
      if (triggeredSlots.get(dedupeKey) === currentHHMM) continue; // already posted this minute
      triggeredSlots.set(dedupeKey, currentHHMM);

      logger.info({ pageId: page.id, slot: dueSlot, timezone }, "Page automation: time slot due, posting");

      // Run in background so one slow page doesn't block others
      postPageNextVideo(page).catch((err) => {
        logger.error({ pageId: page.id, err: err.message }, "Page automation post failed");
      });
    }
  } catch (err: any) {
    logger.error({ err: err.message }, "Page automation scheduler error");
  }
}

async function postPageNextVideo(page: typeof facebookPagesTable.$inferSelect): Promise<void> {
  const [account] = await db
    .select()
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.id, page.accountId));

  if (!account) {
    logger.warn({ pageId: page.id }, "Page automation: account not found");
    return;
  }

  // Resolve channel ID
  const identity = page.sourceIdentity!;
  let channelId: string | null = null;

  if (identity.startsWith("http")) {
    const match = identity.match(/channel\/([^/?&]+)/) ?? identity.match(/\?.*c=([^&]+)/);
    channelId = match?.[1] ?? null;
  } else {
    channelId = await fetchChannelIdFromHandle(identity);
  }

  if (!channelId) {
    logger.warn({ pageId: page.id, identity }, "Page automation: could not resolve YouTube channel");
    return;
  }

  const videos = await fetchChannelVideos(channelId);
  if (!videos.length) {
    logger.warn({ pageId: page.id, channelId }, "Page automation: no videos found on channel");
    return;
  }

  // Pick the next video after the last posted one
  const lastPostedId = page.lastPostedYtVideoId;
  let nextVideo = videos[0];

  if (lastPostedId) {
    const lastIdx = videos.findIndex((v) => v.videoId === lastPostedId);
    if (lastIdx > 0) {
      nextVideo = videos[lastIdx - 1]; // RSS is newest-first, post in order
    }
    // If lastPostedId is the newest (idx=0), wrap to the oldest or skip
    if (lastIdx === 0) {
      logger.info({ pageId: page.id }, "Page automation: all recent videos already posted, reposting oldest");
      nextVideo = videos[videos.length - 1];
    }
  }

  const ytUrl = `https://www.youtube.com/watch?v=${nextVideo.videoId}`;

  // Get richer metadata if available from yt-dlp
  let metadata = { title: nextVideo.title, description: nextVideo.description, tags: [] as string[] };
  try {
    const ytMeta = await getYouTubeMetadata(ytUrl);
    if (ytMeta.title) metadata = ytMeta;
  } catch {}

  const caption = generateCaption(metadata.title, metadata.description, metadata.tags);

  logger.info({ pageId: page.id, videoId: nextVideo.videoId, ytUrl, caption: caption.slice(0, 80) }, "Page automation: posting video");

  try {
    await postYouTubeVideoToPage(page.fbPageId, account.accessToken, ytUrl, caption);

    await db
      .update(facebookPagesTable)
      .set({
        lastPostedYtVideoId: nextVideo.videoId,
        lastPostedAt: new Date(),
        totalPosted: page.totalPosted + 1,
      })
      .where(eq(facebookPagesTable.id, page.id));

    logger.info({ pageId: page.id, videoId: nextVideo.videoId }, "Page automation: posted successfully");
  } catch (err: any) {
    await db
      .update(facebookPagesTable)
      .set({ totalFailed: page.totalFailed + 1 })
      .where(eq(facebookPagesTable.id, page.id));
    throw err;
  }
}
