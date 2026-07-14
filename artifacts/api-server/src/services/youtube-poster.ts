import { eq, and, lte } from "drizzle-orm";
import fs from "fs";
import path from "path";
import axios from "axios";
import {
  db,
  youtubeScheduledVideosTable,
  youtubeChannelsTable,
  youtubeAccountsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

// Phase 4 — YouTube Upload Engine.
// Completely independent of Facebook's facebook-poster.ts / page-automation.ts:
// separate table (youtube_scheduled_videos), separate uploads/temp folders, separate
// OAuth provider (Google), no shared imports or code paths with any Facebook file.
//
// Reads rows queued by the Phase 3 scheduler (status = "pending", scheduledAt due)
// and publishes them to YouTube via the Data API v3 resumable upload protocol.

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

function getGoogleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Returns a valid access token for this account, refreshing it first if expired or about to expire. */
export async function getValidAccessToken(account: typeof youtubeAccountsTable.$inferSelect): Promise<string> {
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
  const isExpiring = !expiresAt || expiresAt - Date.now() < 60_000;

  if (!isExpiring) return account.accessToken;

  if (!account.refreshToken) {
    await db.update(youtubeAccountsTable).set({ status: "expired" }).where(eq(youtubeAccountsTable.id, account.id));
    throw new Error("Access token expired and no refresh token is stored; please reconnect this YouTube account");
  }

  const creds = getGoogleCredentials();
  if (!creds) throw new Error("Google OAuth is not configured on the server");

  try {
    const tokenRes = await axios.post(
      GOOGLE_TOKEN_URL,
      new URLSearchParams({
        refresh_token: account.refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "refresh_token",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const { access_token: accessToken, expires_in: expiresIn } = tokenRes.data;
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    await db
      .update(youtubeAccountsTable)
      .set({ accessToken, tokenExpiresAt, status: "connected" })
      .where(eq(youtubeAccountsTable.id, account.id));

    return accessToken;
  } catch (err: any) {
    await db.update(youtubeAccountsTable).set({ status: "expired" }).where(eq(youtubeAccountsTable.id, account.id));
    throw new Error("Failed to refresh Google access token; please reconnect this YouTube account");
  }
}

/** Resolve a scheduled video's source into a local file path, downloading remote URLs to a temp file if needed. */
async function resolveVideoFile(
  video: typeof youtubeScheduledVideosTable.$inferSelect,
): Promise<{ filePath: string; cleanup: () => void }> {
  if (video.videoPath) {
    const fullPath = path.join(process.cwd(), video.videoPath.replace(/^\//, ""));
    if (!fs.existsSync(fullPath)) throw new Error(`Uploaded file missing on disk: ${video.videoPath}`);
    return { filePath: fullPath, cleanup: () => {} };
  }

  if (!video.videoUrl) throw new Error("No video file or URL to upload");

  const tmpDir = path.join(process.cwd(), "uploads", "youtube", "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

  const resp = await axios.get(video.videoUrl, { responseType: "stream", timeout: 30_000 });
  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(tmpFile);
    resp.data.pipe(writer);
    writer.on("finish", () => resolve());
    writer.on("error", reject);
  });

  return {
    filePath: tmpFile,
    cleanup: () => {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Upload a local video file to YouTube via the resumable upload protocol. Returns the new video ID. */
export async function uploadToYoutube(
  accessToken: string,
  filePath: string,
  metadata: { title: string; description: string; privacyStatus: "public" | "unlisted" | "private"; videoType: "short" | "long" },
): Promise<string> {
  const stats = fs.statSync(filePath);

  // Shorts have no separate upload endpoint in the Data API — YouTube classifies a
  // vertical/short video as a Short automatically; the "#Shorts" tag reinforces that intent.
  const description =
    metadata.videoType === "short" && !metadata.description.includes("#Shorts")
      ? `${metadata.description}\n\n#Shorts`.trim()
      : metadata.description;

  const initRes = await axios.post(
    `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
    {
      snippet: { title: metadata.title, description, categoryId: "22" },
      status: { privacyStatus: metadata.privacyStatus, selfDeclaredMadeForKids: false },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/*",
        "X-Upload-Content-Length": String(stats.size),
      },
    },
  );

  const uploadUrl = initRes.headers["location"];
  if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL");

  const fileStream = fs.createReadStream(filePath);
  const uploadRes = await axios.put(uploadUrl, fileStream, {
    headers: {
      "Content-Type": "video/*",
      "Content-Length": String(stats.size),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const videoId = uploadRes.data?.id;
  if (!videoId) throw new Error("YouTube upload did not return a video ID");
  return videoId;
}

/** Process a single scheduled video end-to-end. Also used by the "post now" action. */
export async function postScheduledVideo(id: number): Promise<void> {
  const [video] = await db.select().from(youtubeScheduledVideosTable).where(eq(youtubeScheduledVideosTable.id, id));
  if (!video) return;
  if (video.status === "processing" || video.status === "posted") return;

  await db
    .update(youtubeScheduledVideosTable)
    .set({ status: "processing", errorMessage: null })
    .where(eq(youtubeScheduledVideosTable.id, id));

  let cleanup: (() => void) | null = null;

  try {
    const [channel] = await db.select().from(youtubeChannelsTable).where(eq(youtubeChannelsTable.id, video.channelId));
    if (!channel) throw new Error("Channel no longer exists");

    const [account] = await db.select().from(youtubeAccountsTable).where(eq(youtubeAccountsTable.id, channel.accountId));
    if (!account) throw new Error("YouTube account no longer exists");

    const accessToken = await getValidAccessToken(account);
    const resolved = await resolveVideoFile(video);
    cleanup = resolved.cleanup;

    const youtubeVideoId = await uploadToYoutube(accessToken, resolved.filePath, {
      title: video.title,
      description: video.description ?? "",
      privacyStatus: video.privacyStatus,
      videoType: video.videoType,
    });

    await db
      .update(youtubeScheduledVideosTable)
      .set({ status: "posted", youtubeVideoId, errorMessage: null })
      .where(eq(youtubeScheduledVideosTable.id, id));

    logger.info({ id, youtubeVideoId }, "YouTube upload succeeded");
  } catch (err: any) {
    const message = err?.response?.data?.error?.message || err.message || "Upload failed";

    await db
      .update(youtubeScheduledVideosTable)
      .set({ status: "failed", errorMessage: String(message).slice(0, 500) })
      .where(eq(youtubeScheduledVideosTable.id, id));

    logger.error({ id, err: message }, "YouTube upload failed");
  } finally {
    cleanup?.();
  }
}

/** Scheduler tick — finds all due pending videos and uploads them one at a time. */
export async function runYoutubeScheduler(): Promise<void> {
  const due = await db
    .select()
    .from(youtubeScheduledVideosTable)
    .where(
      and(
        eq(youtubeScheduledVideosTable.status, "pending"),
        lte(youtubeScheduledVideosTable.scheduledAt, new Date()),
      ),
    );

  for (const video of due) {
    await postScheduledVideo(video.id);
  }
}
