/**
 * YouTube Automation Service
 *
 * Mirrors page-automation.ts but uploads content TO YouTube channels
 * instead of to Facebook pages.
 *
 * Sources supported: youtube (RSS+yt-dlp), instagram (yt-dlp), tiktok (yt-dlp)
 * Destination: YouTube Data API v3 (resumable upload)
 *
 * Runs every 60s via index.ts setInterval.
 */

import axios from "axios";
import fs from "fs";
import { db, youtubeAccountsTable, youtubeChannelsTable, automationLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  fetchChannelIdFromHandle,
  fetchYouTubeRssVideos,
  fetchProfileVideos,
  getVideoMetadata,
  downloadVideoToTempFile,
  generateCaption,
  getCurrentHHMM,
  timeSlotDue,
  hoursSinceLastPost,
} from "./page-automation";

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"] ?? "";
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"] ?? "";

// ---------------------------------------------------------------------------
// Automation log helper
// ---------------------------------------------------------------------------

async function logYouTubeAutomation(
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
    logger.warn({ err: err.message }, "Failed to write YouTube automation log");
  }
}

// ---------------------------------------------------------------------------
// Token management — refresh Google OAuth token when expired
// ---------------------------------------------------------------------------

async function getValidAccessToken(
  account: typeof youtubeAccountsTable.$inferSelect,
): Promise<string> {
  // Still valid (5 min buffer)
  if (
    account.tokenExpiry &&
    new Date(account.tokenExpiry).getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return account.accessToken;
  }

  // Refresh the token
  logger.info({ accountId: account.id }, "youtube-automation: refreshing access token");

  const res = await axios.post(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: account.refreshToken,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15_000,
    },
  );

  const { access_token, expires_in } = res.data;
  if (!access_token) throw new Error("Token refresh returned no access_token");

  const tokenExpiry = new Date(Date.now() + (expires_in ?? 3600) * 1000);

  await db
    .update(youtubeAccountsTable)
    .set({ accessToken: access_token, tokenExpiry, status: "connected" })
    .where(eq(youtubeAccountsTable.id, account.id));

  return access_token;
}

function isGoogleAuthError(err: any): boolean {
  const status = err?.response?.status;
  const reason = err?.response?.data?.error;
  return (
    status === 401 ||
    status === 403 ||
    reason === "invalid_grant" ||
    reason === "unauthorized_client"
  );
}

async function markAccountExpired(accountId: number): Promise<void> {
  try {
    await db
      .update(youtubeAccountsTable)
      .set({ status: "expired" })
      .where(eq(youtubeAccountsTable.id, accountId));
    logger.warn({ accountId }, "YouTube account marked as expired");
  } catch {}
}

// ---------------------------------------------------------------------------
// YouTube upload via Data API v3 (resumable upload)
// ---------------------------------------------------------------------------

async function uploadVideoToYouTube(
  channelYtId: string,
  accessToken: string,
  title: string,
  description: string,
  tags: string[],
  filePath: string,
): Promise<string> {
  const fileSize = fs.statSync(filePath).size;
  const mimeType = "video/mp4";

  logger.info(
    { channelYtId, filePath, sizeBytes: fileSize },
    "youtube-automation: starting YouTube resumable upload",
  );

  // Step 1 — initiate resumable upload session
  const initRes = await axios.post(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      snippet: {
        title: title.slice(0, 100),
        description: description.slice(0, 5000),
        tags: tags.slice(0, 500),
        categoryId: "22", // People & Blogs
        defaultLanguage: "en",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": fileSize,
      },
      timeout: 30_000,
    },
  );

  const uploadUrl = initRes.headers["location"];
  if (!uploadUrl) throw new Error("YouTube did not return an upload URL");

  // Step 2 — upload video binary
  const fileStream = fs.createReadStream(filePath);

  const uploadRes = await axios.put(uploadUrl, fileStream, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": fileSize,
    },
    timeout: 600_000, // 10 min for large videos
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const videoId = uploadRes.data?.id ?? "unknown";
  logger.info({ channelYtId, videoId }, "youtube-automation: video uploaded to YouTube");
  return videoId;
}

// ---------------------------------------------------------------------------
// Per-source: get next video to upload
// ---------------------------------------------------------------------------

