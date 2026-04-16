import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import { db, facebookPagesTable, facebookAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { parseStringPromise } from "xml2js";

const execFileAsync = promisify(execFile);
const FB_API = "https://graph.facebook.com/v19.0";
const YT_DLP_PATH = process.env["YT_DLP_PATH"] ?? "yt-dlp";

// ---------------------------------------------------------------------------
// Timezone-aware time matching
// ---------------------------------------------------------------------------

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
  return getCurrentHHMM(timezone) === slot;
}

// ---------------------------------------------------------------------------
// Caption / hashtag generation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// yt-dlp helpers — download video to temp file then upload
// ---------------------------------------------------------------------------

async function getVideoMetadata(url: string): Promise<{ title: string; description: string; tags: string[] }> {
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

/**
 * Download a video to a temp file using yt-dlp.
 * Works for YouTube, Instagram, TikTok and any yt-dlp-supported source.
 * Returns the temp file path — caller MUST delete it after use.
 */
async function downloadVideoToTempFile(url: string, label = "auto"): Promise<string> {
  const tmpDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const tmpFile = path.join(tmpDir, `${label}_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

  logger.info({ url: url.slice(0, 80), tmpFile }, "page-automation: downloading video");

  await execFileAsync(
    YT_DLP_PATH,
    [
      "--format", "best[ext=mp4][height<=720]/mp4/best[height<=720]/best",
      "--merge-output-format", "mp4",
      "--output", tmpFile,
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      url,
    ],
    { timeout: 300_000 },  // 5 min for page automation downloads
  );

  if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size === 0) {
    throw new Error(`yt-dlp download produced no output for: ${url.slice(0, 80)}`);
  }

  return tmpFile;
}

/**
 * Fetch a list of recent video IDs + URLs from any yt-dlp-supported
 * playlist/profile URL. Returns newest-first (as yt-dlp provides them).
 */
async function fetchProfileVideos(
  profileUrl: string,
  limit = 20,
): Promise<{ videoId: string; title: string; url: string }[]> {
  try {
    const { stdout } = await execFileAsync(
      YT_DLP_PATH,
      [
        "--flat-playlist",
        "--print", "%(id)s\t%(title)s\t%(webpage_url)s",
        "--playlist-end", String(limit),
        "--no-warnings",
        profileUrl,
      ],
      { timeout: 45_000 },
    );

    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [videoId, title, url] = line.split("\t");
        return { videoId: videoId ?? "", title: title ?? "", url: url ?? "" };
      })
      .filter((v) => v.videoId);
  } catch (err: any) {
    logger.warn({ profileUrl, err: err.message }, "yt-dlp --flat-playlist failed");
    return [];
  }
}

// ---------------------------------------------------------------------------
// YouTube RSS scraper (preferred for YouTube — no yt-dlp rate-limit risk)
// ---------------------------------------------------------------------------

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

async function fetchYouTubeRssVideos(
  channelId: string,
): Promise<{ videoId: string; title: string; description: string }[]> {
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

// ---------------------------------------------------------------------------
// Facebook helpers
// ---------------------------------------------------------------------------

async function getPageAccessToken(fbPageId: string, userToken: string): Promise<string> {
  const res = await axios.get(`${FB_API}/${fbPageId}`, {
    params: { fields: "access_token", access_token: userToken },
    timeout: 15_000,
  });
  return res.data?.access_token ?? userToken;
}

/**
 * Upload a video to Facebook using binary multipart.
 * This is the ONLY upload strategy used in page automation.
 * file_url is NOT used because YouTube/TikTok/IG CDN URLs require
 * authentication headers and expire within seconds.
 */
async function uploadVideoFileTofacebook(
  fbPageId: string,
  pageToken: string,
  title: string,
  caption: string,
  filePath: string,
): Promise<string> {
  logger.info({ fbPageId, filePath }, "page-automation: uploading video to Facebook (binary)");

  const form = new FormData();
  form.append("source", fs.createReadStream(filePath));
  form.append("title", title);
  form.append("description", caption);
  form.append("access_token", pageToken);

  const res = await axios.post(`${FB_API}/${fbPageId}/videos`, form, {
    headers: form.getHeaders(),
    timeout: 300_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return res.data?.id ?? "unknown";
}

/**
 * Download a video URL to a temp file and upload it to Facebook.
 * Handles cleanup automatically on success or failure.
 */
async function downloadAndUploadToFacebook(
  fbPageId: string,
  pageToken: string,
  videoUrl: string,
  title: string,
  caption: string,
  label = "auto",
): Promise<void> {
  const tmpFile = await downloadVideoToTempFile(videoUrl, label);
  try {
    await uploadVideoFileTofacebook(fbPageId, pageToken, title, caption, tmpFile);
  } finally {
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Per-source posting logic
// ---------------------------------------------------------------------------

async function postNextYouTubeVideo(
  page: typeof facebookPagesTable.$inferSelect,
  pageToken: string,
): Promise<{ postedVideoId: string }> {
  const identity = page.sourceIdentity!;

  // Resolve channel ID
  let channelId: string | null = null;
  if (identity.startsWith("http")) {
    const m = identity.match(/channel\/([^/?&]+)/) ?? identity.match(/\?.*c=([^&]+)/);
    channelId = m?.[1] ?? null;
  } else {
    channelId = await fetchChannelIdFromHandle(identity);
  }
  if (!channelId) throw new Error(`Could not resolve YouTube channel from "${identity}"`);

  const videos = await fetchYouTubeRssVideos(channelId);
  if (!videos.length) throw new Error("No videos found on YouTube channel");

  // Pick next unseen video (RSS is newest-first → post in chronological order)
  const lastPostedId = page.lastPostedYtVideoId;
  let nextVideo = videos[0];
  if (lastPostedId) {
    const lastIdx = videos.findIndex((v) => v.videoId === lastPostedId);
    if (lastIdx > 0) {
      nextVideo = videos[lastIdx - 1];
    } else if (lastIdx === 0) {
      nextVideo = videos[videos.length - 1]; // wrap around to oldest
    }
  }

  const ytUrl = `https://www.youtube.com/watch?v=${nextVideo.videoId}`;

  // Get richer metadata from yt-dlp (optional, fallback to RSS data)
  let meta = { title: nextVideo.title, description: nextVideo.description, tags: [] as string[] };
  try {
    const m = await getVideoMetadata(ytUrl);
    if (m.title) meta = { ...meta, ...m };
  } catch {}

  const title = meta.title || nextVideo.title;
  const caption = generateCaption(title, meta.description, meta.tags);

  // Download video file and upload to Facebook via binary multipart
  // NOTE: We do NOT use file_url because YouTube CDN signed URLs expire in seconds
  await downloadAndUploadToFacebook(page.fbPageId, pageToken, ytUrl, title, caption, "yt");

  return { postedVideoId: nextVideo.videoId };
}

async function postNextInstagramVideo(
  page: typeof facebookPagesTable.$inferSelect,
  pageToken: string,
): Promise<{ postedVideoId: string }> {
  const handle = page.sourceIdentity!.replace(/^@/, "");
  const profileUrl = `https://www.instagram.com/@${handle}/`;

  const videos = await fetchProfileVideos(profileUrl, 20);
  if (!videos.length) throw new Error(`No Instagram videos found for @${handle}`);

  const lastPostedId = page.lastPostedYtVideoId;
  let nextVideo = videos[0];

  if (lastPostedId) {
    const lastIdx = videos.findIndex((v) => v.videoId === lastPostedId);
    if (lastIdx > 0) {
      nextVideo = videos[lastIdx - 1];
    } else if (lastIdx === 0) {
      nextVideo = videos[videos.length - 1];
    }
  }

  const videoUrl = nextVideo.url || `https://www.instagram.com/reel/${nextVideo.videoId}/`;

  const meta = await getVideoMetadata(videoUrl)
    .catch(() => ({ title: nextVideo.title || handle, description: "", tags: [] as string[] }));

  const title = meta.title || nextVideo.title || handle;
  const caption = generateCaption(title, meta.description, meta.tags);

  await downloadAndUploadToFacebook(page.fbPageId, pageToken, videoUrl, title, caption, "ig");

  return { postedVideoId: nextVideo.videoId };
}

async function postNextTikTokVideo(
  page: typeof facebookPagesTable.$inferSelect,
  pageToken: string,
): Promise<{ postedVideoId: string }> {
  const handle = page.sourceIdentity!.replace(/^@/, "");
  const profileUrl = `https://www.tiktok.com/@${handle}`;

  const videos = await fetchProfileVideos(profileUrl, 20);
  if (!videos.length) throw new Error(`No TikTok videos found for @${handle}`);

  const lastPostedId = page.lastPostedYtVideoId;
  let nextVideo = videos[0];

  if (lastPostedId) {
    const lastIdx = videos.findIndex((v) => v.videoId === lastPostedId);
    if (lastIdx > 0) {
      nextVideo = videos[lastIdx - 1];
    } else if (lastIdx === 0) {
      nextVideo = videos[videos.length - 1];
    }
  }

  const videoUrl = nextVideo.url || `https://www.tiktok.com/@${handle}/video/${nextVideo.videoId}`;

  const meta = await getVideoMetadata(videoUrl)
    .catch(() => ({ title: nextVideo.title || handle, description: "", tags: [] as string[] }));

  const title = meta.title || nextVideo.title || handle;
  const caption = generateCaption(title, meta.description, meta.tags);

  await downloadAndUploadToFacebook(page.fbPageId, pageToken, videoUrl, title, caption, "tt");

  return { postedVideoId: nextVideo.videoId };
}

// ---------------------------------------------------------------------------
// Main per-page orchestrator
// ---------------------------------------------------------------------------

async function postPageNextVideo(page: typeof facebookPagesTable.$inferSelect): Promise<void> {
  const [account] = await db
    .select()
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.id, page.accountId));

  if (!account) {
    logger.warn({ pageId: page.id }, "Page automation: account not found");
    return;
  }

  const pageToken = await getPageAccessToken(page.fbPageId, account.accessToken);

  let postedVideoId: string;

  const source = page.sourceType ?? "youtube";
  logger.info({ pageId: page.id, source, identity: page.sourceIdentity }, "Page automation: posting next video");

  if (source === "youtube") {
    ({ postedVideoId } = await postNextYouTubeVideo(page, pageToken));
  } else if (source === "instagram") {
    ({ postedVideoId } = await postNextInstagramVideo(page, pageToken));
  } else if (source === "tiktok") {
    ({ postedVideoId } = await postNextTikTokVideo(page, pageToken));
  } else {
    throw new Error(`Unknown source type: ${source}`);
  }

  await db
    .update(facebookPagesTable)
    .set({
      lastPostedYtVideoId: postedVideoId,
      lastPostedAt: new Date(),
      totalPosted: page.totalPosted + 1,
    })
    .where(eq(facebookPagesTable.id, page.id));

  logger.info({ pageId: page.id, source, postedVideoId }, "Page automation: posted successfully");
}

