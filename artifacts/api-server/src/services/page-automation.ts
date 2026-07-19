import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import {
  db,
  facebookPagesTable,
  facebookAccountsTable,
  automationLogsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { parseStringPromise } from "xml2js";

const execFileAsync = promisify(execFile);
const FB_API = "https://graph.facebook.com/v19.0";
const YT_DLP_PATH = process.env["YT_DLP_PATH"] ?? "yt-dlp";

// Optional cookie files for platforms that require an authenticated session
// to scrape (Instagram now blocks all anonymous yt-dlp requests with 429 /
// "empty media response" — see runYtDlp()/classifyYtDlpError() below).
// Export cookies from a logged-in browser session in Netscape cookies.txt
// format and point these env vars at the file.
const INSTAGRAM_COOKIES_FILE = process.env["INSTAGRAM_COOKIES_FILE"];
const TIKTOK_COOKIES_FILE = process.env["TIKTOK_COOKIES_FILE"];

function cookiesArgsFor(url: string): string[] {
  if (url.includes("instagram.com") && INSTAGRAM_COOKIES_FILE && fs.existsSync(INSTAGRAM_COOKIES_FILE)) {
    return ["--cookies", INSTAGRAM_COOKIES_FILE];
  }
  if (url.includes("tiktok.com") && TIKTOK_COOKIES_FILE && fs.existsSync(TIKTOK_COOKIES_FILE)) {
    return ["--cookies", TIKTOK_COOKIES_FILE];
  }
  return [];
}

/**
 * Classifies a yt-dlp failure so callers/logs can tell "platform requires
 * login now" apart from a generic transient failure.
 */
type YtDlpErrorKind = "auth_wall" | "rate_limited" | "not_found" | "unknown";

function classifyYtDlpError(message: string): YtDlpErrorKind {
  const m = message.toLowerCase();
  if (
    m.includes("empty media response") ||
    m.includes("login required") ||
    m.includes("rate-limit reached") ||
    m.includes("--cookies-from-browser")
  ) {
    return "auth_wall";
  }
  if (m.includes("429") || m.includes("too many requests")) return "rate_limited";
  if (m.includes("404") || m.includes("unable to find") || m.includes("no video") || m.includes("content isn't available")) {
    return "not_found";
  }
  return "unknown";
}

/**
 * Runs yt-dlp with structured start/end/error logging, cookie injection for
 * platforms that need it, and one retry with backoff for rate-limit errors.
 * `step` is a pipeline-stage tag used purely for log correlation, e.g.
 * "metadata", "download", "profile-list".
 */
async function runYtDlp(
  step: string,
  url: string,
  args: string[],
  opts: { timeout: number },
): Promise<{ stdout: string; stderr: string }> {
  const fullArgs = [...cookiesArgsFor(url), ...args, url];
  const attempt = async () => {
    const startedAt = Date.now();
    try {
      const res = await execFileAsync(YT_DLP_PATH, fullArgs, { timeout: opts.timeout });
      logger.info(
        { step, url: url.slice(0, 120), durationMs: Date.now() - startedAt },
        `yt-dlp[${step}]: succeeded`,
      );
      return res;
    } catch (err: any) {
      const message: string = err?.stderr || err?.message || String(err);
      const kind = classifyYtDlpError(message);
      logger.error(
        { step, url: url.slice(0, 120), durationMs: Date.now() - startedAt, kind, message: message.slice(0, 500) },
        `yt-dlp[${step}]: failed`,
      );
      const wrapped: any = new Error(message.slice(0, 800));
      wrapped.ytDlpKind = kind;
      wrapped.step = step;
      throw wrapped;
    }
  };

  try {
    return await attempt();
  } catch (err: any) {
    if (err.ytDlpKind === "rate_limited") {
      logger.warn({ step, url: url.slice(0, 120) }, `yt-dlp[${step}]: rate-limited, retrying once after backoff`);
      await new Promise((r) => setTimeout(r, 5_000 + Math.random() * 3_000));
      return await attempt();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Automation log writer
// ---------------------------------------------------------------------------

async function logAutomation(
  status: "success" | "error" | "info",
  type: string,
  message: string,
  pageId?: number,
  pageName?: string,
  accountId?: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(automationLogsTable).values({
      type,
      message,
      pageId: pageId ?? null,
      pageName: pageName ?? null,
      accountId: accountId ?? null,
      status,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err: any) {
    logger.warn({ err: err.message }, "Failed to write automation log");
  }
}

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

/**
 * Returns "YYYY-MM-DD HH:MM" in the given timezone — used for dedup keys in
 * triggeredSlots so a slot fires once per minute per DAY, not once per server
 * lifetime. Storing just HH:MM would cause the Map to permanently block the
 * same slot the next day (stored "09:00" === current "09:00" → always skip).
 */
function getCurrentDateHHMM(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const y  = parts.find((p) => p.type === "year")?.value   ?? "0000";
    const mo = parts.find((p) => p.type === "month")?.value  ?? "00";
    const d  = parts.find((p) => p.type === "day")?.value    ?? "00";
    const h  = parts.find((p) => p.type === "hour")?.value?.padStart(2, "0")   ?? "00";
    const m  = parts.find((p) => p.type === "minute")?.value?.padStart(2, "0") ?? "00";
    return `${y}-${mo}-${d} ${h}:${m}`;
  } catch {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
  }
}

function timeSlotDue(slot: string, timezone: string): boolean {
  return getCurrentHHMM(timezone) === slot;
}

/**
 * Get the number of hours since the last post, or Infinity if never posted.
 */
function hoursSinceLastPost(lastPostedAt: Date | null | undefined): number {
  if (!lastPostedAt) return Infinity;
  return (Date.now() - new Date(lastPostedAt).getTime()) / (1000 * 60 * 60);
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
  logger.info({ step: "metadata", url: url.slice(0, 120) }, "Pipeline step 3/8: extracting video metadata");
  try {
    const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
    const extraArgs = isYouTube ? ["--extractor-args", "youtube:player_client=android,ios"] : [];
    const { stdout } = await runYtDlp(
      "metadata",
      url,
      ["--dump-json", "--no-playlist", "--no-warnings", ...extraArgs],
      { timeout: 30_000 },
    );
    const data = JSON.parse(stdout.trim());
    return {
      title: data.title ?? "",
      description: data.description ?? "",
      tags: Array.isArray(data.tags) ? data.tags : [],
    };
  } catch (err: any) {
    // Metadata is best-effort — callers fall back to RSS/profile-listing title.
    // We still surface the classified error kind so auth-wall failures (e.g.
    // Instagram requiring login) are visible in logs even though we don't abort here.
    logger.warn({ url, kind: err.ytDlpKind, err: err.message }, "yt-dlp metadata extraction failed, continuing with fallback title");
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

  logger.info({ step: "download", url: url.slice(0, 120), tmpFile }, "Pipeline step 4/8: downloading video");

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const extraArgs = isYouTube ? ["--extractor-args", "youtube:player_client=android,ios"] : [];

  await runYtDlp(
    "download",
    url,
    [
      "--format", "best[ext=mp4][height<=720]/mp4/best[height<=720]/best",
      "--merge-output-format", "mp4",
      "--output", tmpFile,
      "--no-playlist",
      "--no-warnings",
      ...extraArgs,
    ],
    { timeout: 300_000 },  // 5 min for page automation downloads
  );

  // Pipeline step 5/8: verify the file actually landed on disk before we ever
  // try to schedule/upload it — this is the exact check that used to be
  // silently skipped when yt-dlp exited 0 but wrote nothing (e.g. merge failures).
  if (!fs.existsSync(tmpFile)) {
    logger.error({ step: "file-verify", tmpFile }, "Pipeline step 5/8: FAILED — file does not exist after download");
    throw new Error(`yt-dlp download produced no output file for: ${url.slice(0, 80)}`);
  }
  const size = fs.statSync(tmpFile).size;
  if (size === 0) {
    logger.error({ step: "file-verify", tmpFile }, "Pipeline step 5/8: FAILED — file exists but is 0 bytes");
    try { fs.unlinkSync(tmpFile); } catch {}
    throw new Error(`yt-dlp download produced an empty (0-byte) file for: ${url.slice(0, 80)}`);
  }
  logger.info({ step: "file-verify", tmpFile, sizeBytes: size }, "Pipeline step 5/8: file verified on disk");

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
  logger.info({ step: "profile-list", profileUrl }, "Pipeline step 3/8: listing recent videos from profile");
  try {
    const { stdout } = await runYtDlp(
      "profile-list",
      profileUrl,
      [
        "--flat-playlist",
        "--print", "%(id)s\t%(title)s\t%(webpage_url)s",
        "--playlist-end", String(limit),
        "--no-warnings",
      ],
      { timeout: 45_000 },
    );

    const videos = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [videoId, title, url] = line.split("\t");
        return { videoId: videoId ?? "", title: title ?? "", url: url ?? "" };
      })
      .filter((v) => v.videoId);

    logger.info({ step: "profile-list", profileUrl, count: videos.length }, "Pipeline step 3/8: profile listing complete");
    return videos;
  } catch (err: any) {
    // Surface WHY the listing failed — this is the exact spot where Instagram
    // now fails for every account (anonymous scraping blocked platform-side),
    // vs. TikTok/YouTube which still succeed anonymously as of this fix.
    logger.error(
      { profileUrl, kind: err.ytDlpKind, err: err.message },
      err.ytDlpKind === "auth_wall"
        ? "Pipeline step 3/8 FAILED: platform requires an authenticated session (cookies) to list videos — see INSTAGRAM_COOKIES_FILE"
        : "Pipeline step 3/8 FAILED: yt-dlp --flat-playlist failed",
    );
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
    // Multiple patterns for resilience — YouTube changes page structure over time
    const m1 = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/);
    if (m1) return m1[1];
    const m2 = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/);
    if (m2) return m2[1];
    const m3 = html.match(/"browseId":"(UC[a-zA-Z0-9_-]+)"/);
    if (m3) return m3[1];
    const m4 = html.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (m4) return m4[1];
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

/**
 * Detect if an Axios error is a Facebook token expiry / permission error.
 */
function isFacebookAuthError(err: any): boolean {
  const fbCode = err?.response?.data?.error?.code;
  const fbSubCode = err?.response?.data?.error?.error_subcode;
  const fbType = err?.response?.data?.error?.type;
  // OAuthException with code 190 = expired/invalid token
  // Code 200-299 = permission errors
  return (
    fbType === "OAuthException" ||
    fbCode === 190 ||
    fbSubCode === 463 ||
    fbSubCode === 467 ||
    (typeof fbCode === "number" && fbCode >= 200 && fbCode < 300)
  );
}

async function markAccountExpired(accountId: number): Promise<void> {
  try {
    await db
      .update(facebookAccountsTable)
      .set({ status: "expired" })
      .where(eq(facebookAccountsTable.id, accountId));
    logger.warn({ accountId }, "Facebook account marked as expired due to token failure");
  } catch (err: any) {
    logger.warn({ err: err.message }, "Failed to mark account expired");
  }
}

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
  logger.info({ step: "fb-upload", fbPageId, filePath }, "Pipeline step 8/8: uploading video to Facebook (binary)");

  const form = new FormData();
  form.append("source", fs.createReadStream(filePath));
  form.append("title", title);
  form.append("description", caption);
  form.append("access_token", pageToken);

  try {
    const res = await axios.post(`${FB_API}/${fbPageId}/videos`, form, {
      headers: form.getHeaders(),
      timeout: 300_000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const fbVideoId = res.data?.id ?? "unknown";
    logger.info({ step: "fb-upload", fbPageId, fbVideoId }, "Pipeline step 8/8: Facebook upload succeeded");
    return fbVideoId;
  } catch (err: any) {
    const fbErr = err?.response?.data?.error;
    logger.error(
      { step: "fb-upload", fbPageId, fbCode: fbErr?.code, fbSubcode: fbErr?.error_subcode, fbMessage: fbErr?.message ?? err.message },
      "Pipeline step 8/8 FAILED: Facebook upload rejected",
    );
    throw err;
  }
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
    // /channel/UC... or ?c=UC... style URLs
    const m = identity.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/) ?? identity.match(/[?&]c=(UC[a-zA-Z0-9_-]+)/);
    if (m) {
      channelId = m[1];
    } else {
      // @handle style URL: https://youtube.com/@moviesamazing
      const handleMatch = identity.match(/\/@([^/?&#]+)/);
      if (handleMatch) {
        channelId = await fetchChannelIdFromHandle(handleMatch[1]);
      }
    }
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
  if (!videos.length) {
    // fetchProfileVideos() swallows its own error (so a bad/renamed handle
    // doesn't crash the whole scheduler loop) — re-probe here so we can give
    // an accurate, actionable error instead of a generic "no videos found".
    const probeErr: any = await runYtDlp(
      "profile-list-probe",
      profileUrl,
      ["--flat-playlist", "--playlist-end", "1", "--no-warnings", "--print", "%(id)s"],
      { timeout: 20_000 },
    ).then(() => null).catch((e) => e);

    if (probeErr?.ytDlpKind === "auth_wall" || probeErr?.ytDlpKind === "rate_limited") {
      throw new Error(
        `Instagram is blocking anonymous access for @${handle} (${probeErr.ytDlpKind}). ` +
        `Instagram now requires an authenticated session to list/download videos — set ` +
        `INSTAGRAM_COOKIES_FILE to a cookies.txt exported from a logged-in browser session.`,
      );
    }
    throw new Error(`No Instagram videos found for @${handle}`);
  }

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
  if (!videos.length) {
    throw new Error(`No TikTok videos found for @${handle} (profile may be private, renamed, or empty)`);
  }

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

export async function postPageNextVideo(page: typeof facebookPagesTable.$inferSelect): Promise<void> {
  const [account] = await db
    .select()
    .from(facebookAccountsTable)
    .where(eq(facebookAccountsTable.id, page.accountId));

  if (!account) {
    logger.warn({ pageId: page.id }, "Page automation: account not found");
    await logAutomation(
      "error",
      "automation",
      `Account not found for page "${page.name}"`,
      page.id,
      page.name,
      page.accountId,
    );
    return;
  }

  // Check if account token is already marked expired — skip early but write a
  // visible log entry so the user can see why automation isn't posting.
  if (account.status === "expired") {
    logger.warn({ pageId: page.id, accountId: account.id }, "Page automation: account token expired, skipping");
    await logAutomation(
      "error",
      "automation",
      `Automation paused: Facebook account token expired for page "${page.name}" — please reconnect your Facebook account`,
      page.id,
      page.name,
      account.id,
    );
    return;
  }

  let pageToken: string;
  try {
    pageToken = await getPageAccessToken(page.fbPageId, account.accessToken);
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err.message;
    logger.error({ pageId: page.id, err: msg }, "Page automation: failed to get page token");
    if (isFacebookAuthError(err)) {
      await markAccountExpired(account.id);
      await logAutomation(
        "error",
        "automation",
        `Facebook token expired for page "${page.name}" — please reconnect your account`,
        page.id,
        page.name,
        account.id,
        { fbError: msg },
      );
    }
    throw err;
  }

  let postedVideoId: string;

  // Pipeline steps 1/8 + 2/8: URL/identity input and platform detection.
  // "Schedule creation in DB" (step 6 in the user-facing mental model) does
  // NOT exist as a separate step for page automation — unlike the manual
  // upload flow (scheduled_videos table), automation downloads and posts
  // synchronously within a single scheduler tick. Step 7 ("scheduler
  // execution") is this very function being invoked by runFixedSchedule()/
  // runRandomSchedule() below.
  const source = page.sourceType ?? "youtube";
  logger.info(
    { step: "platform-detect", pageId: page.id, source, identity: page.sourceIdentity },
    "Pipeline steps 1-2/8: URL input + platform detected",
  );

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

  await logAutomation(
    "success",
    "automation",
    `Successfully posted video to "${page.name}" from ${source}`,
    page.id,
    page.name,
    account.id,
    { source, videoId: postedVideoId },
  );

  logger.info({ pageId: page.id, source, postedVideoId }, "Page automation: posted successfully");
}

// ---------------------------------------------------------------------------
// Fixed schedule — runs every 60 s, checks time slots
// ---------------------------------------------------------------------------

const triggeredSlots = new Map<string, string>(); // `${pageId}:${slot}` → HH:MM when last fired

async function runFixedSchedule(): Promise<void> {
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
    if (!page.sourceIdentity?.trim()) {
      logger.warn({ pageId: page.id }, "Page automation (fixed): skipping — no sourceIdentity configured");
      continue;
    }

    const slots: string[] = Array.isArray(page.timeSlots) ? page.timeSlots : [];
    if (!slots.length) {
      logger.warn({ pageId: page.id }, "Page automation (fixed): skipping — no time slots configured");
      continue;
    }

    const timezone = page.timezone || "UTC";
    const dueSlot = slots.find((slot) => timeSlotDue(slot, timezone));
    if (!dueSlot) continue;

    const dedupeKey = `${page.id}:${dueSlot}`;
    const currentDateHHMM = getCurrentDateHHMM(timezone);
    if (triggeredSlots.get(dedupeKey) === currentDateHHMM) continue;
    triggeredSlots.set(dedupeKey, currentDateHHMM);

    logger.info(
      { pageId: page.id, source: page.sourceType, slot: dueSlot, timezone },
      "Page automation (fixed): time slot due, posting",
    );

    postPageNextVideo(page).catch(async (err) => {
      const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
      logger.error({ pageId: page.id, source: page.sourceType, err: msg }, "Page automation (fixed) post failed");

      // Check for auth errors and mark account expired
      if (isFacebookAuthError(err)) {
        const [account] = await db
          .select()
          .from(facebookAccountsTable)
          .where(eq(facebookAccountsTable.id, page.accountId));
        if (account) await markAccountExpired(account.id);
      }

      await logAutomation(
        "error",
        "automation",
        `Failed to post to "${page.name}": ${msg}`,
        page.id,
        page.name,
        page.accountId,
        { source: page.sourceType, slot: dueSlot, error: msg },
      );

      db.update(facebookPagesTable)
        .set({ totalFailed: page.totalFailed + 1 })
        .where(eq(facebookPagesTable.id, page.id))
        .catch(() => {});
    });
  }
}

// ---------------------------------------------------------------------------
// Random schedule — posts evenly spaced throughout the day based on postsPerDay
// ---------------------------------------------------------------------------

// In-memory set to prevent double-triggering the same page within the same polling cycle
const randomInProgress = new Set<number>();

async function runRandomSchedule(): Promise<void> {
  const activePages = await db
    .select()
    .from(facebookPagesTable)
    .where(
      and(
        eq(facebookPagesTable.automationEnabled, true),
        eq(facebookPagesTable.scheduleLogic, "random"),
        eq(facebookPagesTable.status, "active"),
      ),
    );

  if (!activePages.length) return;

  for (const page of activePages) {
    if (!page.sourceIdentity?.trim()) {
      logger.warn({ pageId: page.id }, "Page automation (random): skipping — no sourceIdentity configured");
      continue;
    }

    // Prevent concurrent execution for the same page
    if (randomInProgress.has(page.id)) continue;

    const postsPerDay = page.postsPerDay > 0 ? page.postsPerDay : 1;
    // Minimum interval between posts in hours
    const minIntervalHours = 24 / postsPerDay;
    const hoursElapsed = hoursSinceLastPost(page.lastPostedAt);

    if (hoursElapsed < minIntervalHours) continue;

    logger.info(
      { pageId: page.id, source: page.sourceType, hoursElapsed, minIntervalHours },
      "Page automation (random): interval elapsed, posting",
    );

    randomInProgress.add(page.id);

    postPageNextVideo(page)
      .catch(async (err) => {
        const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
        logger.error({ pageId: page.id, source: page.sourceType, err: msg }, "Page automation (random) post failed");

        if (isFacebookAuthError(err)) {
          const [account] = await db
            .select()
            .from(facebookAccountsTable)
            .where(eq(facebookAccountsTable.id, page.accountId));
          if (account) await markAccountExpired(account.id);
        }

        await logAutomation(
          "error",
          "automation",
          `Failed to post to "${page.name}": ${msg}`,
          page.id,
          page.name,
          page.accountId,
          { source: page.sourceType, scheduleLogic: "random", error: msg },
        );

        db.update(facebookPagesTable)
          .set({ totalFailed: page.totalFailed + 1 })
          .where(eq(facebookPagesTable.id, page.id))
          .catch(() => {});
      })
      .finally(() => {
        randomInProgress.delete(page.id);
      });
  }
}

// ---------------------------------------------------------------------------
// Main scheduler entry point — runs every 60 s
// ---------------------------------------------------------------------------

export async function runPageAutomation(): Promise<void> {
  try {
    await Promise.allSettled([
      runFixedSchedule(),
      runRandomSchedule(),
    ]);
  } catch (err: any) {
    logger.error({ err: err.message }, "Page automation scheduler error");
  }
}
