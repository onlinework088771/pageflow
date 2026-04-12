import axios from "axios";
import { db, scheduledVideosTable, facebookPagesTable, facebookAccountsTable } from "@workspace/db";
import { eq, and, lte, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

const FB_API = "https://graph.facebook.com/v19.0";

async function getPageAccessToken(fbPageId: string, userToken: string): Promise<string> {
  const res = await axios.get(`${FB_API}/${fbPageId}`, {
    params: { fields: "access_token", access_token: userToken },
  });
  if (!res.data?.access_token) {
    throw new Error(`No page access token returned for page ${fbPageId}`);
  }
  return res.data.access_token;
}

async function postVideoToPage(
  fbPageId: string,
  pageToken: string,
  title: string,
  videoUrl: string,
): Promise<string> {
  const res = await axios.post(
    `${FB_API}/${fbPageId}/videos`,
    null,
    {
      params: {
        file_url: videoUrl,
        title,
        description: title,
        access_token: pageToken,
      },
    },
  );
  return res.data?.id ?? "unknown";
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
  let videoUrl = video.videoUrl ?? undefined;

  if (!videoUrl && video.videoPath && publicBaseUrl) {
    const filename = video.videoPath.replace(/^\/uploads\//, "");
    videoUrl = `${publicBaseUrl}/uploads/${filename}`;
  }

  if (!videoUrl) {
    await db
      .update(scheduledVideosTable)
      .set({ status: "failed", errorMessage: "No accessible video URL. Use a public video URL instead of file upload for auto-posting." })
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
      await postVideoToPage(page.fbPageId, pageToken, video.title, videoUrl);
      postedCount++;

      logger.info({ videoId, pageId, fbPageId: page.fbPageId }, "Posted video to Facebook page");
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err.message ?? "Unknown error";
      errors.push(`Page ${pageId}: ${msg}`);
      logger.error({ videoId, pageId, err: msg }, "Failed to post video to page");
    }
  }

  const finalStatus = postedCount > 0 ? "posted" : "failed";
  const errorMessage = errors.length > 0 ? errors.join("; ") : undefined;

  await db
    .update(scheduledVideosTable)
    .set({ status: finalStatus, postedCount, errorMessage: errorMessage ?? null })
    .where(eq(scheduledVideosTable.id, videoId));
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
