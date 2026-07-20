import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { parseStringPromise } from "xml2js";
import { eq, and } from "drizzle-orm";
import {
  db,
  youtubeAutomationsTable,
  youtubeChannelsTable,
  youtubeAccountsTable,
  automationLogsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

// Phase 5 — YouTube Automation.
// Independent counterpart to Facebook's page-automation.ts: instead of posting
// scraped content to a Facebook Page, this posts it to one of the user's own
// connected YouTube channels. Deliberately self-contained (own yt-dlp/RSS/
// download helpers, own logging) rather than importing page-automation.ts's
// internal (non-exported) helpers — this keeps the YouTube module fully
// independent per the project's Facebook-isolation rule. `generateCaption` is
// the one exception: it's already an exported, pure helper, so it's imported
// directly here to avoid duplicating hashtag/caption logic.
import { generateCaption } from "./page-automation";
import { getValidAccessToken, uploadToYoutube } from "./youtube-poster";

const execFileAsync = promisify(execFile);
const YT_DLP_PATH = process.env["YT_DLP_PATH"] ?? "yt-dlp";
const TIKTOK_COOKIES_FILE = process.env["TIKTOK_COOKIES_FILE"];
const INSTAGRAM_COOKIES_FILE = process.env["INSTAGRAM_COOKIES_FILE"];
const FACEBOOK_COOKIES_FILE = process.env["FACEBOOK_COOKIES_FILE"];

function cookiesArgsFor(url: string): string[] {
  if (url.includes("tiktok.com") && TIKTOK_COOKIES_FILE && fs.existsSync(TIKTOK_COOKIES_FILE)) {
    return ["--cookies", TIKTOK_COOKIES_FILE];
  }
  if (url.includes("instagram.com") && INSTAGRAM_COOKIES_FILE && fs.existsSync(INSTAGRAM_COOKIES_FILE)) {
    return ["--cookies", INSTAGRAM_COOKIES_FILE];
  }
  if (url.includes("facebook.com") && FACEBOOK_COOKIES_FILE && fs.existsSync(FACEBOOK_COOKIES_FILE)) {
    return ["--cookies", FACEBOOK_COOKIES_FILE];
  }
  return [];
}

async function logAutomation(
  status: "success" | "error" | "info",
  message: string,
  channelId?: number,
  channelName?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(automationLogsTable).values({
      type: "youtube_automation",
      message,
      pageId: channelId ?? null,
      pageName: channelName ?? null,
      status,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err: any) {
    logger.warn({ err: err.message }, "Failed to write youtube automation log");
  }
}

// ---------------------------------------------------------------------------
// Timezone-aware time matching (mirrors page-automation.ts's own logic)
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

function hoursSinceLastPost(lastPostedAt: Date | null | undefined): number {
  if (!lastPostedAt) return Infinity;
  return (Date.now() - new Date(lastPostedAt).getTime()) / (1000 * 60 * 60);
}

// ---------------------------------------------------------------------------
// Source resolution — YouTube (RSS) and TikTok (yt-dlp)
// ---------------------------------------------------------------------------

async function fetchChannelIdFromHandle(handle: string): Promise<string | null> {
  const cleanHandle = handle.replace(/^@/, "").replace(/\/$/, "");
  if (cleanHandle.startsWith("UC") && cleanHandle.length === 24) return cleanHandle;
  try {
    const resp = await fetch(`https://www.youtube.com/@${cleanHandle}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PageFlow/1.0)" },
    });
    const html = await resp.text();
    const m1 = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/);
    if (m1) return m1[1];
    const m2 = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/);
    if (m2) return m2[1];
    const m3 = html.match(/"browseId":"(UC[a-zA-Z0-9_-]+)"/);
    if (m3) return m3[1];
    const m4 = html.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (m4) return m4[1];
  } catch {
    /* fall through */
  }
  return null;
}

async function fetchYouTubeRssVideos(
  channelId: string,
): Promise<{ videoId: string; title: string; description: string; url: string }[]> {
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
    url: e.link?.["$"]?.href ?? `https://www.youtube.com/watch?v=${e["yt:videoId"]}`,
  }));
}

/**
 * Translate raw yt-dlp stderr into a short, human-readable reason.
 * Shown directly in automation_logs so the user knows exactly why it failed.
 */
function parseYtDlpError(platform: string, stderr: string): string {
  const s = stderr.toLowerCase();

  if (s.includes("login required") || s.includes("not logged in") || s.includes("please log in") || s.includes("checkpoint")) {
    return `Access denied — ${platform} requires authentication. Configure a cookies file (FACEBOOK_COOKIES_FILE / INSTAGRAM_COOKIES_FILE / TIKTOK_COOKIES_FILE) and try again.`;
  }
  if (s.includes("does not exist") || s.includes("page not found") || s.includes("this page isn't available") || s.includes("content isn't available") || s.includes("no such page")) {
    return `Page not found — check the username or URL entered for ${platform}.`;
  }
  if (s.includes("no video formats found") || s.includes("no videos found") || s.includes("this playlist is empty")) {
    return `Page has no public videos — the ${platform} page exists but has not posted any accessible videos.`;
  }
  if (s.includes("private") || s.includes("only for friends") || s.includes("restricted")) {
    return `Access denied — this ${platform} page or its videos are private or restricted.`;
  }
  if (s.includes("rate") || s.includes("too many requests") || s.includes("429")) {
    return `Rate limited by ${platform} — too many requests. Try again in a few minutes.`;
  }
  if (s.includes("unable to extract") || s.includes("could not extract") || s.includes("unsupported url")) {
    return `URL is invalid or unsupported — ${platform} could not extract any videos from this address.`;
  }
  if (s.includes("timeout") || s.includes("timed out") || s.includes("connection")) {
    return `Network error — could not reach ${platform}. Check server connectivity and try again.`;
  }
  // Fallback: return the raw stderr trimmed to something readable
  return stderr.replace(/\s+/g, " ").trim().slice(0, 300);
}

async function fetchProfileVideos(
  platform: "tiktok" | "instagram" | "facebook",
  profileUrl: string,
  limit = 20,
): Promise<{ videoId: string; title: string; url: string }[]> {
  logger.info({ step: "fetch-start", platform, profileUrl }, `[YT-AUTO] Fetching ${platform} video list: ${profileUrl}`);
  const cookieArgs = cookiesArgsFor(profileUrl);
  if (cookieArgs.length === 0) {
    logger.warn({ platform }, `[YT-AUTO] No cookies file configured for ${platform} — anonymous requests may be blocked`);
  }
  const fullArgs = [
    ...cookieArgs,
    "--flat-playlist",
    "--print", "%(id)s\t%(title)s\t%(webpage_url)s",
    "--playlist-end", String(limit),
    "--no-warnings",
    profileUrl,
  ];
  logger.debug({ args: fullArgs.filter((a) => a !== "--cookies").join(" ") }, "[YT-AUTO] yt-dlp list args");

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(YT_DLP_PATH, fullArgs, { timeout: 45_000 }));
  } catch (err: any) {
    const raw: string = err?.stderr || err?.message || String(err);
    const friendly = parseYtDlpError(platform, raw);
    logger.error({ platform, profileUrl, raw: raw.slice(0, 500) }, `[YT-AUTO] yt-dlp ${platform} listing failed`);
    throw new Error(friendly);
  }

  const videos = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [videoId, title, url] = line.split("\t");
      return { videoId: videoId ?? "", title: title ?? "", url: url ?? "" };
    })
    .filter((v) => v.videoId);

  logger.info({ platform, profileUrl, count: videos.length }, `[YT-AUTO] Found ${videos.length} videos from ${platform}`);
  if (videos.length === 0) {
    // Treat empty response as an error too so the user sees it in the dashboard.
    throw new Error(`Page has no public videos — the ${platform} page exists but returned no accessible videos. The page may be empty, private, or may require authentication.`);
  }
  return videos;
}

