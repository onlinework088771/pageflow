import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import { db, scheduledVideosTable, facebookPagesTable, facebookAccountsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { generateCaption } from "./page-automation";
import { deleteAfterPublish } from "./cleanup-service";

const execFileAsync = promisify(execFile);
const FB_API = "https://graph.facebook.com/v19.0";
const YT_DLP_PATH = process.env["YT_DLP_PATH"] ?? "yt-dlp";

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url);
}

/**
 * Extract full metadata from a YouTube video using yt-dlp.
 * Returns title, description, and tags for caption generation.
 */
async function getYouTubeMetadata(url: string): Promise<{ title: string; description: string; tags: string[] }> {
  try {
    logger.info({ url }, "Extracting YouTube metadata via yt-dlp");
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
    logger.warn({ url, err: err.message }, "yt-dlp --dump-json failed, skipping metadata");
    return { title: "", description: "", tags: [] };
  }
}

/**
 * Fast path: extract a direct CDN stream URL from YouTube using yt-dlp.
 * This takes ~2-3 seconds vs. downloading the entire file.
 */
async function getYouTubeDirectUrl(url: string): Promise<string> {
  logger.info({ url }, "Extracting YouTube direct URL via yt-dlp");
  const { stdout } = await execFileAsync(
    YT_DLP_PATH,
    [
      "--get-url",
      "--format", "best[ext=mp4][height<=720]/mp4/best[height<=720]/best",
      "--no-playlist",
      url,
    ],
    { timeout: 30_000 },
  );
  const directUrl = stdout.trim().split("\n")[0];
  if (!directUrl) throw new Error("yt-dlp returned no direct URL");
  return directUrl;
}

/**
 * Slow fallback: download the full YouTube video to a temp file.
 * Only used if the direct URL approach fails.
 */
async function downloadYouTubeVideo(url: string, outputPath: string): Promise<void> {
  logger.info({ url, outputPath }, "Downloading YouTube video via yt-dlp (fallback)");
  await execFileAsync(
    YT_DLP_PATH,
    [
      "--format", "best[ext=mp4][height<=720]/mp4/best[height<=720]/best",
      "--merge-output-format", "mp4",
      "--output", outputPath,
      "--no-playlist",
      "--quiet",
      url,
    ],
    { timeout: 180_000 },
  );
}

async function getPageAccessToken(fbPageId: string, userToken: string): Promise<string> {
  const res = await axios.get(`${FB_API}/${fbPageId}`, {
    params: { fields: "access_token", access_token: userToken },
    timeout: 15_000,
  });
  if (!res.data?.access_token) {
    throw new Error(`No page access token returned for page ${fbPageId}`);
  }
  return res.data.access_token;
}

/**
 * Fast upload: pass a URL so Facebook downloads it directly — no server-side download.
 */
async function uploadVideoViaUrl(
  fbPageId: string,
  pageToken: string,
  title: string,
  videoUrl: string,
  description?: string,
): Promise<string> {
  logger.info({ fbPageId, videoUrl: videoUrl.slice(0, 80) }, "Uploading video to Facebook via URL");
  const res = await axios.post(
    `${FB_API}/${fbPageId}/videos`,
    null,
    {
      params: {
        file_url: videoUrl,
        title,
        description: description ?? title,
        access_token: pageToken,
      },
      timeout: 120_000,
    },
  );
  return res.data?.id ?? "unknown";
}

/**
 * Binary upload: used for locally-uploaded files where no URL is available.
 */