async function getNextYouTubeSourceVideo(
  channel: typeof youtubeChannelsTable.$inferSelect,
): Promise<{ videoId: string; url: string; title: string; description: string; tags: string[] }> {
  const identity = channel.sourceIdentity!;

  // Resolve channel ID from handle if needed
  let channelId: string | null = null;
  if (identity.startsWith("http")) {
    const m = identity.match(/channel\/([^/?&]+)/) ?? identity.match(/\?.*c=([^&]+)/);
    channelId = m?.[1] ?? null;
  } else {
    channelId = await fetchChannelIdFromHandle(identity);
  }
  if (!channelId) throw new Error(`Could not resolve YouTube channel from "${identity}"`);

  const videos = await fetchYouTubeRssVideos(channelId);
  if (!videos.length) throw new Error("No videos found on YouTube source channel");

  const lastPostedId = channel.lastPostedVideoId;
  let nextVideo = videos[0];
  if (lastPostedId) {
    const lastIdx = videos.findIndex((v) => v.videoId === lastPostedId);
    if (lastIdx > 0) {
      nextVideo = videos[lastIdx - 1];
    } else if (lastIdx === 0) {
      nextVideo = videos[videos.length - 1];
    }
  }

  const ytUrl = `https://www.youtube.com/watch?v=${nextVideo.videoId}`;
  let meta = { title: nextVideo.title, description: nextVideo.description, tags: [] as string[] };
  try {
    const m = await getVideoMetadata(ytUrl);
    if (m.title) meta = { ...meta, ...m };
  } catch {}

  return {
    videoId: nextVideo.videoId,
    url: ytUrl,
    title: meta.title || nextVideo.title,
    description: meta.description,
    tags: meta.tags,
  };
}

async function getNextInstagramSourceVideo(
  channel: typeof youtubeChannelsTable.$inferSelect,
): Promise<{ videoId: string; url: string; title: string; description: string; tags: string[] }> {
  const handle = channel.sourceIdentity!.replace(/^@/, "");
  const profileUrl = `https://www.instagram.com/@${handle}/`;

  const videos = await fetchProfileVideos(profileUrl, 20);
  if (!videos.length) throw new Error(`No Instagram videos found for @${handle}`);

  const lastPostedId = channel.lastPostedVideoId;
  let nextVideo = videos[0];
  if (lastPostedId) {
    const lastIdx = videos.findIndex((v) => v.videoId === lastPostedId);
    if (lastIdx > 0) nextVideo = videos[lastIdx - 1];
    else if (lastIdx === 0) nextVideo = videos[videos.length - 1];
  }

  const url = nextVideo.url || `https://www.instagram.com/reel/${nextVideo.videoId}/`;
  const meta = await getVideoMetadata(url).catch(() => ({
    title: nextVideo.title || handle,
    description: "",
    tags: [] as string[],
  }));

  return {
    videoId: nextVideo.videoId,
    url,
    title: meta.title || nextVideo.title || handle,
    description: meta.description,
    tags: meta.tags,
  };
}

async function getNextTikTokSourceVideo(
  channel: typeof youtubeChannelsTable.$inferSelect,
): Promise<{ videoId: string; url: string; title: string; description: string; tags: string[] }> {
  const handle = channel.sourceIdentity!.replace(/^@/, "");
  const profileUrl = `https://www.tiktok.com/@${handle}`;

  const videos = await fetchProfileVideos(profileUrl, 20);
  if (!videos.length) throw new Error(`No TikTok videos found for @${handle}`);

  const lastPostedId = channel.lastPostedVideoId;
  let nextVideo = videos[0];
  if (lastPostedId) {
    const lastIdx = videos.findIndex((v) => v.videoId === lastPostedId);
    if (lastIdx > 0) nextVideo = videos[lastIdx - 1];
    else if (lastIdx === 0) nextVideo = videos[videos.length - 1];
  }

  const url = nextVideo.url || `https://www.tiktok.com/@${handle}/video/${nextVideo.videoId}`;
  const meta = await getVideoMetadata(url).catch(() => ({
    title: nextVideo.title || handle,
    description: "",
    tags: [] as string[],
  }));

  return {
    videoId: nextVideo.videoId,
    url,
    title: meta.title || nextVideo.title || handle,
    description: meta.description,
    tags: meta.tags,
  };
}

