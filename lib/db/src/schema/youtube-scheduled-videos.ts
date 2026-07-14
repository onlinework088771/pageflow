import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { youtubeChannelsTable } from "./youtube-accounts";

// Phase 3 — YouTube Scheduler.
// Completely independent of `scheduled_videos` (Facebook). This table only stores
// *what* to upload and *when* — no posting logic lives here. The Phase 4 upload
// engine will read rows from this table and actually call the YouTube Data API.
export const youtubeScheduledVideosTable = pgTable("youtube_scheduled_videos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  channelId: integer("channel_id")
    .notNull()
    .references(() => youtubeChannelsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  videoType: text("video_type", { enum: ["short", "long"] }).notNull().default("long"),
  videoUrl: text("video_url"),
  videoPath: text("video_path"),
  thumbnailUrl: text("thumbnail_url"),
  privacyStatus: text("privacy_status", { enum: ["public", "unlisted", "private"] })
    .notNull()
    .default("public"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  status: text("status", { enum: ["pending", "processing", "posted", "failed"] })
    .notNull()
    .default("pending"),
  errorMessage: text("error_message"),
  youtubeVideoId: text("youtube_video_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type YoutubeScheduledVideo = typeof youtubeScheduledVideosTable.$inferSelect;

export const YoutubeScheduledVideoSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  videoType: z.enum(["short", "long"]),
  videoUrl: z.string().optional(),
  videoPath: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  privacyStatus: z.enum(["public", "unlisted", "private"]),
  scheduledAt: z.string(),
  timezone: z.string(),
  status: z.enum(["pending", "processing", "posted", "failed"]),
  errorMessage: z.string().optional(),
  youtubeVideoId: z.string().optional(),
  createdAt: z.string(),
});