/** Normalise a user-supplied handle/URL into a full profile URL for a given platform. */
function resolveProfileUrl(platform: "tiktok" | "instagram" | "facebook", identity: string): string {
  const trimmed = identity.trim().replace(/\/$/, "");

  // If it already looks like a URL, normalise the host and return as-is.
  if (trimmed.startsWith("http")) {
    const normalized = trimmed
      .replace(/^https?:\/\/(m\.|www\.)?facebook\.com/, "https://www.facebook.com")
      .replace(/^https?:\/\/(www\.)?tiktok\.com/, "https://www.tiktok.com")
      .replace(/^https?:\/\/(www\.)?instagram\.com/, "https://www.instagram.com");
    logger.info({ platform, input: trimmed, resolved: normalized }, "[YT-AUTO] Resolved source URL (from full URL)");
    return normalized;
  }

  const handle = trimmed.replace(/^@/, "");
  let resolved: string;
  if (platform === "tiktok")   resolved = `https://www.tiktok.com/@${handle}`;
  else if (platform === "facebook") resolved = `https://www.facebook.com/${handle}/videos/`;
  else                          resolved = `https://www.instagram.com/${handle}/`;

  logger.info({ platform, input: trimmed, handle, resolved }, "[YT-AUTO] Resolved source URL (from handle)");
  return resolved;
}

