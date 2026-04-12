import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import { db, scheduledVideosTable, facebookPagesTable, facebookAccountsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { logger } from "../lib/logger";

const execFileAsync = promisify(execFile);
const FB_API = "https://graph.facebook.com/v19.0";
const YT_DLP_PATH = process.env["YT_DLP_PATH"] ?? "yt-dlp";

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url);
}

async function downloadYouTubeVideo(url: string, outputPath: string): Promise<void> {
  logger.info({ url, outputPath }, "Downloading YouTube video via yt-dlp");
  await execFileAsync(YT_DLP_PATH, [
    "--format", "mp4/bestvideo+bestaudio/best",
    "--merge-output-format", "mp4",
    "--output", outputPath,
    "--no-playlist",
    "--quiet",
    url,
  ], { timeout: 120_000 });
}

async function downloadDirectVideo(url: string, outputPath: string): Promise<void> {
  logger.info({ url }, "Downloading direct video URL");
  const response = await axios.get(url, {
    responseType: "stream",
    timeout: 60_000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
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

async function uploadVideoToFacebook(
  fbPageId: string,
  pageToken: string,
  title: string,
  videoFilePath: string,
): Promise<string> {
  const form = new FormData();
  form.append("source", fs.createReadStream(videoFilePath));
  form.append("title", title);
  form.append("description", title);
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
  videoFilePath: string,
): Promise<string> {
  return uploadVideoToFacebook(fbPageId, pageToken, title, videoFilePath);
}

export async function executeScheduledPost(videoId: number, publicBaseUrl?: string): Promise<void> {
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

  let tempFilePath: string | undefined;
  let localFilePath: string | undefined;

  try {
    if (localVideoPath && fs.existsSync(localVideoPath)) {
      localFilePath = localVideoPath;
    } else if (videoUrl) {
      const tmpDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      tempFilePath = path.join(tmpDir, `tmp_${videoId}_${Date.now()}.mp4`);

      if (isYouTubeUrl(videoUrl)) {
        await downloadYouTubeVideo(videoUrl, tempFilePath);
      } else {
        await downloadDirectVideo(videoUrl, tempFilePath);
      }
      localFilePath = tempFilePath;
    }

    if (!localFilePath || !fs.existsSync(localFilePath)) {
      await db
        .update(scheduledVideosTable)
        .set({
          status: "failed",
          errorMessage: "No video file available. Please upload a file or provide a direct MP4 URL.",
        })
        .where(eq(scheduledVideosTable.id, videoId));
      return;
    }

    let postedCount = 0;
    const errors: string[] = [];

    for (const pageId of pageIds) {
      try {
        const [page] = await db
          .select()
          .from(facebookPagesTable)
          .where(eq(facebookPagesTable.id, parseInt(pageId, 10)));

        if (!page) {
          errors.push(`Page ${pageId} not found`);
          continue;
        }

        const [account] = await db
          .select()
          .from(facebookAccountsTable)
          .where(eq(facebookAccountsTable.id, page.accountId));

        if (!account) {
          errors.push(`Account for page ${pageId} not found`);
          continue;
        }

        const pageToken = await getPageAccessToken(page.fbPageId, account.accessToken);
        await postVideoToPage(page.fbPageId, pageToken, video.title, localFilePath);
        postedCount++;

        logger.info({ videoId, pageId, fbPageId: page.fbPageId }, "Posted video to Facebook page");
      } catch (err: any) {
        const msg =
          err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
        errors.push(`${msg}`);
        logger.error({ videoId, pageId, err: msg }, "Failed to post video to page");
      }
    }

    const finalStatus = postedCount > 0 ? "posted" : "failed";
    const errorMessage = errors.length > 0 ? errors.slice(0, 3).join(" | ") : undefined;

    await db
      .update(scheduledVideosTable)
      .set({ status: finalStatus, postedCount, errorMessage: errorMessage ?? null })
      .where(eq(scheduledVideosTable.id, videoId));
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
}

export async function runScheduler(publicBaseUrl?: string): Promise<void> {
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
      executeScheduledPost(video.id, publicBaseUrl).catch((err) => {
        logger.error({ videoId: video.id, err: err.message }, "Scheduler: post failed");
      });
    }
  } catch (err: any) {
    logger.error({ err: err.message }, "Scheduler tick error");
  }
}
