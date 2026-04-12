import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, scheduledVideosTable } from "@workspace/db";
import { ScheduledVideoSchema } from "@workspace/db";
import { executeScheduledPost } from "../services/facebook-poster";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads");
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
  limits: { fileSize: 500 * 1024 * 1024 },
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

function serializeVideo(v: typeof scheduledVideosTable.$inferSelect) {
  return {
    id: String(v.id),
    title: v.title,
    description: v.description ?? undefined,
    videoUrl: v.videoUrl ?? undefined,
    videoPath: v.videoPath ?? undefined,
    thumbnailUrl: v.thumbnailUrl ?? undefined,
    pageIds: Array.isArray(v.pageIds) ? v.pageIds : [],
    scheduledAt: v.scheduledAt instanceof Date ? v.scheduledAt.toISOString() : String(v.scheduledAt),
    timezone: v.timezone,
    status: v.status,
    errorMessage: v.errorMessage ?? undefined,
    postedCount: v.postedCount,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}

router.get("/scheduled-videos", async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const videos = await db
    .select()
    .from(scheduledVideosTable)
    .where(eq(scheduledVideosTable.userId, userId))
    .orderBy(asc(scheduledVideosTable.scheduledAt));
  res.json(videos.map(serializeVideo));
});

router.post("/scheduled-videos", upload.single("video"), async (req, res): Promise<void> => {
  try {
    const { title, description, pageIds, scheduledAt, timezone, videoUrl } = req.body;

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    let parsedPageIds: string[] = [];
    try {
      parsedPageIds = typeof pageIds === "string" ? JSON.parse(pageIds) : (pageIds ?? []);
    } catch {
      parsedPageIds = [];
    }

    if (!parsedPageIds.length) {
      res.status(400).json({ error: "At least one page must be selected" });
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

    const videoPath = req.file ? `/uploads/${req.file.filename}` : undefined;
    const finalVideoUrl = videoUrl || undefined;

    if (!videoPath && !finalVideoUrl) {
      res.status(400).json({ error: "Either a video file or URL is required" });
      return;
    }

    const userId = req.user!.userId;
    const [video] = await db
      .insert(scheduledVideosTable)
      .values({
        userId,
        title,
        description: description || null,
        pageIds: parsedPageIds,
        scheduledAt: scheduledDate,
        timezone: timezone || "UTC",
        videoPath,
        videoUrl: finalVideoUrl,
        status: "pending",
      })
      .returning();

    res.status(201).json(ScheduledVideoSchema.parse(serializeVideo(video)));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to schedule video" });
  }
});

router.post("/scheduled-videos/:id/post-now", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [video] = await db
    .select()
    .from(scheduledVideosTable)
    .where(eq(scheduledVideosTable.id, id));

  if (!video) {
    res.status(404).json({ error: "Scheduled video not found" });
    return;
  }

  if (video.status === "processing") {
    res.status(409).json({ error: "Already processing" });
    return;
  }

  if (video.status === "posted") {
    res.status(409).json({ error: "Already posted" });
    return;
  }

  const domain = process.env["REPLIT_DEV_DOMAIN"] ?? process.env["REPL_SLUG"];
  const publicBaseUrl = domain ? `https://${domain}` : undefined;

  executeScheduledPost(id, publicBaseUrl).catch((err) => {
    console.error("Post-now error:", err.message);
  });

  res.json({ message: "Posting started", id: String(id) });
});

router.get("/scheduled-videos/:id/status", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [video] = await db
    .select()
    .from(scheduledVideosTable)
    .where(eq(scheduledVideosTable.id, id));

  if (!video) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(serializeVideo(video));
});

router.delete("/scheduled-videos/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [video] = await db
    .delete(scheduledVideosTable)
    .where(eq(scheduledVideosTable.id, id))
    .returning();

  if (!video) {
    res.status(404).json({ error: "Scheduled video not found" });
    return;
  }

  if (video.videoPath) {
    const fullPath = path.join(process.cwd(), video.videoPath.replace(/^\//, ""));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  res.sendStatus(204);
});

export default router;
