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

/**
 * Post an image to a Facebook page via the /photos endpoint.
 */
async function postImageToPage(
  fbPageId: string,
  pageToken: string,
  caption: string,
  opts: { localFilePath?: string; imageUrl?: string },
): Promise<string> {
  const { localFilePath, imageUrl } = opts;

  if (localFilePath && fs.existsSync(localFilePath)) {
    logger.info({ fbPageId, localFilePath }, "Uploading image to Facebook as binary");
    const form = new FormData();
    form.append("source", fs.createReadStream(localFilePath));
    form.append("caption", caption);
    form.append("access_token", pageToken);
    const res = await axios.post(`${FB_API}/${fbPageId}/photos`, form, {
      headers: form.getHeaders(),
      timeout: 120_000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return res.data?.id ?? "unknown";
  }

  if (imageUrl) {
    logger.info({ fbPageId, imageUrl: imageUrl.slice(0, 80) }, "Uploading image to Facebook via URL");
    const res = await axios.post(`${FB_API}/${fbPageId}/photos`, null, {
      params: { url: imageUrl, caption, access_token: pageToken },
      timeout: 60_000,
    });
    return res.data?.id ?? "unknown";
  }

  throw new Error("No image source available (no file, no URL)");
}

/**
 * Post a text-only message to a Facebook page via the /feed endpoint.
 */
async function postTextToPage(
  fbPageId: string,
  pageToken: string,
  message: string,
): Promise<string> {
  logger.info({ fbPageId }, "Posting text to Facebook /feed");
  const res = await axios.post(`${FB_API}/${fbPageId}/feed`, null, {
    params: { message, access_token: pageToken },
    timeout: 30_000,
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

  // YouTube URL → ALWAYS download first then binary-upload.
  // We do NOT use file_url with YouTube because:
  //   1. YouTube CDN URLs returned by yt-dlp are signed and expire within seconds
  //   2. Facebook's servers cannot authenticate with YouTube's CDN
  //   3. file_url with YouTube consistently fails in production
  if (originalUrl && isYouTubeUrl(originalUrl)) {
    logger.info({ originalUrl: originalUrl.slice(0, 80) }, "YouTube URL: fetching metadata + downloading video");

    // Get metadata first (optional enrichment, non-blocking)
    const metadata = await getYouTubeMetadata(originalUrl).catch(() => ({
      title: "", description: "", tags: [] as string[],
    }));

    const effectiveTitle = metadata.title || title;
    const effectiveCaption = description
      || (metadata.title
        ? generateCaption(metadata.title, metadata.description, metadata.tags)
        : title);

    // Download to temp file
    const tmpDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `yt_dl_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

    try {
      await downloadYouTubeVideo(originalUrl, tmpFile);
      if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size === 0) {
        throw new Error("yt-dlp download produced empty file");
      }
      logger.info({ tmpFile, sizeBytes: fs.statSync(tmpFile).size }, "YouTube video downloaded, uploading to Facebook");
      return await uploadVideoViaFile(fbPageId, pageToken, effectiveTitle, tmpFile, effectiveCaption);
    } finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    }
  }

  // Non-YouTube direct video URL (e.g. MP4 CDN link) → pass via URL to Facebook
  if (videoUrl) {
    return uploadVideoViaUrl(fbPageId, pageToken, title, videoUrl, description);
  }

  throw new Error("No video source available (no file, no URL)");
}

/**
 * Post a video as a Facebook Reel using Meta's official 3-step Reels Publishing Graph API.
 * Step 1: Initialize upload session via POST /v19.0/{fbPageId}/video_reels (upload_phase: 'start')
 * Step 2: Binary upload of video file via POST to upload_url (or rupload endpoint)
 * Step 3: Publish Reel via POST /v19.0/{fbPageId}/video_reels (upload_phase: 'finish', video_state: 'PUBLISHED')
 */
async function postReelToPage(
  fbPageId: string,
  pageToken: string,
  title: string,
  opts: { localFilePath?: string; videoUrl?: string; originalUrl?: string; description?: string },
): Promise<string> {
  const { localFilePath, videoUrl, originalUrl, description } = opts;
  let resolvedFilePath = localFilePath;
  let isTempFile = false;

  // If YouTube URL, download via yt-dlp first
  if (!resolvedFilePath && originalUrl && isYouTubeUrl(originalUrl)) {
    const tmpDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    resolvedFilePath = path.join(tmpDir, `yt_reel_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
    isTempFile = true;
    await downloadYouTubeVideo(originalUrl, resolvedFilePath);
    if (!fs.existsSync(resolvedFilePath) || fs.statSync(resolvedFilePath).size === 0) {
      throw new Error("yt-dlp download produced empty file for Reel");
    }
  } else if (!resolvedFilePath && videoUrl) {
    // Remote direct video URL -> download to temp file
    const tmpDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    resolvedFilePath = path.join(tmpDir, `remote_reel_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
    isTempFile = true;
    const response = await axios.get(videoUrl, { responseType: "stream", timeout: 120_000 });
    const writer = fs.createWriteStream(resolvedFilePath);
    await new Promise<void>((resolve, reject) => {
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  }

  if (!resolvedFilePath || !fs.existsSync(resolvedFilePath)) {
    throw new Error("No valid video file available for Reel publishing");
  }

  try {
    const fileStats = fs.statSync(resolvedFilePath);
    const fileSize = fileStats.size;

    logger.info({ fbPageId, fileSize }, "Reel Step 1: Initializing upload session");
    const initRes = await axios.post(
      `${FB_API}/${fbPageId}/video_reels`,
      null,
      {
        params: {
          upload_phase: "start",
          access_token: pageToken,
        },
        timeout: 30_000,
      },
    );

    const videoId = initRes.data?.video_id;
    const uploadUrl = initRes.data?.upload_url || `https://rupload.facebook.com/video-upload/v19.0/${videoId}`;

    if (!videoId) {
      throw new Error(`Failed to initialize Reel: ${JSON.stringify(initRes.data)}`);
    }

    logger.info({ fbPageId, videoId, uploadUrl }, "Reel Step 2: Uploading video binary");
    const fileStream = fs.createReadStream(resolvedFilePath);
    await axios.post(uploadUrl, fileStream, {
      headers: {
        Authorization: `OAuth ${pageToken}`,
        offset: "0",
        file_size: String(fileSize),
        "Content-Type": "application/octet-stream",
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300_000,
    });

    logger.info({ fbPageId, videoId }, "Reel Step 3: Publishing Reel");
    const caption = description || title;
    await axios.post(
      `${FB_API}/${fbPageId}/video_reels`,
      null,
      {
        params: {
          upload_phase: "finish",
          access_token: pageToken,
          video_id: videoId,
          video_state: "PUBLISHED",
          description: caption,
          title: title || undefined,
        },
        timeout: 60_000,
      },
    );

    logger.info({ fbPageId, videoId }, "Reel published successfully");
    return videoId;
  } finally {
    if (isTempFile && resolvedFilePath) {
      try { if (fs.existsSync(resolvedFilePath)) fs.unlinkSync(resolvedFilePath); } catch {}
    }
  }
}

/**
 * Invite a collaborator Facebook Page to a published Reel using Meta Graph API.
 * Endpoint: POST /v19.0/{reelVideoId} with collaborator_page_id & access_token.
 * Isolated execution: Returns structured status object, never throws unhandled errors.
 */
async function inviteReelCollaborator(
  reelVideoId: string,
  hostPageToken: string,
  collaboratorFbPageId: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    logger.info({ reelVideoId, collaboratorFbPageId }, "Sending Reel collaboration invitation");
    const res = await axios.post(
      `${FB_API}/${reelVideoId}`,
      null,
      {
        params: {
          collaborator_page_id: collaboratorFbPageId,
          access_token: hostPageToken,
        },
        timeout: 30_000,
      },
    );
    logger.info({ reelVideoId, collaboratorFbPageId, result: res.data }, "Reel collaboration invitation successful");
    return { success: true, data: res.data };
  } catch (err: any) {
    const errorMsg = err?.response?.data?.error?.message ?? err.message ?? "Failed to invite collaborator";
    logger.warn(
      {
        reelVideoId,
        collaboratorFbPageId,
        err: errorMsg,
        fbData: err?.response?.data,
      },
      "Reel collaboration invite returned error (non-fatal to publication)",
    );
    return { success: false, error: errorMsg };
  }
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
  const mediaUrl = video.videoUrl ?? undefined;
  const localMediaPath = video.videoPath
    ? path.join(process.cwd(), video.videoPath.replace(/^\//, ""))
    : undefined;

  const localFilePath =
    localMediaPath && fs.existsSync(localMediaPath) ? localMediaPath : undefined;

  const storedDescription = video.description ?? undefined;
  const postType = video.postType ?? "video";
  const publishMode = video.publishMode ?? (postType === "reel" ? "reel" : "video");
  const isReel = publishMode === "reel";

  let postedCount = 0;
  let primaryReelId: string | null = null;
  const publishedReelIds: Record<string, string> = { ...(video.publishedReelIds || {}) };
  const collaborationResults: Record<string, { success: boolean; hostPageId: string; collaboratorPageId: string; error?: string }> = {
    ...(video.collaborationResults || {}),
  };
  const errors: string[] = [];
  const collabErrors: string[] = [];

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
        const caption = storedDescription || video.title;

        if (postType === "text") {
          // Text post — no file needed
          await postTextToPage(page.fbPageId, pageToken, caption);
        } else if (postType === "image") {
          // Image post → /photos endpoint
          await postImageToPage(page.fbPageId, pageToken, caption, {
            localFilePath,
            imageUrl: mediaUrl,
          });
        } else if (isReel) {
          // Dedicated Reel flow using Meta /video_reels endpoint
          const publishedId = await postReelToPage(page.fbPageId, pageToken, video.title, {
            localFilePath,
            videoUrl: mediaUrl,
            originalUrl: mediaUrl,
            description: storedDescription,
          });
          if (publishedId && publishedId !== "unknown") {
            primaryReelId = publishedId;
            publishedReelIds[pageId] = publishedId;

            // Optional Collaboration - Runs strictly AFTER Reel is published and ID is secured
            if (video.collaborationEnabled && Array.isArray(video.collaboratorPageIds) && video.collaboratorPageIds.length > 0) {
              for (const collabPageId of video.collaboratorPageIds) {
                if (String(collabPageId) === String(pageId)) continue; // Skip self

                try {
                  const [collabPage] = await db
                    .select()
                    .from(facebookPagesTable)
                    .where(eq(facebookPagesTable.id, parseInt(collabPageId, 10)));

                  if (collabPage && collabPage.fbPageId) {
                    const collabRes = await inviteReelCollaborator(publishedId, pageToken, collabPage.fbPageId);
                    collaborationResults[`${pageId}_${collabPageId}`] = {
                      success: collabRes.success,
                      hostPageId: pageId,
                      collaboratorPageId: collabPageId,
                      error: collabRes.error,
                    };
                    if (!collabRes.success && collabRes.error) {
                      collabErrors.push(`Collab ${collabPage.name || collabPageId}: ${collabRes.error}`);
                    }
                  }
                } catch (collabErr: any) {
                  logger.warn({ videoId, pageId, collabPageId, err: collabErr.message }, "Unexpected error in collaboration attempt");
                }
              }
            }
          }
        } else {
          // Standard video flow using /videos endpoint (UNTOUCHED)
          await postVideoToPage(page.fbPageId, pageToken, video.title, {
            localFilePath,
            videoUrl: mediaUrl,
            originalUrl: mediaUrl,
            description: storedDescription,
          });
        }

        postedCount++;
        logger.info({ videoId, pageId, fbPageId: page.fbPageId, postType, publishMode }, "Posted to Facebook page");
      } catch (err: any) {
        const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
        errors.push(msg);
        logger.error(
          {
            videoId,
            pageId,
            postType,
            publishMode,
            err: msg,
            fbHttpStatus: err?.response?.status,
            fbErrorCode: err?.response?.data?.error?.code,
            fbErrorSubcode: err?.response?.data?.error?.error_subcode,
            fbErrorType: err?.response?.data?.error?.type,
            fbTraceId: err?.response?.data?.error?.fbtrace_id,
            fbRawResponse: err?.response?.data,
          },
          "Failed to post to page",
        );
      }
    }

    const finalStatus = postedCount > 0 ? "posted" : "failed";
    const errorMessage = errors.length ? errors.slice(0, 3).join(" | ") : undefined;

    let computedCollabStatus: string | null = null;
    if (video.collaborationEnabled && Array.isArray(video.collaboratorPageIds) && video.collaboratorPageIds.length > 0) {
      const results = Object.values(collaborationResults);
      if (results.length > 0) {
        const successes = results.filter((r) => r.success).length;
        if (successes === results.length) {
          computedCollabStatus = "invited";
        } else if (successes > 0) {
          computedCollabStatus = "partial";
        } else {
          computedCollabStatus = "failed";
        }
      } else {
        computedCollabStatus = "skipped";
      }
    }

    await db
      .update(scheduledVideosTable)
      .set({
        status: finalStatus,
        postedCount,
        errorMessage: errorMessage ?? null,
        ...(primaryReelId ? { reelId: primaryReelId, publishedReelIds } : {}),
        ...(video.collaborationEnabled
          ? {
              collaborationStatus: computedCollabStatus,
              collaborationResults,
              collaborationError: collabErrors.length ? collabErrors.join(" | ") : null,
            }
          : {}),
      })
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
