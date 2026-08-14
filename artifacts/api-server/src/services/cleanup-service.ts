import fs from "fs";
import path from "path";
import { db, scheduledVideosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const AUTO_DELETE = process.env["AUTO_DELETE"] !== "false";
const DELETE_AFTER_HOURS = parseInt(process.env["DELETE_AFTER_HOURS"] ?? "48", 10);

const uploadsDir = path.join(process.cwd(), "uploads");

/**
 * Safely delete a video file from /uploads after a successful Facebook publish.
 * Only runs when AUTO_DELETE is enabled.
 * Does NOT throw — failures are logged and silently swallowed.
 */
export async function deleteAfterPublish(videoPath: string): Promise<void> {
  if (!AUTO_DELETE) return;
  if (!videoPath) return;

  const filename = path.basename(videoPath);
  const fullPath = path.join(uploadsDir, filename);

  try {
    if (!fs.existsSync(fullPath)) return;
    await fs.promises.unlink(fullPath);
    logger.info(`Video deleted: ${filename}`);
  } catch (err: any) {
    logger.warn(`Failed to delete video: ${filename} - ${err.message}`);
  }
}

/**
 * Hourly fallback cleanup job.
 * Removes files from /uploads that are either:
 *   - In the DB with status "posted" and older than DELETE_AFTER_HOURS hours
 *   - Not referenced in the DB at all (orphan files)
 * Never touches files for pending / processing / scheduled / failed videos.
 */
export async function runCleanupJob(): Promise<void> {
  if (!AUTO_DELETE) return;

  try {
    if (!fs.existsSync(uploadsDir)) return;

    const files = await fs.promises.readdir(uploadsDir);
    if (!files.length) return;

    const cutoffMs = DELETE_AFTER_HOURS * 60 * 60 * 1000;
    const now = Date.now();

    logger.info({ fileCount: files.length, cutoffHours: DELETE_AFTER_HOURS }, "Cleanup job: scanning uploads");

    for (const filename of files) {
      const fullPath = path.join(uploadsDir, filename);

      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch {
        continue;
      }

      if (!stat.isFile()) continue;

      const ageMs = now - stat.mtimeMs;
      if (ageMs < cutoffMs) continue;

      const relativePath = `/uploads/${filename}`;

      try {
        const [record] = await db
          .select({ id: scheduledVideosTable.id, status: scheduledVideosTable.status })
          .from(scheduledVideosTable)
          .where(eq(scheduledVideosTable.videoPath, relativePath));

        if (record) {
          if (record.status !== "posted") {
            continue;
          }
        }

        await fs.promises.unlink(fullPath);
        logger.info(`Video deleted: ${filename}`);
      } catch (err: any) {
        logger.warn(`Failed to delete video: ${filename} - ${err.message}`);
      }
    }
  } catch (err: any) {
    logger.error({ err: err.message }, "Cleanup job error");
  }
}