async function getNextFacebookSourceVideo(
  channel: typeof youtubeChannelsTable.$inferSelect,
): Promise<{ videoId: string; url: string; title: string; description: string; tags: string[] }> {
  // sourceIdentity is the Facebook page URL or page ID
  const identity = channel.sourceIdentity!.trim();

  // Build the videos playlist URL for yt-dlp
  // Works for: https://www.facebook.com/profile.php?id=XXXXX
  //            https://www.facebook.com/pagename
  //            numeric page ID (build URL from it)
  let profileUrl: string;
  if (identity.startsWith("http")) {
    // Append /videos if not already present
    profileUrl = identity.replace(/\/$/, "") + "/videos";
  } else {
    profileUrl = `https://www.facebook.com/${identity}/videos`;
  }

  const videos = await fetchProfileVideos(profileUrl, 20);
  if (!videos.length) throw new Error(`No Facebook videos found for: ${identity}`);

  const lastPostedId = channel.lastPostedVideoId;
  let nextVideo = videos[0];
  if (lastPostedId) {
    const lastIdx = videos.findIndex((v) => v.videoId === lastPostedId);
    if (lastIdx > 0) nextVideo = videos[lastIdx - 1];
    else if (lastIdx === 0) nextVideo = videos[videos.length - 1];
  }

  const url = nextVideo.url || `https://www.facebook.com/watch/?v=${nextVideo.videoId}`;
  const meta = await getVideoMetadata(url).catch(() => ({
    title: nextVideo.title || "Facebook Video",
    description: "",
    tags: [] as string[],
  }));

  return {
    videoId: nextVideo.videoId,
    url,
    title: meta.title || nextVideo.title || "Facebook Video",
    description: meta.description,
    tags: meta.tags,
  };
}

// ---------------------------------------------------------------------------
// Main per-channel posting orchestrator
// ---------------------------------------------------------------------------

async function postChannelNextVideo(
  channel: typeof youtubeChannelsTable.$inferSelect,
): Promise<void> {
  const [account] = await db
    .select()
    .from(youtubeAccountsTable)
    .where(eq(youtubeAccountsTable.id, channel.accountId));

  if (!account) {
    logger.warn({ channelId: channel.id }, "youtube-automation: account not found");
    await logYouTubeAutomation(
      "error",
      "youtube-automation",
      `Account not found for channel "${channel.name}"`,
      channel.id,
      channel.name,
    );
    return;
  }

  if (account.status === "expired") {
    logger.warn({ channelId: channel.id }, "youtube-automation: account expired, skipping");
    return;
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(account);
  } catch (err: any) {
    logger.error(
      { channelId: channel.id, err: err.message },
      "youtube-automation: token refresh failed",
    );
    if (isGoogleAuthError(err)) await markAccountExpired(account.id);
    await logYouTubeAutomation(
      "error",
      "youtube-automation",
      `Token refresh failed for "${channel.name}" — please reconnect your YouTube account`,
      channel.id,
      channel.name,
      account.id,
    );
    throw err;
  }

  const source = channel.sourceType ?? "youtube";
  logger.info(
    { channelId: channel.id, source, identity: channel.sourceIdentity },
    "youtube-automation: posting next video",
  );

  // Get next video metadata from source
  let nextVideoInfo: { videoId: string; url: string; title: string; description: string; tags: string[] };

  if (source === "youtube") {
    nextVideoInfo = await getNextYouTubeSourceVideo(channel);
  } else if (source === "instagram") {
    nextVideoInfo = await getNextInstagramSourceVideo(channel);
  } else if (source === "tiktok") {
    nextVideoInfo = await getNextTikTokSourceVideo(channel);
  } else if (source === "facebook") {
    nextVideoInfo = await getNextFacebookSourceVideo(channel);
  } else {
    throw new Error(`Unknown source type: ${source}`);
  }

  const caption = generateCaption(nextVideoInfo.title, nextVideoInfo.description, nextVideoInfo.tags);

  // Download video to temp file
  const label = `yt_auto_${source}`;
  const tmpFile = await downloadVideoToTempFile(nextVideoInfo.url, label);

  try {
    await uploadVideoToYouTube(
      channel.channelId,
      accessToken,
      nextVideoInfo.title,
      caption,
      nextVideoInfo.tags.slice(0, 30),
      tmpFile,
    );
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  }

  // Update channel stats
  await db
    .update(youtubeChannelsTable)
    .set({
      lastPostedVideoId: nextVideoInfo.videoId,
      lastPostedAt: new Date(),
      totalPosted: channel.totalPosted + 1,
    })
    .where(eq(youtubeChannelsTable.id, channel.id));

  await logYouTubeAutomation(
    "success",
    "youtube-automation",
    `Successfully uploaded video to YouTube channel "${channel.name}" from ${source}`,
    channel.id,
    channel.name,
    account.id,
    { source, videoId: nextVideoInfo.videoId },
  );

  logger.info(
    { channelId: channel.id, source, videoId: nextVideoInfo.videoId },
    "youtube-automation: posted successfully",
  );
}

// ---------------------------------------------------------------------------
// Fixed schedule — same time-slot pattern as page-automation
// ---------------------------------------------------------------------------

const triggeredSlots = new Map<string, string>(); // `${channelDbId}:${slot}` → HH:MM fired