// ---------------------------------------------------------------------------
// Scheduler — runs every 60 s, checks all active pages with fixed time slots
// ---------------------------------------------------------------------------

const triggeredSlots = new Map<string, string>(); // `${pageId}:${slot}` → HH:MM when last fired

export async function runPageAutomation(): Promise<void> {
  try {
    // Fetch ALL active pages with fixed schedule (any source type)
    const activePages = await db
      .select()
      .from(facebookPagesTable)
      .where(
        and(
          eq(facebookPagesTable.automationEnabled, true),
          eq(facebookPagesTable.scheduleLogic, "fixed"),
          eq(facebookPagesTable.status, "active"),
        ),
      );

    if (!activePages.length) return;

    for (const page of activePages) {
      if (!page.sourceIdentity?.trim()) continue;

      const slots: string[] = Array.isArray(page.timeSlots) ? page.timeSlots : [];
      if (!slots.length) continue;

      const timezone = page.timezone || "UTC";
      const dueSlot = slots.find((slot) => timeSlotDue(slot, timezone));
      if (!dueSlot) continue;

      const dedupeKey = `${page.id}:${dueSlot}`;
      const currentHHMM = getCurrentHHMM(timezone);
      if (triggeredSlots.get(dedupeKey) === currentHHMM) continue;
      triggeredSlots.set(dedupeKey, currentHHMM);

      logger.info(
        { pageId: page.id, source: page.sourceType, slot: dueSlot, timezone },
        "Page automation: time slot due, posting",
      );

      postPageNextVideo(page).catch((err) => {
        logger.error({ pageId: page.id, source: page.sourceType, err: err.message }, "Page automation post failed");
        db.update(facebookPagesTable)
          .set({ totalFailed: page.totalFailed + 1 })
          .where(eq(facebookPagesTable.id, page.id))
          .catch(() => {});
      });
    }
  } catch (err: any) {
    logger.error({ err: err.message }, "Page automation scheduler error");
  }
}
