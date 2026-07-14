import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  db,
  youtubeScheduledVideosTable,
  youtubeChannelsTable,
  youtubeAccountsTable,
  YoutubeScheduledVideoSchema,
} from "@workspace/db";
import { postScheduledVideo } from "../services/youtube-poster";

// Phase 3 — YouTube Scheduler.
// Fully independent of the Facebook `scheduled-videos.ts` route: separate table,
// separate uploads sub-folder, no shared code paths. This route only creates and
// manages schedule entries — it never calls the YouTube Data API. The Phase 4
// upload engine will be the only thing that reads `status = "pending"` rows here
// and actually publishes them.

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "youtube");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // YouTube allows much larger files than Facebook
  fileFilter: (_req, file, cb) => {
    const allowed = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
});

function serialize(v: typeof youtubeScheduledVideosTable.$inferSelect) {
  return {
    id: String(v.id),
    channelId: String(v.channelId),
    title: v.title,
    description: v.description ?? undefined,
    videoType: v.videoType,
    videoUrl: v.videoUrl ?? undefined,
    videoPath: v.videoPath ?? undefined,
    thumbnailUrl: v.thumbnailUrl ?? undefined,
    privacyStatus: v.privacyStatus,
    scheduledAt: v.scheduledAt instanceof Date ? v.scheduledAt.toISOString() : String(v.scheduledAt),
    timezone: v.timezone,
    status: v.status,
    errorMessage: v.errorMessage ?? undefined,
    youtubeVideoId: v.youtubeVideoId ?? undefined,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}

/** Confirm the channel belongs to a YouTube account owned by this user. */
async function assertOwnsChannel(userId: number, channelId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: youtubeChannelsTable.id })
    .from(youtubeChannelsTable)
    .innerJoin(youtubeAccountsTable, eq(youtubeChannelsTable.accountId, youtubeAccountsTable.id))
    .where(and(eq(youtubeChannelsTable.id, channelId), eq(youtubeAccountsTable.userId, userId)));
  return Boolean(row);
}

router.get("/youtube/scheduled-videos", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const videos = await db
    .select()
    .from(youtubeScheduledVideosTable)
    .where(eq(youtubeScheduledVideosTable.userId, userId))
    .orderBy(asc(youtubeScheduledVideosTable.scheduledAt));
  res.json(videos.map(serialize));
});

router.post("/youtube/scheduled-videos", upload.single("video"), async (req, res): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { title, description, channelId, videoType, privacyStatus, scheduledAt, timezone, videoUrl } = req.body;

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const parsedChannelId = parseInt(channelId, 10);
    if (!channelId || isNaN(parsedChannelId)) {
      res.status(400).json({ error: "A YouTube channel must be selected" });
      return;
    }

    if (!(await assertOwnsChannel(userId, parsedChannelId))) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    if (!scheduledAt) {
      res.status(400).json({ error: "Scheduled time is required" });
      return;
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      res.status(400).json({ error: "Invalid scheduled time" });
      return;
    }

    const resolvedVideoType: "short" | "long" = videoType === "short" ? "short" : "long";
    const resolvedPrivacy: "public" | "unlisted" | "private" =
      ["public", "unlisted", "private"].includes(privacyStatus) ? privacyStatus : "public";

    const videoPath = req.file ? `/uploads/youtube/${req.file.filename}` : undefined;
    const finalVideoUrl = videoUrl || undefined;

    if (!videoPath && !finalVideoUrl) {
      res.status(400).json({ error: "Either a video file or a video URL is required" });
      return;
    }

    const [video] = await db
      .insert(youtubeScheduledVideosTable)
      .values({
        userId,
        channelId: parsedChannelId,
        title,
        description: description || null,
        videoType: resolvedVideoType,
        privacyStatus: resolvedPrivacy,
        videoPath,
        videoUrl: finalVideoUrl,
        scheduledAt: scheduledDate,
        timezone: timezone || "UTC",
        status: "pending",
      })
      .returning();

    res.status(201).json(YoutubeScheduledVideoSchema.parse(serialize(video)));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to schedule video" });
  }
});

router.put("/youtube/scheduled-videos/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const userId = req.user!.userId;
  const [existing] = await db
    .select()
    .from(youtubeScheduledVideosTable)
    .where(and(eq(youtubeScheduledVideosTable.id, id), eq(youtubeScheduledVideosTable.userId, userId)));

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (existing.status !== "pending" && existing.status !== "failed") {
    res.status(409).json({ error: "Only pending or failed videos can be edited" });
    return;
  }

  const { title, description, scheduledAt, timezone, privacyStatus } = req.body;
  const updates: Partial<typeof youtubeScheduledVideosTable.$inferInsert> = {};

  if (title !== undefined) updates.title = String(title).trim();
  if (description !== undefined) updates.description = description ? String(description).trim() : null;
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid date" });
      return;
    }
    updates.scheduledAt = d;
  }
  if (timezone) updates.timezone = timezone;
  if (privacyStatus && ["public", "unlisted", "private"].includes(privacyStatus)) {
    updates.privacyStatus = privacyStatus;
  }

  const [updated] = await db
    .update(youtubeScheduledVideosTable)
    .set({ ...updates, status: "pending" })
    .where(and(eq(youtubeScheduledVideosTable.id, id), eq(youtubeScheduledVideosTable.userId, userId)))
    .returning();

  res.json(serialize(updated));
});

// Phase 4 — trigger the upload engine for one video immediately instead of waiting
// for its scheduled time. Only valid for videos not already posted/processing.
router.post("/youtube/scheduled-videos/:id/post-now", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const userId = req.user!.userId;
  const [video] = await db
    .select()
    .from(youtubeScheduledVideosTable)
    .where(and(eq(youtubeScheduledVideosTable.id, id), eq(youtubeScheduledVideosTable.userId, userId)));

  if (!video) {
    res.status(404).json({ error: "Scheduled video not found" });
    return;
  }
  if (video.status === "processing" || video.status === "posted") {
    res.status(409).json({ error: "This video is already processing or posted" });
    return;
  }

  postScheduledVideo(id).catch(() => {
    /* postScheduledVideo already records failures on the row itself */
  });

  res.json({ status: "processing" });
});

router.delete("/youtube/scheduled-videos/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const userId = req.user!.userId;
  const [video] = await db
    .delete(youtubeScheduledVideosTable)
    .where(and(eq(youtubeScheduledVideosTable.id, id), eq(youtubeScheduledVideosTable.userId, userId)))
    .returning();

  if (!video) {
    res.status(404).json({ error: "Scheduled video not found" });
    return;
  }

  if (video.videoPath) {
    const fullPath = path.join(process.cwd(), video.videoPath.replace(/^\//, ""));
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        /* ignore */
      }
    }
  }

  res.sendStatus(204);
});

export default router;