async function uploadVideoViaFile(
  fbPageId: string,
  pageToken: string,
  title: string,
  videoFilePath: string,
  description?: string,
): Promise<string> {
  logger.info({ fbPageId, videoFilePath }, "Uploading video to Facebook as binary");
  const form = new FormData();
  form.append("source", fs.createReadStream(videoFilePath));
  form.append("title", title);
  form.append("description", description ?? title);
  form.append("access_token", pageToken);

  const res = await axios.post(`${FB_API}/${fbPageId}/videos`, form, {
    headers: form.getHeaders(),
    timeout: 300_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return res.data?.id ?? "unknown";
}

async function postVideoToPage(
  fbPageId: string,
  pageToken: string,
  title: string,
  opts: { localFilePath?: string; videoUrl?: string; originalUrl?: string; description?: string },
): Promise<string> {
  const { localFilePath, videoUrl, originalUrl, description } = opts;

  // Local file → binary upload (fastest for files already on disk)
  if (localFilePath && fs.existsSync(localFilePath)) {
    return uploadVideoViaFile(fbPageId, pageToken, title, localFilePath, description);
  }

  // YouTube URL → extract metadata + CDN stream URL, pass to Facebook
  if (originalUrl && isYouTubeUrl(originalUrl)) {
    try {
      // Run metadata extraction and URL extraction in parallel
      const [directUrl, metadata] = await Promise.all([
        getYouTubeDirectUrl(originalUrl),
        getYouTubeMetadata(originalUrl),
      ]);

      // Build caption from real metadata if we don't already have one
      const effectiveCaption = description
        || (metadata.title
          ? generateCaption(metadata.title, metadata.description, metadata.tags)
          : title);
      const effectiveTitle = metadata.title || title;

      return await uploadVideoViaUrl(fbPageId, pageToken, effectiveTitle, directUrl, effectiveCaption);
    } catch (err: any) {
      logger.warn({ err: err.message }, "YouTube direct URL failed, falling back to download");
      // Fallback: download the file then binary-upload
      const tmpDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `yt_fallback_${Date.now()}.mp4`);
      try {
        await downloadYouTubeVideo(originalUrl, tmpFile);
        return await uploadVideoViaFile(fbPageId, pageToken, title, tmpFile, description);
      } finally {
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
      }
    }
  }

  // Direct video URL (MP4 CDN link, etc.) → pass to Facebook directly
  if (videoUrl) {
    return uploadVideoViaUrl(fbPageId, pageToken, title, videoUrl, description);
  }

  throw new Error("No video source available (no file, no URL)");
}

export async function executeScheduledPost(videoId: number, _publicBaseUrl?: string): Promise<void> {
  const [video] = await db
    .select()
    .from(scheduledVideosTable)
    .where(eq(scheduledVideosTable.id, videoId));

  if (!video) throw new Error("Scheduled video not found");
  if (video.status === "posted") throw new Error("Already posted");
  if (video.status === "processing") throw new Error("Already processing");

  await db
    .update(scheduledVideosTable)
    .set({ status: "processing" })
    .where(eq(scheduledVideosTable.id, videoId));

  const pageIds = Array.isArray(video.pageIds) ? video.pageIds : [];
  const videoUrl = video.videoUrl ?? undefined;
  const localVideoPath = video.videoPath
    ? path.join(process.cwd(), video.videoPath.replace(/^\//, ""))
    : undefined;

  const localFilePath =
    localVideoPath && fs.existsSync(localVideoPath) ? localVideoPath : undefined;

  // Use stored description if available, otherwise it will be auto-generated for YouTube URLs
  const storedDescription = (video as any).description ?? undefined;

  let postedCount = 0;
  const errors: string[] = [];

  try {
    for (const pageId of pageIds) {
      try {
        const [page] = await db
          .select()
          .from(facebookPagesTable)
          .where(eq(facebookPagesTable.id, parseInt(pageId, 10)));

        if (!page) { errors.push(`Page ${pageId} not found`); continue; }

        const [account] = await db
          .select()
          .from(facebookAccountsTable)
          .where(eq(facebookAccountsTable.id, page.accountId));

        if (!account) { errors.push(`Account for page ${pageId} not found`); continue; }

        const pageToken = await getPageAccessToken(page.fbPageId, account.accessToken);

        await postVideoToPage(page.fbPageId, pageToken, video.title, {
          localFilePath,
          videoUrl,
          originalUrl: videoUrl,
          description: storedDescription,
        });
        postedCount++;

        logger.info({ videoId, pageId, fbPageId: page.fbPageId }, "Posted video to Facebook page");
      } catch (err: any) {
        const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
        errors.push(msg);
        logger.error({ videoId, pageId, err: msg }, "Failed to post video to page");
      }
    }

    const finalStatus = postedCount > 0 ? "posted" : "failed";
    const errorMessage = errors.length ? errors.slice(0, 3).join(" | ") : undefined;

    await db
      .update(scheduledVideosTable)
      .set({ status: finalStatus, postedCount, errorMessage: errorMessage ?? null })
      .where(eq(scheduledVideosTable.id, videoId));

    if (finalStatus === "posted" && video.videoPath) {
      await deleteAfterPublish(video.videoPath);
    }
  } catch (err: any) {
    await db
      .update(scheduledVideosTable)
      .set({ status: "failed", errorMessage: err.message })
      .where(eq(scheduledVideosTable.id, videoId));
    throw err;
  }
}

export async function runScheduler(_publicBaseUrl?: string): Promise<void> {
  try {
    const now = new Date();
    const dueVideos = await db
      .select()
      .from(scheduledVideosTable)
      .where(
        and(
          lte(scheduledVideosTable.scheduledAt, now),
          eq(scheduledVideosTable.status, "pending"),
        ),
      );

    for (const video of dueVideos) {
      logger.info({ videoId: video.id, title: video.title }, "Scheduler: posting due video");
      executeScheduledPost(video.id).catch((err) => {
        logger.error({ videoId: video.id, err: err.message }, "Scheduler: post failed");
      });
    }
  } catch (err: any) {
    logger.error({ err: err.message }, "Scheduler tick error");
  }
}