async function runYouTubeFixedSchedule(): Promise<void> {
  const activeChannels = await db
    .select()
    .from(youtubeChannelsTable)
    .where(
      and(
        eq(youtubeChannelsTable.automationEnabled, true),
        eq(youtubeChannelsTable.scheduleLogic, "fixed"),
        eq(youtubeChannelsTable.status, "active"),
      ),
    );

  if (!activeChannels.length) return;

  for (const channel of activeChannels) {
    if (!channel.sourceIdentity?.trim()) {
      logger.warn(
        { channelId: channel.id },
        "youtube-automation (fixed): skipping — no sourceIdentity configured",
      );
      continue;
    }

    const slots: string[] = Array.isArray(channel.timeSlots) ? channel.timeSlots : [];
    if (!slots.length) {
      logger.warn(
        { channelId: channel.id },
        "youtube-automation (fixed): skipping — no time slots configured",
      );
      continue;
    }

    const timezone = channel.timezone || "UTC";
    const dueSlot = slots.find((slot) => timeSlotDue(slot, timezone));
    if (!dueSlot) continue;

    const dedupeKey = `${channel.id}:${dueSlot}`;
    const currentHHMM = getCurrentHHMM(timezone);
    if (triggeredSlots.get(dedupeKey) === currentHHMM) continue;
    triggeredSlots.set(dedupeKey, currentHHMM);

    logger.info(
      { channelId: channel.id, source: channel.sourceType, slot: dueSlot, timezone },
      "youtube-automation (fixed): time slot due, posting",
    );

    postChannelNextVideo(channel).catch(async (err) => {
      const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
      logger.error(
        { channelId: channel.id, err: msg },
        "youtube-automation (fixed): post failed",
      );

      if (isGoogleAuthError(err)) await markAccountExpired(channel.accountId);

      await logYouTubeAutomation(
        "error",
        "youtube-automation",
        `Failed to upload to "${channel.name}": ${msg}`,
        channel.id,
        channel.name,
        channel.accountId,
        { source: channel.sourceType, slot: dueSlot, error: msg },
      );

      db.update(youtubeChannelsTable)
        .set({ totalFailed: channel.totalFailed + 1 })
        .where(eq(youtubeChannelsTable.id, channel.id))
        .catch(() => {});
    });
  }
}

// ---------------------------------------------------------------------------
// Random schedule — interval-based, same pattern as page-automation
// ---------------------------------------------------------------------------

const randomInProgress = new Set<number>();

async function runYouTubeRandomSchedule(): Promise<void> {
  const activeChannels = await db
    .select()
    .from(youtubeChannelsTable)
    .where(
      and(
        eq(youtubeChannelsTable.automationEnabled, true),
        eq(youtubeChannelsTable.scheduleLogic, "random"),
        eq(youtubeChannelsTable.status, "active"),
      ),
    );

  if (!activeChannels.length) return;

  for (const channel of activeChannels) {
    if (!channel.sourceIdentity?.trim()) continue;
    if (randomInProgress.has(channel.id)) continue;

    const postsPerDay = channel.postsPerDay > 0 ? channel.postsPerDay : 1;
    const minIntervalHours = 24 / postsPerDay;
    const hoursElapsed = hoursSinceLastPost(channel.lastPostedAt);

    if (hoursElapsed < minIntervalHours) continue;

    logger.info(
      { channelId: channel.id, source: channel.sourceType, hoursElapsed, minIntervalHours },
      "youtube-automation (random): interval elapsed, posting",
    );

    randomInProgress.add(channel.id);

    postChannelNextVideo(channel)
      .catch(async (err) => {
        const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
        logger.error({ channelId: channel.id, err: msg }, "youtube-automation (random): post failed");

        if (isGoogleAuthError(err)) await markAccountExpired(channel.accountId);

        await logYouTubeAutomation(
          "error",
          "youtube-automation",
          `Failed to upload to "${channel.name}": ${msg}`,
          channel.id,
          channel.name,
          channel.accountId,
          { source: channel.sourceType, scheduleLogic: "random", error: msg },
        );

        db.update(youtubeChannelsTable)
          .set({ totalFailed: channel.totalFailed + 1 })
          .where(eq(youtubeChannelsTable.id, channel.id))
          .catch(() => {});
      })
      .finally(() => {
        randomInProgress.delete(channel.id);
      });
  }
}

// ---------------------------------------------------------------------------
// Main entry point — runs every 60s
// ---------------------------------------------------------------------------

export async function runYouTubeAutomation(): Promise<void> {
  try {
    await Promise.allSettled([
      runYouTubeFixedSchedule(),
      runYouTubeRandomSchedule(),
    ]);
  } catch (err: any) {
    logger.error({ err: err.message }, "YouTube automation scheduler error");
  }
}