async function getVideoMetadata(url: string): Promise<{ title: string; description: string; tags: string[] }> {
  try {
    const { stdout } = await execFileAsync(
      YT_DLP_PATH,
      [...cookiesArgsFor(url), "--dump-json", "--no-playlist", "--no-warnings", url],
      { timeout: 30_000 },
    );
    const data = JSON.parse(stdout.trim());
    return { title: data.title ?? "", description: data.description ?? "", tags: Array.isArray(data.tags) ? data.tags : [] };
  } catch (err: any) {
    logger.warn({ url, err: err.message }, "YouTube automation: metadata extraction failed, using fallback title");
    return { title: "", description: "", tags: [] };
  }
}

async function downloadVideoToTempFile(url: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), "uploads", "youtube", "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `auto_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

  await execFileAsync(
    YT_DLP_PATH,
    [
      ...cookiesArgsFor(url),
      "--format", "best[ext=mp4][height<=1080]/mp4/best",
      "--merge-output-format", "mp4",
      "--output", tmpFile,
      "--no-playlist",
      "--no-warnings",
      url,
    ],
    { timeout: 300_000 },
  );

  if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size === 0) {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    throw new Error(`yt-dlp download produced no usable file for: ${url.slice(0, 80)}`);
  }
  return tmpFile;
}

/** Finds the next video from the source that hasn't been posted yet (by lastPostedVideoId). */
async function findNextUnseenVideo(
  automation: typeof youtubeAutomationsTable.$inferSelect,
): Promise<{ videoId: string; url: string; title: string; description?: string } | null> {
  const platform = automation.sourceType as "tiktok" | "instagram" | "facebook" | null;
  if (!platform || !automation.sourceIdentity) {
    logger.warn({ channelId: automation.channelId }, "[YT-AUTO] Automation has no sourceType or sourceIdentity — skipping");
    return null;
  }

  const profileUrl = resolveProfileUrl(platform, automation.sourceIdentity);
  // NOTE: fetchProfileVideos throws on yt-dlp failure; callers must handle.
  const videos = await fetchProfileVideos(platform, profileUrl);
  if (!videos.length) return null;

  const lastId = automation.lastPostedVideoId;
  logger.info({ platform, total: videos.length, lastPostedVideoId: lastId ?? "(none)" }, "[YT-AUTO] Selecting next unseen video");

  const idx = lastId ? videos.findIndex((v) => v.videoId === lastId) : -1;
  if (lastId && idx === -1) {
    logger.warn({ lastId }, "[YT-AUTO] lastPostedVideoId not found in current video list — may have been deleted; picking oldest available");
  }
  // List is newest-first; pick the entry just before the last posted one,
  // or the last entry when nothing has been posted yet.
  const next = idx > 0 ? videos[idx - 1] : videos[videos.length - 1];
  if (next) {
    logger.info({ videoId: next.videoId, title: next.title, url: next.url }, "[YT-AUTO] Next video selected");
  } else {
    logger.info({ platform }, "[YT-AUTO] No unseen video found in current list");
  }
  return next ? { videoId: next.videoId, url: next.url, title: next.title } : null;
}

