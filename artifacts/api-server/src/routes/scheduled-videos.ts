import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, scheduledVideosTable, facebookPagesTable, facebookAccountsTable } from "@workspace/db";
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
    const allowed = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only video or image files are allowed"));
    }
  },
});

function serializeVideo(v: typeof scheduledVideosTable.$inferSelect) {
  return {
    id: String(v.id),
    title: v.title,
    description: v.description ?? undefined,
    postType: v.postType ?? "video",
    publishMode: v.publishMode ?? (v.postType === "reel" ? "reel" : "video"),
    reelId: v.reelId ?? undefined,
    publishedReelIds: v.publishedReelIds ?? {},
    collaborationEnabled: v.collaborationEnabled ?? false,
    collaboratorPageIds: Array.isArray(v.collaboratorPageIds) ? v.collaboratorPageIds : [],
    collaborationStatus: v.collaborationStatus ?? undefined,
    collaborationResults: v.collaborationResults ?? {},
    collaborationError: v.collaborationError ?? undefined,
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
    const {
      title,
      description,
      pageIds,
      scheduledAt,
      timezone,
      videoUrl,
      postType,
      publishMode,
      publish_mode,
      collaborationEnabled,
      collaboration_enabled,
      collaboratorPageIds,
      collaborator_page_ids,
    } = req.body;

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

    const rawPublishMode = publishMode || publish_mode;
    const resolvedPublishMode: "reel" | "video" | undefined =
      rawPublishMode === "reel" || postType === "reel" ? "reel" : rawPublishMode === "video" ? "video" : undefined;

    const resolvedPostType: "reel" | "video" | "image" | "text" =
      resolvedPublishMode === "reel"
        ? "reel"
        : ["reel", "video", "image", "text"].includes(postType)
          ? postType
          : "video";

    const videoPath = req.file ? `/uploads/${req.file.filename}` : undefined;
    const finalVideoUrl = videoUrl || undefined;

    // Text posts don't need a file or URL
    if (resolvedPostType !== "text" && !videoPath && !finalVideoUrl) {
      res.status(400).json({ error: "Either a video/image file or URL is required" });
      return;
    }

    const userId = req.user!.userId;

    // Process & validate collaboration parameters strictly within the authenticated user's context
    const isCollabEnabled =
      resolvedPublishMode === "reel" &&
      (collaborationEnabled === "true" || collaborationEnabled === true || collaboration_enabled === "true" || collaboration_enabled === true);

    let parsedCollaboratorPageIds: string[] = [];
    if (isCollabEnabled) {
      try {
        const rawCollab = collaboratorPageIds || collaborator_page_ids;
        parsedCollaboratorPageIds = typeof rawCollab === "string" ? JSON.parse(rawCollab) : (rawCollab ?? []);
      } catch {
        parsedCollaboratorPageIds = [];
      }

      // Security check: Only allow collaborator pages owned by the authenticated user
      const userAuthorizedPages = await db
        .select({ id: facebookPagesTable.id })
        .from(facebookPagesTable)
        .innerJoin(facebookAccountsTable, eq(facebookPagesTable.accountId, facebookAccountsTable.id))
        .where(eq(facebookAccountsTable.userId, userId));

      const authorizedPageIdSet = new Set(userAuthorizedPages.map((p) => String(p.id)));
      parsedCollaboratorPageIds = parsedCollaboratorPageIds.filter((id) => authorizedPageIdSet.has(String(id)));
    }

    const [video] = await db
      .insert(scheduledVideosTable)
      .values({
        userId,
        title,
        description: description || null,
        postType: resolvedPostType,
        publishMode: resolvedPublishMode ?? "video",
        pageIds: parsedPageIds,
        scheduledAt: scheduledDate,
        timezone: timezone || "UTC",
        videoPath,
        videoUrl: finalVideoUrl,
        collaborationEnabled: isCollabEnabled && parsedCollaboratorPageIds.length > 0,
        collaboratorPageIds: isCollabEnabled ? parsedCollaboratorPageIds : [],
        collaborationStatus: isCollabEnabled && parsedCollaboratorPageIds.length > 0 ? "pending" : null,
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

  const userId = req.user!.userId;
  const [video] = await db
    .select()
    .from(scheduledVideosTable)
    .where(and(eq(scheduledVideosTable.id, id), eq(scheduledVideosTable.userId, userId)));

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

  const userId = req.user!.userId;
  const [video] = await db
    .select()
    .from(scheduledVideosTable)
    .where(and(eq(scheduledVideosTable.id, id), eq(scheduledVideosTable.userId, userId)));

  if (!video) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(serializeVideo(video));
});

router.put("/scheduled-videos/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const userId = req.user!.userId;
  const [existing] = await db
    .select()
    .from(scheduledVideosTable)
    .where(and(eq(scheduledVideosTable.id, id), eq(scheduledVideosTable.userId, userId)));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "pending" && existing.status !== "failed") {
    res.status(409).json({ error: "Only pending or failed videos can be edited" });
    return;
  }

  const { scheduledAt, timezone, pageIds, title, description } = req.body;
  const updates: Partial<typeof scheduledVideosTable.$inferInsert> = {};

  if (title !== undefined) updates.title = String(title).trim();
  if (description !== undefined) updates.description = description ? String(description).trim() : null;
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (isNaN(d.getTime())) { res.status(400).json({ error: "Invalid date" }); return; }
    updates.scheduledAt = d;
  }
  if (timezone) updates.timezone = timezone;
  if (pageIds) {
    try {
      updates.pageIds = typeof pageIds === "string" ? JSON.parse(pageIds) : pageIds;
    } catch { res.status(400).json({ error: "Invalid pageIds" }); return; }
  }

  const [updated] = await db
    .update(scheduledVideosTable)
    .set({ ...updates, status: "pending" })
    .where(and(eq(scheduledVideosTable.id, id), eq(scheduledVideosTable.userId, userId)))
    .returning();

  res.json(serializeVideo(updated));
});

router.post("/scheduled-videos/:id/duplicate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const userId = req.user!.userId;
  const [original] = await db
    .select()
    .from(scheduledVideosTable)
    .where(and(eq(scheduledVideosTable.id, id), eq(scheduledVideosTable.userId, userId)));

  if (!original) { res.status(404).json({ error: "Not found" }); return; }

  const nextDay = new Date(original.scheduledAt);
  nextDay.setDate(nextDay.getDate() + 1);

  const [copy] = await db
    .insert(scheduledVideosTable)
    .values({
      userId,
      title: `${original.title} (Copy)`,
      description: original.description,
      videoUrl: original.videoUrl,
      videoPath: original.videoPath,
      thumbnailUrl: original.thumbnailUrl,
      pageIds: original.pageIds,
      scheduledAt: nextDay,
      timezone: original.timezone,
      status: "pending",
    })
    .returning();

  res.status(201).json(serializeVideo(copy));
});

router.delete("/scheduled-videos/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const userId = req.user!.userId;
  const [video] = await db
    .delete(scheduledVideosTable)
    .where(and(eq(scheduledVideosTable.id, id), eq(scheduledVideosTable.userId, userId)))
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
