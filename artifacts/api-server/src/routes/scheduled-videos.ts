import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, scheduledVideosTable, facebookPagesTable, facebookAccountsTable } from "@workspace/db";
import { ScheduledVideoSchema } from "@workspace/db";
import { executeScheduledPost } from "../services/facebook-poster";
import { getVideoMetadata } from "../services/page-automation";
import {
  extractEmbeddedTitle,
  normalizeTitle,
  parseBoolean,
  titleFromLocalFile,
} from "../lib/original-video-title";

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

async function resolveOriginalTitle(file: Express.Multer.File | undefined, videoUrl?: string): Promise<string | null> {
  if (file) {
    const embeddedTitle = await extractEmbeddedTitle(file.path, uploadsDir);
    return embeddedTitle ?? titleFromLocalFile(file.originalname);
  }
  if (!videoUrl) return null;

  const metadata = await getVideoMetadata(videoUrl);
  return normalizeTitle(metadata.title);
}

function serializeVideo(v: typeof scheduledVideosTable.$inferSelect) {
  return {
    id: String(v.id),
    title: v.title,
    originalTitle: v.originalTitle ?? undefined,
    useOriginalTitle: v.useOriginalTitle ?? false,
    titleManuallyEdited: v.titleManuallyEdited ?? false,
    captionManuallyEdited: v.captionManuallyEdited ?? false,
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

router.post("/scheduled-videos/resolve-title", async (req, res): Promise<void> => {
  try {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) {
      res.status(400).json({ error: "A valid HTTP(S) source URL is required" });
      return;
    }

    const metadata = await getVideoMetadata(url);
    res.json({ originalTitle: normalizeTitle(metadata.title) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Could not resolve source title" });
  }
});

router.post("/scheduled-videos/resolve-file-title", upload.single("video"), async (req, res): Promise<void> => {
  const file = req.file;
  try {
    if (!file) {
      res.status(400).json({ error: "A video file is required" });
      return;
    }

    const embeddedTitle = await extractEmbeddedTitle(file.path, uploadsDir);
    const originalTitle = embeddedTitle ?? titleFromLocalFile(file.originalname);
    res.json({
      originalTitle,
      source: embeddedTitle ? "embedded" : originalTitle ? "filename" : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Could not resolve video title" });
  } finally {
    if (file?.path) {
      await fs.promises.unlink(file.path).catch(() => undefined);
    }
  }
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
      useOriginalTitle,
      use_original_title,
      titleManuallyEdited,
      title_manually_edited,
      captionManuallyEdited,
      caption_manually_edited,
    } = req.body;

    const requestedUseOriginalTitle = parseBoolean(useOriginalTitle ?? use_original_title);
    const requestedTitleManuallyEdited = parseBoolean(titleManuallyEdited ?? title_manually_edited);
    const requestedCaptionManuallyEdited = parseBoolean(captionManuallyEdited ?? caption_manually_edited);
    const submittedTitle = typeof title === "string" ? title.trim() : "";
    const submittedDescription = typeof description === "string" ? description.trim() : "";

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

    let originalTitle: string | null = null;
    if (requestedUseOriginalTitle) {
      try {
        originalTitle = await resolveOriginalTitle(req.file, finalVideoUrl);
      } catch {
        originalTitle = null;
      }
    }

    const finalTitle = requestedUseOriginalTitle && originalTitle && !requestedTitleManuallyEdited
      ? originalTitle
      : submittedTitle;
    if (!finalTitle) {
      res.status(400).json({ error: "Title is required, or enable Use Original Video Title with a resolvable source" });
      return;
    }

    const resolvedDescription = requestedUseOriginalTitle && originalTitle && !requestedCaptionManuallyEdited
      ? originalTitle
      : submittedDescription || null;

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
        title: finalTitle,
        originalTitle,
        useOriginalTitle: requestedUseOriginalTitle,
        titleManuallyEdited: requestedTitleManuallyEdited,
        captionManuallyEdited: requestedCaptionManuallyEdited,
        description: resolvedDescription,
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

  if (title !== undefined) {
    const nextTitle = String(title).trim();
    updates.title = nextTitle;
    updates.titleManuallyEdited = existing.titleManuallyEdited || nextTitle !== existing.title;
  }
  if (description !== undefined) {
    const nextDescription = description ? String(description).trim() : null;
    updates.description = nextDescription;
    updates.captionManuallyEdited = existing.captionManuallyEdited || nextDescription !== (existing.description ?? null);
  }
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
      originalTitle: original.originalTitle,
      useOriginalTitle: original.useOriginalTitle,
      titleManuallyEdited: original.titleManuallyEdited,
      captionManuallyEdited: original.captionManuallyEdited,
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