/** Runs one automation: finds, downloads, and uploads the next unseen video to the channel's own YouTube account. */
export async function runChannelAutomation(automation: typeof youtubeAutomationsTable.$inferSelect): Promise<void> {
  logger.info({ channelId: automation.channelId, sourceType: automation.sourceType, sourceIdentity: automation.sourceIdentity }, "[YT-AUTO] Starting automation run");

  const [channel] = await db.select().from(youtubeChannelsTable).where(eq(youtubeChannelsTable.id, automation.channelId));
  if (!channel) {
    await logAutomation("error", "Automation skipped — channel no longer exists", automation.channelId);
    return;
  }

  const [account] = await db.select().from(youtubeAccountsTable).where(eq(youtubeAccountsTable.id, channel.accountId));
  if (!account) {
    await logAutomation("error", "Automation skipped — YouTube account no longer exists", automation.channelId, channel.title);
    return;
  }

  let tmpFile: string | null = null;
  try {
    // ── Step 1: find next unseen video ──────────────────────────────────────
    // findNextUnseenVideo now throws (via fetchProfileVideos) when yt-dlp
    // fails, so any source-fetch error is caught here and written to logs.
    const next = await findNextUnseenVideo(automation);
    if (!next) {
      logger.info({ channelId: automation.channelId }, "[YT-AUTO] No new video found from source — nothing to post");
      await logAutomation("info", "No new video found from source", automation.channelId, channel.title);
      return;
    }

    // ── Step 2: get a valid access token ────────────────────────────────────
    logger.info({ channelId: automation.channelId }, "[YT-AUTO] Acquiring YouTube access token");
    const accessToken = await getValidAccessToken(account);

    // ── Step 3: fetch video metadata (title, description, tags) ─────────────
    // Fetch rich metadata for TikTok and Facebook via yt-dlp dump-json;
    // Instagram titles are usually reliable from the flat-playlist listing.
    const needsMetadata = automation.sourceType === "tiktok" || automation.sourceType === "facebook";
    logger.info({ url: next.url, needsMetadata }, "[YT-AUTO] Fetching video metadata");
    const meta = needsMetadata
      ? await getVideoMetadata(next.url)
      : { title: "", description: next.description ?? "", tags: [] };

    const title = (next.title || meta.title || "Untitled video").slice(0, 100);
    const description = generateCaption(title, meta.description || next.description || "", meta.tags);
    logger.info({ title, descriptionLength: description.length, tags: meta.tags.length }, "[YT-AUTO] Video metadata resolved");

    // ── Step 4: download ─────────────────────────────────────────────────────
    logger.info({ url: next.url }, "[YT-AUTO] Downloading video to temp file");
    tmpFile = await downloadVideoToTempFile(next.url);
    const sizeMb = (fs.statSync(tmpFile).size / 1024 / 1024).toFixed(1);
    logger.info({ tmpFile, sizeMb: `${sizeMb} MB` }, "[YT-AUTO] Download complete");

    // ── Step 5: upload to YouTube ─────────────────────────────────────────────
    logger.info({ channelId: automation.channelId, title, privacyStatus: automation.privacyStatus, videoType: automation.videoType }, "[YT-AUTO] Uploading to YouTube");
    const youtubeVideoId = await uploadToYoutube(accessToken, tmpFile, {
      title,
      description,
      privacyStatus: automation.privacyStatus,
      videoType: automation.videoType,
    });
    logger.info({ youtubeVideoId }, "[YT-AUTO] Upload successful");

    // ── Step 6: persist success state ────────────────────────────────────────
    await db
      .update(youtubeAutomationsTable)
      .set({
        lastPostedAt: new Date(),
        lastPostedVideoId: next.videoId,
        totalPosted: automation.totalPosted + 1,
        status: "active",
      })
      .where(eq(youtubeAutomationsTable.id, automation.id));

    await logAutomation("success", `Posted "${title}" to YouTube (video ${youtubeVideoId})`, automation.channelId, channel.title, {
      sourceVideoId: next.videoId,
      youtubeVideoId,
    });
  } catch (err: any) {
    const message: string = err?.response?.data?.error?.message || err.message || "Automation run failed";
    logger.error({ automationId: automation.id, err: message }, "[YT-AUTO] Automation run failed");
    await db
      .update(youtubeAutomationsTable)
      .set({ totalFailed: automation.totalFailed + 1, status: "error" })
      .where(eq(youtubeAutomationsTable.id, automation.id));
    await logAutomation("error", String(message).slice(0, 500), automation.channelId, channel.title);
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }
}

async function runFixedSchedule(): Promise<void> {
  const automations = await db
    .select()
    .from(youtubeAutomationsTable)
    .where(and(eq(youtubeAutomationsTable.automationEnabled, true), eq(youtubeAutomationsTable.scheduleLogic, "fixed")));

  for (const automation of automations) {
    // NOTE: status === "error" is NOT a permanent block — we always retry on the
    // next due slot so a transient failure (yt-dlp rate-limit, network blip,
    // Google API outage) does not permanently kill the automation.
    const slots = Array.isArray(automation.timeSlots) ? automation.timeSlots : [];
    const due = slots.some((slot) => timeSlotDue(slot, automation.timezone));
    if (due) {
      await runChannelAutomation(automation);
    }
  }
}

async function runRandomSchedule(): Promise<void> {
  const automations = await db
    .select()
    .from(youtubeAutomationsTable)
    .where(and(eq(youtubeAutomationsTable.automationEnabled, true), eq(youtubeAutomationsTable.scheduleLogic, "random")));

  for (const automation of automations) {
    // NOTE: status === "error" is NOT a permanent block — same reasoning as runFixedSchedule.
    const hoursPerPost = 24 / Math.max(1, automation.postsPerDay);
    if (hoursSinceLastPost(automation.lastPostedAt) >= hoursPerPost) {
      // Small random chance per tick within the due window, mirroring page-automation.ts's
      // random-schedule jitter so posts don't all land at the exact top of the window.
      if (Math.random() < 0.3) {
        await runChannelAutomation(automation);
      }
    }
  }
}

/** Scheduler tick — call every 60s. */
export async function runYoutubeAutomation(): Promise<void> {
  await runFixedSchedule();
  await runRandomSchedule();
}
